import { FileText, ListTree, MousePointerClick, Settings2, X } from 'lucide-react';
import type { LoadedDocument } from '@/lib/client/ingest';
import type { Chunk } from '@/lib/chunk';
import { CHUNKING, LIMITS, RETRIEVAL } from '@/lib/config';

function formatBytes(bytes: number) {
  return bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function SourceViewer({ chunk, onClose }: { chunk: Chunk; onClose: () => void }) {
  return (
    <div className="animate-fade-in">
      <div className="flex items-center gap-2">
        <span className="rounded-md bg-brand-600 px-1.5 py-0.5 font-mono text-xs text-white">S{chunk.id}</span>
        <span className="text-sm font-medium">Page {chunk.page}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close source"
          className="ml-auto rounded-md p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-white"
        >
          <X className="size-4" />
        </button>
      </div>
      <blockquote className="mt-3 border-l-2 border-brand-500 pl-3 text-sm leading-6 whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
        {chunk.text}
      </blockquote>
    </div>
  );
}

export function DocSidebar({
  doc,
  cited,
  onShowSource,
  onCloseSource,
}: {
  doc: LoadedDocument;
  cited?: Chunk;
  onShowSource: (id: number) => void;
  onCloseSource: () => void;
}) {
  const stats: [string, string][] = [
    ['Pages', String(doc.pages)],
    ['Chunks', `${doc.chunks.length} × ~${CHUNKING.maxChars} chars, ${CHUNKING.overlap} overlap`],
    ['Embeddings', `${doc.embeddingModel} (${doc.dimensions}d)`],
    ['Retrieval', `BM25 + vector, RRF k=${RETRIEVAL.rrfK}, top ${RETRIEVAL.topK}`],
    ['Agent', `search, read page, outline · up to ${LIMITS.maxToolCallsPerTurn} tool calls per question`],
    ['Self-check', 'each cited claim judged against its source'],
    ['Read + embed', `${(doc.timings.readMs / 1000).toFixed(1)} s + ${(doc.timings.embedMs / 1000).toFixed(1)} s`],
  ];

  return (
    <aside className="hidden min-h-0 flex-col gap-4 overflow-y-auto border-r border-zinc-200 bg-white p-5 lg:flex dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="flex gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-200">
          <FileText className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium" title={doc.name}>
            {doc.name}
          </p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {doc.pages} pages · {formatBytes(doc.sizeBytes)}
          </p>
        </div>
      </div>

      {doc.summary && <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">{doc.summary}</p>}

      <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800" aria-label="Source">
        {cited ? (
          <SourceViewer chunk={cited} onClose={onCloseSource} />
        ) : (
          <p className="flex items-start gap-2 text-sm text-zinc-500 dark:text-zinc-400">
            <MousePointerClick className="mt-0.5 size-4 shrink-0" aria-hidden />
            Click a citation in an answer to see the exact passage and page here.
          </p>
        )}
      </section>

      {doc.outline.length > 0 && (
        <details className="group rounded-xl border border-zinc-200 p-4 text-sm dark:border-zinc-800">
          <summary className="flex cursor-pointer list-none items-center gap-2 font-medium">
            <ListTree className="size-4 text-zinc-500" aria-hidden />
            Outline
            <span className="ml-auto text-xs font-normal text-zinc-400">{doc.outline.length} sections</span>
          </summary>
          <ol className="mt-3 max-h-72 space-y-0.5 overflow-y-auto">
            {doc.outline.map((entry, i) => (
              <li key={i} style={{ paddingLeft: `${(Math.min(entry.level, 4) - 1) * 12}px` }}>
                <button
                  type="button"
                  onClick={() => onShowSource(entry.chunkId)}
                  className="flex w-full items-baseline gap-2 rounded-md px-1.5 py-1 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  <span className="min-w-0 flex-1 truncate">{entry.title}</span>
                  <span className="shrink-0 font-mono text-[11px] text-zinc-400">p.{entry.page}</span>
                </button>
              </li>
            ))}
          </ol>
        </details>
      )}

      <details className="group rounded-xl border border-zinc-200 p-4 text-sm dark:border-zinc-800" open>
        <summary className="flex cursor-pointer list-none items-center gap-2 font-medium">
          <Settings2 className="size-4 text-zinc-500" aria-hidden />
          Pipeline
          <span className="ml-auto text-xs text-zinc-400 group-open:hidden">show</span>
        </summary>
        <dl className="mt-3 space-y-2">
          {stats.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[96px_1fr] gap-2">
              <dt className="text-zinc-500 dark:text-zinc-400">{label}</dt>
              <dd className="font-mono text-xs leading-5 break-words">{value}</dd>
            </div>
          ))}
        </dl>
      </details>
    </aside>
  );
}
