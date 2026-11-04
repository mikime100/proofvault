// Placeholder screen. Moges replaces this with the real dashboard.
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { api } from './api';

export function App() {
  const health = useQuery({ queryKey: ['health'], queryFn: api.health });
  const disputes = useQuery({ queryKey: ['disputes'], queryFn: api.disputes });

  return (
    <main className="mx-auto max-w-3xl p-8 font-sans">
      <h1 className="flex items-center gap-2 text-2xl font-semibold">
        <ShieldCheck className="size-6" /> ProofVault
      </h1>
      <p className="mt-1 text-sm text-neutral-500">
        API: {health.data ? `ok (${health.data.version})` : health.isError ? 'unreachable' : '...'}
      </p>
      <ul className="mt-6 divide-y rounded border">
        {disputes.data?.items.map((d) => (
          <li key={d.id} className="flex justify-between p-3 text-sm">
            <span>{d.paypalDisputeId}</span>
            <span>{d.reason}</span>
            <span>
              {d.amount.value} {d.amount.currency}
            </span>
            <span>{d.winScore ?? '-'}</span>
            <span>{d.decision ?? 'not analyzed'}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
