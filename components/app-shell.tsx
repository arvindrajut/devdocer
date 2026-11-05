'use client';

import { useCallback, useState } from 'react';
import { ingestPdf, UserFacingError, type IngestProgress, type LoadedDocument } from '@/lib/client/ingest';
import { Header } from './header';
import { IngestProgressView } from './ingest-progress';
import { UploadPanel } from './upload-panel';
import { Workspace } from './workspace';

type State =
  | { phase: 'idle'; error?: string }
  | { phase: 'ingesting'; name: string; progress: IngestProgress }
  | { phase: 'ready'; doc: LoadedDocument; key: number };

export const SAMPLE_PDF = {
  url: '/sample/northwind-remote-work-policy.pdf',
  name: 'northwind-remote-work-policy.pdf',
  pages: 6,
};

export function AppShell() {
  const [state, setState] = useState<State>({ phase: 'idle' });

  const load = useCallback(async (name: string, read: () => Promise<{ data: ArrayBuffer; size: number }>) => {
    setState({ phase: 'ingesting', name, progress: { step: 'read' } });
    try {
      const { data, size } = await read();
      const doc = await ingestPdf({ name, size, data }, (progress) => setState({ phase: 'ingesting', name, progress }));
      setState({ phase: 'ready', doc, key: Date.now() });
    } catch (error) {
      console.error(error);
      setState({
        phase: 'idle',
        error:
          error instanceof UserFacingError
            ? error.message
            : 'Something went wrong while reading that PDF. Please try another file.',
      });
    }
  }, []);

  const loadFile = (file: File) => load(file.name, async () => ({ data: await file.arrayBuffer(), size: file.size }));

  const loadSample = () =>
    load(SAMPLE_PDF.name, async () => {
      const response = await fetch(SAMPLE_PDF.url);
      if (!response.ok) throw new UserFacingError('The sample PDF could not be loaded.');
      const data = await response.arrayBuffer();
      return { data, size: data.byteLength };
    });

  return (
    <div className="flex h-dvh flex-col">
      <Header
        documentName={state.phase === 'ready' ? state.doc.name : undefined}
        onReset={state.phase === 'ready' ? () => setState({ phase: 'idle' }) : undefined}
      />
      <main className="min-h-0 flex-1">
        {state.phase === 'idle' && (
          <UploadPanel error={state.error} onFile={loadFile} onSample={loadSample} samplePages={SAMPLE_PDF.pages} />
        )}
        {state.phase === 'ingesting' && <IngestProgressView name={state.name} progress={state.progress} />}
        {state.phase === 'ready' && <Workspace key={state.key} doc={state.doc} />}
      </main>
    </div>
  );
}
