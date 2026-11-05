import { Check, Loader2 } from 'lucide-react';
import type { IngestProgress, IngestStep } from '@/lib/client/ingest';

const STEPS: { step: IngestStep; label: string }[] = [
  { step: 'read', label: 'Reading the PDF' },
  { step: 'chunk', label: 'Splitting into chunks' },
  { step: 'embed', label: 'Embedding chunks' },
  { step: 'suggest', label: 'Summarizing and suggesting questions' },
];

export function IngestProgressView({ name, progress }: { name: string; progress: IngestProgress }) {
  const current = STEPS.findIndex((s) => s.step === progress.step);
  const percent = progress.total ? Math.round(((progress.done ?? 0) / progress.total) * 100) : 0;

  return (
    <div className="grid h-full place-items-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900" aria-live="polite">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Indexing</p>
        <p className="truncate font-medium">{name}</p>
        <ol className="mt-5 space-y-3">
          {STEPS.map(({ step, label }, i) => {
            const done = i < current;
            const active = i === current;
            return (
              <li key={step} className="flex items-center gap-3 text-sm">
                <span
                  className={`grid size-6 place-items-center rounded-full ${
                    done
                      ? 'bg-brand-600 text-white'
                      : active
                        ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/50 dark:text-brand-200'
                        : 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800'
                  }`}
                >
                  {done ? <Check className="size-3.5" /> : active ? <Loader2 className="size-3.5 animate-spin" /> : i + 1}
                </span>
                <span className={active ? 'font-medium' : done ? 'text-zinc-600 dark:text-zinc-400' : 'text-zinc-400'}>
                  {label}
                  {active && step === 'embed' && progress.total ? ` (${progress.done ?? 0}/${progress.total})` : ''}
                </span>
              </li>
            );
          })}
        </ol>
        {progress.step === 'embed' && progress.total ? (
          <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${percent}%` }} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
