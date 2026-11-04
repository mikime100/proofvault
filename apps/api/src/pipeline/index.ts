// Fitsum's module. Signatures are the contract (INTEGRATION.md section 6).
// Pure inputs and outputs: no Prisma, no PayPal client in here (eslint enforces it).
import type {
  Decision,
  DisputeContext,
  DisputeReason,
  Draft,
  CheckResult,
  LlmClient,
  Money,
  PipelineResult,
  Score,
  SellerRules,
  Timeline,
} from '@proofvault/shared';

const todo = (name: string): never => {
  throw new Error(`pipeline.${name} not implemented yet`);
};

export function buildTimeline(_input: DisputeContext): Timeline {
  return todo('buildTimeline');
}

export async function draftResponse(
  _timeline: Timeline,
  _reason: DisputeReason,
  _llm: LlmClient,
): Promise<Draft> {
  return todo('draftResponse');
}

/**
 * A claim is accepted only if:
 * - it cites at least one record, and every cited record is in this timeline
 * - dates are written as YYYY-MM-DD (any other date format is rejected)
 * - any date written in it matches the date of one of its cited records
 * - any count in it ("4 lessons", "3 days") equals the number of cited records of that type,
 *   or the number of distinct days among them
 * Anything else in the text is accepted on the strength of its citations.
 */
export function checkClaims(_draft: Draft, _timeline: Timeline): CheckResult {
  return todo('checkClaims');
}

export function scoreDispute(_timeline: Timeline, _reason: DisputeReason): Score {
  return todo('scoreDispute');
}

export async function explainScore(_score: Score, _llm: LlmClient): Promise<string[]> {
  return todo('explainScore');
}

/** Rule order is fixed: see the comment on SellerRules in packages/shared. */
export function decide(_score: Score, _amount: Money, _rules: SellerRules): Decision {
  return todo('decide');
}

export async function renderEvidencePdf(_result: PipelineResult): Promise<Buffer> {
  return todo('renderEvidencePdf');
}

export async function runPipeline(
  _input: DisputeContext,
  _rules: SellerRules,
  _deps: { llm: LlmClient },
): Promise<PipelineResult> {
  return todo('runPipeline');
}
