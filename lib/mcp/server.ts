import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { getOutline, readPage, searchOutput, TOOL_INPUTS, type AgentDocument, type Passage } from '../agent/tools';
import { TOOL_DESCRIPTIONS } from '../prompt';

const formatPassages = (passages: Passage[]) =>
  passages.map((p) => `[${p.id}] page ${p.page}\n${p.text}`).join('\n\n') || 'No matching passages.';

const text = (body: string): CallToolResult => ({ content: [{ type: 'text', text: body }] });

/**
 * DevDocer's agent tools as an MCP server, so Claude Code, Claude Desktop or any MCP
 * client can search a PDF with the same hybrid retriever and cite passages by id.
 */
export function createMcpServer(doc: AgentDocument, embed: (texts: string[]) => Promise<number[][]>): McpServer {
  const server = new McpServer(
    { name: 'devdocer', version: '2.1.0' },
    {
      instructions:
        `Tools for the PDF "${doc.name}" (${doc.pages} pages). Start with search_document or get_outline, ` +
        'use read_page for surrounding context, and cite passages by their ids, e.g. [S12].',
    },
  );

  server.registerTool(
    'search_document',
    { title: 'Search the document', description: TOOL_DESCRIPTIONS.searchDocument, inputSchema: TOOL_INPUTS.searchDocument.shape },
    async ({ query }) => {
      const [vector] = await embed([query]);
      return text(formatPassages(searchOutput(query, doc.index.search(query, vector)).passages));
    },
  );

  server.registerTool(
    'read_page',
    { title: 'Read a page', description: TOOL_DESCRIPTIONS.readPage, inputSchema: TOOL_INPUTS.readPage.shape },
    async ({ page }) => {
      try {
        return text(formatPassages(readPage(doc, page).passages));
      } catch (error) {
        return { ...text(error instanceof Error ? error.message : 'Could not read that page.'), isError: true };
      }
    },
  );

  server.registerTool(
    'get_outline',
    { title: 'Get the outline', description: TOOL_DESCRIPTIONS.getOutline },
    async () => {
      const { sections } = getOutline(doc);
      if (!sections.length) return text('No section headings were found. Use search_document instead.');
      return text(sections.map((s) => `${'  '.repeat(s.level - 1)}${s.title} (page ${s.page}) [${s.source}]`).join('\n'));
    },
  );

  return server;
}
