'use client';

import { AlertCircle, Bot, FileUp, Gauge, Layers, Plug, Quote, ShieldCheck, Sparkles } from 'lucide-react';
import { useRef, useState } from 'react';
import { LIMITS, RETRIEVAL } from '@/lib/config';

const FEATURES = [
  {
    icon: Bot,
    title: 'Multi-step agent',
    body: `The model plans its own lookups with three tools (search, read a page, read the outline) and can search again with new wording, up to ${LIMITS.maxToolCallsPerTurn} calls per question.`,
  },
  {
    icon: Layers,
    title: 'Hybrid retrieval',
    body: `BM25 keyword search and embedding search run side by side and are merged with reciprocal rank fusion (k = ${RETRIEVAL.rrfK}), so exact terms and paraphrases both land.`,
  },
  {
    icon: Quote,
    title: 'Cited, grounded answers',
    body: 'Every claim links to the passage and page it came from. If the document does not say, it says so instead of guessing.',
  },
  {
    icon: ShieldCheck,
    title: 'Self-checked',
    body: 'After answering, a second model call judges each cited claim against its source and flags anything the passage does not support.',
  },
  {
    icon: Plug,
    title: 'MCP server',
    body: 'The same tools run as an MCP server, so Claude Code, Claude Desktop or any MCP client can search a PDF and cite it.',
  },
  {
    icon: Gauge,
    title: 'Measured, not vibes',
    body: 'A retrieval eval set compares keyword, vector and hybrid search; unit tests and CI run on every change.',
  },
];

const STEPS = [
  ['Read', 'pdf.js extracts text page by page in your browser'],
  ['Chunk', '~1,200-character overlapping chunks, plus a section outline'],
  ['Embed', 'OpenAI text-embedding-3-small, 512 dimensions'],
  ['Plan & search', 'The agent calls its tools until it can answer, with citations'],
  ['Verify', 'Each cited claim is checked against its passage'],
];

export function UploadPanel({
  error,
  onFile,
  onSample,
  samplePages,
}: {
  error?: string;
  onFile: (file: File) => void;
  onSample: () => void;
  samplePages: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const pick = (files: FileList | null) => {
    const file = files?.[0];
    if (file) onFile(file);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-4xl flex-col items-center px-4 pt-12 pb-16 sm:pt-20">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 dark:border-brand-900 dark:bg-brand-900/30 dark:text-brand-200">
          <Sparkles className="size-3.5" aria-hidden />
          Agentic RAG · Hybrid search · Self-checked answers · MCP
        </span>
        <h1 className="mt-5 text-center text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Ask any PDF a question. <span className="text-brand-600 dark:text-brand-400">Get the page it came from.</span>
        </h1>
        <p className="mt-4 max-w-2xl text-center text-base text-pretty text-zinc-600 sm:text-lg dark:text-zinc-400">
          Drop in a policy, contract, manual or paper. DevDocer indexes it in your browser and answers with
          citations you can click to check.
        </p>

        <div
          role="button"
          tabIndex={0}
          aria-label="Upload a PDF"
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            pick(e.dataTransfer.files);
          }}
          className={`mt-10 flex w-full max-w-2xl cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
            dragging
              ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
              : 'border-zinc-300 bg-white hover:border-brand-400 hover:bg-brand-50/40 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-brand-500 dark:hover:bg-zinc-900/60'
          }`}
        >
          <span className="grid size-12 place-items-center rounded-xl bg-brand-600 text-white shadow-sm">
            <FileUp className="size-6" aria-hidden />
          </span>
          <p className="mt-4 font-medium">
            Drop a PDF here, or <span className="text-brand-600 underline underline-offset-4 dark:text-brand-400">browse</span>
          </p>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Text-based PDFs up to {LIMITS.maxFileBytes / 1048576} MB and {LIMITS.maxPages} pages
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            onChange={(e) => pick(e.target.files)}
          />
        </div>

        {error && (
          <p role="alert" className="mt-4 flex max-w-2xl items-start gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={onSample}
          className="mt-5 rounded-lg px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-brand-500 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          No PDF handy? <span className="text-brand-600 dark:text-brand-400">Try the sample remote-work policy ({samplePages} pages) →</span>
        </button>
        <p className="mt-2 max-w-xl text-center text-xs text-zinc-500 dark:text-zinc-500">
          Your file never leaves your browser. Only text snippets are sent to OpenAI to embed them and to answer
          questions, and nothing is stored on the server.
        </p>

        <section className="mt-16 grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Features">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
              <Icon className="size-5 text-brand-600 dark:text-brand-400" aria-hidden />
              <h2 className="mt-3 font-semibold">{title}</h2>
              <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{body}</p>
            </div>
          ))}
        </section>

        <section id="how" className="mt-12 w-full" aria-label="How it works">
          <h2 className="text-center text-sm font-semibold tracking-wide text-zinc-500 uppercase">How it works</h2>
          <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {STEPS.map(([title, body], i) => (
              <li key={title} className="rounded-xl bg-zinc-100/70 p-4 dark:bg-zinc-900/70">
                <span className="font-mono text-xs text-brand-600 dark:text-brand-400">0{i + 1}</span>
                <p className="mt-1 font-medium">{title}</p>
                <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{body}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
