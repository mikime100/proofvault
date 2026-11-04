import { describe, expect, it } from 'vitest';
import { DisputeContext, DisputeDetail, DisputeList, Draft, maskIp, SellerRules } from './index';
import { DEFAULT_RULES, disputeDetailFixtures, disputeListFixture, SCENARIOS } from './fixtures';

// If a fixture stops matching the contract, everyone building on it is building on a lie.
describe('fixtures match the contract', () => {
  it.each(SCENARIOS.map((s) => [s.id, s] as const))('%s context is valid', (_id, s) => {
    expect(() => DisputeContext.parse(s.context)).not.toThrow();
    if (s.fakeDraft) expect(() => Draft.parse(s.fakeDraft)).not.toThrow();
  });

  it('default rules are valid', () => {
    expect(() => SellerRules.parse(DEFAULT_RULES)).not.toThrow();
  });

  it('api fixtures are valid', () => {
    expect(() => DisputeList.parse(disputeListFixture)).not.toThrow();
    for (const d of Object.values(disputeDetailFixtures)) {
      expect(() => DisputeDetail.parse(d)).not.toThrow();
    }
  });

  it('api fixtures never contain a full IP', () => {
    const json = JSON.stringify([disputeListFixture, disputeDetailFixtures]);
    expect(json).not.toMatch(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
  });
});

describe('maskIp', () => {
  it('masks IPv4 and IPv6', () => {
    expect(maskIp('196.188.12.7')).toBe('196.188.x.x');
    expect(maskIp('2001:db8:85a3::7334')).toBe('2001:db8:x:x');
  });
});
