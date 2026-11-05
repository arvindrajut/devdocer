/**
 * Retrieval eval: does the right page come back, for keyword-only, vector-only and
 * hybrid search? Run with `npm run eval`. With OPENAI_API_KEY set it uses real
 * embeddings; without it, deterministic fake embeddings (so the numbers then mostly
 * reflect the keyword side).
 */
import { readFile, writeFile } from 'node:fs/promises';
import { openai } from '@ai-sdk/openai';
import { embedMany } from 'ai';
import { extractText, getDocumentProxy } from 'unpdf';
import { expect, it } from 'vitest';
import { chunkPages } from '@/lib/chunk';
import { EMBEDDING_DIMENSIONS } from '@/lib/config';
import { DocumentIndex, type RetrievalMode } from '@/lib/search';
import { fakeEmbed } from '@/lib/server/fake-ai';
import questions from './questions.json';

const SAMPLE = 'public/sample/northwind-remote-work-policy.pdf';
const useOpenAI = Boolean(process.env.OPENAI_API_KEY) && process.env.DEVDOCER_FAKE_AI !== '1';

async function embed(texts: string[]): Promise<number[][]> {
  if (!useOpenAI) return fakeEmbed(texts);
  const { embeddings } = await embedMany({
    model: openai.embeddingModel(process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small'),
    values: texts,
    dimensions: EMBEDDING_DIMENSIONS,
  });
  return embeddings;
}

type Row = { mode: RetrievalMode; kind: string; n: number; hitAt1: number; hitAt3: number; mrr: number };

it('compares keyword, vector and hybrid retrieval on the sample policy', { timeout: 120_000 }, async () => {
  const pdf = await getDocumentProxy(new Uint8Array(await readFile(SAMPLE)));
  const { text } = await extractText(pdf, { mergePages: false });
  const chunks = chunkPages(text as string[]);
  const index = new DocumentIndex(chunks, await embed(chunks.map((c) => c.text)));
  const queryVectors = await embed(questions.map((q) => q.question));

  const rows: Row[] = [];
  for (const mode of ['keyword', 'vector', 'hybrid'] as const) {
    for (const kind of ['all', 'exact', 'paraphrase']) {
      const subset = questions.map((q, i) => ({ ...q, vector: queryVectors[i] })).filter((q) => kind === 'all' || q.kind === kind);
      let hitAt1 = 0;
      let hitAt3 = 0;
      let reciprocal = 0;
      for (const q of subset) {
        const hits = index.search(q.question, q.vector, { mode, topK: 5 });
        const rank = hits.findIndex((h) => h.chunk.page === q.page) + 1;
        if (rank === 1) hitAt1++;
        if (rank >= 1 && rank <= 3) hitAt3++;
        if (rank >= 1) reciprocal += 1 / rank;
      }
      const n = subset.length;
      rows.push({ mode, kind, n, hitAt1: hitAt1 / n, hitAt3: hitAt3 / n, mrr: reciprocal / n });
    }
  }

  const pct = (x: number) => `${Math.round(x * 100)}%`;
  console.log(`\nRetrieval eval · ${chunks.length} chunks · ${questions.length} questions · embeddings: ${useOpenAI ? 'OpenAI' : 'fake (offline)'}\n`);
  console.table(rows.map((r) => ({ mode: r.mode, questions: `${r.kind} (${r.n})`, 'hit@1': pct(r.hitAt1), 'hit@3': pct(r.hitAt3), 'MRR@5': r.mrr.toFixed(2) })));
  await writeFile('evals/results.json', JSON.stringify({ embeddings: useOpenAI ? 'openai' : 'fake', chunks: chunks.length, rows }, null, 2));

  const hybrid = rows.find((r) => r.mode === 'hybrid' && r.kind === 'all')!;
  expect(hybrid.hitAt3).toBeGreaterThanOrEqual(useOpenAI ? 0.85 : 0.5);
});
