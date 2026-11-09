import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { RefreshCw, Search } from 'lucide-react';
import type { DisputeListItem } from '@proofvault/shared';
import { api } from '../api';
import { Page, PageHeader } from '../components/AppShell';
import { StatStrip } from '../components/StatStrip';
import { DecisionBadge } from '../components/DecisionBadge';
import { StatusBadge } from '../components/StatusBadge';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Skeleton } from '../components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { CANCELLED, reportError } from '../lib/errors';
import { fmtDate, hoursUntil, reasonLabel } from '../lib/format';
import { usePasscode } from '../lib/passcode';
import { cn } from '../lib/utils';

type Filter = 'all' | 'you' | 'paypal' | 'closed';

const FILTERS: { key: Filter; label: string; match: (d: DisputeListItem) => boolean }[] = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'you', label: 'Needs you', match: (d) => d.status === 'WAITING_FOR_SELLER_RESPONSE' },
  {
    key: 'paypal',
    label: 'Waiting',
    match: (d) => d.status !== 'WAITING_FOR_SELLER_RESPONSE' && d.status !== 'RESOLVED',
  },
  { key: 'closed', label: 'Closed', match: (d) => d.status === 'RESOLVED' },
];

const dueSoon = (d: DisputeListItem) =>
  d.status !== 'RESOLVED' && !!d.responseDueAt && hoursUntil(d.responseDueAt) <= 48;

function DueBadge({ d }: { d: DisputeListItem }) {
  if (!dueSoon(d) || !d.responseDueAt) return null;
  const h = hoursUntil(d.responseDueAt);
  return (
    <Badge variant="danger">
      {h < 0 ? 'Overdue' : `Due in ${Math.max(1, Math.ceil(h))}h`}
    </Badge>
  );
}

function Score({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">-</span>;
  return <span className="tabular font-medium">{value}</span>;
}

const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Kpis({ items }: { items: DisputeListItem[] }) {
  const needsYou = items.filter((d) => d.status === 'WAITING_FOR_SELLER_RESPONSE').length;
  const due = items.filter(dueSoon).length;
  const open = items.filter((d) => d.status !== 'RESOLVED');
  const atRisk = open.reduce((s, d) => s + Number(d.amount.value), 0);
  const closed = items.filter((d) => d.status === 'RESOLVED').length;
  return (
    <StatStrip
      stats={[
        { label: 'Needs you', value: String(needsYou) },
        { label: 'Due within 48 hours', value: String(due) },
        { label: 'Open amount', value: money(atRisk), note: `${open.length} open case${open.length === 1 ? '' : 's'}` },
        { label: 'Closed', value: String(closed) },
      ]}
    />
  );
}

function ListSkeleton() {
  return (
    <Page>
      <Skeleton className="h-8 w-40" />
      <Skeleton className="mt-2 h-4 w-80" />
      <Skeleton className="mt-6 h-24 rounded-xl" />
      <Skeleton className="mt-6 h-72 rounded-xl" />
    </Page>
  );
}

export function DisputesPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const passcode = usePasscode();
  const disputes = useQuery({ queryKey: ['disputes'], queryFn: api.disputes, refetchInterval: 60_000 });
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');

  const sync = useMutation({
    mutationFn: async () => {
      const pc = await passcode.require();
      if (!pc) throw new Error(CANCELLED);
      return api.syncDisputes(pc);
    },
    onSuccess: (r) => {
      toast.success(
        r.synced ? `${r.synced} case${r.synced === 1 ? '' : 's'} updated from PayPal` : 'Up to date with PayPal',
        { description: 'The PayPal sandbox list can lag new cases by a few minutes. Load one by ID from the search bar.' },
      );
      qc.invalidateQueries({ queryKey: ['disputes'] });
    },
    onError: (e) => reportError(e, 'sync with PayPal', passcode.forget),
  });

  const items = useMemo(() => disputes.data?.items ?? [], [disputes.data]);
  const shown = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter)!;
    const needle = q.trim().toLowerCase();
    return items.filter(
      (d) =>
        f.match(d) &&
        (!needle ||
          d.paypalDisputeId.toLowerCase().includes(needle) ||
          (d.buyerEmail ?? '').toLowerCase().includes(needle)),
    );
  }, [items, filter, q]);

  if (disputes.isPending) return <ListSkeleton />;
  if (disputes.isError)
    return (
      <Page>
        <PageHeader title="Disputes" />
        <div className="mt-6 rounded-xl border border-danger/20 bg-danger-soft p-6 text-sm text-danger">
          Could not load disputes. Check the API is running, then{' '}
          <button className="font-medium underline" onClick={() => disputes.refetch()}>
            try again
          </button>
          .
        </div>
      </Page>
    );

  const counts = Object.fromEntries(FILTERS.map((f) => [f.key, items.filter(f.match).length])) as Record<Filter, number>;

  return (
    <Page>
      <PageHeader
        title="Disputes"
        actions={
          <Button variant="outline" onClick={() => sync.mutate()} disabled={sync.isPending}>
            {sync.isPending && <RefreshCw className="animate-spin" />}
            {sync.isPending ? 'Syncing…' : 'Sync with PayPal'}
          </Button>
        }
      />

      <Kpis items={items} />

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:w-72">
          <label htmlFor="list-search" className="sr-only">
            Filter by case ID or buyer email
          </label>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="list-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Case ID or buyer email"
            className="h-10 pl-9"
          />
        </div>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList className="h-10 w-full sm:w-auto">
            {FILTERS.map((f) => (
              <TabsTrigger key={f.key} value={f.key} className="px-3">
                {f.label}
                <span className="tabular ml-1.5 text-xs text-muted-foreground">{counts[f.key]}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {items.length === 0 ? (
        <div className="mt-6 flex flex-col items-center rounded-xl border px-6 py-14 text-center">
          <p className="font-semibold">No disputes yet</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            New PayPal cases arrive on their own every minute. Sync now, or load a case by its ID from the
            search bar.
          </p>
          <Button className="mt-5" onClick={() => sync.mutate()} disabled={sync.isPending}>
            Sync with PayPal
          </Button>
        </div>
      ) : shown.length === 0 ? (
        <div className="mt-6 rounded-xl border px-6 py-10 text-center text-sm text-muted-foreground">
          No cases match.{' '}
          <button
            className="font-medium text-primary underline-offset-4 hover:underline"
            onClick={() => {
              setFilter('all');
              setQ('');
            }}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <>
          {/* Desktop and tablet: table */}
          <div className="mt-4 hidden overflow-x-auto rounded-xl border md:block">
            <Table>
              <TableHeader className="bg-canvas">
                <TableRow className="hover:bg-transparent">
                  {['Case', 'Reason', 'Amount', 'Status', 'Respond by', 'Score', 'Agent decision'].map((h, i) => (
                    <TableHead
                      key={i}
                      className={cn(
                        'h-11 text-xs font-medium text-muted-foreground',
                        (h === 'Amount' || h === 'Score') && 'text-right',
                      )}
                    >
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((d) => (
                  <TableRow
                    key={d.id}
                    onClick={() => navigate(`/disputes/${d.id}`)}
                    className="cursor-pointer border-divider hover:bg-canvas"
                  >
                    <TableCell className="py-3.5">
                      <Link
                        to={`/disputes/${d.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-mono text-[13px] font-medium text-foreground hover:text-primary hover:underline"
                      >
                        {d.paypalDisputeId}
                      </Link>
                      {d.buyerEmail && <div className="mt-0.5 text-xs text-muted-foreground">{d.buyerEmail}</div>}
                    </TableCell>
                    <TableCell>{reasonLabel(d.reason)}</TableCell>
                    <TableCell className="tabular text-right font-medium">
                      {d.amount.value} <span className="text-xs text-muted-foreground">{d.amount.currency}</span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={d.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="tabular">{d.responseDueAt ? fmtDate(d.responseDueAt) : '-'}</span>
                        <DueBadge d={d} />
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Score value={d.winScore} />
                    </TableCell>
                    <TableCell>
                      <DecisionBadge action={d.decision} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Phone: cards */}
          <ul className="mt-4 space-y-3 md:hidden">
            {shown.map((d) => (
              <li key={d.id}>
                <Link
                  to={`/disputes/${d.id}`}
                  className="block rounded-xl border p-4 transition-colors active:bg-canvas"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-[13px] font-medium">{d.paypalDisputeId}</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">{reasonLabel(d.reason)}</p>
                    </div>
                    <p className="tabular shrink-0 text-base font-semibold">
                      {d.amount.value} <span className="text-xs font-normal text-muted-foreground">{d.amount.currency}</span>
                    </p>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <StatusBadge status={d.status} />
                    <DueBadge d={d} />
                    <DecisionBadge action={d.decision} />
                    {d.winScore !== null && (
                      <span className="tabular ml-auto text-xs text-muted-foreground">Score {d.winScore}</span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </Page>
  );
}
