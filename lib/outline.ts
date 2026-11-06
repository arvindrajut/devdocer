import { cleanPageText, type Chunk } from './chunk';

export type OutlineEntry = {
  title: string;
  /** 1 for "6. Equipment", 2 for "6.1 Home office stipend", and so on. */
  level: number;
  page: number;
  /** The chunk that contains the heading, so the agent can cite it. */
  chunkId: number;
};

/** "6. Equipment and expenses", "6.1 Home office stipend". Years like "2026 Budget" don't qualify. */
const NUMBERED = /^((?:\d{1,2}\.){0,3}\d{1,2})\.?\s+(\p{Lu}.{1,80})$/u;
/** "Section 4", "Article IV: Term", "Appendix B". */
const NAMED = /^(?:section|article|chapter|part|appendix)\s+(?:\d+|[IVXLC]+|[A-Z])\b[.:]?(?:\s+.{1,80})?$/iu;
/** "TERMS AND CONDITIONS", at least one run of three capitals and nothing lowercase. */
const ALL_CAPS = /^(?=.*\p{Lu}{3})[\p{Lu}\d][\p{Lu}\d &,'’/()-]{4,60}$/u;

function asHeading(line: string): { title: string; level: number } | null {
  if (line.length > 90 || /[.,;:]$/.test(line) || line.split(' ').length > 12) return null;
  const numbered = line.match(NUMBERED);
  if (numbered) return { title: line, level: numbered[1].split('.').length };
  if (NAMED.test(line) || ALL_CAPS.test(line)) return { title: line, level: 1 };
  return null;
}

/**
 * Finds the document's section headings from its text layer. PDFs rarely carry a
 * usable outline, so this looks for numbered, "Section 4"-style and all-caps lines.
 */
export function extractOutline(pages: string[], chunks: Chunk[]): OutlineEntry[] {
  const found: Omit<OutlineEntry, 'chunkId'>[] = [];
  pages.forEach((raw, i) => {
    for (const line of cleanPageText(raw).split('\n')) {
      const heading = asHeading(line.trim());
      if (heading) found.push({ ...heading, page: i + 1 });
    }
  });

  // A title on three or more pages is a running header, not a section.
  const counts = new Map<string, number>();
  for (const entry of found) counts.set(entry.title, (counts.get(entry.title) ?? 0) + 1);

  return found
    .filter((entry) => (counts.get(entry.title) ?? 0) < 3)
    .flatMap((entry) => {
      const onPage = chunks.filter((c) => c.page === entry.page);
      const chunk = onPage.find((c) => c.text.includes(entry.title)) ?? onPage[0];
      return chunk ? [{ ...entry, chunkId: chunk.id }] : [];
    })
    .slice(0, 200);
}
