import type { LanguageModelV4Prompt, LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { simulateReadableStream } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { tokenize } from '../bm25';
import { EMBEDDING_DIMENSIONS } from '../config';

/**
 * Offline stand-ins for OpenAI, used when DEVDOCER_FAKE_AI=1. They keep the real
 * code paths (streamText, tool calls, the browser index) running without a key.
 */

/** Feature hashing: deterministic vectors where shared words mean higher cosine similarity. */
export function fakeEmbed(texts: string[], dimensions: number = EMBEDDING_DIMENSIONS): number[][] {
  return texts.map((text) => {
    const vector = new Array<number>(dimensions).fill(0);
    for (const token of tokenize(text)) {
      let hash = 2166136261;
      for (let i = 0; i < token.length; i++) hash = Math.imul(hash ^ token.charCodeAt(i), 16777619);
      const slot = Math.abs(hash) % dimensions;
      vector[slot] += hash & 1 ? 1 : -1;
    }
    const norm = Math.hypot(...vector) || 1;
    return vector.map((v) => v / norm);
  });
}

const usage = {
  inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 0, text: 0, reasoning: undefined },
};

type Passage = { id: string; page: number; text: string };

function lastUserText(prompt: LanguageModelV4Prompt): string {
  for (let i = prompt.length - 1; i >= 0; i--) {
    const message = prompt[i];
    if (message.role === 'user') return message.content.map((part) => (part.type === 'text' ? part.text : '')).join(' ');
  }
  return '';
}

/** Passages returned by searchDocument since the last user message, if any. */
function toolPassages(prompt: LanguageModelV4Prompt): Passage[] | null {
  let found: Passage[] | null = null;
  for (const message of prompt) {
    if (message.role === 'user') found = null;
    if (message.role !== 'tool') continue;
    for (const part of message.content) {
      if (part.type !== 'tool-result') continue;
      const output = part.output;
      const value = output.type === 'json' ? output.value : output.type === 'text' ? safeParse(output.value) : null;
      const passages = (value as { passages?: Passage[] } | null)?.passages ?? [];
      found = [...(found ?? []), ...passages];
    }
  }
  return found;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** First real sentence of a passage, skipping short heading lines like "6. Equipment". */
function firstSentence(text: string): string {
  const body = text
    .split('\n')
    .filter((line) => line.trim().length >= 40)
    .join(' ');
  const source = body || text;
  return (source.replace(/\s+/g, ' ').match(/[A-Z][^.!?]{20,}[.!?]/)?.[0] ?? source.slice(0, 200)).trim();
}

export function fakeChatModel() {
  return new MockLanguageModelV4({
    doStream: async ({ prompt }) => {
      const passages = toolPassages(prompt);
      const chunks: LanguageModelV4StreamPart[] = [{ type: 'stream-start', warnings: [] }];

      if (passages === null) {
        chunks.push({
          type: 'tool-call',
          toolCallId: `fake-${Date.now()}`,
          toolName: 'searchDocument',
          input: JSON.stringify({ query: lastUserText(prompt).slice(0, 200) || 'overview' }),
        });
        chunks.push({ type: 'finish', finishReason: { unified: 'tool-calls', raw: undefined }, usage });
      } else {
        const answer = passages.length
          ? [
              'Offline test mode (no model call). The closest passages say:',
              '',
              ...passages.slice(0, 3).map((p) => `- ${firstSentence(p.text)} [${p.id}]`),
            ].join('\n')
          : "I couldn't find that in the document.";
        chunks.push({ type: 'text-start', id: 't1' });
        for (const word of answer.split(/(?<= )/)) chunks.push({ type: 'text-delta', id: 't1', delta: word });
        chunks.push({ type: 'text-end', id: 't1' });
        chunks.push({ type: 'finish', finishReason: { unified: 'stop', raw: undefined }, usage });
      }

      return { stream: simulateReadableStream({ chunks, chunkDelayInMs: 8 }) };
    },
  });
}
