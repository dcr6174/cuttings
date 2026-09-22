import type { Item } from './types.js';
import { sampleItems } from './sample-feed.js';

export interface SourceAdapter {
  readonly id: string;
  readonly label: string;
  readonly kind: 'sample' | 'live';
  fetchItems(query: string, signal?: AbortSignal): Promise<Item[]>;
}

export const sampleFlatsSource: SourceAdapter = {
  id: 'sample-flats',
  label: 'Sample flats feed (offline)',
  kind: 'sample',
  async fetchItems(): Promise<Item[]> {
    return sampleItems();
  },
};

// A single HN search API hit. Only the fields Cuttings uses are mapped;
// anything the source does not supply (for example an amount) stays absent.
export interface HnHit {
  objectID: string;
  title?: string | null;
  url?: string | null;
  story_text?: string | null;
  created_at_i?: number | null;
  author?: string | null;
}

export function mapHnHit(hit: HnHit): Item | undefined {
  if (!hit.objectID || !hit.title) return undefined;
  const item: Item = {
    id: `hn-${hit.objectID}`,
    title: hit.title,
    source: 'Hacker News',
    url: hit.url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`,
    text: hit.story_text ?? '',
  };
  if (typeof hit.created_at_i === 'number') item.publishedAt = new Date(hit.created_at_i * 1_000).toISOString();
  return item;
}

// Legitimate live source: the official Hacker News API, provided by Algolia.
// Public, keyless, CORS-enabled, documented at https://hn.algolia.com/api.
export function createHackerNewsSource(fetchFn: typeof fetch = (input, init) => fetch(input, init)): SourceAdapter {
  return {
    id: 'hackernews',
    label: 'Hacker News (live)',
    kind: 'live',
    async fetchItems(query: string, signal?: AbortSignal): Promise<Item[]> {
      const params = new URLSearchParams({ query, tags: 'story', hitsPerPage: '20' });
      const response = await fetchFn(`https://hn.algolia.com/api/v1/search_by_date?${params.toString()}`, signal ? { signal } : undefined);
      if (!response.ok) throw new Error(`Hacker News API returned ${response.status}.`);
      const data = await response.json() as { hits?: HnHit[] };
      return (data.hits ?? []).map(mapHnHit).filter((item): item is Item => item !== undefined);
    },
  };
}

export const sources: Record<string, SourceAdapter> = {
  'sample-flats': sampleFlatsSource,
  hackernews: createHackerNewsSource(),
};
