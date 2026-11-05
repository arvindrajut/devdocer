/** Matches citation groups such as [S12] or [S3, S7]. */
const CITATION_GROUP = /\[(S\d+(?:\s*,\s*S\d+)*)\]/g;

export function citedIds(text: string): number[] {
  const ids = new Set<number>();
  for (const match of text.matchAll(CITATION_GROUP)) {
    for (const id of match[1].split(',')) ids.add(Number(id.trim().slice(1)));
  }
  return [...ids];
}

/**
 * Rewrites [S12] markers as Markdown links (#cite-12) so the chat renderer can
 * turn them into clickable page chips.
 */
export function linkCitations(markdown: string): string {
  return markdown.replace(CITATION_GROUP, (_, group: string) =>
    group
      .split(',')
      .map((raw) => {
        const id = raw.trim().slice(1);
        return `[S${id}](#cite-${id})`;
      })
      .join(' '),
  );
}

export function citationId(href: string | undefined): number | null {
  const match = href?.match(/^#cite-(\d+)$/);
  return match ? Number(match[1]) : null;
}
