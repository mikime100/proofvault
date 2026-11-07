// API response fixtures for the frontends (VITE_USE_FIXTURES=true).
// The analysis values here are hand-written examples so Moges can build screens
// before the real pipeline exists. They are NOT the pipeline's expected output;
// the expectations live in scenarios.ts.
import { maskIp } from '../mask';
import type {
  ActionLogEntry,
  Claim,
  DecisionAction,
  DisputeDetail,
  DisputeList,
  DisputeContext,
  PipelineResult,
  RejectedClaim,
  Timeline,
} from '../schemas';
import { SCENARIOS } from './scenarios';

function maskedContext(ctx: DisputeContext): DisputeContext {
  return {
    ...ctx,
    order: ctx.order ? { ...ctx.order, checkoutIp: maskIp(ctx.order.checkoutIp) } : null,
    events: ctx.events.map((e) => ({ ...e, ip: maskIp(e.ip) })),
  };
}

function timelineOf(ctx: DisputeContext): Timeline {
  const entries: Timeline['entries'] = [];
  if (ctx.order) {
    entries.push({
      recordId: ctx.order.id,
      source: 'order',
      type: 'purchase',
      at: ctx.order.createdAt,
      summary: `Paid ${ctx.order.amount.value} ${ctx.order.amount.currency} with PayPal`,
      ip: ctx.order.checkoutIp,
      device: ctx.order.checkoutDevice,
    });
  }
  for (const e of ctx.events) {
    entries.push({
      recordId: e.id,
      source: 'access_event',
      type: e.type,
      at: e.at,
      summary: e.meta?.lesson ? `Viewed lesson ${e.meta.lesson}` : e.type,
      ip: e.ip,
      device: e.device,
    });
  }
  entries.push({
    recordId: ctx.dispute.id,
    source: 'dispute',
    type: 'dispute_opened',
    at: ctx.dispute.createdAt,
    summary: `Dispute opened: ${ctx.dispute.reason}`,
  });
  return { disputeId: ctx.dispute.id, orderId: ctx.order?.id ?? null, entries };
}

function analysis(
  ctx: DisputeContext,
  score: number,
  decision: DecisionAction,
  accepted: Claim[],
  rejected: RejectedClaim[] = [],
  flags: PipelineResult['flags'] = [],
): PipelineResult {
  return {
    timeline: timelineOf(ctx),
    accepted,
    rejected,
    recommendation: score >= 40 ? 'fight' : 'refund',
    responseText: accepted.map((c) => c.text).join(' '),
    score: {
      value: score,
      features: [],
      reasons: [`Example reason for a score of ${score}.`],
    },
    decision: { action: decision, reason: 'Example decision text.' },
    flags,
  };
}

const [S1, S2, S3, S4, S5] = SCENARIOS.map((s) => maskedContext(s.context)) as [
  DisputeContext,
  DisputeContext,
  DisputeContext,
  DisputeContext,
  DisputeContext,
];

const action = (disputeId: string, a: ActionLogEntry['action'], detail: string): ActionLogEntry => ({
  id: `act_${disputeId}_${a}`,
  disputeId,
  action: a,
  actor: 'agent',
  ok: true,
  detail,
  createdAt: '2026-11-04T14:00:00Z',
});

// Seed cases were never loaded from PayPal, so no restriction is known (decision 16).
const ALL_ACTIONS: DisputeDetail['allowedActions'] = ['submit', 'offer', 'accept', 'message', 'escalate'];

const details: Record<string, Omit<DisputeDetail, 'allowedActions'>> = {
  dsp_s1: {
    dispute: { ...S1.dispute, winScore: 88 },
    order: S1.order,
    analysis: analysis(S1, 88, 'submit', [
      { text: 'The buyer viewed all 4 lessons between 2026-11-01 and 2026-11-03.', recordIds: ['evt_s1_2', 'evt_s1_3', 'evt_s1_5', 'evt_s1_6'] },
      { text: 'The buyer downloaded the bonus PDF on 2026-11-02.', recordIds: ['evt_s1_4'] },
    ]),
    actions: [action('dsp_s1', 'analyze', 'Pipeline ran'), action('dsp_s1', 'submit', 'Evidence submitted')],
  },
  dsp_s2: {
    dispute: { ...S2.dispute, winScore: 52 },
    order: S2.order,
    analysis: analysis(S2, 52, 'await_approval', [
      { text: 'The buyer logged in on 2026-11-02 and viewed lesson 1.', recordIds: ['evt_s2_1', 'evt_s2_2'] },
    ]),
    actions: [action('dsp_s2', 'analyze', 'Pipeline ran')],
  },
  dsp_s3: {
    dispute: { ...S3.dispute, winScore: 12 },
    order: S3.order,
    analysis: analysis(S3, 12, 'accept', [], [], ['no_access_events']),
    actions: [action('dsp_s3', 'analyze', 'Pipeline ran'), action('dsp_s3', 'accept', 'Claim accepted, refund issued')],
  },
  dsp_s4: {
    dispute: S4.dispute,
    order: null,
    analysis: analysis(S4, 0, 'await_approval', [], [], ['no_matching_order']),
    actions: [action('dsp_s4', 'analyze', 'Pipeline ran')],
  },
  dsp_s5: {
    dispute: { ...S5.dispute, winScore: 52 },
    order: S5.order,
    analysis: analysis(
      S5,
      52,
      'await_approval',
      [{ text: 'The buyer logged in on 2026-11-02.', recordIds: ['evt_s2_1'] }],
      [
        { claim: { text: 'The buyer downloaded the bonus PDF.', recordIds: ['evt_does_not_exist'] }, reason: 'Record evt_does_not_exist does not exist for this order' },
        { claim: { text: 'The buyer viewed 5 lessons.', recordIds: ['evt_s2_2'] }, reason: 'Says 5 lessons, records show 1' },
      ],
    ),
    actions: [action('dsp_s5', 'analyze', 'Pipeline ran')],
  },
};

export const disputeDetailFixtures: Record<string, DisputeDetail> = Object.fromEntries(
  Object.entries(details).map(([id, d]) => [id, { ...d, allowedActions: ALL_ACTIONS }]),
);

export const disputeListFixture: DisputeList = {
  items: Object.values(disputeDetailFixtures).map((d) => ({
    ...d.dispute,
    decision: d.analysis?.decision.action ?? null,
    buyerEmail: d.order?.buyerEmail ?? null,
    allowedActions: d.allowedActions,
  })),
};
