// Display helpers: friendly labels and dates. IPs arrive already masked.

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function hoursUntil(iso: string): number {
  return (new Date(iso).getTime() - Date.now()) / 3_600_000;
}

const REASONS: Record<string, string> = {
  MERCHANDISE_OR_SERVICE_NOT_RECEIVED: 'Item not received',
  MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED: 'Not as described',
  UNAUTHORISED: 'Unauthorised',
  CREDIT_NOT_PROCESSED: 'Credit not processed',
  DUPLICATE_TRANSACTION: 'Duplicate transaction',
  INCORRECT_AMOUNT: 'Incorrect amount',
  PAYMENT_BY_OTHER_MEANS: 'Paid by other means',
  CANCELED_RECURRING_BILLING: 'Cancelled recurring billing',
  PROBLEM_WITH_REMITTANCE: 'Problem with remittance',
  OTHER: 'Other',
};

export function reasonLabel(reason: string): string {
  return REASONS[reason] ?? reason;
}

const STATUSES: Record<string, string> = {
  OPEN: 'Open',
  WAITING_FOR_BUYER_RESPONSE: 'Waiting for buyer',
  WAITING_FOR_SELLER_RESPONSE: 'Waiting for you',
  UNDER_REVIEW: 'Under review',
  RESOLVED: 'Resolved',
  OTHER: 'Other',
};

export function statusLabel(status: string): string {
  return STATUSES[status] ?? status;
}
