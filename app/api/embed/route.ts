import { embedMany } from 'ai';
import { z } from 'zod';
import { EMBEDDING_DIMENSIONS, LIMITS } from '@/lib/config';
import { describeAIError, embeddingModel, embeddingModelId, isFakeAI, missingKeyResponse } from '@/lib/server/ai';
import { fakeEmbed } from '@/lib/server/fake-ai';
import { rateLimit } from '@/lib/server/rate-limit';

export const maxDuration = 60;

const Body = z.object({
  texts: z.array(z.string().trim().min(1).max(LIMITS.maxChunkChars)).min(1).max(LIMITS.embedBatch),
});

/** Embeds a batch of chunks (or one query). The browser keeps the vectors; nothing is stored here. */
export async function POST(request: Request) {
  const limited = rateLimit(request, 'embed', 120, 10 * 60_000);
  if (limited) return limited;
  const noKey = missingKeyResponse();
  if (noKey) return noKey;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Send 1 to 96 non-empty texts of up to 4,000 characters.' }, { status: 400 });
  const { texts } = parsed.data;

  if (isFakeAI()) {
    return Response.json({ embeddings: fakeEmbed(texts), model: 'fake-hashing', dimensions: EMBEDDING_DIMENSIONS, tokens: 0 });
  }

  try {
    const started = Date.now();
    const { embeddings, usage } = await embedMany({
      model: embeddingModel(),
      values: texts,
      dimensions: EMBEDDING_DIMENSIONS,
      maxRetries: 2,
    });
    console.info(JSON.stringify({ event: 'embed', texts: texts.length, tokens: usage.tokens, ms: Date.now() - started }));
    return Response.json({ embeddings, model: embeddingModelId(), dimensions: EMBEDDING_DIMENSIONS, tokens: usage.tokens });
  } catch (error) {
    console.error('embed failed', error);
    return Response.json({ error: describeAIError(error) }, { status: 502 });
  }
}
