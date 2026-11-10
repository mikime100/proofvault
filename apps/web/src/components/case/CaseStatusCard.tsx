// The top of the dispute page (#46): where the case stands, what just happened, what comes next,
// and the buttons PayPal allows right now. Replaces "a small toast" as the only feedback.
import { useState } from 'react';
import { Check, RefreshCw, X } from 'lucide-react';
import type { DisputeDetail } from '@proofvault/shared';
import { actionLabel, ago, OUTCOME_LABEL, STAGES, type CaseStatus } from '../../lib/caseStatus';
import { plainDetail, type Failure } from '../../lib/errors';
import { fmtDateTime, hoursUntil, reasonLabel } from '../../lib/format';
import { cn } from '../../lib/utils';
import { DecisionBadge } from '../DecisionBadge';
import { StatusBadge } from '../StatusBadge';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';

export type SellerAction = 'submit' | 'offer' | 'accept' | 'escalate';

const BUTTONS: {
  type: SellerAction;
  label: string;
  variant: 'default' | 'outline';
  className?: string;
}[] = [
  { type: 'submit', label: 'Submit evidence', variant: 'default' },
  { type: 'escalate', label: 'Escalate to PayPal', variant: 'outline' },
  { type: 'offer', label: 'Make offer', variant: 'outline' },
  {
    type: 'accept',
    label: 'Refund buyer',
    variant: 'outline',
    className: 'border-danger/25 bg-danger-soft text-danger hover:bg-danger-soft/70 hover:text-danger',
  },
];

function Stepper({ status }: { status: CaseStatus }) {
  const current = STAGES.findIndex((s) => s.key === status.stage);
  return (
    <ol className="flex items-center" aria-label="Case stage">
      {STAGES.map((s, i) => {
        const done = i < current || status.stage === 'decided';
        const active = i === current && status.stage !== 'decided';
        return (
          <li key={s.key} className={cn('flex items-center', i < STAGES.length - 1 && 'flex-1')}>
            <div className="flex flex-col items-center gap-1.5 sm:flex-row sm:gap-2">
              <span
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold',
                  done && 'border-foreground bg-foreground text-white',
                  active && 'border-foreground bg-white text-foreground',
                  !done && !active && 'border-border bg-white text-muted-foreground',
                )}
                aria-current={active ? 'step' : undefined}
              >
                {done ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
              </span>
              <span
                className={cn(
                  'text-xs sm:text-sm',
                  active ? 'font-semibold text-foreground' : done ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {s.label}
              </span>
            </div>
            {i < STAGES.length - 1 && (
              <span
                className={cn('mx-2 mb-5 h-0.5 flex-1 rounded-full sm:mx-3 sm:mb-0', i < current ? 'bg-foreground' : 'bg-border')}
                aria-hidden
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

// Tone is a short coloured bar beside the next step: enough to tell "your move" from "PayPal's
// move" at a glance. The title always says it in words too.
const TONE: Record<CaseStatus['next']['tone'], string> = {
  action: 'bg-warning',
  waiting: 'bg-slate-300',
  done: 'bg-success',
  neutral: 'bg-border',
};

/** Next step first and largest (it is what the seller came for), the last action beside it. */
function NextPanel({ status, now }: { status: CaseStatus; now: number }) {
  const last = status.last;
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-[3fr_2fr] md:gap-0">
      <div className="flex gap-3 md:pr-6" aria-live="polite">
        <span className={cn('w-1 shrink-0 rounded-full', TONE[status.next.tone])} aria-hidden />
        <div className="min-w-0">
          <h2 className="text-sm text-muted-foreground">What happens next</h2>
          <p className="mt-1 text-lg leading-snug font-semibold tracking-[-0.01em]">{status.next.title}</p>
          <p className="mt-1 text-sm leading-relaxed text-foreground/80">{status.next.body}</p>
          {status.next.sandboxHint && (
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Sandbox timing, not a promise: {status.next.sandboxHint}
            </p>
          )}
        </div>
      </div>

      <div className="border-t pt-4 md:border-t-0 md:border-l md:pt-0 md:pl-6" aria-live="polite">
        <h2 className="text-sm text-muted-foreground">Last action</h2>
        {last ? (
          <>
            <p className={cn('mt-1 font-medium', !last.ok && 'text-danger')}>{actionLabel(last)}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {last.actor === 'agent' ? 'By the agent' : 'By you'},{' '}
              <time dateTime={last.createdAt} title={fmtDateTime(last.createdAt)}>
                {ago(last.createdAt, now)}
              </time>
            </p>
            {!last.ok && last.detail && (
              <p className="mt-1 text-sm text-danger [overflow-wrap:anywhere]">{plainDetail(last.detail)}</p>
            )}
          </>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">Nothing sent to PayPal yet.</p>
        )}
      </div>
    </div>
  );
}

interface ConfirmState {
  type: 'offer' | 'accept';
}

export function CaseStatusCard({
  detail,
  status,
  now,
  checkedAt,
  busy,
  refreshing,
  offerAmount,
  failure,
  onDismissFailure,
  onAction,
  onRefresh,
}: {
  detail: DisputeDetail;
  status: CaseStatus;
  now: number;
  checkedAt: number;
  busy: SellerAction | null;
  refreshing: boolean;
  /** Offer the agent would make (seller's offerPercent), for the confirm dialog. Null while rules load. */
  offerAmount: string | null;
  /** Last refused write, kept on screen until the next attempt. */
  failure: Failure | null;
  onDismissFailure: () => void;
  /** amount is set only for an offer, as the seller edited it in the confirm dialog. */
  onAction: (type: SellerAction, amount?: string) => void;
  onRefresh: () => void;
}) {
  const { dispute, analysis, allowedActions } = detail;
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [offer, setOffer] = useState('');
  const resolved = dispute.status === 'RESOLVED';
  const outcome = dispute.outcome;
  const due = !resolved && dispute.responseDueAt ? hoursUntil(dispute.responseDueAt) : null;
  const money = `${dispute.amount.value} ${dispute.amount.currency}`;
  // The offer must be a positive amount with cents, below the full disputed amount (that would be a refund).
  const offerError = !/^\d+(\.\d{1,2})?$/.test(offer.trim())
    ? 'Enter an amount like 24.50.'
    : Number(offer) <= 0
      ? 'The offer must be more than 0.'
      : Number(offer) >= Number(dispute.amount.value)
        ? `The offer must be less than ${money}. To give it all back, use Accept claim.`
        : null;

  const click = (type: SellerAction) => {
    if (type === 'offer') setOffer(offerAmount ?? '');
    if (type === 'offer' || type === 'accept') setConfirm({ type });
    else onAction(type);
  };

  return (
    <section aria-labelledby="case-title" className="rounded-2xl border bg-card">
      <div className="flex flex-col gap-4 p-5 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 id="case-title" className="font-mono text-xl font-semibold tracking-tight sm:text-2xl">
              {dispute.paypalDisputeId}
            </h1>
            <StatusBadge status={dispute.status} />
            {outcome && (
              <Badge variant={outcome === 'won' ? 'success' : 'warning'}>
                {OUTCOME_LABEL[outcome]}
              </Badge>
            )}
            {dispute.paypalDisputeId.startsWith('PP-D-') && (
              <Badge variant="muted">
                Seeded demo case
              </Badge>
            )}
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {reasonLabel(dispute.reason)} · <span className="tabular font-medium text-foreground">{money}</span>
            {due !== null && dispute.responseDueAt && (
              <>
                {' '}
                ·{' '}
                <span className={cn(due <= 48 && 'font-medium text-danger')}>
                  {due < 0 ? 'Response overdue' : `Respond by ${fmtDateTime(dispute.responseDueAt)}`}
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Agent:</span>
          <DecisionBadge action={analysis?.decision.action ?? null} />
        </div>
      </div>

      <div className="border-t px-5 py-5 sm:px-6">
        <Stepper status={status} />
      </div>

      <div className="border-t px-5 py-5 sm:px-6">
        <NextPanel status={status} now={now} />
        {failure && (
          <div
            role="alert"
            className="mt-3 flex items-start gap-3 rounded-xl border border-danger/25 bg-danger-soft p-4 text-danger"
          >
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{failure.title}</p>
              <p className="mt-0.5 text-sm">{failure.description}</p>
              <p className="mt-1 text-sm text-foreground/70">Nothing changed on the case.</p>
            </div>
            <Button variant="ghost" size="icon-sm" onClick={onDismissFailure} aria-label="Dismiss">
              <X />
            </Button>
          </div>
        )}
      </div>

      {!resolved && (
        <div className="flex flex-col gap-3 border-t px-5 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
            {BUTTONS.map((b) => {
              // Submit also needs a built evidence package (else the api answers 409 NO_EVIDENCE_PACKAGE).
              const why = !allowedActions.includes(b.type)
                ? 'PayPal does not allow this at the current stage.'
                : b.type === 'submit' && !analysis
                  ? 'Not analysed yet. The agent builds the evidence package first.'
                  : null;
              const allowed = why === null;
              const btn = (
                <Button
                  variant={b.variant}
                  className={cn('w-full sm:w-auto', b.className)}
                  disabled={!allowed || busy !== null}
                  onClick={() => click(b.type)}
                >
                  {busy === b.type && <RefreshCw className="animate-spin" />}
                  {busy === b.type ? 'Sending to PayPal…' : b.label}
                </Button>
              );
              return allowed ? (
                <span key={b.type}>{btn}</span>
              ) : (
                <Tooltip key={b.type}>
                  <TooltipTrigger asChild>
                    <span tabIndex={0} className="rounded-md">
                      {btn}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{why}</TooltipContent>
                </Tooltip>
              );
            })}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>
              {status.waitingOnPaypal ? 'Checking every 30 s. ' : ''}Updated {ago(new Date(checkedAt).toISOString(), now)}
            </span>
            <Button variant="ghost" size="sm" onClick={onRefresh} disabled={refreshing}>
              {refreshing && <RefreshCw className="animate-spin" />}
              Refresh
            </Button>
          </div>
        </div>
      )}
      {!resolved && allowedActions.length === 0 && (
        <p className="border-t px-5 py-3 text-sm text-muted-foreground sm:px-6">
          PayPal does not allow any seller action right now. That is normal while PayPal or the buyer has the
          next move.
        </p>
      )}

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.type === 'accept' ? `Refund ${money} to the buyer?` : 'Send an offer to the buyer?'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {confirm?.type === 'accept' ? (
                  <p>
                    This accepts the claim on PayPal. The buyer gets {money} back and the case closes against you. It
                    cannot be undone.
                  </p>
                ) : (
                  <>
                    <p>
                      PayPal sends the buyer a partial refund offer. If they accept, the case closes with that refund.
                      The amount starts at your offer percentage in Agent rules.
                    </p>
                    <div className="space-y-1.5 pt-1">
                      <Label htmlFor="offer-amount" className="text-foreground">
                        Offer amount ({dispute.amount.currency})
                      </Label>
                      <Input
                        id="offer-amount"
                        inputMode="decimal"
                        value={offer}
                        onChange={(e) => setOffer(e.target.value)}
                        aria-invalid={offerError !== null}
                        aria-describedby="offer-amount-hint"
                        className="tabular max-w-40 text-foreground"
                      />
                      <p id="offer-amount-hint" className={cn('text-xs', offerError && 'text-danger')}>
                        {offerError ?? `Out of ${money} disputed.`}
                      </p>
                    </div>
                  </>
                )}
                {dispute.paypalDisputeId.startsWith('PP-R-') && (
                  <p className="font-medium text-danger">
                    This is a real sandbox case ({dispute.paypalDisputeId}). Only continue if you mean it.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep fighting</AlertDialogCancel>
            <AlertDialogAction
              className={cn(confirm?.type === 'accept' && 'bg-danger text-white hover:bg-danger/90')}
              disabled={confirm?.type === 'offer' && offerError !== null}
              onClick={() =>
                confirm && onAction(confirm.type, confirm.type === 'offer' ? Number(offer).toFixed(2) : undefined)
              }
            >
              {confirm?.type === 'accept'
                ? 'Refund buyer'
                : offerError
                  ? 'Send offer'
                  : `Send offer of ${Number(offer).toFixed(2)} ${dispute.amount.currency}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
