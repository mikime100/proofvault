import { z } from 'zod';
import type { DisputeReason, LlmClient, Score } from '@proofvault/shared';
import { reasonLabel } from './reason';

const Reasons = z.object({ reasons: z.array(z.string().min(1)).min(1).max(6) });

/**
 * Plain-language reasons for the score, shown to the seller on the dashboard (never sent to
 * PayPal). The number is code-computed; this only writes the explanation. One retry, then a
 * thrown error (runPipeline falls back to feature labels).
 */
export async function explainScore(score: Score, llm: LlmClient, reason?: DisputeReason): Promise<string[]> {
  const system = [
    'You explain a PayPal dispute score to a seller of a digital product (an online course and its downloads).',
    'Nothing is shipped, so never mention shipping, tracking, delivery, photos or receipts.',
    'The score is our estimate of the chance the seller wins this dispute, not a verdict on who is right.',
    'Be honest and stick to the evidence listed. Do not suggest evidence the seller does not have.',
    'Use plain words, no internal ids and no codes in CAPITALS_WITH_UNDERSCORES. Return JSON only.',
  ].join(' ');
  const features = score.features.map((f) => `${f.label} (+${f.points})`).join('; ');
  // State the access fact outright, so the model neither invents use nor denies real use.
  const accessFact =
    score.features.length === 0
      ? 'There is no record that the buyer ever opened the course. Say so plainly, and say that refunding is the honest move.'
      : 'The records show the buyer did access the course after paying. Do not say otherwise.';
  const prompt = [
    'TASK: explain',
    ...(reason ? [`Dispute reason: ${reasonLabel(reason)}`] : []),
    `Chance of winning: ${score.value} out of 100.`,
    `Evidence found: ${features || 'none'}`,
    accessFact,
    'Return JSON: {"reasons":["...","..."]} with 2 to 4 short plain-language reasons.',
  ].join('\n');

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await llm.generateJson({ system, prompt });
      return Reasons.parse(raw).reasons;
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(`Could not parse reasons: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}
