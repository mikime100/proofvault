import { z } from 'zod';
import type { LlmClient, Score } from '@proofvault/shared';

const Reasons = z.object({ reasons: z.array(z.string().min(1)).min(1).max(6) });

/**
 * Plain-language reasons for the score. The number is code-computed; this only writes the
 * explanation. One retry, then a thrown error (runPipeline falls back to feature labels).
 */
export async function explainScore(score: Score, llm: LlmClient): Promise<string[]> {
  const system = 'You explain a dispute win score in plain language for a seller. Return JSON only.';
  const features = score.features.map((f) => `${f.label} (+${f.points})`).join('; ');
  const prompt = [
    'TASK: explain',
    `Dispute score: ${score.value} out of 100.`,
    `Evidence features: ${features || 'none'}`,
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
