import { describe, expect, it } from 'vitest';
import { createHackerNewsSource, mapHnHit, sampleFlatsSource } from '../src/sources.js';
import { sampleItems, SAMPLE_FIXTURES } from '../src/sample-feed.js';
import { parseConditions } from '../src/parser.js';
import { evaluateItem } from '../src/engine.js';
import { FixtureEvaluator } from '../src/fixture-evaluator.js';
import type { Condition } from '../src/types.js';

describe('Hacker News adapter', () => {
  it('maps hits to items and preserves the original URL', () => {
    const item = mapHnHit({ objectID: '42', title: 'Show HN: Cuttings', url: 'https://example.test/app', story_text: 'A digest app.', created_at_i: 1_758_000_000 });
    expect(item).toMatchObject({ id: 'hn-42', title: 'Show HN: Cuttings', source: 'Hacker News', url: 'https://example.test/app', publishedAt: new Date(1_758_000_000_000).toISOString() });
  });
  it('falls back to the HN discussion URL and drops hits without a title', () => {
    expect(mapHnHit({ objectID: '7', title: null })?.url).toBeUndefined();
    expect(mapHnHit({ objectID: '7', title: 'Ask HN' })?.url).toBe('https://news.ycombinator.com/item?id=7');
  });
  it('never invents fields the source did not supply', () => {
    const item = mapHnHit({ objectID: '9', title: 'No dates here' });
    expect(item?.amount).toBeUndefined();
    expect(item?.publishedAt).toBeUndefined();
  });
  it('fetches and maps live API responses', async () => {
    const fetchFn = (async () => ({ ok: true, status: 200, json: async () => ({ hits: [{ objectID: '1', title: 'A', created_at_i: 1_758_000_000 }, { objectID: '2' }] }) }) as unknown) as typeof fetch;
    const source = createHackerNewsSource(fetchFn);
    const items = await source.fetchItems('ai');
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe('hn-1');
  });
  it('surfaces API errors instead of swallowing them', async () => {
    const fetchFn = (async () => ({ ok: false, status: 503 })) as unknown as typeof fetch;
    await expect(createHackerNewsSource(fetchFn).fetchItems('ai')).rejects.toThrow('503');
  });
});

describe('sample feed', () => {
  it('stays keyless and deterministic: one strong, two maybes, one reject', async () => {
    const conditions: Condition[] = parseConditions('Under ₹30,000 per month\nPosted within the last 2 days\nOne bedroom\nBalcony preferred')
      .map((p, i) => ({ ...p, id: `c${i}`, requirement: p.mode !== 'exact' && p.raw.toLowerCase().includes('preferred') ? 'preferred' : 'required' }) as Condition);
    const evaluator = new FixtureEvaluator(SAMPLE_FIXTURES);
    const outcomes: Record<string, string> = {};
    for (const item of sampleItems()) {
      outcomes[item.id] = (await evaluateItem(item, conditions, evaluator, 0.75)).outcome;
    }
    expect(outcomes).toEqual({ 'flat-1': 'strong', 'flat-2': 'maybe', 'flat-3': 'maybe', 'flat-4': 'reject' });
  });
  it('serves the same items through the sample source adapter', async () => {
    const items = await sampleFlatsSource.fetchItems('');
    expect(items.map(i => i.id)).toEqual(['flat-1', 'flat-2', 'flat-3', 'flat-4']);
  });
});
