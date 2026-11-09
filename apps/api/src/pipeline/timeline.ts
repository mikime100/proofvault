import type { AccessEvent, DisputeContext, Timeline, TimelineEntry } from '@proofvault/shared';
import { reasonLabel } from './reason';

function describeEvent(e: AccessEvent): string {
  switch (e.type) {
    case 'login':
      return 'Opened the course';
    case 'lesson_view':
      return e.meta?.lesson ? `Viewed lesson ${e.meta.lesson}` : 'Viewed a lesson';
    case 'download':
      return e.meta?.file ? `Downloaded ${e.meta.file}` : 'Downloaded a file';
    case 'activation':
      return 'Activated the licence';
  }
}

/**
 * Everything we know about one dispute, oldest first. Each entry keeps the id of the record it
 * came from, so every claim can point back at its proof. IPs stay full here; the api masks them.
 */
export function buildTimeline({ dispute, order, events }: DisputeContext): Timeline {
  const entries: TimelineEntry[] = [];
  if (order) {
    entries.push({
      recordId: order.id,
      source: 'order',
      type: 'purchase',
      at: order.createdAt,
      summary: `Paid ${order.amount.value} ${order.amount.currency} with PayPal`,
      ip: order.checkoutIp,
      device: order.checkoutDevice,
    });
  }
  for (const e of events) {
    entries.push({
      recordId: e.id,
      source: 'access_event',
      type: e.type,
      at: e.at,
      summary: describeEvent(e),
      ip: e.ip,
      device: e.device,
    });
  }
  entries.push({
    recordId: dispute.id,
    source: 'dispute',
    type: 'dispute_opened',
    at: dispute.createdAt,
    summary: `Buyer opened a PayPal dispute: ${reasonLabel(dispute.reason).toLowerCase()}`,
  });
  // Stable sort: records with the same time keep the order above.
  entries.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return { disputeId: dispute.id, orderId: order?.id ?? null, entries };
}
