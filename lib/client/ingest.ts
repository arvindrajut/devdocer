import type { AgentDocument, Passage } from '../agent/tools';
import { chunkPages } from '../chunk';
import { CHUNKING, LIMITS } from '../config';
import { extractOutline } from '../outline';
import { DocumentIndex } from '../search';
import type { GroundingReport } from '../verify';

export class UserFacingError extends Error {}

export type IngestStep = 'read' | 'chunk' | 'embed' | 'suggest';
export type IngestProgress = { step: IngestStep; done?: number; total?: number };

export type LoadedDocument = AgentDocument & {
  sizeBytes: number;
  embeddingModel: string;
  dimensions: number;
  summary: string | null;
  questions: string[];
  timings: { readMs: number; embedMs: number };
};

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new UserFacingError(data.error ?? `Request failed (${response.status}).`);
  return data as T;
}

type EmbedResponse = { embeddings: number[][]; model: string; dimensions: number };

export function embedTexts(texts: string[]): Promise<EmbedResponse> {
  return postJson<EmbedResponse>('/api/embed', { texts });
}

/** Extracts one string per page with pdf.js (via unpdf), entirely in the browser. */
async function readPdfPages(data: ArrayBuffer): Promise<string[]> {
  const { getDocumentProxy, extractText } = await import('unpdf');
  let pdf;
  try {
    pdf = await getDocumentProxy(new Uint8Array(data));
  } catch {
    throw new UserFacingError("That file couldn't be read as a PDF. It may be damaged or password-protected.");
  }
  if (pdf.numPages > LIMITS.maxPages) {
    throw new UserFacingError(`This PDF has ${pdf.numPages} pages; the limit is ${LIMITS.maxPages}.`);
  }
  const { text } = await extractText(pdf, { mergePages: false });
  return Array.isArray(text) ? text : [text];
}

/**
 * The ingestion pipeline: read pages → split into overlapping chunks → embed in
 * batches → build the hybrid index and outline → ask for a summary and starter questions.
 */
export async function ingestPdf(
  file: { name: string; size: number; data: ArrayBuffer },
  onProgress: (progress: IngestProgress) => void,
): Promise<LoadedDocument> {
  if (file.size > LIMITS.maxFileBytes) {
    throw new UserFacingError(`That file is ${(file.size / 1048576).toFixed(1)} MB; the limit is 15 MB.`);
  }

  onProgress({ step: 'read' });
  const readStarted = performance.now();
  const pages = await readPdfPages(file.data);
  const readMs = performance.now() - readStarted;

  onProgress({ step: 'chunk' });
  const chunks = chunkPages(pages, CHUNKING);
  if (chunks.length === 0) {
    throw new UserFacingError('No selectable text was found. This looks like a scanned PDF, and OCR is not supported yet.');
  }
  if (chunks.length > LIMITS.maxChunks) {
    throw new UserFacingError(`This PDF is too long for the demo (${chunks.length} chunks; the limit is ${LIMITS.maxChunks}).`);
  }

  const embeddings: number[][] = [];
  let model = '';
  let dimensions = 0;
  const embedStarted = performance.now();
  for (let i = 0; i < chunks.length; i += LIMITS.embedBatch) {
    onProgress({ step: 'embed', done: i, total: chunks.length });
    const batch = chunks.slice(i, i + LIMITS.embedBatch).map((c) => c.text);
    const result = await embedTexts(batch);
    embeddings.push(...result.embeddings);
    model = result.model;
    dimensions = result.dimensions;
  }
  onProgress({ step: 'embed', done: chunks.length, total: chunks.length });
  const embedMs = performance.now() - embedStarted;
  const index = new DocumentIndex(chunks, embeddings);

  onProgress({ step: 'suggest' });
  const excerpt = pages.join('\n\n').slice(0, 12_000);
  const suggestions = await postJson<{ summary: string | null; questions: string[] }>('/api/suggest', {
    name: file.name,
    pages: pages.length,
    excerpt: excerpt.length >= 20 ? excerpt : `${excerpt} (very short document)`,
  }).catch(() => ({ summary: null, questions: [] }));

  return {
    name: file.name,
    sizeBytes: file.size,
    pages: pages.length,
    chunks,
    index,
    outline: extractOutline(pages, chunks),
    embeddingModel: model,
    dimensions,
    summary: suggestions.summary,
    questions: suggestions.questions,
    timings: { readMs, embedMs },
  };
}

/** Runs one searchDocument tool call: embed the query, then hybrid-search the in-browser index. */
export async function searchDocument(doc: LoadedDocument, query: string) {
  const started = performance.now();
  const { embeddings } = await embedTexts([query]);
  const hits = doc.index.search(query, embeddings[0]);
  return { hits, ms: performance.now() - started };
}

/** Asks the server to check each cited claim in an answer against the passages it cites. */
export function verifyAnswer(question: string, answer: string, passages: Passage[]): Promise<GroundingReport> {
  return postJson<GroundingReport>('/api/verify', { question, answer, passages });
}
