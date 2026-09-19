import { describe, expect, it } from 'vitest';
import { JevError, JevEvaluator } from '../src/jev.js';
import type { Item, SemanticQuestion } from '../src/types.js';

const item: Item = { id: 'i1', title: 'Flat with balcony', source: 'fixture', url: 'https://example.test/1', text: 'Sunny balcony.' };
const questions: SemanticQuestion[] = [
  { id: 'c0', ask: 'Does this have a balcony?', expect: true, criteria: 'balcony preferred' },
  { id: 'c1', ask: 'Is this a basement?', expect: false, criteria: 'not a basement' },
];

function mockFetch(status: number, body: unknown, calls: string[] = []): typeof fetch {
  return (async (url: unknown, init?: { headers?: Record<string, string> }) => {
    calls.push(`${String(url)} ${init?.headers?.['authorization'] ?? ''}`);
    return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) } as Response;
  }) as typeof fetch;
}

const noSleep = () => Promise.resolve();

describe('JevEvaluator', () => {
  it('builds the systemone request and maps noul probabilities', async () => {
    const calls: string[] = [];
    const evaluator = new JevEvaluator('secret-key', { fetchFn: mockFetch(200, { model: 'jev-latest', answers: { c0: { type: 'noul', noul: 0.92 }, c1: { type: 'noul', noul: 0.1 } } }, calls), sleep: noSleep });
    const judgments = await evaluator.evaluate(item, questions, { confidenceThreshold: 0.75, mode: 'shadow' });
    expect(judgments['c0']).toEqual({ result: true, confidence: 0.92, evaluatorVersion: 'jev:jev-latest' });
    expect(judgments['c1']).toEqual({ result: false, confidence: 0.9, evaluatorVersion: 'jev:jev-latest' });
    expect(calls[0]).toBe('https://api.typesafe.ai/v1/systemone Bearer secret-key');
  });
  it('retries once on 429 then succeeds', async () => {
    let n = 0;
    const fetchFn = (async () => {
      n += 1;
      if (n === 1) return { ok: false, status: 429, json: async () => ({}), text: async () => 'rate limited' } as Response;
      return { ok: true, status: 200, json: async () => ({ answers: { c0: { noul: 0.8 }, c1: { noul: 0.2 } } }), text: async () => '' } as Response;
    }) as typeof fetch;
    const evaluator = new JevEvaluator('k', { fetchFn, sleep: noSleep });
    const judgments = await evaluator.evaluate(item, questions, { confidenceThreshold: 0.75, mode: 'shadow' });
    expect(n).toBe(2);
    expect(judgments['c0']?.result).toBe(true);
  });
  it('throws JevError after retries are exhausted', async () => {
    const evaluator = new JevEvaluator('k', { fetchFn: mockFetch(529, 'overloaded'), sleep: noSleep });
    await expect(evaluator.evaluate(item, questions, { confidenceThreshold: 0.75, mode: 'shadow' })).rejects.toBeInstanceOf(JevError);
  });
  it('throws on a non-retryable status without retrying', async () => {
    const calls: string[] = [];
    const evaluator = new JevEvaluator('k', { fetchFn: mockFetch(401, 'bad key', calls), sleep: noSleep });
    await expect(evaluator.evaluate(item, questions, { confidenceThreshold: 0.75, mode: 'shadow' })).rejects.toMatchObject({ status: 401 });
    expect(calls).toHaveLength(1);
  });
  it('refuses to call the API without a key', async () => {
    const evaluator = new JevEvaluator('', { fetchFn: mockFetch(200, {}), sleep: noSleep });
    await expect(evaluator.evaluate(item, questions, { confidenceThreshold: 0.75, mode: 'shadow' })).rejects.toThrow('API key');
  });
});
