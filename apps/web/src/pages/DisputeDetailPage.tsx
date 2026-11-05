import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CreditCard,
  Download,
  Flag,
  KeyRound,
  LogIn,
  MonitorPlay,
  ShieldAlert,
} from 'lucide-react';
import type { PipelineFlag, TimelineEntry } from '@proofvault/shared';
import { api } from '../api';
import { DecisionBadge } from '../components/DecisionBadge';
import { fmtDateTime, reasonLabel, statusLabel } from '../lib/format';
import { cn } from '../lib/utils';

const ENTRY_ICONS: Record<string, typeof CreditCard> = {
  purchase: CreditCard,
  login: LogIn,
  lesson_view: MonitorPlay,
  download: Download,
  activation: KeyRound,
  dispute_opened: Flag,
};

const FLAG_MESSAGES: Record<PipelineFlag, string> = {
  no_matching_order: 'No matching order — this dispute is for a purchase we do not know.',
  unsupported_reason: 'PayPal reason we do not score — sent to manual review.',
  llm_failed: 'The AI draft failed — sent to manual review.',
  no_access_events: 'No access events were recorded for this order.',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 rounded-lg border bg-white p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Timeline({ entries, highlightIds }: { entries: TimelineEntry[]; highlightIds: Set<string> }) {
  const sorted = useMemo(() => [...entries].sort((a, b) => a.at.localeCompare(b.at)), [entries]);
  return (
    <ol className="space-y-2">
      {sorted.map((e) => {
        const Icon = ENTRY_ICONS[e.type] ?? Flag;
        const cited = highlightIds.has(e.recordId);
        return (
          <li
            key={e.recordId}
            className={cn(
              'flex items-start gap-3 rounded-md border px-3 py-2 text-sm',
              cited ? 'border-amber-300 bg-amber-50' : 'border-neutral-200',
            )}
          >
            <Icon className={cn('mt-0.5 size-4 shrink-0', cited ? 'text-amber-600' : 'text-neutral-400')} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className="font-medium">{e.summary}</span>
                <span className="text-xs text-neutral-500">{fmtDateTime(e.at)}</span>
              </div>
              <div className="mt-0.5 text-xs text-neutral-500">
                {e.type}
                {e.ip ? ` · ${e.ip}` : ''}
                {e.device ? ` · ${e.device}` : ''}
                {cited ? ' · cited as evidence' : ''}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function DisputeDetailPage() {
  const { id = '' } = useParams();
  const detail = useQuery({ queryKey: ['dispute', id], queryFn: () => api.dispute(id) });

  if (detail.isPending) return <p className="text-sm text-neutral-500">Loading dispute…</p>;
  if (detail.isError || !detail.data)
    return <p className="text-sm text-red-600">Could not load dispute {id}.</p>;

  const { dispute, order, analysis, actions } = detail.data;
  const citedIds = new Set(analysis?.accepted.flatMap((c) => c.recordIds) ?? []);
  const entryById = new Map(analysis?.timeline.entries.map((e) => [e.recordId, e]) ?? []);

  return (
    <section>
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-blue-700 hover:underline">
        <ArrowLeft className="size-4" /> All disputes
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{dispute.paypalDisputeId}</h1>
        <DecisionBadge action={analysis?.decision.action ?? null} />
        {dispute.status !== 'RESOLVED' && dispute.responseDueAt && (
          <span className="text-sm text-neutral-500">Respond by {fmtDateTime(dispute.responseDueAt)}</span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-neutral-600">
        <span>
          Reason: <span className="font-medium text-neutral-900">{reasonLabel(dispute.reason)}</span>
        </span>
        <span>
          Amount: <span className="font-medium text-neutral-900">{dispute.amount.value} {dispute.amount.currency}</span>
        </span>
        <span>Status: {statusLabel(dispute.status)}</span>
        <span>Score: {dispute.winScore ?? analysis?.score.value ?? '—'}</span>
      </div>

      {analysis && analysis.flags.length > 0 && (
        <div className="mt-4 space-y-1">
          {analysis.flags.map((f) => (
            <p key={f} className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <ShieldAlert className="size-4 shrink-0" /> {FLAG_MESSAGES[f]}
            </p>
          ))}
        </div>
      )}

      {order ? (
        <Section title="Order">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-neutral-500">Buyer</dt>
              <dd>{order.buyerEmail}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Paid</dt>
              <dd>
                {order.amount.value} {order.amount.currency}
              </dd>
            </div>
            <div>
              <dt className="text-neutral-500">Purchased</dt>
              <dd>{fmtDateTime(order.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Checkout IP</dt>
              <dd className="font-mono text-xs">{order.checkoutIp}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Device</dt>
              <dd>{order.checkoutDevice}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Risk</dt>
              <dd>{order.riskLevel}</dd>
            </div>
          </dl>
        </Section>
      ) : (
        <div className="mt-4 rounded-md border border-neutral-300 bg-neutral-100 px-4 py-3 text-sm text-neutral-700">
          No matching order — we have no record of this purchase, so there is no access evidence to show.
        </div>
      )}

      {analysis ? (
        <>
          <Section title="AI analysis">
            <div className="flex items-center gap-3">
              <span className="text-3xl font-semibold">{analysis.score.value}</span>
              <span className="text-sm text-neutral-500">win score</span>
              <span className="ml-auto rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">
                Recommendation: {analysis.recommendation}
              </span>
            </div>
            {analysis.score.reasons.length > 0 && (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-neutral-700">
                {analysis.score.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
            {analysis.score.features.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs text-neutral-600">
                {analysis.score.features.map((f) => (
                  <li key={f.key}>
                    {f.label}: {f.points > 0 ? '+' : ''}
                    {f.points} pts
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 rounded-md bg-neutral-50 px-3 py-2 text-sm">
              <span className="font-medium">Decision: </span>
              {analysis.decision.reason}
            </div>
          </Section>

          <Section title="Claims sent as evidence">
            {analysis.accepted.length === 0 ? (
              <p className="text-sm text-neutral-500">No claims survived the guardrail.</p>
            ) : (
              <ul className="space-y-3">
                {analysis.accepted.map((c) => (
                  <li key={c.text} className="rounded-md border border-neutral-200 px-3 py-2 text-sm">
                    <p>{c.text}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {c.recordIds.map((rid) => {
                        const e = entryById.get(rid);
                        return (
                          <span
                            key={rid}
                            className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[11px] text-neutral-600"
                            title={rid}
                          >
                            {e ? `${e.type} · ${fmtDateTime(e.at)}` : rid}
                          </span>
                        );
                      })}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {analysis.responseText && (
              <div className="mt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Response text
                </h3>
                <p className="mt-1 rounded-md bg-neutral-50 px-3 py-2 text-sm">{analysis.responseText}</p>
              </div>
            )}
          </Section>

          {analysis.rejected.length > 0 && (
            <Section title="Removed by guardrail">
              <ul className="space-y-2">
                {analysis.rejected.map((r) => (
                  <li key={r.claim.text} className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm">
                    <p className="text-neutral-800 line-through decoration-red-400">{r.claim.text}</p>
                    <p className="mt-1 text-xs text-red-700">{r.reason}</p>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="Evidence timeline">
            <Timeline entries={analysis.timeline.entries} highlightIds={citedIds} />
          </Section>
        </>
      ) : (
        <Section title="AI analysis">
          <p className="text-sm text-neutral-500">Not analyzed yet.</p>
        </Section>
      )}

      <Section title="Activity">
        {actions.length === 0 ? (
          <p className="text-sm text-neutral-500">No actions recorded.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {actions.map((a) => (
              <li key={a.id} className="flex items-baseline gap-3">
                <span className={cn('rounded px-1.5 py-0.5 text-xs font-medium', a.ok ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700')}>
                  {a.action}
                </span>
                <span className="text-neutral-500">{a.actor}</span>
                <span className="flex-1">{a.detail}</span>
                <span className="text-xs text-neutral-400">{fmtDateTime(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </section>
  );
}
