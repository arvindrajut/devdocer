import { describe, expect, it } from 'vitest';
import { citationId, citedIds, linkCitations } from '@/lib/citations';

describe('citations', () => {
  it('collects unique ids from single and grouped citations', () => {
    expect(citedIds('Stipend is $750 [S4]. It renews [S4, S5].')).toEqual([4, 5]);
  });

  it('turns citation groups into one link per source', () => {
    expect(linkCitations('Yes [S3, S7].')).toBe('Yes [S3](#cite-3) [S7](#cite-7).');
  });

  it('leaves ordinary brackets alone', () => {
    expect(linkCitations('See [the policy] and [S]')).toBe('See [the policy] and [S]');
  });

  it('reads the id back from a link', () => {
    expect(citationId('#cite-12')).toBe(12);
    expect(citationId('https://example.com')).toBeNull();
  });
});
