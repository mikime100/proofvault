import { Draft } from '@proofvault/shared';
import type { Draft as DraftType, DisputeReason, LlmClient, Timeline } from '@proofvault/shared';

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
    'Write only claims that are backed by records in the timeline below.',
    'Never invent records, dates, or counts.',
    'Every record id you cite MUST appear in the timeline.',
    'Write dates as YYYY-MM-DD only.',
    'Return JSON only, no prose.',
  ].join(' ');

  const lines = timeline.entries.map((e) => `${e.recordId} | ${e.type} | ${e.at} | ${e.summary}`);
  const prompt = [
    'TASK: draft',
    `disputeId: ${timeline.disputeId}`,
    `Dispute reason: ${reason}`,
    'Timeline (recordId | type | date | summary):',
    ...lines,
    '',
    'Return JSON exactly: {"claims":[{"text":"...","recordIds":["..."]}],"recommendation":"fight|offer|refund"}.',
    'Cite at least one record per claim. Use only the record ids listed above.',
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
