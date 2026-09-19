import type { Item } from './types.js';
import type { FixtureLabel } from './fixture-evaluator.js';

function hoursAgo(hours: number, now = Date.now()): string {
  return new Date(now - hours * 3_600_000).toISOString();
}

// The sample feed is deliberately small and deterministic so the keyless demo
// always produces the same digest: one strong match, two maybes, one reject.
export function sampleItems(now = Date.now()): Item[] {
  return [
    {
      id: 'flat-1',
      title: 'Sunlit one-bedroom near Indiranagar',
      source: 'Sample feed',
      url: 'https://example.test/flats/1',
      text: 'Fourth-floor one-bedroom flat with a balcony, lift, and backup power. Owner-listed. Rent ₹28,000 per month.',
      amount: { value: 28_000, period: 'month', currency: 'INR' },
      publishedAt: hoursAgo(2, now),
    },
    {
      id: 'flat-2',
      title: 'Quiet 1BHK off 12th Main',
      source: 'Sample feed',
      url: 'https://example.test/flats/2',
      text: 'Recently painted, semi-furnished one-bedroom home on a low-traffic lane. Rent ₹29,500 per month.',
      amount: { value: 29_500, period: 'month', currency: 'INR' },
      publishedAt: hoursAgo(5, now),
    },
    {
      id: 'flat-3',
      title: 'Compact studio by the metro',
      source: 'Sample feed',
      url: 'https://example.test/flats/3',
      text: 'Bright studio with a separate kitchen, 900 m from the metro. Rent ₹25,000 per month.',
      amount: { value: 25_000, period: 'month', currency: 'INR' },
      publishedAt: hoursAgo(26, now),
    },
    {
      id: 'flat-4',
      title: 'Furnished one-bedroom with terrace',
      source: 'Sample feed',
      url: 'https://example.test/flats/4',
      text: 'Top-floor one-bedroom flat with terrace access and lake views. Rent ₹34,000 per month.',
      amount: { value: 34_000, period: 'month', currency: 'INR' },
      publishedAt: hoursAgo(3, now),
    },
  ];
}

// Fixture answers are keyed by the lowercase question the parser produces, so
// they keep working even when condition ids change as the search is edited.
export const SAMPLE_FIXTURES: Record<string, Record<string, FixtureLabel>> = {
  'flat-1': {
    'does this one bedroom?': { result: true, confidence: 0.97 },
    'does this balcony preferred?': { result: true, confidence: 0.9 },
  },
  'flat-2': {
    'does this one bedroom?': { result: true, confidence: 0.8 },
    'does this balcony preferred?': { result: null, confidence: 0.4 },
  },
  'flat-3': {
    'does this one bedroom?': { result: false, confidence: 0.55 },
    'does this balcony preferred?': { result: false, confidence: 0.62 },
  },
  'flat-4': {
    'does this one bedroom?': { result: true, confidence: 0.95 },
    'does this balcony preferred?': { result: true, confidence: 0.88 },
  },
};
