import { describe, expect, it } from 'vitest';
import { chunkPages, cleanPageText, splitText } from '@/lib/chunk';

describe('cleanPageText', () => {
  it('joins words hyphenated across a line break and collapses spacing', () => {
    expect(cleanPageText('reim-\nbursement   is\t\tpaid\n\n\n\nmonthly')).toBe('reimbursement is paid\n\nmonthly');
  });

  it('unwraps line breaks inside sentences but keeps them before headings', () => {
    expect(cleanPageText('6.1 Home office stipend\nStaff receive a stipend of\n$750 and a keyboard\nand a headset.\nNext rule.')).toBe(
      '6.1 Home office stipend\nStaff receive a stipend of $750 and a keyboard and a headset.\nNext rule.',
    );
  });

  it('does not glue numbered headings onto the previous line', () => {
    expect(cleanPageText('Owner: People Operations\n1. Purpose\nReturn it within\n14 days.')).toBe(
      'Owner: People Operations\n1. Purpose\nReturn it within 14 days.',
    );
  });
});

describe('splitText', () => {
  it('returns short text unchanged', () => {
    expect(splitText('A short paragraph.', 100)).toEqual(['A short paragraph.']);
  });

  it('keeps every piece within the limit', () => {
    const text = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} talks about something.`).join(' ');
    const pieces = splitText(text, 120);
    expect(pieces.length).toBeGreaterThan(5);
    for (const piece of pieces) expect(piece.length).toBeLessThanOrEqual(120);
  });

  it('prefers paragraph boundaries over sentence boundaries', () => {
    const first = 'First paragraph. It has two sentences.';
    const second = 'Second paragraph is here.';
    expect(splitText(`${first}\n\n${second}`, 45)).toEqual([first, second]);
  });

  it('hard-cuts a single word longer than the limit', () => {
    expect(splitText('x'.repeat(25), 10)).toEqual(['x'.repeat(10), 'x'.repeat(10), 'x'.repeat(5)]);
  });
});

describe('chunkPages', () => {
  it('numbers chunks from 1, records the page and skips empty pages', () => {
    const chunks = chunkPages(['Page one text.', '   ', 'Page three text.'], { maxChars: 200, overlap: 20 });
    expect(chunks).toEqual([
      { id: 1, page: 1, text: 'Page one text.' },
      { id: 2, page: 3, text: 'Page three text.' },
    ]);
  });

  it('carries overlap from the previous chunk on the same page', () => {
    const page = Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ');
    const chunks = chunkPages([page], { maxChars: 80, overlap: 20 });
    expect(chunks.length).toBeGreaterThan(1);
    const tailOfFirst = chunks[0].text.split(' ').at(-1)!;
    expect(chunks[1].text.startsWith(tailOfFirst) || chunks[1].text.includes(` ${tailOfFirst} `)).toBe(true);
  });
});
