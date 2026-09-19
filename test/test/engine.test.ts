import { describe, expect, it } from 'vitest';
import { evaluateItem, runExact } from '../src/engine.js';
import { FixtureEvaluator } from '../src/fixture-evaluator.js';
import type { Condition, Item } from '../src/types.js';

const item: Item = { id: 'flat-1', title: 'Canal flat', source: 'fixture', url: 'https://example.test/flat-1', text: 'Cats allowed. Bright.', amount: { value: 350, period: 'week', currency: 'GBP' }, publishedAt: '2026-09-18T00:00:00Z', deadline: '2026-10-01T00:00:00Z' };
const exact: Condition = { id: 'rent', requirement: 'required', mode: 'exact', raw: 'under £1600 a month', field: 'amount', op: 'lt', value: 1600, period: 'month' };

describe('exact engine', () => {
  it('normalizes recurring periods', () => expect(runExact(item, exact).status).toBe('pass'));
  it('does not guess an unknown item period', () => expect(runExact({ ...item, amount: { value: 1500 } }, exact).status).toBe('could-not-check'));
  it('does not compare one-off and recurring amounts', () => expect(runExact({ ...item, amount: { value: 1500, period: 'once' } }, exact).status).toBe('could-not-check'));
  it('short-circuits a failed required exact condition before semantic evaluation', async () => {
    let calls = 0;
    const result = await evaluateItem(item, [{ ...exact, value: 100 }], { version: 'spy:v1', async evaluate() { calls += 1; return {}; } });
    expect(result.outcome).toBe('reject'); expect(calls).toBe(0);
  });
});

describe('semantic batch contract', () => {
  it('calls the evaluator once with all remaining questions', async () => {
    let calls = 0; let size = 0;
    const conditions: Condition[] = [exact,
      { id: 'cats', requirement: 'required', mode: 'semantic', raw: 'allows cats', ask: 'Does this allow cats?', expect: true },
      { id: 'basement', requirement: 'required', mode: 'semantic', raw: 'not a basement', ask: 'Is this a basement?', expect: false }];
    const result = await evaluateItem(item, conditions, { version: 'spy:v1', async evaluate(_item, questions) { calls += 1; size = questions.length; return { cats: { result: true, confidence: 1, evaluatorVersion: 'spy:v1' }, basement: { result: false, confidence: 1, evaluatorVersion: 'spy:v1' } }; } });
    expect(calls).toBe(1); expect(size).toBe(2); expect(result.outcome).toBe('strong');
  });
  it('maps low-confidence semantic results to maybe and records provenance', async () => {
    const condition: Condition = { id: 'cats', requirement: 'required', mode: 'semantic', raw: 'allows cats', ask: 'Does this allow cats?', expect: true };
    const result = await evaluateItem(item, [condition], new FixtureEvaluator({ 'flat-1': { cats: { result: true, confidence: 0.6 } } }), 0.75);
    expect(result.outcome).toBe('maybe'); expect(result.provenance[0]).toMatchObject({ confidenceThreshold: 0.75, evaluatorVersion: 'fixture:v1', result: true, acceptedResult: null });
  });
  it('runs keylessly with deterministic fixture answers', async () => {
    const condition: Condition = { id: 'cats', requirement: 'required', mode: 'semantic', raw: 'allows cats', ask: 'Does this allow cats?', expect: true };
    expect((await evaluateItem(item, [condition], new FixtureEvaluator({ 'flat-1': { cats: true } }))).outcome).toBe('strong');
  });
});
