import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';
import type { ActionLogEntry } from '@proofvault/shared';
import { api } from '../api';
import { Page } from '../components/AppShell';
import { CaseStatusCard, type SellerAction } from '../components/case/CaseStatusCard';
import {
  Activity,
  Claims,
  OrderCard,
  Panel,
  SandboxControls,
  ScoreCard,
  Timeline,
  type SandboxStepName,
} from '../components/case/EvidencePanels';
import { Skeleton } from '../components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { actionLabel, caseStatus } from '../lib/caseStatus';
import { CANCELLED, reportError, type Failure } from '../lib/errors';
import { usePasscode } from '../lib/passcode';
import { cn } from '../lib/utils';

const POLL_MS = 30_000;

const ACTION_WORD: Record<SellerAction, string> = {
  submit: 'submit evidence',
  escalate: 'escalate',
  offer: 'make an offer',
  accept: 'refund the buyer',
};

/** Re-renders every 15 s so "2 min ago" stays true. */
function useNow(ms = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function DetailSkeleton() {
  return (
    <Page>
      <Skeleton className="h-5 w-28" />
      <Skeleton className="mt-4 h-80 w-full rounded-2xl" />
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-96 rounded-xl lg:col-span-2" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    </Page>
  );
}

export function DisputeDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const passcode = usePasscode();
  const now = useNow();
  const cardRef = useRef<HTMLDivElement>(null);
  const [flash, setFlash] = useState(false);
  const [tab, setTab] = useState('evidence');
  const [focusRecord, setFocusRecord] = useState<string | null>(null);
  // Last refused write stays on the card until the next try (a toast alone fades too fast).
  const [failure, setFailure] = useState<Failure | null>(null);

  const detail = useQuery({
    queryKey: ['dispute', id],
    queryFn: () => api.dispute(id),
    // While PayPal has the next move, keep checking so the page moves on by itself.
    refetchInterval: (q) => (q.state.data && caseStatus(q.state.data).waitingOnPaypal ? POLL_MS : false),
  });
  const rules = useQuery({ queryKey: ['rules'], queryFn: api.rules, staleTime: 5 * 60_000 });

  const afterWrite = async (entry: ActionLogEntry, failMsg: string) => {
    setFailure(entry.ok ? null : { title: failMsg, description: entry.detail || 'PayPal did not accept it.' });
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['dispute', id] }),
      qc.invalidateQueries({ queryKey: ['disputes'] }),
    ]);
    if (entry.ok) {
      toast.success(actionLabel(entry), { description: 'The case card shows what PayPal does next.' });
    } else {
      toast.error(failMsg, { description: entry.detail || 'PayPal did not accept it.' });
    }
    setFlash(true);
    cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => setFlash(false), 1600);
  };

  const act = useMutation({
    mutationFn: async (type: SellerAction) => {
      setFailure(null);
      const pc = await passcode.require();
      if (!pc) throw new Error(CANCELLED);
      return api.disputeAction(id, type, pc);
    },
    onSuccess: (entry, type) => afterWrite(entry, `Could not ${ACTION_WORD[type]}`),
    onError: (e, type) => setFailure(reportError(e, ACTION_WORD[type], passcode.forget)),
  });

  const sandbox = useMutation({
    mutationFn: async (step: SandboxStepName) => {
      setFailure(null);
      const pc = await passcode.require();
      if (!pc) throw new Error(CANCELLED);
      return api.sandboxStep(id, step, pc);
    },
    onSuccess: (entry, step) => afterWrite(entry, `Sandbox ${step} was refused`),
    onError: (e, step) => setFailure(reportError(e, `sandbox ${step}`, passcode.forget)),
  });

  const status = useMemo(() => (detail.data ? caseStatus(detail.data) : null), [detail.data]);

  if (detail.isPending) return <DetailSkeleton />;
  if (detail.isError || !detail.data || !status)
    return (
      <Page>
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> All disputes
        </Link>
        <div className="mt-4 rounded-xl border border-danger/20 bg-danger-soft p-6 text-sm text-danger">
          Could not load this dispute.{' '}
          <button className="font-medium underline" onClick={() => detail.refetch()}>
            Try again
          </button>
        </div>
      </Page>
    );

  const { order, analysis, actions, allowedActions, dispute } = detail.data;
  const citedIds = new Set(analysis?.accepted.flatMap((c) => c.recordIds) ?? []);
  const offerAmount = rules.data
    ? ((Number(dispute.amount.value) * rules.data.offerPercent) / 100).toFixed(2)
    : null;

  return (
    <Page>
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> All disputes
      </Link>

      <div
        ref={cardRef}
        className={cn('mt-4 scroll-mt-4 rounded-2xl transition-shadow duration-300', flash && 'ring-4 ring-primary/20')}
      >
        <CaseStatusCard
          detail={detail.data}
          status={status}
          now={now}
          checkedAt={detail.dataUpdatedAt}
          busy={act.isPending ? (act.variables ?? null) : null}
          refreshing={detail.isFetching}
          offerAmount={offerAmount}
          failure={failure}
          onDismissFailure={() => setFailure(null)}
          onAction={(t) => act.mutate(t)}
          onRefresh={() => {
            void detail.refetch();
            void qc.invalidateQueries({ queryKey: ['disputes'] });
          }}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="h-10 w-full overflow-x-auto overflow-y-hidden [scrollbar-width:none] sm:w-fit">
              <TabsTrigger value="evidence" className="px-2 sm:px-3">
                Evidence
              </TabsTrigger>
              <TabsTrigger value="timeline" className="px-2 sm:px-3">
                Timeline
                {analysis && (
                  <span className="tabular ml-1.5 text-xs text-muted-foreground">{analysis.timeline.entries.length}</span>
                )}
              </TabsTrigger>
              <TabsTrigger value="activity" className="px-2 sm:px-3">
                Activity
                <span className="tabular ml-1.5 text-xs text-muted-foreground">{actions.length}</span>
              </TabsTrigger>
              <TabsTrigger value="sandbox" className="px-2 sm:px-3">
                Sandbox
              </TabsTrigger>
            </TabsList>

            <TabsContent value="evidence" className="mt-4">
              <Panel>
                {analysis ? (
                  <Claims
                    analysis={analysis}
                    onShowRecord={(rid) => {
                      setFocusRecord(rid);
                      setTab('timeline');
                    }}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">Not analysed yet.</p>
                )}
              </Panel>
            </TabsContent>

            <TabsContent value="timeline" className="mt-4">
              <Panel description="What the buyer did after paying, as logged by your store. Cited records went to PayPal.">
                {analysis ? (
                  <Timeline entries={analysis.timeline.entries} citedIds={citedIds} focusId={focusRecord} />
                ) : (
                  <p className="text-sm text-muted-foreground">The timeline appears after analysis.</p>
                )}
              </Panel>
            </TabsContent>

            <TabsContent value="activity" className="mt-4">
              <Panel>
                <Activity actions={actions} />
              </Panel>
            </TabsContent>

            <TabsContent value="sandbox" className="mt-4">
              <Panel>
                <SandboxControls
                  allowedActions={allowedActions}
                  busy={sandbox.isPending ? (sandbox.variables ?? null) : null}
                  onStep={(s) => sandbox.mutate(s)}
                />
              </Panel>
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-6 lg:pt-14">
          <ScoreCard analysis={analysis} />
          <OrderCard order={order} />
        </div>
      </div>
    </Page>
  );
}
