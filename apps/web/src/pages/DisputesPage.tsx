import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import type { DisputeListItem } from '@proofvault/shared';
import { api } from '../api';
import { DecisionBadge } from '../components/DecisionBadge';
import { fmtDate, hoursUntil, reasonLabel, statusLabel } from '../lib/format';
import { usePasscode } from '../lib/passcode';
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
  const qc = useQueryClient();
  const navigate = useNavigate();
  const passcode = usePasscode();
  const disputes = useQuery({ queryKey: ['disputes'], queryFn: api.disputes });
  const [caseId, setCaseId] = useState('');

  const sync = useMutation({
    mutationFn: async () => {
      const pc = await passcode.require();
      if (!pc) throw new Error('cancelled');
      return api.syncDisputes(pc);
    },
    onSuccess: () => {
      toast.success('Sync finished');
      qc.invalidateQueries({ queryKey: ['disputes'] });
    },
    onError: (e) => {
      if (!(e instanceof Error && e.message === 'cancelled')) toast.error('Sync failed');
    },
  });

  const fetchCase = useMutation({
    mutationFn: async (id: string) => {
      const pc = await passcode.require();
      if (!pc) throw new Error('cancelled');
      return api.fetchDispute(id.trim(), pc);
    },
    onSuccess: (detail) => {
      toast.success(`Loaded ${detail.dispute.paypalDisputeId}`);
      qc.invalidateQueries({ queryKey: ['disputes'] });
      navigate(`/disputes/${detail.dispute.id}`);
    },
    onError: (e) => {
      if (!(e instanceof Error && e.message === 'cancelled')) toast.error('Fetch failed');
    },
  });

  if (disputes.isPending) return <p className="text-sm text-neutral-500">Loading disputes…</p>;
  if (disputes.isError) return <p className="text-sm text-red-600">Could not load disputes.</p>;

  const items = disputes.data.items;
  return (
    <section>
      <h1 className="text-xl font-semibold">Disputes</h1>
      <p className="mt-1 text-sm text-neutral-500">{items.length} dispute{items.length === 1 ? '' : 's'}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          onClick={() => sync.mutate()}
          disabled={sync.isPending}
          className="rounded-md border bg-white px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
        >
          {sync.isPending ? 'Syncing…' : 'Sync now'}
        </button>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (caseId.trim()) fetchCase.mutate(caseId);
          }}
        >
          <input
            value={caseId}
            onChange={(e) => setCaseId(e.target.value)}
            placeholder="PP-… case ID"
            className="w-40 rounded-md border bg-white px-3 py-1.5 text-sm"
          />
          <button
            type="submit"
            disabled={fetchCase.isPending || !caseId.trim()}
            className="rounded-md border bg-white px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
          >
            {fetchCase.isPending ? 'Fetching…' : 'Fetch case'}
          </button>
        </form>
      </div>

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
