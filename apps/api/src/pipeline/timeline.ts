import type { AccessEvent, DisputeContext, Timeline, TimelineEntry } from '@proofvault/shared';

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

/** Events with the same type and meta within this window are treated as one (double-clicks). */
const DEDUPE_WINDOW_MS = 5_000;

function metaKey(e: AccessEvent): string {
  return JSON.stringify(e.meta ?? {});
}

/**
 * Collapse bursts of identical events (same type + meta within a few seconds) into one.
 * The first live purchase recorded 7 download events in 8 seconds from a button that gave
 * no feedback; without this, counts are inflated and the claim checker's counts are wrong.
 */
function dedupeEvents(events: AccessEvent[]): AccessEvent[] {
  const sorted = [...events].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const result: AccessEvent[] = [];
  for (const e of sorted) {
    const prev = result[result.length - 1];
    if (
      prev &&
      prev.type === e.type &&
      metaKey(prev) === metaKey(e) &&
      Math.abs(Date.parse(e.at) - Date.parse(prev.at)) < DEDUPE_WINDOW_MS
    ) {
      continue;
    }
    result.push(e);
  }
  return result;
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
  for (const e of dedupeEvents(events)) {
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
    summary: `Dispute opened: ${dispute.reason}`,
  });
  // Stable sort: records with the same time keep the order above.
  entries.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return { disputeId: dispute.id, orderId: order?.id ?? null, entries };
}
