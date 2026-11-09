import type { DisputeReason } from '@proofvault/shared';

/**
 * PayPal's reason codes in plain English. The raw code (MERCHANDISE_OR_SERVICE_NOT_RECEIVED)
 * must never reach a person: not the PDF, not the LLM prompts, not the timeline summaries,
 * because the claims the LLM writes from those end up in front of PayPal's reviewer.
 */
const REASON_LABELS: Record<string, string> = {
  MERCHANDISE_OR_SERVICE_NOT_RECEIVED: 'Item not received',
  MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED: 'Item not as described',
  UNAUTHORISED: 'Unauthorised transaction',
  CREDIT_NOT_PROCESSED: 'Credit not processed',
  DUPLICATE_TRANSACTION: 'Duplicate transaction',
  INCORRECT_AMOUNT: 'Incorrect amount',
  PAYMENT_BY_OTHER_MEANS: 'Payment by other means',
  CANCELED_RECURRING_BILLING: 'Cancelled recurring billing',
  PROBLEM_WITH_REMITTANCE: 'Problem with remittance',
  OTHER: 'Other',
};

/** "MERCHANDISE_OR_SERVICE_NOT_RECEIVED" -> "Item not received". Unknown codes become plain words too. */
export function reasonLabel(reason: DisputeReason | string): string {
  const known = REASON_LABELS[reason];
  if (known) return known;
  const words = reason.toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
