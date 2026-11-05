import { SUPPORTED_REASONS } from '@proofvault/shared';
import type {
  Claim,
  Decision,
  DisputeContext,
  LlmClient,
  PipelineFlag,
  PipelineResult,
  Recommendation,
  RejectedClaim,
  Score,
  SellerRules,
  Timeline,
} from '@proofvault/shared';
import { buildTimeline } from './timeline';
import { checkClaims } from './claims';
import { scoreDispute } from './score';
import { draftResponse, DraftError } from './draft';
import { explainScore } from './explain';
import { decide } from '../rules/decide';

/**
 * Run the full pipeline for one dispute. Pure inputs/outputs: Mike loads the data and passes
 * it in; this returns the analysis; Mike saves it and runs the PayPal action.
 *
 * build timeline -> draft (LLM) -> check claims -> score (code) -> explain (LLM) -> decide.
 * Short-circuits with flags for no matching order or unsupported reason, and falls back to
 * manual review if the LLM never returns a valid draft.
 */
export async function runPipeline(
  input: DisputeContext,
  rules: SellerRules,
  deps: { llm: LlmClient },
): Promise<PipelineResult> {
  const { dispute, order } = input;
  const timeline = buildTimeline(input);
  const flags: PipelineFlag[] = [];

  if (!order) {
    flags.push('no_matching_order');
    return noAction(timeline, 'refund', 'No matching order was found for this dispute.', flags);
  }

  if (!SUPPORTED_REASONS.includes(dispute.reason)) {
    flags.push('unsupported_reason');
    return noAction(
      timeline,
      'refund',
      `Reason ${dispute.reason} is not supported for automated scoring.`,
      flags,
    );
  }

  const accessCount = timeline.entries.filter((e) => e.source === 'access_event').length;
  if (accessCount === 0) flags.push('no_access_events');

  let recommendation: Recommendation = 'refund';
  let accepted: Claim[] = [];
  let rejected: RejectedClaim[] = [];
  let llmFailed = false;

  try {
    const draft = await draftResponse(timeline, dispute.reason, deps.llm);
    recommendation = draft.recommendation;
    const check = checkClaims(draft, timeline);
    accepted = check.accepted;
    rejected = check.rejected;
  } catch (e) {
    if (e instanceof DraftError) {
      llmFailed = true;
      flags.push('llm_failed');
    } else {
      throw e;
    }
  }

  const score: Score = scoreDispute(timeline, dispute.reason);
  score.reasons = llmFailed ? fallbackReasons(score) : await explainOrFallback(score, deps.llm);

  const decision: Decision = llmFailed
    ? { action: 'await_approval', reason: 'Manual review: the model did not return a valid draft.' }
    : decide(score, dispute.amount, rules);

  return {
    timeline,
    accepted,
    rejected,
    recommendation,
    responseText: accepted.map((c) => c.text).join(' '),
    score,
    decision,
    flags,
  };
}

function noAction(
  timeline: Timeline,
  recommendation: Recommendation,
  decisionReason: string,
  flags: PipelineFlag[],
): PipelineResult {
  return {
    timeline,
    accepted: [],
    rejected: [],
    recommendation,
    responseText: '',
    score: { value: 0, features: [], reasons: [] },
    decision: { action: 'await_approval', reason: decisionReason },
    flags,
  };
}

async function explainOrFallback(score: Score, llm: LlmClient): Promise<string[]> {
  try {
    return await explainScore(score, llm);
  } catch {
    return fallbackReasons(score);
  }
}

function fallbackReasons(score: Score): string[] {
  if (score.features.length === 0) return ['No automated reasons available.'];
  return score.features.map((f) => `${f.label} (+${f.points}).`);
}
