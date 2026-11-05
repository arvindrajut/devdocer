const STOPWORDS = new Set(
  (
    'a an and are as at be been but by can could did do does for from had has have how i if in into is it its ' +
    'may me might my no not of on or our shall should so than that the their them then there these they this ' +
    'those to was we were what when where which who whom why will with would you your about after any all also'
  ).split(' '),
);

/** Very light stemming so "policies" matches "policy" and "days" matches "day". */
function stem(token: string): string {
  if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

/** Lowercases, strips accents and keeps codes like "hr-214" or "2.5" as single tokens. */
export function tokenize(text: string): string[] {
  const words =
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .match(/[a-z0-9]+(?:[.\-][a-z0-9]+)*/g) ?? [];
  return words.filter((w) => w.length > 1 && !STOPWORDS.has(w)).map(stem);
}

export type Bm25Hit = { index: number; score: number };

/** Okapi BM25 over an in-memory list of documents. */
export class Bm25Index {
  private readonly termFreqs: Map<string, number>[];
  private readonly lengths: number[];
  private readonly docFreq = new Map<string, number>();
  private readonly avgLength: number;

  constructor(
    documents: string[],
    private readonly k1 = 1.2,
    private readonly b = 0.75,
  ) {
    this.termFreqs = documents.map((doc) => {
      const counts = new Map<string, number>();
      for (const token of tokenize(doc)) counts.set(token, (counts.get(token) ?? 0) + 1);
      for (const term of counts.keys()) this.docFreq.set(term, (this.docFreq.get(term) ?? 0) + 1);
      return counts;
    });
    this.lengths = this.termFreqs.map((counts) => [...counts.values()].reduce((sum, n) => sum + n, 0));
    this.avgLength = this.lengths.reduce((sum, n) => sum + n, 0) / Math.max(documents.length, 1) || 1;
  }

  search(query: string, limit = Number.POSITIVE_INFINITY): Bm25Hit[] {
    const terms = [...new Set(tokenize(query))];
    const total = this.termFreqs.length;
    const hits: Bm25Hit[] = [];

    this.termFreqs.forEach((counts, index) => {
      let score = 0;
      for (const term of terms) {
        const tf = counts.get(term);
        if (!tf) continue;
        const df = this.docFreq.get(term) ?? 0;
        const idf = Math.log(1 + (total - df + 0.5) / (df + 0.5));
        const norm = this.k1 * (1 - this.b + (this.b * this.lengths[index]) / this.avgLength);
        score += idf * ((tf * (this.k1 + 1)) / (tf + norm));
      }
      if (score > 0) hits.push({ index, score });
    });

    return hits.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}
