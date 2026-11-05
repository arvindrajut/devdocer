import { generateText, Output } from 'ai';
import { z } from 'zod';
import { LIMITS } from '@/lib/config';
import { suggestPrompt } from '@/lib/prompt';
import { chatModel, chatProviderOptions, isFakeAI, missingKeyResponse } from '@/lib/server/ai';
import { rateLimit } from '@/lib/server/rate-limit';

export const maxDuration = 30;

const Body = z.object({
  name: z.string().trim().min(1).max(200),
  pages: z.number().int().min(1).max(LIMITS.maxPages),
  excerpt: z.string().trim().min(20).max(12_000),
});

const Suggestions = z.object({
  summary: z.string().describe('Two sentences: what the document is and who it is for'),
  questions: z.array(z.string()).min(3).max(4).describe('Specific questions the document can answer'),
});

/** Structured output: a short summary and starter questions, validated against a Zod schema. */
export async function POST(request: Request) {
  const limited = rateLimit(request, 'suggest', 30, 10 * 60_000);
  if (limited) return limited;
  const noKey = missingKeyResponse();
  if (noKey) return noKey;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Invalid request.' }, { status: 400 });
  const { name, pages, excerpt } = parsed.data;

  if (isFakeAI()) {
    const firstLine = excerpt.split('\n').find((line) => line.trim().length > 20)?.trim() ?? name;
    return Response.json({
      summary: `${firstLine.slice(0, 160)} (offline test mode, so this summary is just the first line).`,
      questions: ['What is this document about?', 'What are the key numbers or limits?', 'Who does this apply to?', 'What deadlines does it mention?'],
    } satisfies z.infer<typeof Suggestions>);
  }

  try {
    const { output } = await generateText({
      model: chatModel(),
      output: Output.object({ schema: Suggestions }),
      prompt: suggestPrompt({ name, pages }, excerpt),
      providerOptions: chatProviderOptions(),
      maxRetries: 1,
    });
    return Response.json(output);
  } catch (error) {
    // Suggestions are optional; the chat still works without them.
    console.error('suggest failed', error);
    return Response.json({ summary: null, questions: [] });
  }
}
