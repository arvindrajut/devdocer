import { beforeAll, describe, expect, it } from 'vitest';
import { POST } from '@/app/api/chat/route';

beforeAll(() => {
  process.env.DEVDOCER_FAKE_AI = '1';
});

const doc = { name: 'policy.pdf', pages: 6 };

function request(body: unknown) {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `test-${Math.random()}` },
    body: JSON.stringify(body),
  });
}

describe('POST /api/chat (offline test model)', () => {
  it('asks the browser to run searchDocument first', async () => {
    const response = await POST(
      request({ doc, messages: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'How much is the stipend?' }] }] }),
    );
    expect(response.status).toBe(200);
    const stream = await response.text();
    expect(stream).toContain('"toolName":"searchDocument"');
    expect(stream).toContain('How much is the stipend?');
  });

  it('answers with citations once passages come back', async () => {
    const response = await POST(
      request({
        doc,
        messages: [
          { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'How much is the stipend?' }] },
          {
            id: 'a1',
            role: 'assistant',
            parts: [
              {
                type: 'tool-searchDocument',
                toolCallId: 'call-1',
                state: 'output-available',
                input: { query: 'stipend' },
                output: { query: 'stipend', passages: [{ id: 'S4', page: 4, text: 'The home office stipend is $750.' }] },
              },
            ],
          },
        ],
      }),
    );
    const stream = await response.text();
    expect(stream).toContain('[S4]');
    expect(stream).toContain('$750');
  });

  it('rejects malformed requests', async () => {
    const response = await POST(request({ messages: [] }));
    expect(response.status).toBe(400);
  });
});
