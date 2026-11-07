import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  DisputeReason,
  DisputeStatus,
  type LlmClient,
  type PipelineResult,
  SellerRules,
} from '@proofvault/shared';
import { PrismaService } from '../db/prisma.service';
import { createLlmClient } from '../pipeline/llm';
import { runPipeline } from '../pipeline/runPipeline';

/**
 * Runs the AI pipeline in-process after intake saves a dispute.
 * The webhook / poll never awaits this — it fires and returns immediately.
 * A failed run is logged as an analyze action with ok=false and can be re-run
 * via POST /disputes/:id/analyze.
 *
 * Issue #20: Render Workflows was evaluated and deferred (Nov 8 noon cutoff); this
 * in-process fallback is the agreed approach per PLAN.md section 1.
 */
@Injectable()
export class PipelineRunnerService {
  private readonly log = new Logger('PipelineRunner');
  private _llm: LlmClient | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fire and forget. Never throws — the caller (IntakeService) must not be affected
   * by a pipeline failure.
   */
  triggerAsync(disputeId: string): void {
    this.run(disputeId).catch((err: unknown) =>
      this.log.error(`pipeline failed for ${disputeId}: ${String(err)}`),
    );
  }

  /**
   * Load the DisputeContext, run the pipeline, persist the result.
   * Safe to run multiple times: EvidencePackage is upserted (decision 6), and
   * only the first run with no prior agent action triggers an auto-action (decision 9,
   * enforced by the executor in issue #21).
   */
  async run(disputeId: string): Promise<PipelineResult> {
    const disputeRow = await this.prisma.dispute.findUniqueOrThrow({
      where: { id: disputeId },
    });

    const orderRow = disputeRow.orderId
      ? await this.prisma.order.findUnique({ where: { id: disputeRow.orderId } })
      : null;

    const eventRows = orderRow
      ? await this.prisma.accessEvent.findMany({
          where: { orderId: orderRow.id },
          orderBy: { at: 'asc' },
        })
      : [];

    const seller = await this.prisma.seller.findFirst({ orderBy: { createdAt: 'asc' } });
    const rules = SellerRules.parse(seller?.autoActionRules ?? {});

    // IPs are kept full here; buildTimeline keeps them full too.
    // The PDF renderer and the API mappers mask them before they leave the server.
    const context = {
      dispute: {
        id: disputeRow.id,
        paypalDisputeId: disputeRow.paypalDisputeId,
        orderId: disputeRow.orderId,
        reason: DisputeReason.parse(disputeRow.reason),
        amount: { value: disputeRow.amount, currency: disputeRow.currency as 'USD' },
        status: DisputeStatus.parse(disputeRow.status),
        responseDueAt: disputeRow.responseDueAt?.toISOString() ?? null,
        winScore: disputeRow.winScore,
        createdAt: disputeRow.createdAt.toISOString(),
      },
      order: orderRow
        ? {
            id: orderRow.id,
            paypalOrderId: orderRow.paypalOrderId,
            paypalCaptureId: orderRow.paypalCaptureId,
            productId: orderRow.productId,
            buyerEmail: orderRow.buyerEmail,
            amount: { value: orderRow.amount, currency: orderRow.currency as 'USD' },
            checkoutIp: orderRow.checkoutIp,
            checkoutDevice: orderRow.checkoutDevice,
            riskLevel: orderRow.riskLevel,
            createdAt: orderRow.createdAt.toISOString(),
          }
        : null,
      events: eventRows.map((e) => ({
        id: e.id,
        orderId: e.orderId,
        type: e.type,
        ip: e.ip,
        device: e.device,
        userAgent: e.userAgent,
        at: e.at.toISOString(),
        meta: (e.meta as Record<string, string> | null) ?? undefined,
      })),
    };

    let result: PipelineResult;
    try {
      result = await runPipeline(context, rules, { llm: this.llm });
    } catch (err) {
      // Log failure as an analyze action with ok=false so the dashboard can show it.
      await this.prisma.actionLog.create({
        data: {
          disputeId,
          action: 'analyze',
          actor: 'agent',
          ok: false,
          detail: `Pipeline failed: ${String(err)}`,
          request: {} as Prisma.InputJsonValue,
          response: {} as Prisma.InputJsonValue,
        },
      });
      throw err;
    }

    // Decision 6: one EvidencePackage per dispute; re-run replaces it.
    await this.prisma.evidencePackage.upsert({
      where: { disputeId },
      create: {
        disputeId,
        analysis: result as unknown as Prisma.InputJsonValue,
        draftResponse: result.responseText,
      },
      update: {
        analysis: result as unknown as Prisma.InputJsonValue,
        draftResponse: result.responseText,
        approvedBy: null,
        autoSubmitted: false,
        submittedAt: null,
      },
    });

    await this.prisma.dispute.update({
      where: { id: disputeId },
      data: { winScore: result.score.value },
    });

    await this.prisma.actionLog.create({
      data: {
        disputeId,
        action: 'analyze',
        actor: 'agent',
        ok: true,
        detail: `Pipeline completed: score ${result.score.value}, decision ${result.decision.action}`,
        request: {} as Prisma.InputJsonValue,
        response: { decision: result.decision } as unknown as Prisma.InputJsonValue,
      },
    });

    this.log.log(
      `dispute ${disputeId}: score ${result.score.value}, decision ${result.decision.action}, flags [${result.flags.join(', ')}]`,
    );
    return result;
  }

  private get llm(): LlmClient {
    this._llm ??= createLlmClient();
    return this._llm;
  }
}
