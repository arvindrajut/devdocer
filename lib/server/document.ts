import { extractText, getDocumentProxy } from 'unpdf';
import type { AgentDocument } from '../agent/tools';
import { chunkPages } from '../chunk';
import { CHUNKING, LIMITS } from '../config';
import { extractOutline } from '../outline';
import { DocumentIndex } from '../search';

/**
 * The browser's ingestion pipeline, in Node: read → chunk → embed → index and
 * outline. Used by the MCP server and the tests.
 */
export async function indexPdf(
  name: string,
  data: Uint8Array,
  embed: (texts: string[]) => Promise<number[][]>,
): Promise<AgentDocument> {
  const pdf = await getDocumentProxy(data);
  if (pdf.numPages > LIMITS.maxPages) throw new Error(`${name} has ${pdf.numPages} pages; the limit is ${LIMITS.maxPages}.`);
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [text];

  const chunks = chunkPages(pages, CHUNKING);
  if (chunks.length === 0) throw new Error(`${name} has no selectable text (it may be a scanned PDF).`);
  if (chunks.length > LIMITS.maxChunks) throw new Error(`${name} is too long (${chunks.length} chunks; the limit is ${LIMITS.maxChunks}).`);

  const embeddings: number[][] = [];
  for (let i = 0; i < chunks.length; i += LIMITS.embedBatch) {
    embeddings.push(...(await embed(chunks.slice(i, i + LIMITS.embedBatch).map((c) => c.text))));
  }

  return { name, pages: pages.length, chunks, index: new DocumentIndex(chunks, embeddings), outline: extractOutline(pages, chunks) };
}
