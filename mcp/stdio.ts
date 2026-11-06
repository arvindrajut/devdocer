/**
 * Runs DevDocer as an MCP server over stdio for one PDF:
 *
 *   npx tsx mcp/stdio.ts path/to/file.pdf
 *
 * With OPENAI_API_KEY set it uses OpenAI embeddings (hybrid search); without one it
 * falls back to offline vectors, so search leans on BM25. Logs go to stderr because
 * stdout carries the MCP protocol.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from '../lib/mcp/server';
import { embedOnServer, embeddingModelId, hasEmbeddingKey } from '../lib/server/ai';
import { indexPdf } from '../lib/server/document';

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: npx tsx mcp/stdio.ts path/to/file.pdf');
    process.exit(1);
  }

  const started = Date.now();
  const doc = await indexPdf(path.basename(file), new Uint8Array(await readFile(file)), embedOnServer);
  console.error(
    `devdocer: indexed ${doc.name} (${doc.pages} pages, ${doc.chunks.length} chunks, ${doc.outline.length} headings) ` +
      `with ${hasEmbeddingKey() ? embeddingModelId() : 'offline embeddings'} in ${Date.now() - started} ms`,
  );

  await createMcpServer(doc, embedOnServer).connect(new StdioServerTransport());
}

main().catch((error) => {
  console.error(`devdocer: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
