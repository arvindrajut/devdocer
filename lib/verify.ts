import type { Passage } from './agent/tools';
import { tokenize } from './bm25';
import { citedIds } from './citations';

export type Verdict = 'supported' | 'partial' | 'unsupported';
export type Claim = { claim: string; sources: string[] };
export type ClaimCheck = Claim & { verdict: Verdict; reason: string };
export type GroundingReport = { claims: ClaimCheck[]; checker: string };

const CITATIONS = /\s*\[S\d+(?:\s*,\s*S\d+)*\]/g;
const ONLY_CITATIONS = /^(?:\s*\[S\d+(?:\s*,\s*S\d+)*\])+[.!?]?$/;

/**
 * Splits an answer into the sentences and bullets that cite a source: the claims a
 * reader would want checked. Uncited lines (an intro, "I couldn't find that") are skipped.
 */
export function citedClaims(answer: string): Claim[] {
  const pieces: string[] = [];
  for (const line of answer.split('\n')) {
    const text = line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim();
    if (!text) continue;
    for (const sentence of text.split(/(?<=[.!?])\s+(?=[\p{Lu}\d$[])/u)) {
      // "…is $750. [S4]" puts the citation after the full stop; keep it with its sentence.
      if (ONLY_CITATIONS.test(sentence) && pieces.length) pieces[pieces.length - 1] += ` ${sentence}`;
      else pieces.push(sentence);
    }
  }
  return pieces.flatMap((piece) => {
    const ids = citedIds(piece);
    const claim = piece.replace(CITATIONS, '').replace(/\s+([.,;!?])/g, '$1').trim();
    return ids.length && tokenize(claim).length >= 2 ? [{ claim, sources: ids.map((id) => `S${id}`) }] : [];
  });
}

const numbersIn = (text: string) => new Set(text.match(/\d+(?:[.,]\d+)*/g)?.map((n) => n.replace(/,/g, '')) ?? []);

/**
 * The offline checker: how many of the claim's content words appear in the passages it
 * cites, and whether every number in it does. Cheap and strict about numbers, which is
 * where ungrounded answers usually go wrong; the model-based checker judges meaning.
 */
export function lexicalCheck(claims: Claim[], passages: Passage[]): ClaimCheck[] {
  const byId = new Map(passages.map((p) => [p.id, p.text]));
  return claims.map(({ claim, sources }) => {
    const missing = sources.filter((id) => !byId.has(id));
    if (missing.length === sources.length) {
      return { claim, sources, verdict: 'unsupported', reason: `Cites ${missing.join(', ')}, which the agent never retrieved.` };
    }
    const sourceText = sources.map((id) => byId.get(id) ?? '').join('\n');
    const strayNumber = [...numbersIn(claim)].find((n) => !numbersIn(sourceText).has(n));
    if (strayNumber) return { claim, sources, verdict: 'unsupported', reason: `"${strayNumber}" doesn't appear in the cited passage.` };

    const sourceWords = new Set(tokenize(sourceText));
    const words = tokenize(claim);
    const coverage = words.filter((w) => sourceWords.has(w)).length / words.length;
    const pct = `${Math.round(coverage * 100)}% of its key words`;
    if (coverage >= 0.6) return { claim, sources, verdict: 'supported', reason: `The cited passage contains ${pct}.` };
    if (coverage >= 0.35) return { claim, sources, verdict: 'partial', reason: `Only ${pct} appear in the cited passage.` };
    return { claim, sources, verdict: 'unsupported', reason: `The cited passage contains only ${pct}.` };
  });
}
