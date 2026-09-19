import { describe, expect, it } from 'vitest';
import { parseCondition, splitConditions } from '../src/parser.js';

const NOW = new Date('2026-09-19T00:00:00Z');

describe('amount grammar', () => {
  it.each([
    ["under £1,600 a month", "amount", "lt", 1600, "month"],
    ["below $900 pcm", "amount", "lt", 900, "month"],
    ["less than €40 a week", "amount", "lt", 40, "week"],
    ["cheaper than ₹500 an hour", "amount", "lt", 500, "hour"],
    ["max £2,000 monthly", "amount", "lte", 2000, "month"],
    ["maximum $75k pa", "amount", "lte", 75000, "year"],
    ["up to £750 pw", "amount", "lte", 750, "week"],
    ["£1600 or less pcm", "amount", "lte", 1600, "month"],
    ["over £70k per annum", "amount", "gt", 70000, "year"],
    ["above $20 an hour", "amount", "gt", 20, "hour"],
    ["more than €500 a week", "amount", "gt", 500, "week"],
    ["at least £55k yearly", "amount", "gte", 55000, "year"],
    ["minimum ₹1000 per day", "amount", "gte", 1000, undefined],
    ["from £35k pa", "amount", "gte", 35000, "year"],
    ["between £1,200 and £1,800 pcm", "amount", "between", [1200, 1800], "month"],
    ["£1200–£1800 a month", "amount", "between", [1200, 1800], "month"],
    ["$10-$15 an hour", "amount", "between", [10, 15], "hour"],
    ["between 50 and 90 a week", "amount", "between", [50, 90], "week"],
    ["under 1.5k monthly", "amount", "lt", 1500, "month"],
    ["at least 2,500 per annum", "amount", "gte", 2500, "year"],
  ])('%s', (raw, field, op, value, period) => {
    const parsed = parseCondition(raw as string, NOW);
    expect(parsed).toMatchObject({ mode: 'exact', field, op, value, ...(period ? { period } : {}) });
  });
});

describe('date grammar', () => {
  it.each([
    ["posted in the last 3 days", "publishedAt", "gte"],
    ["published within the past 2 weeks", "publishedAt", "gte"],
    ["newer than 10 days", "publishedAt", "gte"],
    ["posted in the last a week", "publishedAt", "gte"],
    ["published in the last a fortnight", "publishedAt", "gte"],
    ["closes after 2030-01-01", "deadline", "gt"],
    ["at least 2 weeks to apply", "deadline", "gte"],
    ["more than 5 days away", "deadline", "gte"],
    ["at least a week to apply", "deadline", "gte"],
    ["more than a fortnight away", "deadline", "gte"],
  ])('%s', (raw, field, op) => {
    expect(parseCondition(raw as string, NOW)).toMatchObject({ mode: 'exact', field, op });
  });
});

describe('semantic fall-through', () => {
  it.each([
    ["allows cats"],
    ["has a garden"],
    ["remote work"],
    ["visa sponsorship"],
    ["quiet street"],
    ["near a park"],
    ["wheelchair accessible"],
    ["furnished"],
    ["good natural light"],
    ["flexible hours"],
    ["open source"],
    ["family friendly"],
    ["short application"],
    ["is pet friendly"],
  ])('%s', raw => expect(parseCondition(raw, NOW)).toMatchObject({ mode: 'semantic', expect: true }));
  it.each([
    ["not a basement flat"],
    ["no shared bathroom"],
    ["not commission only"],
    ["no night shifts"],
    ["no agency"],
    ["not furnished"],
  ])('%s', raw => expect(parseCondition(raw, NOW)).toMatchObject({ mode: 'semantic', expect: false }));
});

describe('ambiguous numeric fall-through', () => {
  it.each([
    ["under 5 miles from the station"],
    ["fewer than 20 applicants"],
    ["team of 10 people"],
    ["3 bedrooms"],
    ["rated over 4 stars"],
    ["within 2 stops"],
    ["less than 30 minutes away"],
    ["supports 5 users"],
    ["more than 100 reviews"],
    ["under 2 years old"],
    ["at least 3 references"],
    ["20 hours of training"],
    ["fits 4 people"],
    ["has 2 bathrooms"],
    ["less than 5 steps"],
  ])('%s', raw => expect(parseCondition(raw, NOW)).toMatchObject({ mode: 'ambiguous' }));
});

describe('splitting', () => {
  it('splits conjunctions, semicolons, comma-and, and newlines but not or', () => {
    expect(splitConditions('allows cats and has a garden; remote or hybrid, and under £1600\nnot a basement')).toEqual([
      'allows cats', 'has a garden', 'remote or hybrid', 'under £1600', 'not a basement'
    ]);
  });
});
