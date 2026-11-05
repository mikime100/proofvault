import type { DecisionAction } from '@proofvault/shared';
import { cn } from '../lib/utils';

const STYLES: Record<DecisionAction, string> = {
  submit: 'bg-emerald-100 text-emerald-800',
  offer: 'bg-sky-100 text-sky-800',
  accept: 'bg-amber-100 text-amber-800',
  await_approval: 'bg-neutral-200 text-neutral-700',
};

const LABELS: Record<DecisionAction, string> = {
  submit: 'Auto-submit',
  offer: 'Make offer',
  accept: 'Accept claim',
  await_approval: 'Needs approval',
};

export function DecisionBadge({ action }: { action: DecisionAction | null }) {
  if (!action) {
    return <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">Not analyzed</span>;
  }
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STYLES[action])}>
      {LABELS[action]}
    </span>
  );
}
