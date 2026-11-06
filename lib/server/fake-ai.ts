import type { LanguageModelV4Prompt, LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { simulateReadableStream } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { passagesOf, type OutlineOutput } from '../agent/tools';
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

type ToolResult = { toolName: string; value: unknown };

function lastUserText(prompt: LanguageModelV4Prompt): string {
  for (let i = prompt.length - 1; i >= 0; i--) {
    const message = prompt[i];
    if (message.role === 'user') return message.content.map((part) => (part.type === 'text' ? part.text : '')).join(' ');
  }
  return '';
}

/** Tool results since the last user message, or null if the model hasn't used a tool yet. */
function toolResults(prompt: LanguageModelV4Prompt): ToolResult[] | null {
  let found: ToolResult[] | null = null;
  for (const message of prompt) {
    if (message.role === 'user') found = null;
    if (message.role !== 'tool') continue;
    for (const part of message.content) {
      if (part.type !== 'tool-result') continue;
      const output = part.output;
      const value = output.type === 'json' ? output.value : output.type === 'text' ? safeParse(output.value) : null;
      found = [...(found ?? []), { toolName: part.toolName, value }];
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

/** Sentences of a passage, skipping short heading lines like "6.1 Home office stipend". */
function sentencesOf(text: string): string[] {
  const body = text
    .split('\n')
    .filter((line) => line.trim().length >= 40)
    .join(' ');
  return (body || text).replace(/\s+/g, ' ').match(/[^.!?]{20,}?[.!?](?=\s|$)/g)?.map((s) => s.trim()) ?? [text.slice(0, 200)];
}

const OUTLINE_QUESTION = /\b(outline|sections?|structure|table of contents|cover|topics)\b/i;

function toolCall(toolName: string, input: object): LanguageModelV4StreamPart[] {
  return [
    { type: 'tool-call', toolCallId: `fake-${toolName}-${Date.now()}`, toolName, input: JSON.stringify(input) },
    { type: 'finish', finishReason: { unified: 'tool-calls', raw: undefined }, usage },
  ];
}

function answerFrom(results: ToolResult[], question: string): string {
  const sections = results.flatMap((r) => (r.toolName === 'getOutline' ? (r.value as OutlineOutput).sections ?? [] : []));
  if (sections.length) {
    return [
      'Offline test mode (no model call). The document has these sections:',
      '',
      ...sections.filter((s) => s.level === 1).map((s) => `- ${s.title}, page ${s.page} [${s.source}]`),
    ].join('\n');
  }
  const passages = [...new Map(results.flatMap((r) => passagesOf(r.value)).map((p) => [p.id, p])).values()];
  if (!passages.length) return "I couldn't find that in the document.";
  // Quote the sentences that share the most words with the question.
  const asked = new Set(tokenize(question));
  const ranked = [...new Map(passages.flatMap((p) => sentencesOf(p.text).map((sentence) => [sentence, p.id] as const))).entries()]
    .map(([sentence, id]) => ({ sentence, id, score: tokenize(sentence).filter((w) => asked.has(w)).length }))
    .sort((a, b) => b.score - a.score)
    .filter((s, i, all) => i === 0 || s.score >= all[0].score / 2)
    .slice(0, 3);
  return [
    'Offline test mode (no model call). The closest passages say:',
    '',
    ...ranked.map((p) => `- ${p.sentence} [${p.id}]`),
  ].join('\n');
}

/**
 * A scripted agent that exercises the same multi-step loop as the real model:
 * outline questions read the outline; anything else searches, then reads the page
 * of the best hit, then answers from what came back.
 */
export function fakeChatModel() {
  return new MockLanguageModelV4({
    doStream: async ({ prompt }) => {
      const results = toolResults(prompt);
      const question = lastUserText(prompt);
      const chunks: LanguageModelV4StreamPart[] = [{ type: 'stream-start', warnings: [] }];
      const searched = results?.filter((r) => r.toolName === 'searchDocument') ?? [];
      const bestPage = passagesOf(searched[0]?.value)[0]?.page;

      if (results === null) {
        chunks.push(
          ...(OUTLINE_QUESTION.test(question)
            ? toolCall('getOutline', {})
            : toolCall('searchDocument', { query: question.slice(0, 200) || 'overview' })),
        );
      } else if (bestPage && !results.some((r) => r.toolName === 'readPage')) {
        chunks.push(...toolCall('readPage', { page: bestPage }));
      } else {
        chunks.push({ type: 'text-start', id: 't1' });
        for (const word of answerFrom(results, question).split(/(?<= )/)) chunks.push({ type: 'text-delta', id: 't1', delta: word });
        chunks.push({ type: 'text-end', id: 't1' });
        chunks.push({ type: 'finish', finishReason: { unified: 'stop', raw: undefined }, usage });
      }

      return { stream: simulateReadableStream({ chunks, chunkDelayInMs: 8 }) };
    },
  });
}
