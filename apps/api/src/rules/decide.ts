import type { Decision, Money, Score, SellerRules } from '@proofvault/shared';

/**
 * The auto-action rules engine. Fixed rule order (first match wins), see the comment on
 * SellerRules in packages/shared. decide assumes a supported reason with a matching order;
 * runPipeline handles the no-match / unsupported cases before calling this.
 *
 * 2. autoSubmitEnabled and score >= autoSubmitMinScore -> submit
 * 3. score < weakScoreBelow and amount <= autoAcceptMaxAmount -> accept
 * 4. score < weakScoreBelow and amount <= autoOfferMaxAmount -> offer (offerPercent of amount)
 * 5. otherwise -> await_approval
 */
export function decide(score: Score, amount: Money, rules: SellerRules): Decision {
  if (rules.autoSubmitEnabled && score.value >= rules.autoSubmitMinScore) {
    return {
      action: 'submit',
      reason: `Score ${score.value} meets the auto-submit threshold (${rules.autoSubmitMinScore}).`,
    };
  }

  const amountCents = parseCents(amount.value);
  if (score.value < rules.weakScoreBelow && amountCents <= parseCents(rules.autoAcceptMaxAmount)) {
    return {
      action: 'accept',
      reason: `Weak score ${score.value} and amount ${amount.value} is at or under the auto-accept limit ${rules.autoAcceptMaxAmount}.`,
    };
  }

  if (score.value < rules.weakScoreBelow && amountCents <= parseCents(rules.autoOfferMaxAmount)) {
    const offerCents = Math.round((amountCents * rules.offerPercent) / 100);
    return {
      action: 'offer',
      reason: `Weak score ${score.value}; offering ${rules.offerPercent}% of ${amount.value}.`,
      offerAmount: { value: formatCents(offerCents), currency: amount.currency },
    };
  }

  return {
    action: 'await_approval',
    reason: `Score ${score.value} does not match any auto-action rule; needs seller approval.`,
  };
}

// Money values are strings with 2 decimals; compare in integer cents to avoid float drift.
function parseCents(value: string): number {
  return Math.round(Number(value) * 100);
}

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2);
}
