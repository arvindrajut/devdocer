import { generateText, Output } from 'ai';
import { z } from 'zod';
import { LIMITS } from '@/lib/config';
import { verifyPrompt } from '@/lib/prompt';
import { chatModel, chatModelId, chatProviderOptions, describeAIError, isFakeAI, missingKeyResponse } from '@/lib/server/ai';
import { rateLimit } from '@/lib/server/rate-limit';
import { citedClaims, lexicalCheck, type ClaimCheck, type GroundingReport } from '@/lib/verify';

export const maxDuration = 30;

const Body = z.object({
  question: z.string().trim().min(1).max(LIMITS.maxQuestionChars),
  answer: z.string().trim().min(1).max(LIMITS.maxAnswerChars),
  passages: z
    .array(z.object({ id: z.string().regex(/^S\d+$/), page: z.number().int().min(1), text: z.string().max(LIMITS.maxChunkChars) }))
    .max(LIMITS.maxVerifyPassages),
});

const Verdicts = z.object({
  verdicts: z.array(
    z.object({
      claim: z.number().int().describe('The claim number'),
      verdict: z.enum(['supported', 'partial', 'unsupported']),
      reason: z.string().describe('One short sentence; for partial or unsupported, say what is missing or different'),
    }),
  ),
});

/**
 * The self-check: after an answer streams, the browser sends its cited claims and
 * the passages they cite, and a second model call judges each claim (structured
 * output). Offline, a lexical checker stands in.
 */
export async function POST(request: Request) {
  const limited = rateLimit(request, 'verify', 60, 10 * 60_000);
  if (limited) return limited;
  const noKey = missingKeyResponse();
  if (noKey) return noKey;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Invalid self-check request.' }, { status: 400 });
  const { question, answer, passages } = parsed.data;

  const claims = citedClaims(answer).slice(0, 15);
  if (isFakeAI() || claims.length === 0) {
    return Response.json({ claims: lexicalCheck(claims, passages), checker: 'offline lexical check' } satisfies GroundingReport);
  }

  try {
    const started = Date.now();
    const { output, usage } = await generateText({
      model: chatModel(),
      output: Output.object({ schema: Verdicts }),
      prompt: verifyPrompt(question, claims, passages),
      providerOptions: chatProviderOptions(),
      maxOutputTokens: 1500,
      maxRetries: 1,
    });
    const checked: ClaimCheck[] = claims.map((claim, i) => {
      const verdict = output.verdicts.find((v) => v.claim === i + 1);
      return verdict
        ? { ...claim, verdict: verdict.verdict, reason: verdict.reason }
        : { ...claim, verdict: 'partial', reason: 'The checker skipped this claim.' };
    });
    console.info(JSON.stringify({ event: 'verify', claims: claims.length, tokens: usage.totalTokens, ms: Date.now() - started }));
    return Response.json({ claims: checked, checker: chatModelId() } satisfies GroundingReport);
  } catch (error) {
    console.error('verify failed', error);
    return Response.json({ error: describeAIError(error) }, { status: 502 });
  }
}
