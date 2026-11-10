// What a buyer sees after paying: a course player with the lesson list beside it.
// Tracking is unchanged and only ever follows a buyer action: lesson_view when they open a lesson,
// download when they download the bonus. Nothing opens or fires on its own.
import { useState } from 'react';
import { Check, Play } from 'lucide-react';
import { COURSE, TOTAL_MINUTES, type Lesson } from '../lib/course';
import { cn } from '../lib/utils';
import { Button } from './ui/button';

const WATCHED_KEY = 'pv_watched';

function readWatched(): number[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(WATCHED_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : [];
  } catch {
    return [];
  }
}

function PrivateLink({ accessToken }: { accessToken: string }) {
  const link = `${window.location.origin}/learn?t=${accessToken}`;
  const [copied, setCopied] = useState(false);
  return (
    <section className="rounded-xl border p-4 sm:p-5">
      <h2 className="text-sm font-semibold">Your private course link</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Open the course on any device with this link. Anyone who has it can watch, so keep it to yourself.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          readOnly
          value={link}
          aria-label="Private course link"
          onFocus={(e) => e.currentTarget.select()}
          className="h-10 min-w-0 flex-1 rounded-md border bg-canvas px-3 font-mono text-xs text-muted-foreground"
        />
        <Button
          variant="outline"
          onClick={() => {
            void navigator.clipboard?.writeText(link).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2000);
            });
          }}
        >
          {copied ? 'Copied' : 'Copy link'}
        </Button>
      </div>
    </section>
  );
}

export function CoursePlayer({
  accessToken,
  onLessonOpen,
  onDownload,
}: {
  accessToken: string;
  onLessonOpen: (lesson: Lesson) => void;
  onDownload: () => void;
}) {
  const [active, setActive] = useState<Lesson | null>(null);
  const [watched, setWatched] = useState<number[]>(readWatched);

  const open = (l: Lesson) => {
    if (active?.n === l.n) return;
    setActive(l);
    onLessonOpen(l);
    if (!watched.includes(l.n)) {
      const next = [...watched, l.n];
      setWatched(next);
      try {
        localStorage.setItem(WATCHED_KEY, JSON.stringify(next));
      } catch {
        /* progress is a nicety; storage may be blocked */
      }
    }
  };
  const nextLesson = active ? COURSE.lessons.find((l) => l.n === active.n + 1) : undefined;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
      <p className="text-sm text-muted-foreground">Your course</p>
      <h1 className="mt-1 text-2xl leading-tight font-semibold tracking-[-0.02em] sm:text-3xl">{COURSE.name}</h1>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          <div className="flex aspect-video flex-col items-center justify-center rounded-2xl bg-foreground px-6 text-center text-white">
            {active ? (
              <>
                <span className="flex size-14 items-center justify-center rounded-full bg-white/10">
                  <Play className="size-6 translate-x-0.5" aria-hidden />
                </span>
                <p className="mt-4 text-sm text-white/60">Lesson {active.n}</p>
                <p className="mt-1 max-w-md text-lg font-medium">{active.title}</p>
                <p className="mt-3 text-xs text-white/40">Demo store: the course video would play here.</p>
              </>
            ) : (
              <>
                <p className="text-lg font-medium">Ready when you are</p>
                <p className="mt-1 text-sm text-white/60">
                  {COURSE.lessons.length} lessons · {TOTAL_MINUTES} minutes
                </p>
                <Button
                  variant="secondary"
                  className="mt-5"
                  onClick={() => open(COURSE.lessons[0]!)}
                >
                  Start lesson 1
                </Button>
              </>
            )}
          </div>

          {active && (
            <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold">{active.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{active.summary}</p>
              </div>
              {nextLesson && (
                <Button variant="outline" className="shrink-0" onClick={() => open(nextLesson)}>
                  Next lesson
                </Button>
              )}
            </div>
          )}
        </div>

        <aside className="space-y-6">
          <section>
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold">Lessons</h2>
              <p className="tabular text-sm text-muted-foreground">
                {watched.length} of {COURSE.lessons.length} watched
              </p>
            </div>
            <ol className="mt-3 divide-y rounded-xl border">
              {COURSE.lessons.map((l) => {
                const isActive = active?.n === l.n;
                const seen = watched.includes(l.n);
                return (
                  <li key={l.n}>
                    <button
                      type="button"
                      onClick={() => open(l)}
                      aria-current={isActive ? 'true' : undefined}
                      className={cn(
                        'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-canvas',
                        isActive && 'bg-canvas',
                      )}
                    >
                      <span
                        className={cn(
                          'tabular mt-px flex size-5 shrink-0 items-center justify-center rounded-full text-[11px]',
                          seen ? 'bg-foreground text-white' : 'border text-muted-foreground',
                        )}
                        aria-label={seen ? 'Watched' : undefined}
                      >
                        {seen ? <Check className="size-3" strokeWidth={3} /> : l.n}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn('block text-sm', isActive && 'font-medium')}>{l.title}</span>
                        <span className="tabular mt-0.5 block text-xs text-muted-foreground">{l.minutes} min</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>

          <section>
            <h2 className="text-sm font-semibold">Resources</h2>
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm">{COURSE.bonus.title}</p>
                <p className="text-xs text-muted-foreground">{COURSE.bonus.kind}</p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <a href={`/${COURSE.bonus.file}`} download={COURSE.bonus.file} onClick={onDownload}>
                  Download
                </a>
              </Button>
            </div>
          </section>
        </aside>
      </div>

      <div className="mt-10">
        <PrivateLink accessToken={accessToken} />
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        To protect against payment fraud, we record when and where you open the course (time, IP
        address and device).
      </p>
    </div>
  );
}
