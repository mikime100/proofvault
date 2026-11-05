// Acceptance tests for the pipeline: the five shared scenarios (INTEGRATION.md section 5).
// Replace each it.todo with a real test. Use a fake LlmClient, never the network.
import { DEFAULT_RULES, SCENARIOS } from '@proofvault/shared/fixtures';
import { describe, expect, it } from 'vitest';
import { buildTimeline, checkClaims } from '../../src/pipeline';

const scenario = (id: string) => SCENARIOS.find((s) => s.id === id)!;

describe('pipeline scenarios', () => {
  it('has all five scenarios loaded', () => {
    expect(SCENARIOS.map((s) => s.id)).toEqual(['S1', 'S2', 'S3', 'S4', 'S5']);
    expect(DEFAULT_RULES.autoSubmitMinScore).toBe(75);
  });

  it.todo('S1 strong: score >= 75, decision submit, recommendation fight');
  it.todo('S2 medium: score 40 to 74, decision await_approval');
  it.todo('S3 weak $9: score < 40, decision accept, recommendation refund, flag no_access_events');
  it.todo('S4 no match: decision await_approval, flag no_matching_order, no crash');
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
  it.todo('reason outside SUPPORTED_REASONS: decision await_approval, flag unsupported_reason, no score rules run');
  it.todo('decide follows the rule order on SellerRules (one test per rule)');
  it.todo('same input twice gives the same score');
  it('checkClaims rejects a claim whose date is not YYYY-MM-DD', () => {
    const timeline = buildTimeline(scenario('S2').context);
    const result = checkClaims(
      { recommendation: 'fight', claims: [{ text: 'The buyer logged in on November 2.', recordIds: ['evt_s2_1'] }] },
      timeline,
    );
    expect(result.rejected[0]?.reason).toBe('Writes a date as "November 2"; dates must be YYYY-MM-DD');
  });
  it.todo('LLM returns broken JSON: one retry, then await_approval with flag llm_failed');
});
