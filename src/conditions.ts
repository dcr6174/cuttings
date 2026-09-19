import { parseCondition, splitConditions } from './parser.js';
import type { Condition, Requirement } from './types.js';

// Shared condition assembly for saved searches and one-off Search now runs.
// A string is split into separate conditions; a saved list is used as is.
// Requirement detection and positional ids match the original saved-search
// behaviour, so fixtures and provenance keep lining up.
export function buildConditions(input: string | readonly string[], now = new Date()): Condition[] {
  const raws = typeof input === 'string' ? splitConditions(input) : input;
  return raws.map((raw, i) => {
    const requirement: Requirement = raw.toLowerCase().includes('preferred') ? 'preferred' : 'required';
    return { ...parseCondition(raw, now), id: `c${i}`, requirement };
  });
}
