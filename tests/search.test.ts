import { describe, expect, it } from 'vitest';
import { Bm25Index, tokenize } from '@/lib/bm25';
import type { Chunk } from '@/lib/chunk';
import { DocumentIndex, reciprocalRankFusion } from '@/lib/search';

describe('tokenize', () => {
  it('drops stopwords, lowercases and keeps codes together', () => {
    expect(tokenize('Submit form RW-1 to the People team')).toEqual(['submit', 'form', 'rw-1', 'people', 'team']);
  });

  it('lightly stems plurals', () => {
    expect(tokenize('policies days')).toEqual(['policy', 'day']);
  });
});

describe('Bm25Index', () => {
  const index = new Bm25Index([
    'The internet reimbursement is up to $60 per month.',
    'Laptops lock automatically after five minutes.',
    'Hotel rooms are covered up to $220 per night during the summit.',
  ]);

  it('ranks the document that contains the query terms first', () => {
    expect(index.search('internet reimbursement')[0].index).toBe(0);
    expect(index.search('hotel summit')[0].index).toBe(2);
  });

  it('returns nothing when no term matches', () => {
    expect(index.search('broadband')).toEqual([]);
  });
});

describe('reciprocalRankFusion', () => {
  it('rewards items that both rankings agree on', () => {
    const fused = reciprocalRankFusion(
      [
        [1, 2, 3],
        [2, 1, 4],
      ],
      60,
    );
    expect(fused.get(1)).toBeCloseTo(1 / 61 + 1 / 62);
    expect(fused.get(4)).toBeCloseTo(1 / 63);
    expect([...fused.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([id]) => id).sort()).toEqual([1, 2]);
  });
});

describe('DocumentIndex', () => {
  const chunks: Chunk[] = [
    { id: 1, page: 1, text: 'Submit form RW-1 in Workday to request remote work.' },
    { id: 2, page: 2, text: 'Home internet is reimbursed up to $60 per month.' },
    { id: 3, page: 3, text: 'Report a lost laptop to the security team within 24 hours.' },
  ];
  // Hand-made 3-d "embeddings": chunk 2 and 3 point in clear directions.
  const embeddings = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  const index = new DocumentIndex(chunks, embeddings);

  it('finds a paraphrase through the vector side', () => {
    const hits = index.search('Will the company pay for my broadband?', [0.05, 0.99, 0.05]);
    expect(hits[0].chunk.id).toBe(2);
    expect(hits[0].keywordRank).toBeNull();
    expect(hits[0].vectorRank).toBe(1);
  });

  it('finds an exact code through the keyword side even when vectors miss', () => {
    const hits = index.search('form RW-1', [0, 0.7, 0.7]);
    expect(hits.map((h) => h.chunk.id)).toContain(1);
    expect(hits.find((h) => h.chunk.id === 1)?.keywordRank).toBe(1);
  });

  it('drops weak vector-only matches', () => {
    const hits = index.search('zzz', [0.1, 0.1, 0.1], { minSimilarity: 0.9 });
    expect(hits).toEqual([]);
  });

  it('supports single-retriever modes for evaluation', () => {
    const keywordOnly = index.search('lost laptop', [1, 0, 0], { mode: 'keyword' });
    expect(keywordOnly[0].chunk.id).toBe(3);
  });
});
