import { z } from 'zod';
import type { Chunk } from '../chunk';
import { LIMITS } from '../config';
import type { OutlineEntry } from '../outline';
import type { DocumentIndex, SearchHit } from '../search';

/**
 * The agent's tools, shared by the browser (the chat UI runs them against its
 * in-memory index) and the MCP server (which runs them in Node).
 */

export type Passage = { id: string; page: number; text: string };

/** What the tools need to know about the open document. */
export type AgentDocument = {
  name: string;
  pages: number;
  chunks: Chunk[];
  index: DocumentIndex;
  outline: OutlineEntry[];
};

export const toPassage = (chunk: Chunk): Passage => ({ id: `S${chunk.id}`, page: chunk.page, text: chunk.text });

export const TOOL_INPUTS = {
  searchDocument: z.object({
    query: z.string().min(2).max(200).describe('A focused search query, e.g. the key terms of the question'),
  }),
  readPage: z.object({
    page: z.number().int().min(1).max(LIMITS.maxPages).describe('1-based page number, e.g. the page of a passage you found'),
  }),
  getOutline: z.object({}),
};

export type ToolName = keyof typeof TOOL_INPUTS;

export type SearchOutput = { query: string; passages: Passage[] };
export type ReadPageOutput = { page: number; passages: Passage[] };
export type OutlineOutput = { sections: { title: string; level: number; page: number; source: string }[] };

export function searchOutput(query: string, hits: SearchHit[]): SearchOutput {
  return { query, passages: hits.map((hit) => toPassage(hit.chunk)) };
}

/** Every chunk on one page, in reading order, for when a passage is cut off mid-section. */
export function readPage(doc: AgentDocument, page: number): ReadPageOutput {
  if (!Number.isInteger(page) || page < 1 || page > doc.pages) {
    throw new Error(`Page ${page} doesn't exist; the document has ${doc.pages} pages.`);
  }
  return { page, passages: doc.chunks.filter((chunk) => chunk.page === page).map(toPassage) };
}

export function getOutline(doc: AgentDocument): OutlineOutput {
  return {
    sections: doc.outline.map((entry) => ({ title: entry.title, level: entry.level, page: entry.page, source: `S${entry.chunkId}` })),
  };
}

/** Passages a tool returned, whatever the tool. Outline entries carry no text, so they add none. */
export function passagesOf(output: unknown): Passage[] {
  const passages = (output as { passages?: unknown } | null)?.passages;
  return Array.isArray(passages) ? (passages as Passage[]) : [];
}
