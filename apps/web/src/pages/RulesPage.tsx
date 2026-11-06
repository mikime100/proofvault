import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { SellerRules } from '@proofvault/shared';
import { api } from '../api';
import { usePasscode } from '../lib/passcode';

function NumField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
      />
      {hint && <span className="mt-1 block text-xs text-neutral-500">{hint}</span>}
    </label>
  );
}

function MoneyField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
      />
      {hint && <span className="mt-1 block text-xs text-neutral-500">{hint}</span>}
    </label>
  );
}

export function RulesPage() {
  const passcode = usePasscode();
  const qc = useQueryClient();
  const rules = useQuery({ queryKey: ['rules'], queryFn: api.rules });
  const [draft, setDraft] = useState<SellerRules | null>(null);

  useEffect(() => {
    if (rules.data && !draft) setDraft(rules.data);
  }, [rules.data, draft]);

  const save = useMutation({
    mutationFn: async (r: SellerRules) => {
      const pc = await passcode.require();
      if (!pc) throw new Error('cancelled');
      return api.saveRules(r, pc);
    },
    onSuccess: () => {
      toast.success('Rules saved');
      qc.invalidateQueries({ queryKey: ['rules'] });
      setDraft(null);
    },
    onError: (e) => {
      if (e instanceof Error && e.message !== 'cancelled') toast.error('Could not save rules');
    },
  });

  if (rules.isPending) return <p className="text-sm text-neutral-500">Loading rules…</p>;
  if (rules.isError || !draft) return <p className="text-sm text-red-600">Could not load rules.</p>;

  const set = <K extends keyof SellerRules>(k: K, v: SellerRules[K]) =>
    setDraft({ ...draft, [k]: v });

  return (
    <section className="max-w-xl">
      <h1 className="text-xl font-semibold">Auto-action rules</h1>
      <p className="mt-1 text-sm text-neutral-500">
        What the agent may do on its own. Anything else waits for your approval.
      </p>

      <div className="mt-4 space-y-4 rounded-lg border bg-white p-5">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.autoSubmitEnabled}
            onChange={(e) => set('autoSubmitEnabled', e.target.checked)}
            className="size-4"
          />
          Auto-submit evidence when the score is high enough
        </label>

        <NumField
          label="Auto-submit minimum score"
          value={draft.autoSubmitMinScore}
          onChange={(v) => set('autoSubmitMinScore', v)}
          hint="Score at or above this submits evidence automatically."
        />
        <NumField
          label="Weak score below"
          value={draft.weakScoreBelow}
          onChange={(v) => set('weakScoreBelow', v)}
          hint="Below this score the agent recommends refund or offer instead of fighting."
        />
        <MoneyField
          label="Auto-accept max amount"
          value={draft.autoAcceptMaxAmount}
          onChange={(v) => set('autoAcceptMaxAmount', v)}
          hint="Weak-evidence disputes up to this amount are accepted automatically."
        />
        <MoneyField
          label="Auto-offer max amount"
          value={draft.autoOfferMaxAmount}
          onChange={(v) => set('autoOfferMaxAmount', v)}
          hint="Weak-evidence disputes up to this amount get an offer automatically."
        />
        <NumField
          label="Offer percent"
          value={draft.offerPercent}
          onChange={(v) => set('offerPercent', v)}
          hint="Percent of the disputed amount offered to the buyer."
        />
      </div>

      <div className="mt-4 flex gap-2">
        <button
          onClick={() => save.mutate(draft)}
          disabled={save.isPending}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {save.isPending ? 'Saving…' : 'Save rules'}
        </button>
        <button
          onClick={() => setDraft(rules.data ?? null)}
          className="rounded-md px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100"
        >
          Reset
        </button>
      </div>
    </section>
  );
}
