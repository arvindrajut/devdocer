import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from 'ai';
import { z } from 'zod';
import { LIMITS } from '@/lib/config';
import { SEARCH_TOOL_DESCRIPTION, systemPrompt } from '@/lib/prompt';
import { chatModel, chatModelId, chatProviderOptions, describeAIError, isFakeAI, missingKeyResponse } from '@/lib/server/ai';
import { rateLimit } from '@/lib/server/rate-limit';

export const maxDuration = 60;

const Body = z.object({
  messages: z.array(z.custom<UIMessage>((m) => typeof m === 'object' && m !== null && 'role' in m)).min(1).max(LIMITS.maxMessages),
  doc: z.object({ name: z.string().trim().min(1).max(200), pages: z.number().int().min(1).max(LIMITS.maxPages) }),
});

function textOf(message: UIMessage): string {
  return message.parts.map((part) => (part.type === 'text' ? part.text : '')).join('');
}

/** searchDocument calls the assistant has made since the user's latest question. */
function searchesThisTurn(messages: UIMessage[]): number {
  const last = messages.at(-1);
  if (!last || last.role !== 'assistant') return 0;
  return last.parts.filter((part) => part.type === 'tool-searchDocument').length;
}

/**
 * Agentic RAG: the model decides when and what to search. searchDocument has no
 * server-side execute function, so the call streams to the browser, which runs
 * hybrid search over its in-memory index and sends the passages back.
 */
export async function POST(request: Request) {
  const limited = rateLimit(request, 'chat', 60, 10 * 60_000);
  if (limited) return limited;
  const noKey = missingKeyResponse();
  if (noKey) return noKey;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Invalid chat request.' }, { status: 400 });
  const { messages, doc } = parsed.data;

  const lastUser = messages.findLast((m) => m.role === 'user');
  if (!lastUser || textOf(lastUser).length > LIMITS.maxQuestionChars) {
    return Response.json({ error: `Questions can be up to ${LIMITS.maxQuestionChars} characters.` }, { status: 400 });
  }

  const searches = searchesThisTurn(messages);
  const started = Date.now();
  const modelId = isFakeAI() ? 'offline-test-model' : chatModelId();

  const result = streamText({
    model: chatModel(),
    system: systemPrompt(doc),
    messages: await convertToModelMessages(messages),
    tools: {
      searchDocument: {
        description: SEARCH_TOOL_DESCRIPTION,
        inputSchema: z.object({
          query: z.string().min(2).max(200).describe('A focused search query, e.g. the key terms of the question'),
        }),
      },
    },
    // After the search budget is spent, the model has to answer with what it has.
    toolChoice: searches >= LIMITS.maxSearchesPerTurn ? 'none' : 'auto',
    maxOutputTokens: 1500,
    providerOptions: chatProviderOptions(),
    onEnd({ usage, finishReason }) {
      console.info(
        JSON.stringify({ event: 'chat', model: modelId, searches, finishReason, tokens: usage.totalTokens, ms: Date.now() - started }),
      );
    },
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      onError: (error) => {
        console.error('chat failed', error);
        return describeAIError(error);
      },
      messageMetadata: ({ part }) => {
        if (part.type === 'finish') {
          return { model: modelId, totalTokens: part.totalUsage.totalTokens, latencyMs: Date.now() - started };
        }
      },
    }),
  });
}
