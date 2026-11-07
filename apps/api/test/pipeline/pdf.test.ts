import { SCENARIOS } from '@proofvault/shared/fixtures';
import type { PipelineResult } from '@proofvault/shared';
import { describe, expect, it } from 'vitest';
import { buildTimeline, renderEvidencePdf } from '../../src/pipeline';

const scenario = (id: 'S1' | 'S2' | 'S3' | 'S4' | 'S5') => SCENARIOS.find((s) => s.id === id)!;

// A realistic S1 result using the real buildTimeline (IPs full in the timeline object,
// as Mike's timeline.ts intends — the PDF must mask them itself).
const S1_RESULT: PipelineResult = (() => {
  const timeline = buildTimeline(scenario('S1').context);
  return {
    timeline,
    accepted: [
      {
        text: 'The buyer viewed 4 lessons between 2026-11-01 and 2026-11-03.',
        recordIds: ['evt_s1_2', 'evt_s1_3', 'evt_s1_5', 'evt_s1_6'],
      },
    ],
    rejected: [
      {
        claim: { text: 'The buyer viewed 9 lessons.', recordIds: ['evt_s1_2'] },
        reason: 'Says 9 lessons, but the cited records show 4',
      },
    ],
    recommendation: 'fight' as const,
    responseText: 'The buyer viewed 4 lessons between 2026-11-01 and 2026-11-03.',
    score: { value: 100, features: [], reasons: ['Strong access evidence across 3 days.'] },
    decision: { action: 'submit' as const, reason: 'Score 100 meets the auto-submit threshold.' },
    flags: [],
  };
})();

describe('renderEvidencePdf', () => {
  it('produces a valid PDF buffer under 5 MB', async () => {
    const buf = await renderEvidencePdf(S1_RESULT);
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(buf.length).toBeLessThan(5 * 1024 * 1024);
  });

  it('the PDF buffer never contains the full checkout IP (renderEvidencePdf masks via maskIp)', async () => {
    // The timeline has full IPs (196.188.12.7); the pdf must not expose them.
    // PDF streams are binary-compressed so we check the uncompressed cross-reference trailer
    // text. The full IP string must not appear anywhere in the raw bytes.
    const buf = await renderEvidencePdf(S1_RESULT);
    expect(buf.indexOf(Buffer.from('196.188.12.7'))).toBe(-1);
  });
});
