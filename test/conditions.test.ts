import { describe, expect, it } from 'vitest';
import { buildConditions } from '../src/conditions.js';

const NOW = new Date('2026-09-19T00:00:00Z');

describe('buildConditions', () => {
  it('splits plain English into parsed conditions', () => {
    const conditions = buildConditions('under £1,600 a month and has a garden', NOW);
    expect(conditions).toHaveLength(2);
    expect(conditions[0]).toMatchObject({ mode: 'exact', field: 'amount', op: 'lt', value: 1600, period: 'month', requirement: 'required' });
    expect(conditions[1]).toMatchObject({ mode: 'semantic', ask: 'Does this has a garden?', expect: true });
  });

  it('marks conditions containing preferred as preferred', () => {
    const conditions = buildConditions(['Balcony preferred', 'One bedroom'], NOW);
    expect(conditions[0]!.requirement).toBe('preferred');
    expect(conditions[1]!.requirement).toBe('required');
  });

  it('keeps positional condition ids so fixtures keep lining up', () => {
    const conditions = buildConditions('one bedroom and balcony preferred', NOW);
    expect(conditions.map(c => c.id)).toEqual(['c0', 'c1']);
  });

  it('returns no conditions for blank input', () => {
    expect(buildConditions('', NOW)).toEqual([]);
    expect(buildConditions('   ', NOW)).toEqual([]);
  });

  it('accepts a saved list of conditions without re-splitting', () => {
    const conditions = buildConditions(['Posted within the last 2 days', 'Under ₹30,000 per month'], NOW);
    expect(conditions.map(c => c.raw)).toEqual(['Posted within the last 2 days', 'Under ₹30,000 per month']);
    expect(conditions[1]).toMatchObject({ mode: 'exact', field: 'amount', op: 'lt' });
  });
});
