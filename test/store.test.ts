import { describe, expect, it } from 'vitest';
import {
  appendProvenance,
  deserializeSearches,
  hasSavedSearchState,
  loadLabels,
  loadProvenance,
  loadSearches,
  saveLabels,
  saveSearches,
  seedSearches,
  serializeSearches,
  type SavedSearch,
  type StorageLike,
  type StoredProvenance,
} from '../src/store.js';

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => { data[k] = v; } };
}

const sample: SavedSearch = { id: 's1', name: 'Flats', sourceId: 'sample-flats', query: '', conditions: ['Under ₹30,000 per month'], createdAt: '2026-09-19T00:00:00Z', updatedAt: '2026-09-19T00:00:00Z' };

describe('saved search persistence', () => {
  it('round-trips searches through storage', () => {
    const storage = memoryStorage();
    saveSearches([sample], storage);
    expect(loadSearches(storage)).toEqual([sample]);
  });
  it('survives corrupt JSON by returning no searches', () => {
    expect(deserializeSearches('{not json')).toEqual([]);
    expect(loadSearches(memoryStorage({ 'cuttings:v1:searches': '[{"id":1}]' }))).toEqual([]);
  });
  it('drops malformed entries but keeps valid ones', () => {
    const json = JSON.stringify([sample, { id: 7 }, null]);
    expect(deserializeSearches(json)).toEqual([sample]);
  });
  it('seeds a sample search and a live HN search', () => {
    const seeds = seedSearches();
    expect(seeds.map(s => s.sourceId).sort()).toEqual(['hackernews', 'sample-flats']);
  });
  it('serializes deterministically', () => {
    expect(deserializeSearches(serializeSearches([sample]))).toEqual([sample]);
  });
  it('distinguishes an intentionally empty saved list from first use', () => {
    expect(hasSavedSearchState(memoryStorage())).toBe(false);
    const storage = memoryStorage();
    saveSearches([], storage);
    expect(hasSavedSearchState(storage)).toBe(true);
    expect(loadSearches(storage)).toEqual([]);
  });
});

describe('provenance and labels', () => {
  const record: StoredProvenance = {
    searchId: 's1', itemId: 'i1', at: '2026-09-19T01:00:00Z', conditionId: 'c0',
    question: 'Does this mention a balcony?', criteria: 'balcony preferred',
    confidenceThreshold: 0.75, evaluatorVersion: 'jev:jev-latest', confidence: 0.9,
    result: true, acceptedResult: true, mode: 'shadow',
  };
  it('appends provenance and caps the log at 250 records', () => {
    const storage = memoryStorage();
    appendProvenance(Array.from({ length: 260 }, () => record), storage);
    expect(loadProvenance(storage)).toHaveLength(250);
  });
  it('drops malformed provenance rows', () => {
    const storage = memoryStorage({ 'cuttings:v1:provenance': JSON.stringify([record, { nope: 1 }]) });
    expect(loadProvenance(storage)).toEqual([record]);
  });
  it('round-trips human labels', () => {
    const storage = memoryStorage();
    saveLabels({ 'i1/c0': true }, storage);
    expect(loadLabels(storage)).toEqual({ 'i1/c0': true });
  });
});
