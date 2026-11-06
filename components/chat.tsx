'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls, type UIMessage } from 'ai';
import { AlertCircle, ArrowUp, FileSearch, RotateCcw, Square } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getOutline, readPage, searchOutput, toPassage, type ToolName } from '@/lib/agent/tools';
import { citedIds } from '@/lib/citations';
import { searchDocument, verifyAnswer, type LoadedDocument } from '@/lib/client/ingest';
import { LIMITS } from '@/lib/config';
import type { SearchHit } from '@/lib/search';
import type { GroundingReport } from '@/lib/verify';
import { MessageView } from './message';

export type ChatMetadata = { model?: string; totalTokens?: number; latencyMs?: number };
export type ChatMessage = UIMessage<ChatMetadata>;
export type SearchTrace = { hits: SearchHit[]; ms: number };
export type SelfCheck = { status: 'checking' } | { status: 'done'; report: GroundingReport } | { status: 'error'; message: string };

const FALLBACK_QUESTIONS = ['What is this document about?', 'What are the most important numbers in it?', 'Who does it apply to?'];

const textOf = (message: ChatMessage) => message.parts.map((part) => (part.type === 'text' ? part.text : '')).join('');

function readableError(error: Error): string {
  try {
    return JSON.parse(error.message).error ?? error.message;
  } catch {
    return error.message || 'Something went wrong.';
  }
}

export function Chat({ doc, onCite }: { doc: LoadedDocument; onCite: (id: number) => void }) {
  const [input, setInput] = useState('');
  const [traces, setTraces] = useState<Record<string, SearchTrace>>({});
  const [checks, setChecks] = useState<Record<string, SelfCheck>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport<ChatMessage>({
        api: '/api/chat',
        prepareSendMessagesRequest: ({ messages }) => ({
          body: { messages, doc: { name: doc.name, pages: doc.pages } },
        }),
      }),
    [doc],
  );

  /** After an answer finishes, check each cited claim against the passage it cites. */
  const selfCheck = (message: ChatMessage, history: ChatMessage[]) => {
    const answer = textOf(message);
    const passages = citedIds(answer)
      .map((id) => doc.index.chunk(id))
      .filter((chunk) => chunk !== undefined)
      .slice(0, LIMITS.maxVerifyPassages)
      .map(toPassage);
    if (!passages.length) return;
    const question = textOf(history.findLast((m) => m.role === 'user') ?? message).slice(0, LIMITS.maxQuestionChars);
    setChecks((all) => ({ ...all, [message.id]: { status: 'checking' } }));
    verifyAnswer(question, answer.slice(0, LIMITS.maxAnswerChars), passages)
      .then((report) => setChecks((all) => ({ ...all, [message.id]: { status: 'done', report } })))
      .catch((err: Error) => setChecks((all) => ({ ...all, [message.id]: { status: 'error', message: err.message } })));
  };

  const { messages, sendMessage, addToolOutput, status, error, stop, regenerate, clearError } = useChat<ChatMessage>({
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    // The agent's tools run here, in the browser, against the in-memory index.
    async onToolCall({ toolCall }) {
      if (toolCall.dynamic) return;
      const tool = toolCall.toolName as ToolName;
      const { toolCallId } = toolCall;
      try {
        if (tool === 'searchDocument') {
          const { query } = toolCall.input as { query: string };
          const { hits, ms } = await searchDocument(doc, query);
          setTraces((all) => ({ ...all, [toolCallId]: { hits, ms } }));
          addToolOutput({ tool, toolCallId, output: searchOutput(query, hits) });
        } else if (tool === 'readPage') {
          addToolOutput({ tool, toolCallId, output: readPage(doc, (toolCall.input as { page: number }).page) });
        } else if (tool === 'getOutline') {
          addToolOutput({ tool, toolCallId, output: getOutline(doc) });
        }
      } catch (err) {
        addToolOutput({ tool, toolCallId, state: 'output-error', errorText: err instanceof Error ? err.message : 'The tool failed.' });
      }
    },
    onFinish({ message, messages: history, isAbort, isError, finishReason }) {
      if (!isAbort && !isError && finishReason !== 'tool-calls' && message.role === 'assistant') selfCheck(message, history);
    },
  });

  const busy = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    const el = scrollRef.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 240) el.scrollTo({ top: el.scrollHeight });
  }, [messages]);

  const ask = (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    if (error) clearError();
    void sendMessage({ text: question });
    setInput('');
  };

  const suggestions = doc.questions.length ? doc.questions : FALLBACK_QUESTIONS;

  return (
    <section className="flex min-h-0 flex-col" aria-label="Chat">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
          {messages.length === 0 ? (
            <div className="animate-fade-in pt-6 text-center sm:pt-14">
              <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-200">
                <FileSearch className="size-6" aria-hidden />
              </span>
              <h2 className="mt-4 text-xl font-semibold tracking-tight">Ask about {doc.name}</h2>
              {doc.summary && (
                <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-600 lg:hidden dark:text-zinc-400">{doc.summary}</p>
              )}
              <div className="mx-auto mt-6 grid max-w-xl gap-2 sm:grid-cols-2">
                {suggestions.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => ask(q)}
                    className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left text-sm hover:border-brand-400 hover:bg-brand-50/50 focus-visible:outline-2 focus-visible:outline-brand-500 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-brand-500"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((message) => (
                <MessageView key={message.id} message={message} doc={doc} traces={traces} check={checks[message.id]} onCite={onCite} />
              ))}
              {status === 'submitted' && messages.at(-1)?.role === 'user' && (
                <p className="flex items-center gap-2 pl-11 text-sm text-zinc-500">
                  <span className="size-2 animate-pulse rounded-full bg-brand-500" /> Thinking…
                </p>
              )}
            </div>
          )}

          {error && (
            <div role="alert" className="mt-6 flex items-start gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span className="flex-1">{readableError(error)}</span>
              <button type="button" onClick={() => regenerate()} className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline">
                <RotateCcw className="size-3.5" aria-hidden /> Retry
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-zinc-200 bg-white/80 px-4 py-3 backdrop-blur sm:px-6 dark:border-zinc-800 dark:bg-zinc-950/80">
        <form
          className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-zinc-300 bg-white p-2 shadow-sm focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20 dark:border-zinc-700 dark:bg-zinc-900"
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
        >
          <label htmlFor="question" className="sr-only">
            Ask a question about the document
          </label>
          <textarea
            id="question"
            rows={1}
            value={input}
            maxLength={LIMITS.maxQuestionChars}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                ask(input);
              }
            }}
            placeholder="Ask a question about this PDF…"
            className="field-sizing-content max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[15px] outline-none placeholder:text-zinc-400"
          />
          {busy ? (
            <button
              type="button"
              onClick={() => stop()}
              aria-label="Stop generating"
              className="grid size-10 shrink-0 place-items-center rounded-xl bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
            >
              <Square className="size-4 fill-current" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              aria-label="Send question"
              className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-600 text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowUp className="size-5" />
            </button>
          )}
        </form>
        <p className="mx-auto mt-2 max-w-3xl text-center text-xs text-zinc-500">
          Answers come only from this PDF, cite their sources and are self-checked. Verify anything important.
        </p>
      </div>
    </section>
  );
}
