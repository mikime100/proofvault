// Database rows -> the shared contract. Every IP is masked here, so nothing unmasked leaves the api.
import type { ActionLog, Dispute as DisputeRow, Order as OrderRow } from '@prisma/client';
import {
  type ActionLogEntry,
  AllowedAction,
  type Dispute,
  DisputeReason,
  DisputeStatus,
  type Money,
  type Order,
  PipelineResult,
  maskIp,
} from '@proofvault/shared';

const money = (value: string, currency: string): Money => ({ value, currency: currency as 'USD' });

export function toDispute(row: DisputeRow): Dispute {
  return {
    id: row.id,
    paypalDisputeId: row.paypalDisputeId,
    orderId: row.orderId,
    reason: DisputeReason.parse(row.reason),
    amount: money(row.amount, row.currency),
    status: DisputeStatus.parse(row.status),
    responseDueAt: row.responseDueAt?.toISOString() ?? null,
    winScore: row.winScore,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toOrder(row: OrderRow): Order {
  return {
    id: row.id,
    paypalOrderId: row.paypalOrderId,
    paypalCaptureId: row.paypalCaptureId,
    productId: row.productId,
    buyerEmail: row.buyerEmail,
    amount: money(row.amount, row.currency),
    checkoutIp: maskIp(row.checkoutIp),
    checkoutDevice: row.checkoutDevice,
    riskLevel: row.riskLevel,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Stored analysis JSON -> PipelineResult, with every timeline IP masked. */
export function toAnalysis(json: unknown): PipelineResult {
  const result = PipelineResult.parse(json);
  return {
    ...result,
    timeline: {
      ...result.timeline,
      entries: result.timeline.entries.map((e) => (e.ip ? { ...e, ip: maskIp(e.ip) } : e)),
    },
  };
}

/** PayPal link names (rel) to our action names. */
const REL_TO_ACTION: Record<string, AllowedAction> = {
  provide_evidence: 'submit',
  make_offer: 'offer',
  accept_claim: 'accept',
  send_message: 'message',
  escalate: 'escalate',
};

/**
 * Decision 16: what PayPal allows on this case right now, from the `links` of the last copy we
 * loaded. A case never loaded from PayPal (seed data) has no known restriction, so all are listed.
 */
export function allowedActionsOf(raw: unknown): AllowedAction[] {
  const links = (raw as { links?: { rel?: string }[] } | null)?.links;
  if (!links) return [...AllowedAction.options];
  return [...new Set(links.map((l) => REL_TO_ACTION[l.rel ?? '']).filter((a): a is AllowedAction => !!a))];
}

export function toAction(row: ActionLog): ActionLogEntry {
  return {
    id: row.id,
    disputeId: row.disputeId,
    action: row.action,
    actor: row.actor,
    ok: row.ok,
    detail: row.detail,
    createdAt: row.createdAt.toISOString(),
  };
}
