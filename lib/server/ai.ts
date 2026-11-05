import { openai } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import { fakeChatModel } from './fake-ai';

/** DEVDOCER_FAKE_AI=1 runs the whole app without an API key (local UI work, tests, CI). */
export const isFakeAI = () => process.env.DEVDOCER_FAKE_AI === '1';

export const chatModelId = () => process.env.OPENAI_MODEL?.trim() || 'gpt-5.4-mini';
export const embeddingModelId = () => process.env.OPENAI_EMBEDDING_MODEL?.trim() || 'text-embedding-3-small';

export function chatModel(): LanguageModel {
  return isFakeAI() ? fakeChatModel() : openai(chatModelId());
}

export function embeddingModel() {
  return openai.embeddingModel(embeddingModelId());
}

/** Reasoning models answer faster and cheaper at low effort, which is enough for grounded Q&A. */
export function chatProviderOptions() {
  return /^(gpt-5|gpt-6|o\d)/.test(chatModelId()) ? { openai: { reasoningEffort: 'low' as const } } : undefined;
}

/** A clear error instead of a stack trace when the deployment has no key configured. */
export function missingKeyResponse(): Response | null {
  if (isFakeAI() || process.env.OPENAI_API_KEY) return null;
  return Response.json(
    { error: 'The server has no OPENAI_API_KEY configured. Add it to .env.local or the Vercel project settings.' },
    { status: 503 },
  );
}

/** Turns provider errors into messages that are safe to show (never echoes keys or raw payloads). */
export function describeAIError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/api key|401|unauthorized|incorrect api key/i.test(message)) return 'The OpenAI API key was rejected. Check OPENAI_API_KEY.';
  if (/429|rate limit|quota/i.test(message)) return 'OpenAI is rate limiting this app right now. Try again in a minute.';
  if (/model/i.test(message) && /not found|does not exist|access/i.test(message)) return 'The configured OpenAI model is not available to this API key. Check OPENAI_MODEL.';
  return 'The AI provider returned an error. Please try again.';
}
