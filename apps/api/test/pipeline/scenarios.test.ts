// Acceptance tests for the pipeline: the five shared scenarios (INTEGRATION.md section 5).
// Replace each it.todo with a real test. Use a fake LlmClient, never the network.
import { DEFAULT_RULES, SCENARIOS } from '@proofvault/shared/fixtures';
import { describe, expect, it } from 'vitest';

describe('pipeline scenarios', () => {
  it('has all five scenarios loaded', () => {
    expect(SCENARIOS.map((s) => s.id)).toEqual(['S1', 'S2', 'S3', 'S4', 'S5']);
    expect(DEFAULT_RULES.autoSubmitMinScore).toBe(75);
  });

  it.todo('S1 strong: score >= 75, decision submit, recommendation fight');
  it.todo('S2 medium: score 40 to 74, decision await_approval');
  it.todo('S3 weak $9: score < 40, decision accept, recommendation refund, flag no_access_events');
  it.todo('S4 no match: decision await_approval, flag no_matching_order, no crash');
  it.todo('S5 trap: checkClaims keeps 1 claim, rejects 2 with reasons');
  it.todo('reason outside SUPPORTED_REASONS: decision await_approval, flag unsupported_reason, no score rules run');
  it.todo('decide follows the rule order on SellerRules (one test per rule)');
  it.todo('same input twice gives the same score');
  it.todo('checkClaims rejects a claim whose date is not YYYY-MM-DD');
  it.todo('LLM returns broken JSON: one retry, then await_approval with flag llm_failed');
});
