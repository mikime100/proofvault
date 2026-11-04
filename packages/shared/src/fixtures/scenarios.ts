// The five shared scenarios from INTEGRATION.md section 4.
// The seed loads exactly this data, and every slice tests against it.
// Change these only through a PR all three see.
import type {
  AccessEvent,
  DecisionAction,
  DisputeContext,
  Draft,
  Order,
  PipelineFlag,
  Recommendation,
  SellerRules,
} from '../schemas';

export const DEMO_SELLER = {
  id: 'seller_demo',
  name: 'Lumen Lessons',
  email: 'seller@proofvault.test',
  paypalMerchantId: 'SANDBOX_MERCHANT_ID',
};

export const DEMO_PRODUCT = {
  id: 'prod_course',
  sellerId: DEMO_SELLER.id,
  name: 'Figma to Code: Mini Course',
  type: 'course' as const,
  price: { value: '49.00', currency: 'USD' as const },
};

export const DEFAULT_RULES: SellerRules = {
  autoSubmitEnabled: true,
  autoSubmitMinScore: 75,
  autoAcceptMaxAmount: '15.00',
  autoOfferMaxAmount: '30.00',
  offerPercent: 50,
};

const CHECKOUT_IP = '196.188.12.7';
const OTHER_IP = '41.215.88.20';
const DEVICE = 'Windows / Chrome';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0';

function order(id: string, value: string, createdAt: string): Order {
  return {
    id: `ord_${id}`,
    paypalOrderId: `PP-ORDER-${id.toUpperCase()}`,
    paypalCaptureId: `PP-CAPTURE-${id.toUpperCase()}`,
    productId: DEMO_PRODUCT.id,
    buyerEmail: `buyer-${id}@proofvault.test`,
    amount: { value, currency: 'USD' },
    checkoutIp: CHECKOUT_IP,
    checkoutDevice: DEVICE,
    riskLevel: 'low',
    createdAt,
  };
}

function event(
  id: string,
  orderId: string,
  type: AccessEvent['type'],
  at: string,
  ip = CHECKOUT_IP,
  meta?: Record<string, string>,
): AccessEvent {
  return { id, orderId, type, ip, device: DEVICE, userAgent: UA, at, ...(meta ? { meta } : {}) };
}

export interface Scenario {
  id: 'S1' | 'S2' | 'S3' | 'S4' | 'S5';
  title: string;
  context: DisputeContext;
  /** Only S5: what the fake LLM returns. */
  fakeDraft?: Draft;
  expected: {
    scoreMin?: number;
    scoreMax?: number;
    decision?: DecisionAction;
    recommendation?: Recommendation;
    flags?: PipelineFlag[];
    acceptedClaims?: number;
    rejectedClaims?: number;
  };
}

// ---------- S1 strong ----------
const o1 = order('s1', '49.00', '2026-11-01T09:00:00Z');
const S1: Scenario = {
  id: 'S1',
  title: 'Strong evidence: full course consumed from the checkout IP',
  context: {
    order: o1,
    events: [
      event('evt_s1_1', o1.id, 'login', '2026-11-01T09:05:00Z'),
      event('evt_s1_2', o1.id, 'lesson_view', '2026-11-01T09:06:00Z', CHECKOUT_IP, { lesson: '1' }),
      event('evt_s1_3', o1.id, 'lesson_view', '2026-11-01T20:15:00Z', CHECKOUT_IP, { lesson: '2' }),
      event('evt_s1_4', o1.id, 'download', '2026-11-02T08:30:00Z', CHECKOUT_IP, { file: 'bonus.pdf' }),
      event('evt_s1_5', o1.id, 'lesson_view', '2026-11-02T19:00:00Z', CHECKOUT_IP, { lesson: '3' }),
      event('evt_s1_6', o1.id, 'lesson_view', '2026-11-03T21:40:00Z', CHECKOUT_IP, { lesson: '4' }),
    ],
    dispute: {
      id: 'dsp_s1',
      paypalDisputeId: 'PP-D-S1',
      orderId: o1.id,
      reason: 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED',
      amount: o1.amount,
      status: 'WAITING_FOR_SELLER_RESPONSE',
      responseDueAt: '2026-11-14T23:59:00Z',
      winScore: null,
      createdAt: '2026-11-04T10:00:00Z',
    },
  },
  expected: { scoreMin: 75, decision: 'submit', recommendation: 'fight' },
};

// ---------- S2 medium ----------
const o2 = order('s2', '49.00', '2026-11-01T11:00:00Z');
const S2: Scenario = {
  id: 'S2',
  title: 'Partial evidence: one login and one lesson, different IP',
  context: {
    order: o2,
    events: [
      event('evt_s2_1', o2.id, 'login', '2026-11-02T18:00:00Z', OTHER_IP),
      event('evt_s2_2', o2.id, 'lesson_view', '2026-11-02T18:02:00Z', OTHER_IP, { lesson: '1' }),
    ],
    dispute: {
      id: 'dsp_s2',
      paypalDisputeId: 'PP-D-S2',
      orderId: o2.id,
      reason: 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED',
      amount: o2.amount,
      status: 'WAITING_FOR_SELLER_RESPONSE',
      responseDueAt: '2026-11-13T23:59:00Z',
      winScore: null,
      createdAt: '2026-11-04T11:00:00Z',
    },
  },
  expected: { scoreMin: 40, scoreMax: 74, decision: 'await_approval' },
};

// ---------- S3 weak, small amount ----------
const o3 = order('s3', '9.00', '2026-11-02T07:00:00Z');
const S3: Scenario = {
  id: 'S3',
  title: 'Weak evidence on a small amount: purchase only, no access',
  context: {
    order: o3,
    events: [],
    dispute: {
      id: 'dsp_s3',
      paypalDisputeId: 'PP-D-S3',
      orderId: o3.id,
      reason: 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED',
      amount: o3.amount,
      status: 'WAITING_FOR_SELLER_RESPONSE',
      responseDueAt: '2026-11-15T23:59:00Z',
      winScore: null,
      createdAt: '2026-11-04T12:00:00Z',
    },
  },
  expected: {
    scoreMax: 39,
    decision: 'accept',
    recommendation: 'refund',
    flags: ['no_access_events'],
  },
};

// ---------- S4 no matching order ----------
const S4: Scenario = {
  id: 'S4',
  title: 'Dispute for an order we have never seen',
  context: {
    order: null,
    events: [],
    dispute: {
      id: 'dsp_s4',
      paypalDisputeId: 'PP-D-S4',
      orderId: null,
      reason: 'UNAUTHORISED',
      amount: { value: '49.00', currency: 'USD' },
      status: 'WAITING_FOR_SELLER_RESPONSE',
      responseDueAt: '2026-11-12T23:59:00Z',
      winScore: null,
      createdAt: '2026-11-04T13:00:00Z',
    },
  },
  expected: { decision: 'await_approval', flags: ['no_matching_order'] },
};

// ---------- S5 guardrail trap (S2 data, lying LLM) ----------
const S5: Scenario = {
  id: 'S5',
  title: 'Guardrail trap: the LLM invents a record and inflates a count',
  context: { ...S2.context, dispute: { ...S2.context.dispute, id: 'dsp_s5', paypalDisputeId: 'PP-D-S5' } },
  fakeDraft: {
    recommendation: 'fight',
    claims: [
      { text: 'The buyer logged in on 2026-11-02.', recordIds: ['evt_s2_1'] },
      { text: 'The buyer downloaded the bonus PDF.', recordIds: ['evt_does_not_exist'] },
      { text: 'The buyer viewed 5 lessons.', recordIds: ['evt_s2_2'] },
    ],
  },
  expected: { acceptedClaims: 1, rejectedClaims: 2 },
};

export const SCENARIOS: Scenario[] = [S1, S2, S3, S4, S5];
