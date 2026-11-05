import { chatModelId, embeddingModelId, isFakeAI } from '@/lib/server/ai';

export const dynamic = 'force-dynamic';

/** Deployment check: which models are configured, and whether a key is present (never the key itself). */
export function GET() {
  return Response.json({
    ok: true,
    mode: isFakeAI() ? 'offline-test' : 'openai',
    chatModel: chatModelId(),
    embeddingModel: embeddingModelId(),
    hasApiKey: Boolean(process.env.OPENAI_API_KEY),
  });
}
