import { readFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { createMcpServer } from '@/lib/mcp/server';
import { indexPdf } from '@/lib/server/document';
import { fakeEmbed } from '@/lib/server/fake-ai';

const embed = async (texts: string[]) => fakeEmbed(texts);
let client: Client;

beforeAll(async () => {
  const data = new Uint8Array(await readFile('public/sample/northwind-remote-work-policy.pdf'));
  const doc = await indexPdf('northwind-remote-work-policy.pdf', data, embed);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createMcpServer(doc, embed).connect(serverSide);
  client = new Client({ name: 'test-client', version: '1.0.0' });
  await client.connect(clientSide);
});

const textOf = (result: Awaited<ReturnType<Client['callTool']>>) =>
  (result.content as { type: string; text: string }[]).map((c) => c.text).join('\n');

describe('DevDocer MCP server', () => {
  it('lists the three agent tools', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['get_outline', 'read_page', 'search_document']);
  });

  it('search_document returns cited passages from the sample PDF', async () => {
    const result = await client.callTool({ name: 'search_document', arguments: { query: 'home office stipend' } });
    expect(textOf(result)).toMatch(/\[S\d+\] page 4/);
    expect(textOf(result)).toContain('$750');
  });

  it('get_outline lists numbered sections with pages', async () => {
    const result = await client.callTool({ name: 'get_outline', arguments: {} });
    expect(textOf(result)).toContain('6.1 Home office stipend (page 4)');
  });

  it('read_page reports an error for a page that does not exist', async () => {
    const result = await client.callTool({ name: 'read_page', arguments: { page: 40 } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('the document has 6 pages');
  });
});
