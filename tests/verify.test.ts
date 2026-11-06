import { beforeAll, describe, expect, it } from 'vitest';
import { POST } from '@/app/api/verify/route';
import { citedClaims, lexicalCheck } from '@/lib/verify';

beforeAll(() => {
  process.env.DEVDOCER_FAKE_AI = '1';
});

const passages = [
  { id: 'S7', page: 4, text: 'Remote-first and hybrid employees receive a one-time home office stipend of $750. The stipend renews every three years.' },
  { id: 'S8', page: 4, text: 'Remote-first and hybrid employees are reimbursed up to $60 per month for home internet service.' },
];

describe('citedClaims', () => {
  it('splits an answer into cited sentences and bullets, skipping uncited lines', () => {
    const answer = [
      'Here is what the policy says:',
      '- The home office stipend is $750 [S7]. It renews every three years. [S7]',
      '- Internet is reimbursed up to $60 per month [S8].',
    ].join('\n');
    expect(citedClaims(answer)).toEqual([
      { claim: 'The home office stipend is $750.', sources: ['S7'] },
      { claim: 'It renews every three years.', sources: ['S7'] },
      { claim: 'Internet is reimbursed up to $60 per month.', sources: ['S8'] },
    ]);
  });
});

describe('lexicalCheck', () => {
  it('supports claims whose words and numbers are in the cited passage', () => {
    const [check] = lexicalCheck([{ claim: 'Hybrid employees get a home office stipend of $750.', sources: ['S7'] }], passages);
    expect(check.verdict).toBe('supported');
  });

  it('rejects a number that the cited passage does not contain', () => {
    const [check] = lexicalCheck([{ claim: 'The home office stipend is $900.', sources: ['S7'] }], passages);
    expect(check).toMatchObject({ verdict: 'unsupported', reason: '"900" doesn\'t appear in the cited passage.' });
  });

  it('rejects a citation to a passage that was never retrieved', () => {
    const [check] = lexicalCheck([{ claim: 'Coworking is reimbursed monthly.', sources: ['S99'] }], passages);
    expect(check.verdict).toBe('unsupported');
  });
});

describe('POST /api/verify (offline checker)', () => {
  it('returns one verdict per cited claim', async () => {
    const response = await POST(
      new Request('http://localhost/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': 'verify-test' },
        body: JSON.stringify({
          question: 'What does remote work pay for?',
          answer: 'The stipend is $750 [S7]. Internet is covered up to $80 per month [S8].',
          passages,
        }),
      }),
    );
    expect(response.status).toBe(200);
    const report = await response.json();
    expect(report.checker).toBe('offline lexical check');
    expect(report.claims.map((c: { verdict: string }) => c.verdict)).toEqual(['supported', 'unsupported']);
  });
});
