import { SUPPORTED_REASONS } from '@proofvault/shared';
import type {
  DisputeReason,
  Score,
  ScoreFeature,
  Timeline,
  TimelineEntry,
} from '@proofvault/shared';

/**
 * Rules-based win score, 0 to 100. Pure code; the LLM never chooses the number, only
 * writes `score.reasons` later. Only SUPPORTED_REASONS are scored; anything else returns
 * 0 and runPipeline flags it (unsupported_reason).
 */
export function scoreDispute(timeline: Timeline, reason: DisputeReason): Score {
  if (!SUPPORTED_REASONS.includes(reason)) {
    return { value: 0, features: [], reasons: [] };
  }
  const order = timeline.entries.find((e) => e.source === 'order');
  const access = timeline.entries.filter((e) => e.source === 'access_event');
  if (!order) return { value: 0, features: [], reasons: [] };

  switch (reason) {
    case 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED':
      return scoreNotReceived(timeline, order, access);
    case 'UNAUTHORISED':
      return scoreUnauthorised(order, access);
    case 'MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED':
      return scoreNotAsDescribed(order, access);
    default:
      return { value: 0, features: [], reasons: [] };
  }
}

// NOT_RECEIVED: access after purchase, device/IP match, multi-day, activity after dispute.
function scoreNotReceived(timeline: Timeline, order: TimelineEntry, access: TimelineEntry[]): Score {
  const features: ScoreFeature[] = [];
  const lessonViews = access.filter((e) => e.type === 'lesson_view');
  const downloads = access.filter((e) => e.type === 'download');
  const logins = access.filter((e) => e.type === 'login');
  const distinctLessons = countDistinctLessons(lessonViews);
  const distinctDays = new Set(access.map((e) => e.at.slice(0, 10))).size;

  const contentIds = dedupe([
    ...lessonViews.map((e) => e.recordId),
    ...downloads.map((e) => e.recordId),
  ]);
  let contentPts = 0;
  if (lessonViews.length > 0 || downloads.length > 0) contentPts += 25;
  if (distinctLessons >= 3) contentPts += 15;
  if (downloads.length > 0) contentPts += 10;
  if (contentPts > 0) {
    features.push(feature('content_consumed', 'Access after purchase', contentPts, contentIds));
  }

  if (logins.length > 0) {
    features.push(feature('login_occurred', 'Buyer logged in', 10, logins.map((e) => e.recordId)));
  }

  const deviceIds = access.filter((e) => e.device === order.device).map((e) => e.recordId);
  if (deviceIds.length > 0) {
    features.push(feature('device_match', 'Access from the checkout device', 15, dedupe(deviceIds)));
  }

  const ipIds = access.filter((e) => e.ip === order.ip).map((e) => e.recordId);
  if (ipIds.length > 0) {
    features.push(feature('ip_match', 'checkout IP', 15, dedupe(ipIds)));
  }

  if (distinctDays >= 3) {
    features.push(feature('multi_day', 'Activity across 3 or more days', 20, dedupe(access.map((e) => e.recordId))));
  } else if (distinctDays >= 2) {
    features.push(feature('multi_day', 'Activity across multiple days', 10, dedupe(access.map((e) => e.recordId))));
  }

  const disputeAt = timeline.entries.find((e) => e.source === 'dispute')?.at;
  if (disputeAt) {
    const after = access.filter((e) => e.at > disputeAt);
    if (after.length > 0) {
      features.push(feature('after_dispute', 'Activity after the dispute was opened', 15, after.map((e) => e.recordId)));
    }
  }

  return finalize(features);
}

// UNAUTHORISED: the buyer claims they didn't make the purchase. Same device/IP access
// supports the seller. Prior purchases aren't available in DisputeContext, so they're 0.
function scoreUnauthorised(order: TimelineEntry, access: TimelineEntry[]): Score {
  const features: ScoreFeature[] = [];
  const deviceIds = access.filter((e) => e.device === order.device).map((e) => e.recordId);
  if (deviceIds.length > 0) {
    features.push(feature('device_match', 'Access from the checkout device', 25, dedupe(deviceIds)));
  }
  const ipIds = access.filter((e) => e.ip === order.ip).map((e) => e.recordId);
  if (ipIds.length > 0) {
    features.push(feature('ip_match', 'checkout IP', 25, dedupe(ipIds)));
  }
  const distinctDays = new Set(access.map((e) => e.at.slice(0, 10))).size;
  if (distinctDays >= 3) {
    features.push(feature('multi_day', 'Activity across 3 or more days', 25, dedupe(access.map((e) => e.recordId))));
  } else if (distinctDays >= 2) {
    features.push(feature('multi_day', 'Activity across multiple days', 15, dedupe(access.map((e) => e.recordId))));
  }
  const used = access.filter((e) => e.type === 'lesson_view' || e.type === 'download');
  if (used.length > 0) {
    features.push(feature('content_consumed', 'Account used after purchase', 10, dedupe(used.map((e) => e.recordId))));
  }
  return finalize(features);
}

// NOT_AS_DESCRIBED: amount of content consumed is the main signal. Product page snapshot
// and refund policy are stretch items and have no data here.
function scoreNotAsDescribed(order: TimelineEntry, access: TimelineEntry[]): Score {
  const features: ScoreFeature[] = [];
  const lessonViews = access.filter((e) => e.type === 'lesson_view');
  const downloads = access.filter((e) => e.type === 'download');
  const distinctLessons = countDistinctLessons(lessonViews);
  let contentPts = 0;
  const ids: string[] = [];
  if (lessonViews.length > 0 || downloads.length > 0) {
    contentPts += 25;
    ids.push(...lessonViews.map((e) => e.recordId), ...downloads.map((e) => e.recordId));
  }
  if (distinctLessons >= 3) contentPts += 15;
  if (downloads.length > 0) contentPts += 10;
  if (contentPts > 0) {
    features.push(feature('content_consumed', 'Content consumed after purchase', contentPts, dedupe(ids)));
  }
  const deviceIds = access.filter((e) => e.device === order.device).map((e) => e.recordId);
  if (deviceIds.length > 0) {
    features.push(feature('device_match', 'Access from the checkout device', 10, dedupe(deviceIds)));
  }
  return finalize(features);
}

function finalize(features: ScoreFeature[]): Score {
  const value = Math.min(100, features.reduce((sum, f) => sum + f.points, 0));
  return { value, features, reasons: [] };
}

function feature(key: string, label: string, points: number, recordIds: string[]): ScoreFeature {
  return { key, label, points, recordIds };
}

// Distinct lesson numbers parsed from the timeline summary; falls back to the event count
// when the summary doesn't carry a lesson number (so it still works with any timeline).
function countDistinctLessons(lessonViews: TimelineEntry[]): number {
  const nums = new Set<number>();
  for (const e of lessonViews) {
    const m = /lesson\s+(\d+)/i.exec(e.summary);
    if (m) nums.add(Number(m[1] ?? '0'));
  }
  return nums.size > 0 ? nums.size : lessonViews.length;
}

function dedupe(ids: string[]): string[] {
  return [...new Set(ids)];
}
