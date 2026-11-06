'use client';

import { isToolUIPart } from 'ai';
import { AlertCircle, BookOpen, Bot, ChevronRight, ListTree, Loader2, Search, ShieldAlert, ShieldCheck } from 'lucide-react';
import Markdown from 'react-markdown';
import { passagesOf, type OutlineOutput } from '@/lib/agent/tools';
import { citationId, linkCitations } from '@/lib/citations';
import type { LoadedDocument } from '@/lib/client/ingest';
import type { Verdict } from '@/lib/verify';
import type { ChatMessage, SearchTrace, SelfCheck } from './chat';

type ToolPart = {
  type: string;
  toolCallId: string;
  state: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

function CitationChip({ id, doc, onCite }: { id: number; doc: LoadedDocument; onCite: (id: number) => void }) {
  const chunk = doc.index.chunk(id);
  if (!chunk) return <span className="text-xs text-zinc-400">[S{id}]</span>;
  return (
    <button
      type="button"
      onClick={() => onCite(id)}
      title={`Source S${id}, page ${chunk.page}`}
      className="mx-0.5 inline-flex translate-y-[-1px] items-center rounded-md bg-brand-50 px-1.5 py-px align-baseline font-mono text-[11px] font-medium text-brand-700 ring-1 ring-brand-200 hover:bg-brand-100 dark:bg-brand-900/40 dark:text-brand-200 dark:ring-brand-900"
    >
      p.{chunk.page}
    </button>
  );
}

function SearchTable({ trace }: { trace?: SearchTrace }) {
  const hits = trace?.hits ?? [];
  if (!hits.length) return null;
  return (
    <table className="mt-2 w-full max-w-lg text-left font-mono text-xs text-zinc-600 dark:text-zinc-400">
      <thead>
        <tr className="text-zinc-400">
          <th className="py-1 font-normal">source</th>
          <th className="font-normal">page</th>
          <th className="font-normal">cosine</th>
          <th className="font-normal">bm25 rank</th>
          <th className="font-normal">vector rank</th>
        </tr>
      </thead>
      <tbody>
        {hits.map((hit) => (
          <tr key={hit.chunk.id} className="border-t border-zinc-100 dark:border-zinc-800">
            <td className="py-1">S{hit.chunk.id}</td>
            <td>{hit.chunk.page}</td>
            <td>{hit.similarity.toFixed(2)}</td>
            <td>{hit.keywordRank ?? '–'}</td>
            <td>{hit.vectorRank ?? '–'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** What one tool call is doing (while it runs) and did (once its output is back). */
function describeStep(part: ToolPart, trace?: SearchTrace) {
  const done = part.state === 'output-available';
  const input = (part.input ?? {}) as { query?: string; page?: number };
  if (part.type === 'tool-readPage') {
    return { icon: BookOpen, label: done ? `Read page ${input.page} · ${plural(passagesOf(part.output).length, 'passage')}` : `Reading page ${input.page ?? ''}…` };
  }
  if (part.type === 'tool-getOutline') {
    const sections = (part.output as OutlineOutput | undefined)?.sections?.length ?? 0;
    return { icon: ListTree, label: done ? `Read the outline · ${plural(sections, 'section')}` : 'Reading the outline…' };
  }
  const query = input.query ? `“${input.query}”` : '';
  const hits = trace?.hits.length ?? passagesOf(part.output).length;
  return {
    icon: Search,
    label: done
      ? `Searched ${query} · ${plural(hits, 'passage')}${trace ? ` · ${Math.round(trace.ms)} ms` : ''}`
      : `Searching the document${query ? ` for ${query}` : ''}…`,
  };
}

function AgentStep({ part, step, trace }: { part: ToolPart; step: number; trace?: SearchTrace }) {
  if (part.state === 'output-error') {
    return (
      <p className="flex items-center gap-2 text-sm text-red-700 dark:text-red-300">
        <AlertCircle className="size-4" aria-hidden /> Step {step} failed: {part.errorText}
      </p>
    );
  }
  const { icon: Icon, label } = describeStep(part, trace);
  if (part.state !== 'output-available') {
    return (
      <p className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        {label}
      </p>
    );
  }
  const isSearch = part.type === 'tool-searchDocument';
  return (
    <details className="group text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200">
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-zinc-100 font-mono text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          {step}
        </span>
        <Icon className="size-4" aria-hidden />
        <span>{label}</span>
        {isSearch && <ChevronRight className="size-3.5 transition group-open:rotate-90" aria-hidden />}
      </summary>
      {isSearch && <SearchTable trace={trace} />}
    </details>
  );
}

const VERDICT_STYLE: Record<Verdict, { label: string; className: string }> = {
  supported: {
    label: 'Supported',
    className: 'bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:ring-emerald-900',
  },
  partial: {
    label: 'Partly supported',
    className: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:ring-amber-900',
  },
  unsupported: {
    label: 'Not supported',
    className: 'bg-red-50 text-red-800 ring-red-200 dark:bg-red-950/50 dark:text-red-200 dark:ring-red-900',
  },
};

function SelfCheckView({ check }: { check?: SelfCheck }) {
  if (!check) return null;
  if (check.status === 'checking') {
    return (
      <p className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Checking each claim against its source…
      </p>
    );
  }
  if (check.status === 'error') {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Self-check unavailable: {check.message}</p>;
  }

  const { claims, checker } = check.report;
  if (!claims.length) return null;
  const supported = claims.filter((c) => c.verdict === 'supported').length;
  const allGood = supported === claims.length;
  const Icon = allGood ? ShieldCheck : ShieldAlert;
  return (
    <details className="group rounded-xl border border-zinc-200 text-sm dark:border-zinc-800">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2">
        <Icon className={`size-4 shrink-0 ${allGood ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`} aria-hidden />
        <span className="font-medium">
          Self-check: {supported} of {plural(claims.length, 'claim')} supported by the cited source
        </span>
        <ChevronRight className="ml-auto size-3.5 shrink-0 text-zinc-400 transition group-open:rotate-90" aria-hidden />
      </summary>
      <ul className="space-y-3 border-t border-zinc-200 px-3 py-3 dark:border-zinc-800">
        {claims.map((claim, i) => (
          <li key={i} className="grid gap-1">
            <div className="flex items-start gap-2">
              <span className={`shrink-0 rounded-md px-1.5 py-px text-[11px] font-medium ring-1 ${VERDICT_STYLE[claim.verdict].className}`}>
                {VERDICT_STYLE[claim.verdict].label}
              </span>
              <span className="text-zinc-800 dark:text-zinc-200">{claim.claim}</span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {claim.sources.join(', ')} · {claim.reason}
            </p>
          </li>
        ))}
        <li className="font-mono text-[11px] text-zinc-400">checked by {checker}</li>
      </ul>
    </details>
  );
}

export function MessageView({
  message,
  doc,
  traces,
  check,
  onCite,
}: {
  message: ChatMessage;
  doc: LoadedDocument;
  traces: Record<string, SearchTrace>;
  check?: SelfCheck;
  onCite: (id: number) => void;
}) {
  if (message.role === 'user') {
    const text = message.parts.map((p) => (p.type === 'text' ? p.text : '')).join('');
    return (
      <div className="flex animate-fade-in justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-brand-600 px-4 py-2.5 text-[15px] leading-6 whitespace-pre-wrap text-white">
          {text}
        </p>
      </div>
    );
  }

  const steps = new Map(message.parts.filter(isToolUIPart).map((part, i) => [part.toolCallId, i + 1]));
  const meta = message.metadata;

  return (
    <div className="flex animate-fade-in gap-3">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900">
        <Bot className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        {message.parts.map((part, i) => {
          if (isToolUIPart(part)) {
            const toolPart = part as unknown as ToolPart;
            return (
              <AgentStep
                key={toolPart.toolCallId}
                part={toolPart}
                step={steps.get(toolPart.toolCallId) ?? 0}
                trace={traces[toolPart.toolCallId]}
              />
            );
          }
          if (part.type === 'text' && part.text.trim()) {
            return (
              <div key={i} className="answer">
                <Markdown
                  components={{
                    a: ({ href, children }) => {
                      const id = citationId(href);
                      return id ? (
                        <CitationChip id={id} doc={doc} onCite={onCite} />
                      ) : (
                        <a href={href} target="_blank" rel="noreferrer" className="text-brand-600 underline underline-offset-4">
                          {children}
                        </a>
                      );
                    },
                  }}
                >
                  {linkCitations(part.text)}
                </Markdown>
              </div>
            );
          }
          return null;
        })}
        <SelfCheckView check={check} />
        {meta?.model && (
          <p className="font-mono text-[11px] text-zinc-400">
            {meta.model} · {plural(steps.size, 'tool call')}
            {meta.totalTokens ? ` · ${meta.totalTokens.toLocaleString()} tokens` : ''}
            {meta.latencyMs ? ` · ${(meta.latencyMs / 1000).toFixed(1)} s` : ''}
          </p>
        )}
      </div>
    </div>
  );
}
