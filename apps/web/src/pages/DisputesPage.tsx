import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import type { DisputeListItem } from '@proofvault/shared';
import { api } from '../api';
import { DecisionBadge } from '../components/DecisionBadge';
import { fmtDate, hoursUntil, reasonLabel, statusLabel } from '../lib/format';
import { cn } from '../lib/utils';

function dueBadge(d: DisputeListItem) {
  if (d.status === 'RESOLVED' || !d.responseDueAt) return null;
  const h = hoursUntil(d.responseDueAt);
  if (h > 48) return null;
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-xs font-medium',
        h < 0 ? 'bg-red-600 text-white' : 'bg-red-100 text-red-700',
      )}
    >
      {h < 0 ? 'Overdue' : `Due in ${Math.max(1, Math.ceil(h))}h`}
    </span>
  );
}

export function DisputesPage() {
  const disputes = useQuery({ queryKey: ['disputes'], queryFn: api.disputes });

  if (disputes.isPending) return <p className="text-sm text-neutral-500">Loading disputes…</p>;
  if (disputes.isError) return <p className="text-sm text-red-600">Could not load disputes.</p>;

  const items = disputes.data.items;
  return (
    <section>
      <h1 className="text-xl font-semibold">Disputes</h1>
      <p className="mt-1 text-sm text-neutral-500">{items.length} dispute{items.length === 1 ? '' : 's'}</p>

      <div className="mt-4 overflow-hidden rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <th className="px-4 py-3">Dispute</th>
              <th className="px-4 py-3">Reason</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Deadline</th>
              <th className="px-4 py-3 text-right">Score</th>
              <th className="px-4 py-3">Decision</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((d) => (
              <tr key={d.id} className="hover:bg-neutral-50">
                <td className="px-4 py-3">
                  <Link to={`/disputes/${d.id}`} className="font-medium text-blue-700 hover:underline">
                    {d.paypalDisputeId}
                  </Link>
                  {d.buyerEmail && <div className="text-xs text-neutral-500">{d.buyerEmail}</div>}
                </td>
                <td className="px-4 py-3">{reasonLabel(d.reason)}</td>
                <td className="px-4 py-3 text-right font-medium">
                  {d.amount.value} {d.amount.currency}
                </td>
                <td className="px-4 py-3">{statusLabel(d.status)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span>{d.responseDueAt ? fmtDate(d.responseDueAt) : '—'}</span>
                    {dueBadge(d)}
                  </div>
                </td>
                <td className="px-4 py-3 text-right">{d.winScore ?? '—'}</td>
                <td className="px-4 py-3">
                  <DecisionBadge action={d.decision} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {items.length === 0 && (
        <p className="mt-6 flex items-center gap-2 text-sm text-neutral-500">
          <AlertTriangle className="size-4" /> No disputes yet.
        </p>
      )}
    </section>
  );
}
