import { statusLabel } from '../lib/format';
import { cn } from '../lib/utils';

const STYLES: [RegExp, string][] = [
  [/RESOLVED/, 'bg-emerald-100 text-emerald-800'],
  [/WAITING_FOR_SELLER/, 'bg-amber-100 text-amber-800'],
  [/WAITING_FOR_BUYER/, 'bg-sky-100 text-sky-800'],
  [/UNDER_REVIEW|OPEN/, 'bg-violet-100 text-violet-800'],
];

export function StatusBadge({ status }: { status: string }) {
  const style = STYLES.find(([re]) => re.test(status))?.[1] ?? 'bg-neutral-100 text-neutral-600';
  return (
    <span className={cn('inline-block rounded-full px-2 py-0.5 text-xs font-medium', style)}>
      {statusLabel(status)}
    </span>
  );
}
