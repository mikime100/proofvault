// The AI pipeline. Signatures are the contract (INTEGRATION.md section 6).
// Pure inputs and outputs: no Prisma, no PayPal client in here (eslint enforces it).
import type {
  Decision,
  DisputeContext,
  DisputeReason,
  Draft,
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

export { buildTimeline } from './timeline';
export { checkClaims } from './claims';

export async function draftResponse(
  _timeline: Timeline,
  _reason: DisputeReason,
  _llm: LlmClient,
): Promise<Draft> {
  return todo('draftResponse');
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
