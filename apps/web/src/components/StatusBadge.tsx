import { statusLabel } from '../lib/format';
import { Badge } from './ui/badge';

type Variant = 'success' | 'warning' | 'muted';

const VARIANT: Record<string, Variant> = {
  RESOLVED: 'success',
  WAITING_FOR_SELLER_RESPONSE: 'warning',
  WAITING_FOR_BUYER_RESPONSE: 'muted',
  UNDER_REVIEW: 'muted',
  OPEN: 'muted',
};

/** PayPal status as a text chip. The words carry the meaning; colour only backs them up. */
export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={VARIANT[status] ?? 'muted'}>{statusLabel(status)}</Badge>;
}
