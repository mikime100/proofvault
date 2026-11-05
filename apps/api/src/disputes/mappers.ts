// Database rows -> the shared contract. Every IP is masked here, so nothing unmasked leaves the api.
import type { ActionLog, Dispute as DisputeRow, Order as OrderRow } from '@prisma/client';
import {
  type ActionLogEntry,
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
