import { z } from 'zod';

// ---------- Basics (data rules from INTEGRATION.md section 3) ----------

/** UTC ISO 8601, e.g. "2026-11-05T14:03:00Z". */
export const IsoDate = z.iso.datetime();

/** Money as PayPal sends it: value is a string with 2 decimals. USD only for the hackathon. */
export const Money = z.object({
  value: z.string().regex(/^\d+\.\d{2}$/),
  currency: z.literal('USD'),
});
export type Money = z.infer<typeof Money>;

/** PayPal's own dispute reason values, unchanged. */
export const DisputeReason = z.enum([
  'MERCHANDISE_OR_SERVICE_NOT_RECEIVED',
  'MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED',
  'UNAUTHORISED',
  'CREDIT_NOT_PROCESSED',
  'DUPLICATE_TRANSACTION',
  'INCORRECT_AMOUNT',
  'PAYMENT_BY_OTHER_MEANS',
  'CANCELED_RECURRING_BILLING',
  'PROBLEM_WITH_REMITTANCE',
  'OTHER',
]);
export type DisputeReason = z.infer<typeof DisputeReason>;

/** The reasons ProofVault scores. Every other reason goes to await_approval with flag unsupported_reason. */
export const SUPPORTED_REASONS: readonly DisputeReason[] = [
  'MERCHANDISE_OR_SERVICE_NOT_RECEIVED',
  'MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED',
  'UNAUTHORISED',
];

/** PayPal's own dispute status values, unchanged. */
export const DisputeStatus = z.enum([
  'OPEN',
  'WAITING_FOR_BUYER_RESPONSE',
  'WAITING_FOR_SELLER_RESPONSE',
  'UNDER_REVIEW',
  'RESOLVED',
  'OTHER',
]);
export type DisputeStatus = z.infer<typeof DisputeStatus>;

/** login = the buyer opened the course in a new browser session (fired once per session). */
export const AccessEventType = z.enum(['login', 'lesson_view', 'download', 'activation']);
export type AccessEventType = z.infer<typeof AccessEventType>;

export const RiskLevel = z.enum(['low', 'medium', 'high']);

// ---------- Records ----------

export const AccessEvent = z.object({
  id: z.string(),
  orderId: z.string(),
  type: AccessEventType,
  /**
   * Set by the server from X-Forwarded-For, never sent by the browser.
   * Full IP inside the api and pipeline. Masked by the api before it leaves the server.
   */
  ip: z.string(),
  device: z.string(),
  userAgent: z.string(),
  /** Set by the server when the event arrives, never sent by the browser. */
  at: IsoDate,
  meta: z.record(z.string(), z.string()).optional(),
});
export type AccessEvent = z.infer<typeof AccessEvent>;

export const Order = z.object({
  /** Also sent to PayPal as custom_id when the order is created, as a second way to match disputes. */
  id: z.string(),
  paypalOrderId: z.string(),
  /** Null only before capture. Disputes are matched on this first, then on custom_id. */
  paypalCaptureId: z.string().nullable(),
  productId: z.string(),
  buyerEmail: z.string(),
  amount: Money,
  checkoutIp: z.string(),
  checkoutDevice: z.string(),
  riskLevel: RiskLevel,
  createdAt: IsoDate,
});
export type Order = z.infer<typeof Order>;

export const Dispute = z.object({
  id: z.string(),
  paypalDisputeId: z.string(),
  /** Null when the dispute does not match any order we know (scenario S4). */
  orderId: z.string().nullable(),
  reason: DisputeReason,
  amount: Money,
  status: DisputeStatus,
  responseDueAt: IsoDate.nullable(),
  winScore: z.number().int().min(0).max(100).nullable(),
  createdAt: IsoDate,
});
export type Dispute = z.infer<typeof Dispute>;

// ---------- Pipeline ----------

/** Everything the pipeline needs, loaded by the api and passed in. */
export const DisputeContext = z.object({
  dispute: Dispute,
  order: Order.nullable(),
  events: z.array(AccessEvent),
});
export type DisputeContext = z.infer<typeof DisputeContext>;

export const TimelineEntry = z.object({
  /** Database id of the record this entry came from. Claims point at these. */
  recordId: z.string(),
  source: z.enum(['order', 'access_event', 'dispute']),
  type: z.string(),
  at: IsoDate,
  summary: z.string(),
  ip: z.string().optional(),
  device: z.string().optional(),
});
export type TimelineEntry = z.infer<typeof TimelineEntry>;

export const Timeline = z.object({
  disputeId: z.string(),
  orderId: z.string().nullable(),
  entries: z.array(TimelineEntry),
});
export type Timeline = z.infer<typeof Timeline>;

export const Claim = z.object({
  /** Dates inside claim text are always YYYY-MM-DD. The UI and PDF format them for display. */
  text: z.string().min(1),
  recordIds: z.array(z.string()),
});
export type Claim = z.infer<typeof Claim>;

export const Recommendation = z.enum(['fight', 'offer', 'refund']);
export type Recommendation = z.infer<typeof Recommendation>;

/** What the LLM must return. Nothing else from the LLM reaches PayPal. */
export const Draft = z.object({
  claims: z.array(Claim),
  recommendation: Recommendation,
});
export type Draft = z.infer<typeof Draft>;

export const RejectedClaim = z.object({
  claim: Claim,
  reason: z.string(),
});
export type RejectedClaim = z.infer<typeof RejectedClaim>;

export const CheckResult = z.object({
  accepted: z.array(Claim),
  rejected: z.array(RejectedClaim),
});
export type CheckResult = z.infer<typeof CheckResult>;

export const ScoreFeature = z.object({
  key: z.string(),
  label: z.string(),
  points: z.number(),
  recordIds: z.array(z.string()),
});
export type ScoreFeature = z.infer<typeof ScoreFeature>;

export const Score = z.object({
  value: z.number().int().min(0).max(100),
  features: z.array(ScoreFeature),
  /** Plain-language reasons. Written by the LLM, but the number above is computed by code. */
  reasons: z.array(z.string()),
});
export type Score = z.infer<typeof Score>;

/**
 * decide() checks these in this exact order (first match wins):
 * 1. unsupported reason or no matching order -> await_approval
 * 2. autoSubmitEnabled and score >= autoSubmitMinScore -> submit
 * 3. score < weakScoreBelow and amount <= autoAcceptMaxAmount -> accept
 * 4. score < weakScoreBelow and amount <= autoOfferMaxAmount -> offer (offerPercent of amount)
 * 5. everything else -> await_approval
 */
export const SellerRules = z.object({
  autoSubmitEnabled: z.boolean(),
  autoSubmitMinScore: z.number().int().min(0).max(100),
  weakScoreBelow: z.number().int().min(0).max(100),
  autoAcceptMaxAmount: z.string().regex(/^\d+\.\d{2}$/),
  autoOfferMaxAmount: z.string().regex(/^\d+\.\d{2}$/),
  offerPercent: z.number().int().min(1).max(100),
});
export type SellerRules = z.infer<typeof SellerRules>;

export const DecisionAction = z.enum(['submit', 'offer', 'accept', 'await_approval']);
export type DecisionAction = z.infer<typeof DecisionAction>;

/**
 * What the pipeline recommends. The api's executor only runs it automatically when:
 * - this is the first analysis with no earlier agent action on the dispute, and
 * - the dispute status is WAITING_FOR_SELLER_RESPONSE.
 * Otherwise it waits for the seller. A rejected offer never triggers a second auto offer.
 */
export const Decision = z.object({
  action: DecisionAction,
  reason: z.string(),
  offerAmount: Money.optional(),
});
export type Decision = z.infer<typeof Decision>;

export const PipelineFlag = z.enum([
  'no_matching_order',
  'unsupported_reason',
  'llm_failed',
  'no_access_events',
]);
export type PipelineFlag = z.infer<typeof PipelineFlag>;

export const PipelineResult = z.object({
  timeline: Timeline,
  accepted: z.array(Claim),
  rejected: z.array(RejectedClaim),
  recommendation: Recommendation,
  /** Final text sent to PayPal, built only from accepted claims. */
  responseText: z.string(),
  score: Score,
  decision: Decision,
  flags: z.array(PipelineFlag),
});
export type PipelineResult = z.infer<typeof PipelineResult>;

/**
 * The only way pipeline code talks to an LLM. Tests pass a fake.
 * Returns parsed JSON; the caller validates it with a schema.
 */
export interface LlmClient {
  generateJson(args: { system: string; prompt: string }): Promise<unknown>;
}

// ---------- API (Mike serves, Moges consumes) ----------

/**
 * Every route that changes something (approve, submit, offer, accept, sandbox steps, rules)
 * needs this header to equal the server's DEMO_PASSCODE. Reads stay open for judges.
 */
export const DEMO_PASSCODE_HEADER = 'x-demo-passcode';

export const ApiError = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
export type ApiError = z.infer<typeof ApiError>;

export const Health = z.object({ ok: z.literal(true), version: z.string() });
export type Health = z.infer<typeof Health>;

/** Tied to the order's private accessToken, so nobody who only knows an order id can fake evidence. */
export const TrackRequest = z.object({
  accessToken: z.string().min(1),
  type: AccessEventType,
  meta: z.record(z.string(), z.string()).optional(),
});
export type TrackRequest = z.infer<typeof TrackRequest>;

export const CreateOrderResponse = z.object({ paypalOrderId: z.string() });
export const CaptureOrderResponse = z.object({
  paypalOrderId: z.string(),
  status: z.string(),
  accessToken: z.string(),
});

export const DisputeListItem = Dispute.extend({
  decision: DecisionAction.nullable(),
  buyerEmail: z.string().nullable(),
});
export type DisputeListItem = z.infer<typeof DisputeListItem>;

export const DisputeList = z.object({ items: z.array(DisputeListItem) });
export type DisputeList = z.infer<typeof DisputeList>;

/** POST /disputes/fetch: load one PayPal case by its id (the list lags new cases by minutes). */
export const FetchDisputeRequest = z.object({ caseId: z.string().regex(/^PP-[A-Z0-9-]+$/) });
export type FetchDisputeRequest = z.infer<typeof FetchDisputeRequest>;

/** POST /disputes/sync: how many new or changed cases the manual poll brought in. */
export const SyncResult = z.object({ synced: z.number().int().min(0) });
export type SyncResult = z.infer<typeof SyncResult>;

/**
 * POST /disputes/:id/actions: what the seller (or the executor, for auto-actions) does on PayPal.
 * Answers with the ActionLogEntry it wrote. submit uses the saved evidence package; offer without
 * an amount uses the seller's offerPercent of the disputed amount; accept refunds in full.
 */
export const DisputeActionRequest = z.discriminatedUnion('type', [
  z.object({ type: z.literal('submit') }),
  z.object({ type: z.literal('offer'), amount: Money.optional(), note: z.string().max(2000).optional() }),
  z.object({ type: z.literal('accept'), note: z.string().max(2000).optional() }),
  z.object({ type: z.literal('message'), text: z.string().min(1).max(2000) }),
]);
export type DisputeActionRequest = z.infer<typeof DisputeActionRequest>;

export const SandboxStep = z.enum(['require-evidence', 'adjudicate']);
export type SandboxStep = z.infer<typeof SandboxStep>;

/**
 * POST /disputes/:id/sandbox/:step, sandbox only: push a case along for the demo. Body optional.
 * Defaults: require-evidence asks the seller; adjudicate decides in the seller's favour.
 */
export const SandboxStepBody = z
  .object({
    party: z.enum(['SELLER_EVIDENCE', 'BUYER_EVIDENCE']).optional(),
    outcome: z.enum(['SELLER_FAVOR', 'BUYER_FAVOR']).optional(),
  })
  .default({});
export type SandboxStepBody = z.infer<typeof SandboxStepBody>;

export const ActionLogEntry = z.object({
  id: z.string(),
  disputeId: z.string(),
  action: z.enum(['submit', 'offer', 'accept', 'message', 'require_evidence', 'adjudicate', 'analyze']),
  actor: z.enum(['agent', 'seller']),
  ok: z.boolean(),
  detail: z.string(),
  createdAt: IsoDate,
});
export type ActionLogEntry = z.infer<typeof ActionLogEntry>;

export const DisputeDetail = z.object({
  dispute: Dispute,
  order: Order.nullable(),
  /** Null until the pipeline has run. */
  analysis: PipelineResult.nullable(),
  actions: z.array(ActionLogEntry),
});
export type DisputeDetail = z.infer<typeof DisputeDetail>;
