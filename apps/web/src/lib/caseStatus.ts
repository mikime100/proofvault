// Where a case stands and what comes next, worked out in the browser (#46).
//
// Stage: PayPal's lifecycle stage (`dispute.stage`). Seeded cases have no PayPal copy (stage null),
// so for them it is inferred from the status and our action log: an escalation that PayPal
// accepted means the case is on its way to (or in) the claim stage.
// Timings are what we saw in the sandbox on Nov 8, never promises.
import type { ActionLogEntry, AllowedAction, DisputeDetail, OutcomeResult } from '@proofvault/shared';

export const OUTCOME_LABEL: Record<OutcomeResult, string> = {
  won: 'Won',
  lost: 'Lost',
  refunded: 'Refunded',
  offer_accepted: 'Offer accepted',
};

export type Stage = 'opened' | 'inquiry' | 'claim' | 'decided';
export const STAGES: { key: Stage; label: string }[] = [
  { key: 'opened', label: 'Opened' },
  { key: 'inquiry', label: 'Inquiry' },
  { key: 'claim', label: 'Claim' },
  { key: 'decided', label: 'Decided' },
];

export type Tone = 'action' | 'waiting' | 'done' | 'neutral';

export interface NextStep {
  tone: Tone;
  title: string;
  body: string;
  /** Sandbox timing hint, shown with a "sandbox" label. */
  sandboxHint?: string;
}

export interface CaseStatus {
  stage: Stage;
  last: ActionLogEntry | null;
  next: NextStep;
  /** True while PayPal, not the seller, has the next move: the page re-checks on a timer. */
  waitingOnPaypal: boolean;
}

const ACTION_LABEL: Record<ActionLogEntry['action'], string> = {
  submit: 'Evidence submitted',
  offer: 'Offer sent',
  accept: 'Claim accepted (buyer refunded)',
  message: 'Message sent',
  escalate: 'Escalated to PayPal review',
  require_evidence: 'Sandbox: evidence requested',
  adjudicate: 'Sandbox: adjudicated',
  analyze: 'Evidence package built',
};

export function actionLabel(a: ActionLogEntry): string {
  const base = ACTION_LABEL[a.action] ?? a.action;
  return a.ok ? base : `${base.split(' (')[0]}: failed`;
}

/** Newest first, ignoring analysis runs (they do not change anything on PayPal). */
function paypalActions(actions: ActionLogEntry[]): ActionLogEntry[] {
  return actions
    .filter((a) => a.action !== 'analyze')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

const okAfter = (list: ActionLogEntry[], action: ActionLogEntry['action'], after?: string) =>
  list.find((a) => a.ok && a.action === action && (!after || a.createdAt > after)) ?? null;

export function stageOf(detail: DisputeDetail): Stage {
  if (detail.dispute.status === 'RESOLVED') return 'decided';
  const paypalStage = detail.dispute.stage;
  if (paypalStage) return paypalStage === 'INQUIRY' ? 'inquiry' : 'claim';
  const escalated = detail.actions.some((a) => a.ok && a.action === 'escalate');
  return escalated ? 'claim' : 'inquiry';
}

export function caseStatus(detail: DisputeDetail): CaseStatus {
  const { dispute, allowedActions } = detail;
  const acts = paypalActions(detail.actions);
  const last = acts[0] ?? null;
  const stage = stageOf(detail);
  const escalate = okAfter(acts, 'escalate');
  const submitInStage = okAfter(acts, 'submit', escalate?.createdAt);
  const adjudicated = okAfter(acts, 'adjudicate');
  const accepted = okAfter(acts, 'accept');
  const offered = okAfter(acts, 'offer', escalate?.createdAt);
  const can = (a: AllowedAction) => allowedActions.includes(a);

  const result = (next: NextStep, waitingOnPaypal: boolean): CaseStatus => ({
    stage,
    last,
    next,
    waitingOnPaypal,
  });

  if (dispute.status === 'RESOLVED') {
    const outcome = dispute.outcome;
    if (outcome) {
      const body: Record<OutcomeResult, string> = {
        won: 'PayPal decided in your favour. You keep the payment.',
        lost: 'PayPal decided for the buyer and refunded them.',
        refunded: 'The buyer was refunded in full.',
        offer_accepted: 'The buyer accepted your offer, so the case closed with that partial refund.',
      };
      // Green only for a win; a loss or refund is closed but not good news.
      const tone = outcome === 'won' ? 'done' : 'neutral';
      return result({ tone, title: `Case closed: ${OUTCOME_LABEL[outcome]}`, body: body[outcome] }, false);
    }
    if (accepted)
      return result(
        { tone: 'done', title: 'Case closed', body: 'You accepted the claim, so PayPal refunded the buyer.' },
        false,
      );
    if (adjudicated)
      return result(
        {
          tone: 'done',
          title: 'Case closed',
          body: 'PayPal decided the case after the sandbox adjudication. Nothing left to do.',
        },
        false,
      );
    return result(
      { tone: 'done', title: 'Case closed', body: 'PayPal has closed this case. Nothing left to do.' },
      false,
    );
  }

  if (adjudicated)
    return result(
      {
        tone: 'waiting',
        title: 'PayPal is closing the case',
        body: 'The adjudication went through. The case should move to Resolved on its own.',
        sandboxHint: 'In our sandbox run it resolved about 3 minutes after adjudicating.',
      },
      true,
    );

  if (dispute.status === 'WAITING_FOR_SELLER_RESPONSE' && !submitInStage) {
    if (!detail.analysis)
      return result(
        {
          tone: 'action',
          title: 'PayPal is waiting on you',
          body: 'The agent has not built the evidence package yet, so it cannot be submitted. You can still settle with an offer or refund.',
        },
        false,
      );
    if (can('submit'))
      return result(
        {
          tone: 'action',
          title: stage === 'claim' ? 'Claim open: PayPal wants your evidence' : 'PayPal is waiting on you',
          body:
            stage === 'claim'
              ? 'The case is now a claim. The agent resubmits the evidence package by itself when the claim opens, unless someone already acted at this stage. You can also submit it yourself.'
              : 'Submit the evidence package, or settle with an offer or refund.',
        },
        false,
      );
    return result(
      {
        tone: 'action',
        title: 'PayPal is waiting on you',
        body: 'PayPal has not opened any action for this case yet. Refresh in a minute.',
      },
      true,
    );
  }

  if (escalate && !submitInStage)
    return result(
      {
        tone: 'waiting',
        title: 'PayPal is turning this into a claim',
        body: 'Your escalation was accepted. Once the claim opens, PayPal waits on you again for evidence.',
        sandboxHint: 'In our sandbox run the claim stage opened about 4 minutes after escalating.',
      },
      true,
    );

  if (escalate && submitInStage)
    return result(
      {
        tone: 'waiting',
        title: 'PayPal is reviewing your evidence',
        body: can('adjudicate')
          ? 'PayPal now allows a decision. Use Sandbox > Adjudicate to close the demo case.'
          : 'Next is a decision. In the sandbox we trigger it with Sandbox > Adjudicate once PayPal allows it.',
        sandboxHint:
          'In our sandbox run Adjudicate became allowed about 30 minutes after the claim-stage evidence, and the case resolved about 3 minutes later.',
      },
      true,
    );

  if (offered)
    return result(
      {
        tone: 'waiting',
        title: 'Offer sent, waiting for the buyer',
        body: 'The buyer can accept or decline. If they decline, the case comes back to you.',
      },
      true,
    );

  if (submitInStage)
    return result(
      {
        tone: can('escalate') ? 'action' : 'waiting',
        title: 'Evidence sent, waiting for the buyer',
        body: can('escalate')
          ? 'PayPal now waits on the buyer. To get a PayPal decision instead, escalate to PayPal review.'
          : 'PayPal now waits on the buyer. Escalation becomes possible when PayPal allows it.',
      },
      !can('escalate'),
    );

  if (dispute.status === 'WAITING_FOR_BUYER_RESPONSE')
    return result(
      {
        tone: can('escalate') ? 'action' : 'waiting',
        title: 'Waiting for the buyer',
        body: can('escalate')
          ? 'You can escalate to PayPal review to get a decision.'
          : 'Nothing to do until the buyer answers or PayPal allows an action.',
      },
      true,
    );

  return result(
    {
      tone: 'waiting',
      title: 'PayPal is reviewing the case',
      body: 'Nothing to do yet. This page checks again on its own.',
      sandboxHint: 'In the sandbox, new cases sit in review for about a minute before PayPal waits on the seller.',
    },
    true,
  );
}

/** Rough "5 min ago" for the status card; exact time is in the activity log. */
export function ago(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}
