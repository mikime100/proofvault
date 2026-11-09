// A row of headline numbers in one quiet strip: label above, number below, thin dividers between.
// Replaces the "card per metric" grid, which repeated the same chrome four times.
export interface Stat {
  label: string;
  value: string;
  /** Short context only when the number needs it (e.g. "5 open cases"). */
  note?: string;
}

export function StatStrip({ stats }: { stats: Stat[] }) {
  return (
    <dl className="mt-6 grid grid-cols-2 rounded-xl border lg:grid-cols-4">
      {stats.map((s, i) => (
        <div
          key={s.label}
          className={[
            'px-4 py-4 sm:px-5',
            i % 2 === 1 ? 'border-l' : '',
            i >= 2 ? 'border-t lg:border-t-0' : '',
            i === 2 ? 'lg:border-l' : '',
          ].join(' ')}
        >
          <dt className="text-sm text-muted-foreground">{s.label}</dt>
          <dd className="tabular mt-1 text-2xl leading-tight font-semibold tracking-[-0.02em]">{s.value}</dd>
          {s.note && <dd className="mt-0.5 text-xs text-muted-foreground">{s.note}</dd>}
        </div>
      ))}
    </dl>
  );
}
