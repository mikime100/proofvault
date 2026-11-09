import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { SellerRules } from '@proofvault/shared';
import { api, ApiError } from '../api';
import { Page, PageHeader } from '../components/AppShell';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Skeleton } from '../components/ui/skeleton';
import { Switch } from '../components/ui/switch';
import { CANCELLED, reportError } from '../lib/errors';
import { usePasscode } from '../lib/passcode';

type Draft = Record<keyof SellerRules, string | boolean>;

const toDraft = (r: SellerRules): Draft => ({
  autoSubmitEnabled: r.autoSubmitEnabled,
  autoSubmitMinScore: String(r.autoSubmitMinScore),
  weakScoreBelow: String(r.weakScoreBelow),
  autoAcceptMaxAmount: r.autoAcceptMaxAmount,
  autoOfferMaxAmount: r.autoOfferMaxAmount,
  offerPercent: String(r.offerPercent),
});

const NUMBER_FIELDS = new Set<keyof SellerRules>(['autoSubmitMinScore', 'weakScoreBelow', 'offerPercent']);

function parse(d: Draft) {
  const raw = Object.fromEntries(
    Object.entries(d).map(([k, v]) => [
      k,
      NUMBER_FIELDS.has(k as keyof SellerRules) ? (v === '' ? NaN : Number(v)) : v,
    ]),
  );
  return SellerRules.safeParse(raw);
}

const HELP: Partial<Record<keyof SellerRules, string>> = {
  autoSubmitMinScore: 'Whole number from 0 to 100.',
  weakScoreBelow: 'Whole number from 0 to 100.',
  autoAcceptMaxAmount: 'USD with cents, like 20.00.',
  autoOfferMaxAmount: 'USD with cents, like 50.00.',
  offerPercent: 'Whole number from 1 to 100.',
};

function Field({
  id,
  label,
  hint,
  error,
  prefix,
  suffix,
  value,
  onChange,
  onBlur,
  inputMode,
}: {
  id: keyof SellerRules;
  label: string;
  hint: string;
  error?: string;
  prefix?: string;
  suffix?: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  inputMode: 'numeric' | 'decimal';
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
            {prefix}
          </span>
        )}
        <Input
          id={id}
          inputMode={inputMode}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          aria-invalid={!!error}
          aria-describedby={`${id}-hint`}
          className={`tabular h-10 ${prefix ? 'pl-7' : ''} ${suffix ? 'pr-10' : ''}`}
        />
        {suffix && (
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
      <p id={`${id}-hint`} className={error ? 'text-xs text-danger' : 'text-xs text-muted-foreground'} role={error ? 'alert' : undefined}>
        {error ?? hint}
      </p>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-5 sm:p-6">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      <div className="mt-5 grid gap-5 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export function RulesPage() {
  const passcode = usePasscode();
  const qc = useQueryClient();
  const rules = useQuery({ queryKey: ['rules'], queryFn: api.rules });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  // Fields the seller has left: checked inline on blur, not only when they press Save.
  const [touched, setTouched] = useState<Set<keyof SellerRules>>(new Set());
  const touch = (k: keyof SellerRules) => setTouched((t) => (t.has(k) ? t : new Set(t).add(k)));

  useEffect(() => {
    if (rules.data && !draft) setDraft(toDraft(rules.data));
  }, [rules.data, draft]);

  const save = useMutation({
    mutationFn: async (r: SellerRules) => {
      const pc = await passcode.require();
      if (!pc) throw new Error(CANCELLED);
      return api.saveRules(r, pc);
    },
    onSuccess: (saved) => {
      toast.success('Rules saved', { description: 'The agent uses them on the next case it analyses.' });
      qc.setQueryData(['rules'], saved);
      setDraft(toDraft(saved));
      setShowErrors(false);
      setTouched(new Set());
    },
    onError: (e) => reportError(e, 'save the rules', passcode.forget),
  });

  if (rules.isPending || (!draft && !rules.isError))
    return (
      <Page>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-6 h-64 rounded-xl" />
      </Page>
    );
  if (rules.isError || !draft)
    return (
      <Page>
        <PageHeader title="Agent rules" />
        <div className="mt-6 rounded-xl border border-danger/20 bg-danger-soft p-5 text-sm text-danger">
          <p className="font-semibold">Could not load the rules</p>
          <p className="mt-1">
            {rules.error instanceof ApiError && rules.error.code === 'NOT_FOUND'
              ? 'The API does not serve seller rules yet (GET /seller/rules is missing), so the agent uses its built-in defaults.'
              : 'Check the API is running, then reload.'}
          </p>
        </div>
      </Page>
    );

  const parsed = parse(draft);
  const errors: Partial<Record<keyof SellerRules, string>> = {};
  if (!parsed.success)
    for (const issue of parsed.error.issues) {
      const k = issue.path[0] as keyof SellerRules;
      if (showErrors || touched.has(k)) errors[k] = HELP[k] ?? 'Check this value.';
    }
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(rules.data));
  const set = (k: keyof SellerRules) => (v: string | boolean) => setDraft({ ...draft, [k]: v });

  const onSave = () => {
    if (!parsed.success) {
      setShowErrors(true);
      const first = parsed.error.issues[0]?.path[0];
      if (typeof first === 'string') document.getElementById(first)?.focus();
      return;
    }
    save.mutate(parsed.data);
  };

  return (
    <Page className="max-w-5xl">
      <PageHeader
        title="Agent rules"
        description="What the agent may do on its own. Anything outside these rules waits for you."
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section title="Fight with evidence" description="When the proof is strong, send it to PayPal without asking.">
            <div className="flex items-start justify-between gap-4 rounded-lg border bg-canvas p-4 sm:col-span-2">
              <div>
                <Label htmlFor="autoSubmitEnabled" className="text-sm font-medium">
                  Submit evidence automatically
                </Label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Only when the win score reaches the minimum below.
                </p>
              </div>
              <Switch
                id="autoSubmitEnabled"
                checked={draft.autoSubmitEnabled as boolean}
                onCheckedChange={set('autoSubmitEnabled')}
              />
            </div>
            <Field
              id="autoSubmitMinScore"
              label="Minimum win score"
              hint="At or above this, the agent submits on its own."
              suffix="/100"
              inputMode="numeric"
              value={draft.autoSubmitMinScore as string}
              onChange={set('autoSubmitMinScore')}
              onBlur={() => touch('autoSubmitMinScore')}
              error={errors.autoSubmitMinScore}
            />
          </Section>

          <Section
            title="Settle weak cases"
            description="When the proof is thin, settle small cases instead of losing them."
          >
            <Field
              id="weakScoreBelow"
              label="Weak below score"
              hint="Under this score, a case counts as weak."
              suffix="/100"
              inputMode="numeric"
              value={draft.weakScoreBelow as string}
              onChange={set('weakScoreBelow')}
              onBlur={() => touch('weakScoreBelow')}
              error={errors.weakScoreBelow}
            />
            <Field
              id="offerPercent"
              label="Offer size"
              hint="Share of the disputed amount offered to the buyer."
              suffix="%"
              inputMode="numeric"
              value={draft.offerPercent as string}
              onChange={set('offerPercent')}
              onBlur={() => touch('offerPercent')}
              error={errors.offerPercent}
            />
            <Field
              id="autoAcceptMaxAmount"
              label="Refund automatically up to"
              hint="Weak cases up to this amount are refunded in full."
              prefix="$"
              inputMode="decimal"
              value={draft.autoAcceptMaxAmount as string}
              onChange={set('autoAcceptMaxAmount')}
              onBlur={() => touch('autoAcceptMaxAmount')}
              error={errors.autoAcceptMaxAmount}
            />
            <Field
              id="autoOfferMaxAmount"
              label="Offer automatically up to"
              hint="Weak cases up to this amount get a partial offer."
              prefix="$"
              inputMode="decimal"
              value={draft.autoOfferMaxAmount as string}
              onChange={set('autoOfferMaxAmount')}
              onBlur={() => touch('autoOfferMaxAmount')}
              error={errors.autoOfferMaxAmount}
            />
          </Section>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" disabled={!dirty || save.isPending} onClick={() => setDraft(toDraft(rules.data))}>
              Discard changes
            </Button>
            <Button onClick={onSave} disabled={!dirty || save.isPending}>
              {save.isPending ? 'Saving…' : 'Save rules'}
            </Button>
          </div>
        </div>

        <aside className="h-fit rounded-xl border bg-canvas p-5 text-sm lg:sticky lg:top-6">
          <h2 className="font-semibold">How the agent decides</h2>
          <p className="mt-1 text-muted-foreground">First rule that matches wins.</p>
          <ol className="mt-4 list-decimal space-y-2.5 pl-5 text-foreground/85">
            <li>Unknown order or a reason we do not score: wait for you.</li>
            <li>Auto-submit on and score at or above the minimum: submit evidence.</li>
            <li>Weak score and amount within the refund limit: refund.</li>
            <li>Weak score and amount within the offer limit: offer.</li>
            <li>Anything else: wait for you.</li>
          </ol>
          <p className="mt-4 border-t pt-4 text-muted-foreground">
            It only acts while PayPal waits on you, and only with actions PayPal allows at that moment.
          </p>
        </aside>
      </div>
    </Page>
  );
}
