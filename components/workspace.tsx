'use client';

import { useState } from 'react';
import type { LoadedDocument } from '@/lib/client/ingest';
import { Chat } from './chat';
import { DocSidebar, SourceViewer } from './doc-sidebar';

export function Workspace({ doc }: { doc: LoadedDocument }) {
  const [citation, setCitation] = useState<number | null>(null);
  const cited = citation ? doc.index.chunk(citation) : undefined;

  return (
    <div className="grid h-full min-h-0 lg:grid-cols-[360px_minmax(0,1fr)]">
      <DocSidebar doc={doc} cited={cited} onShowSource={setCitation} onCloseSource={() => setCitation(null)} />
      <Chat doc={doc} onCite={setCitation} />
      {cited && (
        <div className="fixed inset-x-0 bottom-0 z-20 max-h-[55dvh] overflow-y-auto rounded-t-2xl border-t border-zinc-200 bg-white p-4 shadow-2xl lg:hidden dark:border-zinc-800 dark:bg-zinc-900">
          <SourceViewer chunk={cited} onClose={() => setCitation(null)} />
        </div>
      )}
    </div>
  );
}
