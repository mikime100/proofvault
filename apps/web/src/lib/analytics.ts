import type { DisputeListItem } from '@proofvault/shared';
import { reasonLabel } from './format';

export interface ReasonStat {
  reason: string;
  label: string;
  total: number;
  resolved: number;
  /** Resolved without conceding (decision was not 'accept'). */
  won: number;
  winRate: number | null;
  amountAtRisk: number;
  recovered: number;
}

export interface AnalyticsSummary {
  total: number;
  open: number;
  resolved: number;
  won: number;
  winRate: number | null;
  amountAtRisk: number;
  recovered: number;
  byReason: ReasonStat[];
}

const money = (items: DisputeListItem[]) =>
  items.reduce((s, d) => s + (d.amount.currency === 'USD' ? Number(d.amount.value) : 0), 0);

const isWon = (d: DisputeListItem) =>
  d.status === 'RESOLVED' && d.decision !== 'accept';

export function summarize(items: DisputeListItem[]): AnalyticsSummary {
  const resolved = items.filter((d) => d.status === 'RESOLVED');
  const won = resolved.filter(isWon);

  const byReasonMap = new Map<string, DisputeListItem[]>();
  for (const d of items) {
    const list = byReasonMap.get(d.reason) ?? [];
    list.push(d);
    byReasonMap.set(d.reason, list);
  }

  const byReason: ReasonStat[] = [...byReasonMap.entries()]
    .map(([reason, list]) => {
      const res = list.filter((d) => d.status === 'RESOLVED');
      const w = res.filter(isWon);
      return {
        reason,
        label: reasonLabel(reason),
        total: list.length,
        resolved: res.length,
        won: w.length,
        winRate: res.length ? w.length / res.length : null,
        amountAtRisk: money(list),
        recovered: money(w),
      };
    })
    .sort((a, b) => b.total - a.total);

  return {
    total: items.length,
    open: items.length - resolved.length,
    resolved: resolved.length,
    won: won.length,
    winRate: resolved.length ? won.length / resolved.length : null,
    amountAtRisk: money(items),
    recovered: money(won),
    byReason,
  };
}
