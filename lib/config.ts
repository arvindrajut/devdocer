/** Limits shared by the browser and the API routes, so both sides agree. */
export const LIMITS = {
  maxFileBytes: 15 * 1024 * 1024,
  maxPages: 300,
  maxChunks: 800,
  /** Chunks sent to /api/embed per request. */
  embedBatch: 96,
  maxChunkChars: 4000,
  maxQuestionChars: 1000,
  /** How many times the model may call searchDocument before it must answer. */
  maxSearchesPerTurn: 3,
  maxMessages: 40,
} as const;

/** Recursive character splitting, measured in characters (about 4 per token). */
export const CHUNKING = { maxChars: 1200, overlap: 200 } as const;

export const RETRIEVAL = {
  topK: 6,
  /** How many results each retriever contributes before fusion. */
  candidates: 25,
  /** Reciprocal rank fusion constant from Cormack et al. (2009). */
  rrfK: 60,
  /** Vector-only hits below this cosine similarity are treated as noise. */
  minSimilarity: 0.25,
} as const;

/** text-embedding-3 models support shortened vectors; 512 keeps the browser index small. */
export const EMBEDDING_DIMENSIONS = 512;
