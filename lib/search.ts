import { Bm25Index } from './bm25';
import type { Chunk } from './chunk';
import { RETRIEVAL } from './config';

export type RetrievalMode = 'hybrid' | 'vector' | 'keyword';

export type SearchHit = {
  chunk: Chunk;
  /** Fused score (reciprocal rank fusion) or the single retriever's rank score. */
  score: number;
  /** Cosine similarity between the query and the chunk. */
  similarity: number;
  /** 1-based rank in the keyword (BM25) list, or null if BM25 didn't return it. */
  keywordRank: number | null;
  /** 1-based rank in the vector list, or null if it wasn't in the top candidates. */
  vectorRank: number | null;
};

export function toUnitVector(values: ArrayLike<number>): Float32Array {
  const vector = Float32Array.from(values);
  let norm = 0;
  for (const v of vector) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < vector.length; i++) vector[i] /= norm;
  return vector;
}

export function dot(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

/**
 * Reciprocal rank fusion: each list contributes 1 / (k + rank) for every item it
 * ranks. Items ranked well by both retrievers rise to the top, and the raw scores
 * of BM25 and cosine similarity never need to be put on the same scale.
 */
export function reciprocalRankFusion(rankings: number[][], k: number = RETRIEVAL.rrfK): Map<number, number> {
  const fused = new Map<number, number>();
  for (const ranking of rankings) {
    ranking.forEach((item, position) => {
      fused.set(item, (fused.get(item) ?? 0) + 1 / (k + position + 1));
    });
  }
  return fused;
}

/** An in-memory hybrid index over one document's chunks. Runs in the browser. */
export class DocumentIndex {
  private readonly vectors: Float32Array[];
  private readonly keyword: Bm25Index;

  constructor(
    readonly chunks: Chunk[],
    embeddings: number[][],
  ) {
    if (chunks.length !== embeddings.length) throw new Error('Every chunk needs exactly one embedding.');
    this.vectors = embeddings.map(toUnitVector);
    this.keyword = new Bm25Index(chunks.map((c) => c.text));
  }

  chunk(id: number): Chunk | undefined {
    return this.chunks[id - 1];
  }

  search(
    query: string,
    queryEmbedding: number[],
    options: Partial<Record<keyof typeof RETRIEVAL, number>> & { mode?: RetrievalMode } = {},
  ): SearchHit[] {
    const { topK, candidates, rrfK, minSimilarity } = { ...RETRIEVAL, ...options };
    const mode = options.mode ?? 'hybrid';

    const q = toUnitVector(queryEmbedding);
    const similarities = this.vectors.map((v) => dot(v, q));
    const vectorOrder = similarities
      .map((_, i) => i)
      .sort((a, b) => similarities[b] - similarities[a])
      .slice(0, candidates);
    const keywordOrder = this.keyword.search(query, candidates).map((hit) => hit.index);

    const rankings = mode === 'vector' ? [vectorOrder] : mode === 'keyword' ? [keywordOrder] : [vectorOrder, keywordOrder];
    const fused = reciprocalRankFusion(rankings, rrfK);

    return [...fused.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([index, score]) => {
        const keywordPosition = keywordOrder.indexOf(index);
        const vectorPosition = vectorOrder.indexOf(index);
        return {
          chunk: this.chunks[index],
          score,
          similarity: similarities[index],
          keywordRank: keywordPosition === -1 ? null : keywordPosition + 1,
          vectorRank: vectorPosition === -1 ? null : vectorPosition + 1,
        };
      })
      // A chunk only the vector side found, with weak similarity, is usually noise.
      .filter((hit) => hit.keywordRank !== null || hit.similarity >= minSimilarity)
      .slice(0, topK);
  }
}
