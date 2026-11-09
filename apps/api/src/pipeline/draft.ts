import { Draft } from '@proofvault/shared';
import type { Draft as DraftType, DisputeReason, LlmClient, Timeline } from '@proofvault/shared';
import { reasonLabel } from './reason';

/** Thrown when the LLM never returns a parseable Draft, even after one retry. */
export class DraftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DraftError';
  }
}

/**
 * Ask the LLM for a structured draft. The model only returns claims + a recommendation;
 * nothing here is sent to PayPal until checkClaims has vetted every claim.
 * One retry on a parse failure, then DraftError (runPipeline turns that into manual review).
 */
export async function draftResponse(
  timeline: Timeline,
  reason: DisputeReason,
  llm: LlmClient,
): Promise<DraftType> {
  const system = [
    "You are ProofVault's evidence assistant for PayPal dispute responses.",
    'The product is digital (an online course and its downloads): nothing is shipped, so there is no tracking number.',
    "PayPal's reviewer reads your claims, so write them in plain English.",
    'Never write internal ids, record ids or PayPal reason codes (words in CAPITALS_WITH_UNDERSCORES) inside a claim; cite records only in recordIds.',
    'Write only claims that are backed by records in the timeline below.',
    'Never invent records, dates, or counts.',
    'Every record id you cite MUST appear in the timeline.',
    'Write dates as YYYY-MM-DD only.',
    'Return JSON only, no prose.',
  ].join(' ');

  const lines = timeline.entries.map((e) => `${e.recordId} | ${e.type} | ${e.at} | ${e.summary}`);
  const prompt = [
    'TASK: draft',
    `Dispute reason: ${reasonLabel(reason)}`,
    'Timeline (recordId | type | date | summary):',
    ...lines,
    '',
    'Return JSON exactly: {"claims":[{"text":"...","recordIds":["..."]}],"recommendation":"fight|offer|refund"}.',
    'Cite at least one record per claim. Use only the record ids listed above.',
    'Recommendation: "fight" when the records show the buyer used the product, "offer" when there is some access but it is thin, "refund" when there is no record the buyer ever accessed it.',
  ].join('\n');

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await llm.generateJson({ system, prompt });
      return Draft.parse(raw);
    } catch (e) {
      lastError = e;
    }
  }
  throw new DraftError(`Could not parse a valid draft after retry: ${stringifyError(lastError)}`);
}

function stringifyError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
