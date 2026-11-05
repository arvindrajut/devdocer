import { CHUNKING } from './config';

export type Chunk = {
  /** 1-based id; the model cites it as [S{id}]. */
  id: number;
  /** 1-based page the chunk came from. */
  page: number;
  text: string;
};

/** Cleans text extracted from a PDF page without losing paragraph breaks. */
export function cleanPageText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/(\p{L})-\n(\p{L})/gu, '$1$2') // words hyphenated across a line break
    .replace(/[ \t\f\v\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    // Unwrap visual line breaks inside a sentence; keep breaks before headings and new paragraphs.
    .replace(/([^\n.:!?])\n(?=[\p{Ll}$(,;]|\d(?![\d.]*\.?\s\p{Lu}))/gu, '$1 ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const SEPARATORS = ['\n\n', '\n', '. ', ' '];

/**
 * Recursive character splitting: split on the largest separator first (paragraphs),
 * fall back to smaller ones (lines, sentences, words) only for pieces that are still
 * too long, and merge neighbours back together up to maxChars.
 */
export function splitText(text: string, maxChars: number, separators: string[] = SEPARATORS): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxChars) return [trimmed];

  const [separator, ...smaller] = separators;
  if (separator === undefined) {
    const hardCuts: string[] = [];
    for (let i = 0; i < trimmed.length; i += maxChars) hardCuts.push(trimmed.slice(i, i + maxChars).trim());
    return hardCuts.filter(Boolean);
  }

  const parts = trimmed.split(separator);
  const pieces: string[] = [];
  let current = '';
  const flush = () => {
    if (current.trim()) pieces.push(current.trim());
    current = '';
  };

  parts.forEach((rawPart, i) => {
    const part = i < parts.length - 1 ? rawPart + separator : rawPart;
    if (part.length > maxChars) {
      flush();
      pieces.push(...splitText(part, maxChars, smaller));
    } else if (current.length + part.length > maxChars) {
      flush();
      current = part;
    } else {
      current += part;
    }
  });
  flush();
  return pieces;
}

/** The last `chars` characters of a piece, starting at a word boundary. */
function overlapTail(text: string, chars: number): string {
  if (chars <= 0) return '';
  if (text.length <= chars) return text;
  const tail = text.slice(-chars);
  const firstSpace = tail.indexOf(' ');
  return firstSpace === -1 ? tail : tail.slice(firstSpace + 1);
}

/**
 * Splits every page into overlapping chunks. Chunks never span pages, so each one
 * can be cited with a single page number.
 */
export function chunkPages(pages: string[], options: { maxChars: number; overlap: number } = CHUNKING): Chunk[] {
  const chunks: Chunk[] = [];
  pages.forEach((raw, pageIndex) => {
    const pieces = splitText(cleanPageText(raw), options.maxChars - options.overlap);
    pieces.forEach((piece, i) => {
      const carried = i > 0 ? overlapTail(pieces[i - 1], options.overlap) : '';
      chunks.push({
        id: chunks.length + 1,
        page: pageIndex + 1,
        text: carried ? `${carried} ${piece}` : piece,
      });
    });
  });
  return chunks;
}
