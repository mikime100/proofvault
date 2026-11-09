import { SCENARIOS } from '@proofvault/shared/fixtures';
import type { PipelineResult } from '@proofvault/shared';
import { describe, expect, it } from 'vitest';
import { buildTimeline, renderEvidencePdf } from '../../src/pipeline';
import type { EvidenceMeta } from '../../src/pipeline';

const scenario = (id: 'S1' | 'S2' | 'S3' | 'S4' | 'S5') => SCENARIOS.find((s) => s.id === id)!;

const S1_META: EvidenceMeta = {
  paypalDisputeId: 'PP-R-HUT-10197163',
  productName: 'Figma to Code: Mini Course',
  reason: 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED',
};

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
    rejected: [],
    recommendation: 'fight' as const,
    responseText: 'The buyer viewed 4 lessons between 2026-11-01 and 2026-11-03.',
    score: { value: 88, features: [], reasons: ['Strong access evidence.'] },
    decision: { action: 'submit' as const, reason: 'Score 88 meets threshold.' },
    flags: [],
  };
})();

// S3 has no access events — zero accepted claims after the pipeline
const S3_RESULT: PipelineResult = (() => {
  const timeline = buildTimeline(scenario('S3').context);
  return {
    timeline,
    accepted: [],
    rejected: [],
    recommendation: 'refund' as const,
    responseText: '',
    score: { value: 0, features: [], reasons: [] },
    decision: { action: 'accept' as const, reason: 'Weak evidence.' },
    flags: ['no_access_events'],
  };
})();

describe('renderEvidencePdf', () => {
  it('produces a valid PDF buffer under 5 MB', async () => {
    const buf = await renderEvidencePdf(S1_RESULT, S1_META);
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(buf.length).toBeLessThan(5 * 1024 * 1024);
  });

  it('the PDF never contains the full checkout IP (renderEvidencePdf masks via maskIp)', async () => {
    const buf = await renderEvidencePdf(S1_RESULT, S1_META);
    expect(buf.indexOf(Buffer.from('196.188.12.7'))).toBe(-1);
  });

  it('does not include the "Removed by guardrail" section (internal QA, not for PayPal)', async () => {
    // "Removed" hex: 52656d6f766564
    const buf = await renderEvidencePdf(S1_RESULT, S1_META);
    expect(buf.indexOf(Buffer.from('52656d6f766564', 'hex'))).toBe(-1);
  });

  it('with no accepted claims, omits the response section (does NOT say "no evidence produced")', async () => {
    const buf = await renderEvidencePdf(S3_RESULT);
    // "Seller response" hex: "Seller" = 53656c6c6572
    expect(buf.indexOf(Buffer.from('53656c6c6572', 'hex'))).toBe(-1);
    // "No evidence" must NOT appear
    expect(buf.indexOf(Buffer.from('4e6f20657669', 'hex'))).toBe(-1); // "No evi"
  });

  it('uses the PayPal case ID, not our internal id, when meta is provided', async () => {
    const withMeta = await renderEvidencePdf(S1_RESULT, S1_META);
    const withoutMeta = await renderEvidencePdf(S1_RESULT);
    // Our internal dispute id (dsp_s1) should not appear anywhere in the PDF with meta
    expect(withMeta.indexOf(Buffer.from('dsp_s1'))).toBe(-1);
    // Without meta there is no case line at all — also fine
    expect(withoutMeta.indexOf(Buffer.from('dsp_s1'))).toBe(-1);
  });

  it('renders the dispute reason as plain English, not the enum string', async () => {
    const buf = await renderEvidencePdf(S1_RESULT, S1_META);
    // "MERCHANDISE" must not appear
    expect(buf.indexOf(Buffer.from('4d45524348414e44495345', 'hex'))).toBe(-1); // "MERCHANDISE"
  });
});
