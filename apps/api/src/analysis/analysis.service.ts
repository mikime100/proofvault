import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  type AccessEvent,
  type DisputeContext,
  type LlmClient,
  type PipelineResult,
  SellerRules,
} from '@proofvault/shared';
import { AppError } from '../common/api-error.filter';
import { PrismaService } from '../db/prisma.service';
import { IntakeService } from '../disputes/intake.service';
import { toDispute, toOrder } from '../disputes/mappers';
import { runPipeline } from '../pipeline';
import { LLM_CLIENT } from './llm.provider';

/**
 * #17: runs Fitsum's pipeline on a dispute and saves the result as its one evidence package
 * (decision 6: a re-run replaces it). Every run, good or bad, is logged as an `analyze` action.
 * Auto-actions on the result are the executor's job (#21), not this service's.
 */
@Injectable()
export class AnalysisService implements OnModuleInit {
  private readonly log = new Logger('Analysis');
  private readonly running = new Set<Promise<unknown>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly intake: IntakeService,
    @Inject(LLM_CLIENT) private readonly llm: LlmClient,
  ) {}

  /** New or changed disputes are analysed in the background, so intake answers PayPal fast. */
  onModuleInit() {
    this.intake.onChange((row) => {
      // Off in tests unless a test turns it on: it would call the real LLM.
      if (process.env.VITEST && process.env.AUTO_ANALYZE !== 'true') return;
      if (process.env.AUTO_ANALYZE === 'false') return;
      const run = this.analyze(row.id)
        .catch((e: unknown) => this.log.warn(`analysis of ${row.paypalDisputeId} failed: ${String(e)}`))
        .finally(() => this.running.delete(run));
      this.running.add(run);
    });
  }

  /** Resolves when every background analysis has finished. For tests and graceful shutdown. */
  async settled(): Promise<void> {
    while (this.running.size) await Promise.all([...this.running]);
  }

  async analyze(disputeId: string): Promise<PipelineResult> {
    const context = await this.loadContext(disputeId);
    const seller = await this.prisma.seller.findFirst({ orderBy: { createdAt: 'asc' } });
    const rules = SellerRules.parse(seller?.autoActionRules);

    let result: PipelineResult;
    try {
      result = await runPipeline(context, rules, { llm: this.llm });
    } catch (e) {
      await this.logRun(disputeId, false, `Analysis failed: ${String(e)}`);
      throw e;
    }

    const analysis = result as unknown as Prisma.InputJsonValue;
    await this.prisma.$transaction([
      this.prisma.evidencePackage.upsert({
        where: { disputeId },
        update: { analysis, draftResponse: result.responseText },
        create: { disputeId, analysis, draftResponse: result.responseText },
      }),
      this.prisma.dispute.update({ where: { id: disputeId }, data: { winScore: result.score.value } }),
    ]);
    const flags = result.flags.length ? `, flags ${result.flags.join(', ')}` : '';
    await this.logRun(
      disputeId,
      true,
      `Score ${result.score.value}, decision ${result.decision.action}, ${result.accepted.length} claims kept, ${result.rejected.length} removed${flags}`,
    );
    this.log.log(`analysed ${disputeId}: score ${result.score.value}, ${result.decision.action}`);
    return result;
  }

  /** Everything the pipeline needs, with full IPs (it compares them; the api masks on the way out). */
  private async loadContext(disputeId: string): Promise<DisputeContext> {
    const row = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: { order: { include: { events: { orderBy: { at: 'asc' } } } } },
    });
    if (!row) throw new AppError(404, 'DISPUTE_NOT_FOUND', `No dispute with id ${disputeId}`);
    const events: AccessEvent[] = (row.order?.events ?? []).map((e) => ({
      id: e.id,
      orderId: e.orderId,
      type: e.type,
      ip: e.ip,
      device: e.device,
      userAgent: e.userAgent,
      at: e.at.toISOString(),
      ...(e.meta ? { meta: e.meta as Record<string, string> } : {}),
    }));
    return {
      dispute: toDispute(row),
      order: row.order ? toOrder(row.order, { maskIps: false }) : null,
      events,
    };
  }

  private logRun(disputeId: string, ok: boolean, detail: string) {
    return this.prisma.actionLog.create({ data: { disputeId, action: 'analyze', actor: 'agent', ok, detail } });
  }
}
