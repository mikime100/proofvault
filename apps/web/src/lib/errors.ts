// One place that turns a failed write into a clear message (#46).
import { toast } from 'sonner';
import { ApiError } from '../api';

export const CANCELLED = 'cancelled';

export interface Failure {
  title: string;
  description: string;
}

function plainPaypal(code: string, message: string): string {
  if (code === 'PAYPAL_ACTION_NOT_ALLOWED_IN_CURRENT_DISPUTE_STATE')
    return "PayPal does not allow this at the case's current stage. Wait for the stage to change, then refresh.";
  if (code === 'PAYPAL_INVALID_RESOURCE_ID' || code === 'PAYPAL_RESOURCE_NOT_FOUND')
    return 'PayPal does not know this case. Seeded PP-D cases exist only in our database.';
  return message;
}

/** A failed action-log entry's detail in plain words (the api stores PayPal's raw issue code). */
export function plainDetail(detail: string): string {
  if (/ACTION_NOT_ALLOWED/.test(detail)) return 'PayPal did not allow this at that stage of the case.';
  if (/INVALID_RESOURCE_ID|RESOURCE_NOT_FOUND/.test(detail)) return 'PayPal does not know this case.';
  return detail;
}

/** The message for a failed write, or null when the seller just cancelled the passcode dialog. */
export function describeError(e: unknown, what: string): Failure | null {
  if (e instanceof Error && e.message === CANCELLED) return null;
  if (e instanceof ApiError) {
    if (e.code === 'BAD_PASSCODE')
      return { title: 'Wrong passcode', description: 'It was cleared. Try again and enter the demo passcode.' };
    if (e.code === 'ACTION_NOT_ALLOWED_NOW')
      return {
        title: `PayPal does not allow "${what}" right now`,
        description: 'PayPal changes the allowed actions as the case moves. Refresh in a minute.',
      };
    if (e.code.startsWith('PAYPAL_'))
      return { title: `PayPal refused "${what}"`, description: plainPaypal(e.code, e.message) };
    return { title: `Could not ${what}`, description: e.message };
  }
  return { title: `Could not ${what}`, description: 'The server did not answer. Check it is running.' };
}

/** Toasts what went wrong and how to recover; returns it so a page can also show it inline. */
export function reportError(e: unknown, what: string, forgetPasscode: () => void): Failure | null {
  const f = describeError(e, what);
  if (!f) return null;
  if (e instanceof ApiError && e.code === 'BAD_PASSCODE') forgetPasscode();
  toast.error(f.title, { description: f.description });
  return f;
}
