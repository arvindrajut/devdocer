'use client';

import { isToolUIPart } from 'ai';
import { AlertCircle, Bot, ChevronRight, Loader2, Search } from 'lucide-react';
import Markdown from 'react-markdown';
import { citationId, linkCitations } from '@/lib/citations';
import type { LoadedDocument } from '@/lib/client/ingest';
import type { ChatMessage, SearchTrace } from './chat';

type ToolPart = {
  type: string;
  toolCallId: string;
  state: string;
  input?: unknown;
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

function SearchActivity({ part, trace }: { part: ToolPart; trace?: SearchTrace }) {
  const query = (part.input as { query?: string } | undefined)?.query ?? '';

  if (part.state === 'output-error') {
    return (
      <p className="flex items-center gap-2 text-sm text-red-700 dark:text-red-300">
        <AlertCircle className="size-4" aria-hidden /> Search failed: {part.errorText}
      </p>
    );
  }
  if (part.state !== 'output-available') {
    return (
      <p className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Searching the document{query ? ` for “${query}”` : ''}…
      </p>
    );
  }

  const hits = trace?.hits ?? [];
  return (
    <details className="group text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200">
        <Search className="size-4" aria-hidden />
        <span>
          Searched <span className="text-zinc-700 dark:text-zinc-200">“{query}”</span> · {hits.length} passage{hits.length === 1 ? '' : 's'}
          {trace ? ` · ${Math.round(trace.ms)} ms` : ''}
        </span>
        <ChevronRight className="size-3.5 transition group-open:rotate-90" aria-hidden />
      </summary>
      {hits.length > 0 && (
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
      )}
    </details>
  );
}

export function MessageView({
  message,
  doc,
  traces,
  onCite,
}: {
  message: ChatMessage;
  doc: LoadedDocument;
  traces: Record<string, SearchTrace>;
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

  const searches = message.parts.filter(isToolUIPart).length;
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
            return <SearchActivity key={toolPart.toolCallId} part={toolPart} trace={traces[toolPart.toolCallId]} />;
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
        {meta?.model && (
          <p className="font-mono text-[11px] text-zinc-400">
            {meta.model} · {searches} search{searches === 1 ? '' : 'es'}
            {meta.totalTokens ? ` · ${meta.totalTokens.toLocaleString()} tokens` : ''}
            {meta.latencyMs ? ` · ${(meta.latencyMs / 1000).toFixed(1)} s` : ''}
          </p>
        )}
      </div>
    </div>
  );
}
