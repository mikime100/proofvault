// The course page a buyer lands on: what they get, then PayPal's buttons in a purchase card.
import { Check, Lock } from 'lucide-react';
import { COURSE, TOTAL_MINUTES } from '../lib/course';
import { usePayPalCheckout } from '../lib/paypal';
import { Skeleton } from './Skeleton';

/** Cover: a design frame on the left turning into code on the right, drawn with plain shapes. */
function Cover() {
  const bar = 'h-2 rounded-full bg-white/15';
  return (
    <div
      aria-hidden
      className="grid aspect-[16/9] grid-cols-2 gap-4 overflow-hidden rounded-2xl bg-foreground p-5 sm:gap-6 sm:p-8"
    >
      <div className="flex flex-col gap-3 rounded-xl bg-white p-4 sm:p-5">
        <div className="h-3 w-1/3 rounded-full bg-slate-900" />
        <div className="h-2 w-2/3 rounded-full bg-slate-200" />
        <div className="mt-auto grid grid-cols-3 gap-2">
          <div className="aspect-square rounded-lg bg-slate-100" />
          <div className="aspect-square rounded-lg bg-slate-100" />
          <div className="aspect-square rounded-lg bg-slate-100" />
        </div>
        <div className="h-7 w-24 rounded-md bg-[#0070e0]" />
      </div>
      <div className="flex flex-col justify-center gap-2.5 font-mono">
        <div className={`${bar} w-1/2`} />
        <div className={`${bar} ml-4 w-3/4`} />
        <div className={`${bar} ml-8 w-2/3 bg-[#7dd3fc]/40`} />
        <div className={`${bar} ml-8 w-1/2`} />
        <div className={`${bar} ml-4 w-1/3`} />
        <div className={`${bar} w-2/5`} />
        <div className={`${bar} ml-4 w-3/5 bg-[#7dd3fc]/40`} />
        <div className={`${bar} w-1/4`} />
      </div>
    </div>
  );
}

function PurchaseCard({ onPaid }: { onPaid: (token: string) => void }) {
  const { container, sdk, capturing, error } = usePayPalCheckout(onPaid);
  return (
    <div className="rounded-2xl border p-5 sm:p-6">
      <p className="tabular text-3xl font-semibold tracking-[-0.02em]">
        ${COURSE.price.value}
        <span className="ml-1.5 text-sm font-normal text-muted-foreground">{COURSE.price.currency}</span>
      </p>
      <p className="mt-1 text-sm text-muted-foreground">One payment. Yours to keep, on any device.</p>

      <ul className="mt-5 space-y-2 text-sm">
        <li>{COURSE.lessons.length} video lessons, {TOTAL_MINUTES} minutes</li>
        <li>{COURSE.bonus.title} ({COURSE.bonus.kind})</li>
        <li>Instant access after payment</li>
      </ul>

      <div className="mt-6">
        {sdk === 'loading' && <Skeleton className="h-[100px] w-full" />}
        <div ref={container} className={capturing ? 'pointer-events-none opacity-50' : undefined} />
        {capturing && <p className="mt-2 text-sm text-muted-foreground">Confirming your payment…</p>}
        {error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        )}
      </div>

      <p className="mt-5 border-t pt-4 text-xs leading-relaxed text-muted-foreground">
        Payments are handled by PayPal. To protect against payment fraud, we record when and where
        you open the course (time, IP address and device).
      </p>
    </div>
  );
}

export function ProductPage({ onPaid }: { onPaid: (token: string) => void }) {
  // One purchase card only (PayPal's buttons must render once). The grid puts it after the pitch
  // on phones and in a sticky right column on desktop.
  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_360px] lg:gap-x-12 lg:py-12">
      <div className="min-w-0 lg:col-start-1">
        <p className="text-sm text-muted-foreground">
          Mini course · {COURSE.lessons.length} lessons · {TOTAL_MINUTES} min
        </p>
        <h1 className="mt-2 text-3xl leading-[1.1] font-semibold tracking-[-0.02em] sm:text-4xl">{COURSE.name}</h1>
        <p className="mt-3 max-w-2xl text-lg leading-relaxed text-foreground/80">{COURSE.tagline}</p>
        <p className="mt-3 text-sm text-muted-foreground">
          By {COURSE.author}, {COURSE.authorRole.toLowerCase()}
        </p>
        <div className="mt-8">
          <Cover />
        </div>
      </div>

      <aside className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
        <div className="lg:sticky lg:top-24">
          <PurchaseCard onPaid={onPaid} />
        </div>
      </aside>

      <div className="min-w-0 lg:col-start-1">
        <section>
          <h2 className="text-lg font-semibold">What you will learn</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {COURSE.outcomes.map((o) => (
              <li key={o} className="flex gap-2.5 text-sm leading-relaxed">
                <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                {o}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-10">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Course content</h2>
            <p className="text-sm text-muted-foreground">
              {COURSE.lessons.length} lessons · {TOTAL_MINUTES} min
            </p>
          </div>
          <ol className="mt-4 divide-y rounded-xl border">
            {COURSE.lessons.map((l) => (
              <li key={l.n} className="flex items-start gap-4 px-4 py-3.5">
                <span className="tabular w-5 shrink-0 pt-0.5 text-sm text-muted-foreground">{l.n}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{l.title}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{l.summary}</p>
                </div>
                <span className="tabular shrink-0 pt-0.5 text-sm text-muted-foreground">{l.minutes} min</span>
              </li>
            ))}
            <li className="flex items-start gap-4 px-4 py-3.5">
              <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="Included after purchase" />
              <p className="flex-1 text-sm">
                <span className="font-medium">{COURSE.bonus.title}</span>
                <span className="text-muted-foreground"> · {COURSE.bonus.kind} download</span>
              </p>
            </li>
          </ol>
        </section>
      </div>
    </div>
  );
}
