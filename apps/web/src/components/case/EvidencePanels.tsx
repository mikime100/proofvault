// Evidence, timeline, activity and sandbox panels for the dispute page.
import { useEffect, useMemo, useRef } from 'react';
import { RefreshCw } from 'lucide-react';
import type { ActionLogEntry, AllowedAction, DisputeDetail, PipelineFlag, TimelineEntry } from '@proofvault/shared';
import { actionLabel } from '../../lib/caseStatus';
import { plainDetail } from '../../lib/errors';
import { fmtDateTime } from '../../lib/format';
import { cn } from '../../lib/utils';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';

type Analysis = NonNullable<DisputeDetail['analysis']>;

const ENTRY_LABEL: Record<string, string> = {
  purchase: 'Purchase',
  login: 'Login',
  lesson_view: 'Lesson viewed',
  download: 'Download',
  activation: 'Activation',
  dispute_opened: 'Dispute opened',
};

const FLAG_MESSAGES: Record<PipelineFlag, string> = {
  no_matching_order: 'No matching order: this dispute is for a purchase we have no record of.',
  unsupported_reason: 'PayPal reason we do not score, so it waits for your decision.',
  llm_failed: 'The AI draft failed, so it waits for your decision.',
  no_access_events: 'No access was recorded for this order, so there is little proof to send.',
};

export function Panel({
  title,
  description,
  children,
  className,
}: {
  /** Omit when a tab already names the content; a second heading saying the same thing is noise. */
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-xl border bg-card p-5', className)}>
      {title && <h2 className="text-base font-semibold">{title}</h2>}
      {description && (
        <p className={cn('text-sm text-muted-foreground', title && 'mt-0.5')}>{description}</p>
      )}
      <div className={cn((title || description) && 'mt-4')}>{children}</div>
    </section>
  );
}

export function Flags({ flags }: { flags: PipelineFlag[] }) {
  if (flags.length === 0) return null;
  return (
    <div className="space-y-2">
      {flags.map((f) => (
        <p
          key={f}
          className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2.5 text-sm text-warning"
        >
          {FLAG_MESSAGES[f]}
        </p>
      ))}
    </div>
  );
}

export function ScoreCard({ analysis }: { analysis: Analysis | null }) {
  if (!analysis)
    return (
      <Panel title="Win score">
        <p className="text-sm text-muted-foreground">Not analysed yet. The agent builds the evidence package first.</p>
      </Panel>
    );
  const v = analysis.score.value;
  const tone = v >= 70 ? 'text-success' : v >= 40 ? 'text-warning' : 'text-danger';
  return (
    <Panel title="Win score" description="Scored by rules in code, not by the AI.">
      <div className="flex items-baseline gap-2">
        <span className={cn('tabular text-4xl font-bold tracking-tight', tone)}>{v}</span>
        <span className="text-sm text-muted-foreground">/ 100</span>
        <Badge variant="muted" className="ml-auto capitalize">
          Recommends: {analysis.recommendation}
        </Badge>
      </div>
      {analysis.score.features.length > 0 && (
        <ul className="mt-4 space-y-1.5 text-sm">
          {analysis.score.features.map((f) => (
            <li key={f.key} className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">{f.label}</span>
              <span className={cn('tabular font-medium', f.points >= 0 ? 'text-success' : 'text-danger')}>
                {f.points > 0 ? '+' : ''}
                {f.points}
              </span>
            </li>
          ))}
        </ul>
      )}
      {analysis.score.reasons.length > 0 && (
        <ul className="mt-4 list-disc space-y-1 border-t pt-4 pl-5 text-sm text-foreground/80">
          {analysis.score.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      <div className="mt-4 rounded-lg bg-canvas px-3 py-2.5 text-sm">
        <span className="font-medium">Agent decision: </span>
        {analysis.decision.reason}
      </div>
    </Panel>
  );
}

export function OrderCard({ order }: { order: DisputeDetail['order'] }) {
  if (!order)
    return (
      <Panel title="Order">
        <p className="text-sm text-muted-foreground">
          No matching order. We have no record of this purchase, so there is no access evidence to show.
        </p>
      </Panel>
    );
  const rows: [string, React.ReactNode][] = [
    ['Buyer', <span className="break-all">{order.buyerEmail}</span>],
    ['Paid', <span className="tabular">{order.amount.value} {order.amount.currency}</span>],
    ['Purchased', fmtDateTime(order.createdAt)],
    ['Checkout IP', <span className="font-mono text-xs">{order.checkoutIp}</span>],
    ['Device', order.checkoutDevice],
    ['Risk', <span className="capitalize">{order.riskLevel}</span>],
  ];
  return (
    <Panel title="Order">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="min-w-0 text-right">{v}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

export function Claims({
  analysis,
  onShowRecord,
}: {
  analysis: Analysis;
  onShowRecord: (recordId: string) => void;
}) {
  const entryById = useMemo(
    () => new Map(analysis.timeline.entries.map((e) => [e.recordId, e])),
    [analysis.timeline.entries],
  );
  return (
    <div className="space-y-5">
      <Flags flags={analysis.flags} />
      <div>
        <h3 className="text-sm font-semibold">Claims sent to PayPal</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Every claim cites a real record from this order. Click a record to see it in the timeline.
        </p>
        {analysis.accepted.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No claims passed the check.</p>
        ) : (
          <ul className="mt-2 divide-y divide-divider">
            {analysis.accepted.map((c) => (
              <li key={c.text} className="py-3">
                <p className="flex items-start gap-2 text-sm">
                  <span className="min-w-0 [overflow-wrap:anywhere]">{c.text}</span>
                </p>
                <div className="mt-2.5 flex flex-wrap gap-1.5 pl-6">
                  {c.recordIds.map((rid) => {
                    const e = entryById.get(rid);
                    return (
                      <button
                        key={rid}
                        type="button"
                        onClick={() => onShowRecord(rid)}
                        title={rid}
                        className="inline-flex min-h-7 items-center gap-1 rounded-md border bg-canvas px-2 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                      >
                        {e ? `${ENTRY_LABEL[e.type] ?? e.type} · ${fmtDateTime(e.at)}` : rid}
                      </button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {analysis.responseText && (
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            Response text
          </h3>
          <p className="mt-2 rounded-lg bg-canvas px-3.5 py-3 text-sm leading-relaxed [overflow-wrap:anywhere]">
            {analysis.responseText}
          </p>
        </div>
      )}

      {analysis.rejected.length > 0 && (
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            Removed by the guardrail
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            The AI wrote these, but no record backs them, so they were never sent.
          </p>
          <ul className="mt-3 space-y-2">
            {analysis.rejected.map((r) => (
              <li key={r.claim.text} className="rounded-lg border border-danger/20 bg-danger-soft px-3.5 py-2.5 text-sm">
                <p className="text-foreground/80 line-through decoration-danger/60 [overflow-wrap:anywhere]">{r.claim.text}</p>
                <p className="mt-1 text-xs text-danger">{r.reason}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function Timeline({
  entries,
  citedIds,
  focusId,
}: {
  entries: TimelineEntry[];
  citedIds: Set<string>;
  focusId: string | null;
}) {
  const sorted = useMemo(() => [...entries].sort((a, b) => a.at.localeCompare(b.at)), [entries]);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (!focusId) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-record="${CSS.escape(focusId)}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.focus({ preventScroll: true });
  }, [focusId]);

  if (sorted.length === 0) return <p className="text-sm text-muted-foreground">No records for this order.</p>;

  return (
    <ol ref={listRef} className="relative space-y-1">
      {sorted.map((e, i) => {
        const cited = citedIds.has(e.recordId);
        const focused = focusId === e.recordId;
        return (
          <li
            key={e.recordId}
            data-record={e.recordId}
            tabIndex={-1}
            className={cn(
              'relative flex gap-3 rounded-lg px-2 py-2.5 outline-none transition-colors',
              focused && 'bg-canvas ring-2 ring-foreground/15',
            )}
          >
            {i < sorted.length - 1 && (
              <span className="absolute top-6 bottom-[-10px] left-[13px] w-px bg-border" aria-hidden />
            )}
            <span
              className={cn(
                'relative z-10 mt-1.5 size-2.5 shrink-0 rounded-full border-2 bg-card',
                cited ? 'border-foreground bg-foreground' : 'border-slate-300',
              )}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-sm font-medium">{e.summary}</span>
                {cited && (
                  <Badge variant="outline" className="font-normal text-muted-foreground">
                    Cited
                  </Badge>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                <time dateTime={e.at}>{fmtDateTime(e.at)}</time>
                {e.ip && <span className="font-mono"> · {e.ip}</span>}
                {e.device && <span> · {e.device}</span>}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function Activity({ actions }: { actions: ActionLogEntry[] }) {
  const sorted = useMemo(() => [...actions].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [actions]);
  if (sorted.length === 0) return <p className="text-sm text-muted-foreground">No actions recorded yet.</p>;
  return (
    <ul className="divide-y divide-divider">
      {sorted.map((a) => (
        <li key={a.id} className="py-3 first:pt-0 last:pb-0">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className={cn('text-sm font-medium', !a.ok && 'text-danger')}>{actionLabel(a)}</span>
              <span className="text-xs text-muted-foreground">{a.actor === 'agent' ? 'by the agent' : 'by you'}</span>
              <time dateTime={a.createdAt} className="ml-auto text-xs text-muted-foreground">
                {fmtDateTime(a.createdAt)}
              </time>
            </div>
            {a.detail && (
              <p className="mt-1 text-sm text-muted-foreground [overflow-wrap:anywhere]">
                {a.ok ? a.detail : plainDetail(a.detail)}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

export type SandboxStepName = 'require-evidence' | 'adjudicate';

export function SandboxControls({
  allowedActions,
  busy,
  onStep,
}: {
  allowedActions: AllowedAction[];
  busy: SandboxStepName | null;
  onStep: (step: SandboxStepName) => void;
}) {
  // #45: the api lists adjudicate / require_evidence only when PayPal allows them right now.
  const steps: { step: SandboxStepName; key: AllowedAction; label: string; body: string }[] = [
    {
      step: 'adjudicate',
      key: 'adjudicate',
      label: 'Adjudicate (seller wins)',
      body: 'Asks the sandbox to decide the claim in your favour. Only works once PayPal allows it: in our run, about 30 minutes after the claim-stage evidence.',
    },
    {
      step: 'require-evidence',
      key: 'require_evidence',
      label: 'Require evidence',
      body: 'Asks the sandbox to request evidence from the seller, which moves a case back to waiting on you.',
    },
  ];
  return (
    <div className="space-y-4">
      <p className="rounded-lg border bg-canvas px-3.5 py-3 text-sm text-muted-foreground">
        Sandbox-only PayPal calls that push a case to its next stage for the demo. They do nothing on a live
        account.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {steps.map((s) => {
          const allowed = allowedActions.includes(s.key);
          const disabled = busy !== null || !allowed;
          return (
            <div key={s.step} className="flex flex-col rounded-lg border p-4">
              <p className="text-sm font-semibold">{s.label}</p>
              <p className="mt-1 flex-1 text-sm text-muted-foreground">{s.body}</p>
              <Button variant="outline" className="mt-3 w-full" disabled={disabled} onClick={() => onStep(s.step)}>
                {busy === s.step && <RefreshCw className="animate-spin" />}
                {busy === s.step ? 'Sending…' : s.label.split(' (')[0]}
              </Button>
              {!allowed && (
                <p className="mt-2 text-xs text-muted-foreground">PayPal does not allow this yet.</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
