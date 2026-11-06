import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isToolUIPart,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from 'ai';
import { z } from 'zod';
import { TOOL_INPUTS } from '@/lib/agent/tools';
import { LIMITS } from '@/lib/config';
import { systemPrompt, TOOL_DESCRIPTIONS } from '@/lib/prompt';
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

/** Tool calls the assistant has made since the user's latest question. */
function toolCallsThisTurn(messages: UIMessage[]): number {
  const last = messages.at(-1);
  if (!last || last.role !== 'assistant') return 0;
  return last.parts.filter(isToolUIPart).length;
}

/**
 * Agentic RAG: the model plans its own lookups with three tools (search, read a
 * page, read the outline). None has a server-side execute function, so each call
 * streams to the browser, which runs it against its in-memory index and sends the
 * result back; the chat then resubmits until the model answers.
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

  const toolCalls = toolCallsThisTurn(messages);
  const started = Date.now();
  const modelId = isFakeAI() ? 'offline-test-model' : chatModelId();

  const result = streamText({
    model: chatModel(),
    system: systemPrompt(doc),
    messages: await convertToModelMessages(messages),
    tools: {
      searchDocument: { description: TOOL_DESCRIPTIONS.searchDocument, inputSchema: TOOL_INPUTS.searchDocument },
      readPage: { description: TOOL_DESCRIPTIONS.readPage, inputSchema: TOOL_INPUTS.readPage },
      getOutline: { description: TOOL_DESCRIPTIONS.getOutline, inputSchema: TOOL_INPUTS.getOutline },
    },
    // After the tool budget is spent, the model has to answer with what it has.
    toolChoice: toolCalls >= LIMITS.maxToolCallsPerTurn ? 'none' : 'auto',
    maxOutputTokens: 1500,
    providerOptions: chatProviderOptions(),
    onEnd({ usage, finishReason }) {
      console.info(
        JSON.stringify({ event: 'chat', model: modelId, toolCalls, finishReason, tokens: usage.totalTokens, ms: Date.now() - started }),
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
