import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { summarize } from '../lib/analytics';
import { cn } from '../lib/utils';

function pct(v: number | null) {
  return v === null ? '—' : `${Math.round(v * 100)}%`;
}

export function AnalyticsPage() {
  const disputes = useQuery({ queryKey: ['disputes'], queryFn: api.disputes });

  if (disputes.isPending) return <p className="text-sm text-neutral-500">Loading analytics…</p>;
  if (disputes.isError) return <p className="text-sm text-red-600">Could not load disputes.</p>;

  const s = summarize(disputes.data.items);

  const cards = [
    { label: 'Total disputes', value: String(s.total) },
    { label: 'Open', value: String(s.open) },
    { label: 'Win rate', value: pct(s.winRate) },
    { label: 'Amount at risk', value: `$${s.amountAtRisk.toFixed(2)}` },
    { label: 'Recovered', value: `$${s.recovered.toFixed(2)}` },
  ];

  return (
    <section>
      <h1 className="text-xl font-semibold">Analytics</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Computed in the browser from the dispute list — no extra endpoint.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg border bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-neutral-500">{c.label}</p>
            <p className="mt-1 text-2xl font-semibold">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <th className="px-4 py-3">Reason</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-right">Resolved</th>
              <th className="px-4 py-3 text-right">Won</th>
              <th className="px-4 py-3 text-right">Win rate</th>
              <th className="px-4 py-3 text-right">Recovered</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {s.byReason.map((r) => (
              <tr key={r.reason}>
                <td className="px-4 py-3 font-medium">{r.label}</td>
                <td className="px-4 py-3 text-right">{r.total}</td>
                <td className="px-4 py-3 text-right">{r.resolved}</td>
                <td className="px-4 py-3 text-right">{r.won}</td>
                <td className="px-4 py-3 text-right">
                  <span
                    className={cn(
                      'inline-block rounded-full px-2 py-0.5 text-xs font-medium',
                      r.winRate !== null && r.winRate >= 0.5
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-red-100 text-red-700',
                    )}
                  >
                    {pct(r.winRate)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-medium">${r.recovered.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
