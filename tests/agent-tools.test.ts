import { describe, expect, it } from 'vitest';
import { getOutline, readPage, searchOutput, type AgentDocument } from '@/lib/agent/tools';
import { chunkPages } from '@/lib/chunk';
import { extractOutline } from '@/lib/outline';
import { DocumentIndex } from '@/lib/search';
import { fakeEmbed } from '@/lib/server/fake-ai';

const pages = [
  'Acme Travel Policy\nPolicy number T-7 · Version 2\n1. Purpose\nThis policy covers business travel for all staff.',
  '2. Booking\nBook flights at least 14 days ahead.\n2.1 Hotels\nHotel rooms are reimbursed up to $180 per night.\nREVISION HISTORY\n2.0 March 3, 2025 Raised the hotel cap.',
  '3. Expenses\nSubmit receipts within 30 days.',
];

function makeDoc(): AgentDocument {
  const chunks = chunkPages(pages, { maxChars: 400, overlap: 50 });
  return { name: 'travel.pdf', pages: pages.length, chunks, index: new DocumentIndex(chunks, fakeEmbed(chunks.map((c) => c.text))), outline: extractOutline(pages, chunks) };
}

describe('extractOutline', () => {
  it('finds numbered and all-caps headings with their level and page', () => {
    const outline = makeDoc().outline.map(({ title, level, page }) => ({ title, level, page }));
    expect(outline).toEqual([
      { title: '1. Purpose', level: 1, page: 1 },
      { title: '2. Booking', level: 1, page: 2 },
      { title: '2.1 Hotels', level: 2, page: 2 },
      { title: 'REVISION HISTORY', level: 1, page: 2 },
      { title: '3. Expenses', level: 1, page: 3 },
    ]);
  });

  it('skips sentences, table rows and running headers', () => {
    const repeated = ['ACME CONFIDENTIAL\n1. One\nText.', 'ACME CONFIDENTIAL\n2. Two\nText.', 'ACME CONFIDENTIAL\n3. Three\nText.'];
    const chunks = chunkPages(repeated, { maxChars: 400, overlap: 0 });
    expect(extractOutline(repeated, chunks).map((e) => e.title)).toEqual(['1. One', '2. Two', '3. Three']);
  });
});

describe('agent tools', () => {
  it('searchDocument returns cited passages', () => {
    const doc = makeDoc();
    const query = 'hotel reimbursed per night';
    const { passages } = searchOutput(query, doc.index.search(query, fakeEmbed([query])[0]));
    expect(passages[0]).toMatchObject({ page: 2 });
    expect(passages[0].id).toMatch(/^S\d+$/);
    expect(passages[0].text).toContain('$180');
  });

  it('readPage returns every chunk on the page and rejects pages that do not exist', () => {
    const doc = makeDoc();
    expect(readPage(doc, 3).passages.map((p) => p.text)).toEqual(['3. Expenses\nSubmit receipts within 30 days.']);
    expect(() => readPage(doc, 9)).toThrow('the document has 3 pages');
  });

  it('getOutline gives each section a source id the model can cite', () => {
    const doc = makeDoc();
    const hotels = getOutline(doc).sections.find((s) => s.title === '2.1 Hotels');
    expect(hotels?.source).toMatch(/^S\d+$/);
    expect(doc.index.chunk(Number(hotels!.source.slice(1)))?.text).toContain('2.1 Hotels');
  });
});
