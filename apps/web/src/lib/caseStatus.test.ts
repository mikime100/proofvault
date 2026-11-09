import { describe, expect, it } from 'vitest';
import type { ActionLogEntry, DisputeDetail } from '@proofvault/shared';
import { ago, caseStatus, stageOf } from './caseStatus';

const act = (action: ActionLogEntry['action'], minute: number, ok = true): ActionLogEntry => ({
  id: `a${minute}`,
  disputeId: 'd1',
  action,
  actor: 'seller',
  ok,
  detail: '',
  createdAt: `2026-11-08T10:${String(minute).padStart(2, '0')}:00.000Z`,
});

const detail = (
  status: DisputeDetail['dispute']['status'],
  actions: ActionLogEntry[] = [],
  allowedActions: DisputeDetail['allowedActions'] = [],
): DisputeDetail => ({
  dispute: {
    id: 'd1',
    paypalDisputeId: 'PP-D-T1',
    orderId: null,
    reason: 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED',
    amount: { value: '49.00', currency: 'USD' },
    status,
    responseDueAt: null,
    winScore: null,
    createdAt: '2026-11-08T09:00:00.000Z',
    stage: null,
    outcome: null,
  },
  order: null,
  analysis: null,
  actions,
  allowedActions,
});

/** Same, with an evidence package built (analysis content is not read by caseStatus). */
const analysed = (...args: Parameters<typeof detail>): DisputeDetail => ({
  ...detail(...args),
  analysis: {} as NonNullable<DisputeDetail['analysis']>,
});

describe('caseStatus', () => {
  it('asks the seller to act when PayPal waits and submit is allowed', () => {
    const s = caseStatus(analysed('WAITING_FOR_SELLER_RESPONSE', [], ['submit', 'accept']));
    expect(s.stage).toBe('inquiry');
    expect(s.next.tone).toBe('action');
    expect(s.waitingOnPaypal).toBe(false);
  });

  it('after an accepted escalation, says PayPal is turning it into a claim', () => {
    const s = caseStatus(detail('UNDER_REVIEW', [act('submit', 1), act('escalate', 5)]));
    expect(s.stage).toBe('claim');
    expect(s.next.title).toMatch(/claim/);
    expect(s.next.sandboxHint).toMatch(/4 minutes/);
    expect(s.waitingOnPaypal).toBe(true);
    expect(s.last?.action).toBe('escalate');
  });

  it('a failed escalation does not move the stage', () => {
    expect(stageOf(detail('WAITING_FOR_BUYER_RESPONSE', [act('escalate', 5, false)]))).toBe('inquiry');
  });

  it('in the claim stage, says the agent resubmits by itself and the seller may too', () => {
    const s = caseStatus(analysed('WAITING_FOR_SELLER_RESPONSE', [act('submit', 1), act('escalate', 5)], ['submit']));
    expect(s.next.tone).toBe('action');
    expect(s.next.title).toMatch(/Claim open/);
    expect(s.next.body).toMatch(/agent resubmits the evidence package by itself/);
    expect(s.next.body).toMatch(/submit it yourself/);
  });

  it('without an analysis, does not tell the seller to submit', () => {
    const s = caseStatus(detail('WAITING_FOR_SELLER_RESPONSE', [], ['submit']));
    expect(s.next.body).toMatch(/not built the evidence package/);
  });

  it("uses PayPal's lifecycle stage when the api sends it", () => {
    const d = detail('WAITING_FOR_SELLER_RESPONSE');
    expect(stageOf({ ...d, dispute: { ...d.dispute, stage: 'CHARGEBACK' } })).toBe('claim');
    expect(stageOf({ ...d, dispute: { ...d.dispute, stage: 'INQUIRY' } })).toBe('inquiry');
    // An escalate in our log does not override PayPal's own answer
    const inq = detail('UNDER_REVIEW', [act('escalate', 5)]);
    expect(stageOf({ ...inq, dispute: { ...inq.dispute, stage: 'INQUIRY' } })).toBe('inquiry');
  });

  it('shows the recorded outcome on a closed case', () => {
    const d = detail('RESOLVED', [act('accept', 3)]);
    const s = caseStatus({ ...d, dispute: { ...d.dispute, outcome: 'won' } });
    expect(s.next.title).toBe('Case closed: Won');
  });

  it('after claim-stage evidence, points at adjudicate with the 30 minute sandbox timing', () => {
    const s = caseStatus(detail('UNDER_REVIEW', [act('submit', 1), act('escalate', 5), act('submit', 10)]));
    expect(s.next.title).toMatch(/reviewing your evidence/);
    expect(s.next.sandboxHint).toMatch(/30 minutes/);
  });

  it('resolved after adjudicate is done', () => {
    const s = caseStatus(detail('RESOLVED', [act('escalate', 5), act('submit', 10), act('adjudicate', 40)]));
    expect(s.stage).toBe('decided');
    expect(s.next.tone).toBe('done');
    expect(s.waitingOnPaypal).toBe(false);
  });

  it('ignores analysis runs when picking the last action', () => {
    const s = caseStatus(detail('WAITING_FOR_BUYER_RESPONSE', [act('submit', 1), act('analyze', 9)]));
    expect(s.last?.action).toBe('submit');
  });
});

describe('ago', () => {
  const now = new Date('2026-11-08T10:30:00.000Z').getTime();
  it('formats minutes and hours', () => {
    expect(ago('2026-11-08T10:29:50.000Z', now)).toBe('just now');
    expect(ago('2026-11-08T10:25:00.000Z', now)).toBe('5 min ago');
    expect(ago('2026-11-08T07:30:00.000Z', now)).toBe('3 h ago');
  });
});
