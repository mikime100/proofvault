// Acceptance tests for the pipeline: the five shared scenarios (INTEGRATION.md section 5).
// Uses a fake LlmClient; the pipeline never touches the network here.
import { DEFAULT_RULES, SCENARIOS } from '@proofvault/shared/fixtures';
import type { Draft, LlmClient } from '@proofvault/shared';
import { describe, expect, it } from 'vitest';
import { buildTimeline, checkClaims, decide, runPipeline, scoreDispute } from '../../src/pipeline';

const scenario = (id: string) => SCENARIOS.find((s) => s.id === id)!;

const S1_DRAFT: Draft = {
  recommendation: 'fight',
  claims: [
    {
      text: 'The buyer viewed all 4 lessons between 2026-11-01 and 2026-11-03.',
      recordIds: ['evt_s1_2', 'evt_s1_3', 'evt_s1_5', 'evt_s1_6'],
    },
    { text: 'The buyer downloaded the bonus PDF on 2026-11-02.', recordIds: ['evt_s1_4'] },
  ],
};
const S2_DRAFT: Draft = {
  recommendation: 'fight',
  claims: [
    { text: 'The buyer logged in on 2026-11-02.', recordIds: ['evt_s2_1'] },
    { text: 'The buyer viewed 1 lesson on 2026-11-02.', recordIds: ['evt_s2_2'] },
  ],
};
const S3_DRAFT: Draft = { recommendation: 'refund', claims: [] };

function fakeLlmFor(draft: Draft): LlmClient & { calls: number } {
  let n = 0;
  return {
    get calls() { return n; },
    async generateJson({ prompt }: { system: string; prompt: string }) {
      n++;
      return prompt.includes('TASK: draft')
        ? draft
        : { reasons: ['Reason one.', 'Reason two.'] };
    },
  };
}

function brokenLlm(): LlmClient & { calls: number } {
  let n = 0;
  return {
    get calls() { return n; },
    async generateJson() { n++; return { broken: true }; },
  };
}

const neverLlm: LlmClient = {
  async generateJson() { throw new Error('LLM should not be called'); },
};

const scoreOf = (value: number) => ({ value, features: [], reasons: [] });
const money = (value: string) => ({ value, currency: 'USD' as const });

describe('pipeline scenarios', () => {
  it('has all five scenarios loaded', () => {
    expect(SCENARIOS.map((s) => s.id)).toEqual(['S1', 'S2', 'S3', 'S4', 'S5']);
    expect(DEFAULT_RULES.autoSubmitMinScore).toBe(75);
  });

  it('S1 strong: score >= 75, decision submit, recommendation fight', async () => {
    const result = await runPipeline(scenario('S1').context, DEFAULT_RULES, { llm: fakeLlmFor(S1_DRAFT) });
    expect(result.score.value).toBeGreaterThanOrEqual(75);
    expect(result.decision.action).toBe('submit');
    expect(result.recommendation).toBe('fight');
    expect(result.accepted.length).toBeGreaterThan(0);
  });

  it('S2 medium: score 40 to 74, decision await_approval', async () => {
    const result = await runPipeline(scenario('S2').context, DEFAULT_RULES, { llm: fakeLlmFor(S2_DRAFT) });
    expect(result.score.value).toBeGreaterThanOrEqual(40);
    expect(result.score.value).toBeLessThanOrEqual(74);
    expect(result.decision.action).toBe('await_approval');
  });

  it('S3 weak $9: score < 40, decision accept, recommendation refund, flag no_access_events', async () => {
    const result = await runPipeline(scenario('S3').context, DEFAULT_RULES, { llm: fakeLlmFor(S3_DRAFT) });
    expect(result.score.value).toBeLessThan(40);
    expect(result.decision.action).toBe('accept');
    expect(result.recommendation).toBe('refund');
    expect(result.flags).toContain('no_access_events');
  });

  it('S4 no match: decision await_approval, flag no_matching_order, no crash', async () => {
    const result = await runPipeline(scenario('S4').context, DEFAULT_RULES, { llm: neverLlm });
    expect(result.decision.action).toBe('await_approval');
    expect(result.flags).toContain('no_matching_order');
    expect(result.timeline.orderId).toBeNull();
  });

  // Mike's canonical S5 test — exact reason strings from claims.ts
  it('S5 trap: checkClaims keeps 1 claim, rejects 2 with reasons', () => {
    const s5 = scenario('S5');
    const result = checkClaims(s5.fakeDraft!, buildTimeline(s5.context));
    expect(result.accepted).toHaveLength(s5.expected.acceptedClaims!);
    expect(result.rejected).toHaveLength(s5.expected.rejectedClaims!);
    expect(result.accepted[0]!.text).toBe('The buyer logged in on 2026-11-02.');
    expect(result.rejected.map((r) => r.reason)).toEqual([
      'Cites evt_does_not_exist, which is not a record of this dispute',
      'Says 5 lessons, but the cited records show 1',
    ]);
  });

  it('reason outside SUPPORTED_REASONS: decision await_approval, flag unsupported_reason, no score rules run', async () => {
    const ctx = { ...scenario('S1').context, dispute: { ...scenario('S1').context.dispute, reason: 'CREDIT_NOT_PROCESSED' as const } };
    const result = await runPipeline(ctx, DEFAULT_RULES, { llm: neverLlm });
    expect(result.decision.action).toBe('await_approval');
    expect(result.flags).toContain('unsupported_reason');
    expect(result.score.features).toHaveLength(0);
  });

  it('decide rule 2: auto-submit when enabled and score at or over threshold', () => {
    expect(decide(scoreOf(80), money('49.00'), DEFAULT_RULES).action).toBe('submit');
  });

  it('decide rule 2: no auto-submit when disabled', () => {
    expect(decide(scoreOf(80), money('49.00'), { ...DEFAULT_RULES, autoSubmitEnabled: false }).action).toBe('await_approval');
  });

  it('decide rule 3: accept when weak and amount at or under auto-accept limit', () => {
    expect(decide(scoreOf(30), money('9.00'), DEFAULT_RULES).action).toBe('accept');
  });

  it('decide rule 4: offer when weak and amount within auto-offer limit', () => {
    const d = decide(scoreOf(30), money('25.00'), DEFAULT_RULES);
    expect(d.action).toBe('offer');
    expect(d.offerAmount?.value).toBe('12.50');
  });

  it('decide rule 5: await otherwise', () => {
    expect(decide(scoreOf(50), money('49.00'), { ...DEFAULT_RULES, autoSubmitEnabled: false }).action).toBe('await_approval');
  });

  it('same input twice gives the same score', () => {
    const t = buildTimeline(scenario('S1').context);
    const reason = 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED' as const;
    expect(scoreDispute(t, reason)).toEqual(scoreDispute(t, reason));
  });

  // Mike's canonical date test — exact wording from claims.ts
  it('checkClaims rejects a claim whose date is not YYYY-MM-DD', () => {
    const timeline = buildTimeline(scenario('S2').context);
    const result = checkClaims(
      { recommendation: 'fight', claims: [{ text: 'The buyer logged in on November 2.', recordIds: ['evt_s2_1'] }] },
      timeline,
    );
    expect(result.rejected[0]?.reason).toBe('Writes a date as "November 2"; dates must be YYYY-MM-DD');
  });

  // ISO datetime (2026-11-02T18:00:00Z) must also be rejected — added per review
  it('checkClaims rejects a claim with an ISO datetime instead of YYYY-MM-DD', () => {
    const timeline = buildTimeline(scenario('S2').context);
    const result = checkClaims(
      { recommendation: 'fight', claims: [{ text: 'The buyer logged in on 2026-11-02T18:00:00Z.', recordIds: ['evt_s2_1'] }] },
      timeline,
    );
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toMatch(/YYYY-MM-DD/);
  });

  it('LLM returns broken JSON: one retry, then await_approval with flag llm_failed', async () => {
    const llm = brokenLlm();
    const result = await runPipeline(scenario('S1').context, DEFAULT_RULES, { llm });
    expect(result.flags).toContain('llm_failed');
    expect(result.decision.action).toBe('await_approval');
    expect(result.decision.reason).toMatch(/manual review/i);
    expect(llm.calls).toBe(2);
  });
});
