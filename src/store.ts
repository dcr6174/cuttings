import type { EvaluationProvenance } from './types.js';

export interface SavedSearch {
  id: string;
  name: string;
  sourceId: string;
  query: string;
  conditions: string[];
  createdAt: string;
  updatedAt: string;
}

export type StoredProvenance = EvaluationProvenance & { searchId: string; itemId: string; at: string };

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const SEARCHES_KEY = 'cuttings:v1:searches';
const PROVENANCE_KEY = 'cuttings:v1:provenance';
const LABELS_KEY = 'cuttings:v1:labels';
const PROVENANCE_CAP = 250;

export function defaultStorage(): StorageLike | undefined {
  try {
    return typeof globalThis.localStorage === 'object' ? globalThis.localStorage : undefined;
  } catch {
    return undefined;
  }
}

function isSavedSearch(value: unknown): value is SavedSearch {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate['id'] === 'string'
    && typeof candidate['name'] === 'string'
    && typeof candidate['sourceId'] === 'string'
    && typeof candidate['query'] === 'string'
    && Array.isArray(candidate['conditions'])
    && (candidate['conditions'] as unknown[]).every(c => typeof c === 'string')
    && typeof candidate['createdAt'] === 'string'
    && typeof candidate['updatedAt'] === 'string';
}

export function serializeSearches(searches: readonly SavedSearch[]): string {
  return JSON.stringify(searches);
}

export function deserializeSearches(json: string | null): SavedSearch[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSavedSearch);
  } catch {
    return [];
  }
}

export function loadSearches(storage: StorageLike | undefined = defaultStorage()): SavedSearch[] {
  return deserializeSearches(storage?.getItem(SEARCHES_KEY) ?? null);
}

export function hasSavedSearchState(storage: StorageLike | undefined = defaultStorage()): boolean {
  try {
    return storage?.getItem(SEARCHES_KEY) !== null && storage !== undefined;
  } catch {
    return false;
  }
}

export function saveSearches(searches: readonly SavedSearch[], storage: StorageLike | undefined = defaultStorage()): void {
  try {
    storage?.setItem(SEARCHES_KEY, serializeSearches(searches));
  } catch {
    // Storage full or blocked: the app keeps working in memory.
  }
}

export function seedSearches(now = new Date()): SavedSearch[] {
  const at = now.toISOString();
  return [
    {
      id: 'search-flats',
      name: 'Flats near Indiranagar',
      sourceId: 'sample-flats',
      query: '',
      conditions: ['Under ₹30,000 per month', 'Posted within the last 2 days', 'One bedroom', 'Balcony preferred'],
      createdAt: at,
      updatedAt: at,
    },
    {
      id: 'search-hn',
      name: 'Hacker News: AI',
      sourceId: 'hackernews',
      query: 'AI',
      conditions: ['Posted within the last 2 days'],
      createdAt: at,
      updatedAt: at,
    },
  ];
}

function isStoredProvenance(value: unknown): value is StoredProvenance {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate['searchId'] === 'string'
    && typeof candidate['itemId'] === 'string'
    && typeof candidate['conditionId'] === 'string'
    && typeof candidate['at'] === 'string'
    && typeof candidate['confidence'] === 'number';
}

export function loadProvenance(storage: StorageLike | undefined = defaultStorage()): StoredProvenance[] {
  try {
    const raw = storage?.getItem(PROVENANCE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredProvenance);
  } catch {
    return [];
  }
}

export function appendProvenance(records: readonly StoredProvenance[], storage: StorageLike | undefined = defaultStorage()): StoredProvenance[] {
  const next = [...loadProvenance(storage), ...records].slice(-PROVENANCE_CAP);
  try {
    storage?.setItem(PROVENANCE_KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked: provenance still lives in memory for this session.
  }
  return next;
}

export function loadLabels(storage: StorageLike | undefined = defaultStorage()): Record<string, boolean> {
  try {
    const raw = storage?.getItem(LABELS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed as Record<string, unknown>).filter(([, v]) => typeof v === 'boolean')) as Record<string, boolean>;
  } catch {
    return {};
  }
}

export function saveLabels(labels: Record<string, boolean>, storage: StorageLike | undefined = defaultStorage()): void {
  try {
    storage?.setItem(LABELS_KEY, JSON.stringify(labels));
  } catch {
    // Storage full or blocked: labels keep working in memory.
  }
}
