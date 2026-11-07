import { Injectable, Logger } from '@nestjs/common';
import type { ActionType, Actor, Dispute as DisputeRow, Prisma } from '@prisma/client';
import {
  type ActionLogEntry,
  type DisputeActionRequest,
  type DisputeReason,
  PipelineResult,
  type SandboxStep,
  type SandboxStepBody,
  SellerRules,
} from '@proofvault/shared';
import { AppError } from '../common/api-error.filter';
import { PrismaService } from '../db/prisma.service';
import { allowedActionsOf, toAction } from '../disputes/mappers';
import { IntakeService } from '../disputes/intake.service';
import { PaypalClient, PaypalError } from '../paypal/paypal.client';
import { renderEvidencePdf } from '../pipeline';

/** PayPal evidence type per dispute reason (decision 12). Anything else goes in as OTHER. */
const EVIDENCE_TYPE: Partial<Record<DisputeReason, string>> = {
  MERCHANDISE_OR_SERVICE_NOT_RECEIVED: 'PROOF_OF_FULFILLMENT',
};

const toCents = (v: string) => Math.round(Number(v) * 100);
const fromCents = (c: number) => (c / 100).toFixed(2);

/**
 * Every PayPal action on a dispute goes through run(): call PayPal, write one action-log row
 * whether it worked or not, refresh the dispute from PayPal, return the log row.
 * Used by the seller's buttons now, and by the auto-action executor (#21) later.
 */
@Injectable()
export class ActionsService {
  private readonly log = new Logger('Actions');

  constructor(
    private readonly prisma: PrismaService,
    private readonly paypal: PaypalClient,
    private readonly intake: IntakeService,
  ) {}

  async act(disputeId: string, req: DisputeActionRequest, actor: Actor): Promise<ActionLogEntry> {
    const dispute = await this.fresh(await this.find(disputeId));
    const id = dispute.paypalDisputeId;

    // Decision 16: only do what PayPal allows right now. Saves a refused call and a confusing error.
    const allowed = allowedActionsOf(dispute.raw);
    if (!allowed.includes(req.type)) {
      throw new AppError(
        409,
        'ACTION_NOT_ALLOWED_NOW',
        `PayPal does not allow "${req.type}" on this case right now. Allowed: ${allowed.join(', ') || 'nothing yet'}`,
      );
    }

    switch (req.type) {
      case 'submit': {
        const pkg = await this.prisma.evidencePackage.findUnique({ where: { disputeId } });
        if (!pkg) throw new AppError(409, 'NO_EVIDENCE_PACKAGE', 'This dispute has not been analysed yet');
        let pdf: Buffer;
        try {
          pdf = await renderEvidencePdf(PipelineResult.parse(pkg.analysis));
        } catch (e) {
          throw new AppError(409, 'PDF_NOT_AVAILABLE', `Could not build the evidence PDF: ${String(e)}`);
        }
        const evidenceType = EVIDENCE_TYPE[dispute.reason as DisputeReason] ?? 'OTHER';
        const entry = await this.run(dispute, 'submit', actor, { evidenceType, notes: pkg.draftResponse }, () =>
          this.paypal.provideEvidence(id, { evidenceType, notes: pkg.draftResponse, pdf, filename: `proofvault-${id}.pdf` }),
        );
        await this.prisma.evidencePackage.update({
          where: { disputeId },
          data: { submittedAt: new Date(), autoSubmitted: actor === 'agent', approvedBy: actor === 'seller' ? 'seller' : null },
        });
        return entry;
      }
      case 'offer': {
        const amount = req.amount?.value ?? (await this.defaultOffer(dispute));
        const note = req.note ?? `We would like to offer a refund of ${amount} USD to settle this.`;
        return this.run(dispute, 'offer', actor, { amount, note }, () => this.paypal.makeOffer(id, { amount, note }));
      }
      case 'accept': {
        const note = req.note ?? 'We accept the claim and refund the full amount.';
        return this.run(dispute, 'accept', actor, { note }, () => this.paypal.acceptClaim(id, { note }));
      }
      case 'escalate': {
        const note = req.note ?? 'The buyer had full access to the digital product; we ask PayPal to review our evidence.';
        return this.run(dispute, 'escalate', actor, { note }, () => this.paypal.escalate(id, { note }));
      }
      case 'message':
        return this.run(dispute, 'message', actor, { message: req.text }, () =>
          this.paypal.sendMessage(id, { message: req.text }),
        );
    }
  }

  /** Sandbox only: push a case to the evidence stage, or decide it, for the demo. */
  async sandbox(disputeId: string, step: SandboxStep, body: SandboxStepBody): Promise<ActionLogEntry> {
    if (process.env.PAYPAL_ENV === 'live') throw new AppError(403, 'SANDBOX_ONLY', 'Only available in the PayPal sandbox');
    const dispute = await this.find(disputeId);
    const id = dispute.paypalDisputeId;
    if (step === 'require-evidence') {
      const party = body.party ?? 'SELLER_EVIDENCE';
      return this.run(dispute, 'require_evidence', 'seller', { party }, () => this.paypal.requireEvidence(id, party));
    }
    const outcome = body.outcome ?? 'SELLER_FAVOR';
    return this.run(dispute, 'adjudicate', 'seller', { outcome }, () => this.paypal.adjudicate(id, outcome));
  }

  /**
   * Reloads the case from PayPal so the allowed actions are current (they change within minutes).
   * Seed cases with made-up PayPal ids cannot be reloaded; then the saved copy is used.
   */
  private async fresh(dispute: DisputeRow): Promise<DisputeRow> {
    if (!dispute.raw) return dispute;
    return this.intake.ingest(dispute.paypalDisputeId).catch(() => dispute);
  }

  private async find(disputeId: string): Promise<DisputeRow> {
    const row = await this.prisma.dispute.findUnique({ where: { id: disputeId } });
    if (!row) throw new AppError(404, 'DISPUTE_NOT_FOUND', `No dispute with id ${disputeId}`);
    return row;
  }

  /** The seller's offerPercent of the disputed amount, in whole cents. */
  private async defaultOffer(dispute: DisputeRow): Promise<string> {
    const seller = await this.prisma.seller.findFirst({ orderBy: { createdAt: 'asc' } });
    const rules = SellerRules.parse(seller?.autoActionRules);
    return fromCents(Math.round((toCents(dispute.amount) * rules.offerPercent) / 100));
  }

  private async run(
    dispute: DisputeRow,
    action: ActionType,
    actor: Actor,
    request: Record<string, unknown>,
    call: () => Promise<unknown>,
  ): Promise<ActionLogEntry> {
    try {
      const response = await call();
      const row = await this.prisma.actionLog.create({
        data: {
          disputeId: dispute.id,
          action,
          actor,
          ok: true,
          detail: `${action} sent to PayPal`,
          request: request as Prisma.InputJsonValue,
          response: (response ?? {}) as Prisma.InputJsonValue,
        },
      });
      // The status changed on PayPal's side; pull it in so the dashboard shows it. Best effort.
      await this.intake.ingest(dispute.paypalDisputeId).catch((e: unknown) => this.log.warn(`refresh failed: ${String(e)}`));
      return toAction(row);
    } catch (e) {
      if (!(e instanceof PaypalError)) throw e;
      await this.prisma.actionLog.create({
        data: {
          disputeId: dispute.id,
          action,
          actor,
          ok: false,
          detail: `PayPal refused ${action}: ${e.issue}`,
          request: request as Prisma.InputJsonValue,
          response: { status: e.status, issue: e.issue, message: e.message },
        },
      });
      throw new AppError(422, `PAYPAL_${e.issue}`, e.message || `PayPal refused ${action}`);
    }
  }
}
