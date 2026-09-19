import type { ExactOp, Parsed, Period } from './types.js';

const CURRENCY = String.raw`(?:£|\$|€|₹)?\s*`;
const NUMBER = String.raw`(\d+(?:[.,]\d+)?\s*[kK]?)`;
const RANGE_DASH = '[–—-]';

function numberOf(value: string): number {
  const clean = value.replace(/,/g, '').replace(/\s/g, '');
  return /k$/i.test(clean) ? Number.parseFloat(clean) * 1_000 : Number.parseFloat(clean);
}

function periodOf(text: string): Period | undefined {
  if (/\b(?:an?\s+hour|hourly|per\s+hour)\b/i.test(text)) return 'hour';
  if (/\b(?:a\s+week|weekly|per\s+week|pw)\b/i.test(text)) return 'week';
  if (/\b(?:a\s+month|monthly|per\s+month|pcm)\b/i.test(text)) return 'month';
  if (/\b(?:a\s+year|yearly|annual(?:ly)?|per\s+year|pa|per\s+annum)\b/i.test(text)) return 'year';
  if (/\b(?:one[- ]off|once|total)\b/i.test(text)) return 'once';
  return undefined;
}

function exact(raw: string, op: ExactOp, value: number | number[], period?: Period): Parsed {
  return { mode: 'exact', raw, field: 'amount', op, value, ...(period ? { period } : {}) };
}

function parseAmount(raw: string): Parsed | undefined {
  const period = periodOf(raw);
  // A bare number plus comparative language is not an amount. It must carry
  // a currency marker or a recognized payment period.
  if (!period && !/[£$€₹]/.test(raw)) return undefined;
  let match = raw.match(new RegExp(String.raw`\bbetween\s+${CURRENCY}${NUMBER}\s+and\s+${CURRENCY}${NUMBER}`, 'i'));
  if (match?.[1] && match[2]) return exact(raw, 'between', [numberOf(match[1]), numberOf(match[2])], period);

  match = raw.match(new RegExp(String.raw`${CURRENCY}${NUMBER}\s*${RANGE_DASH}\s*${CURRENCY}${NUMBER}`, 'i'));
  if (match?.[1] && match[2]) return exact(raw, 'between', [numberOf(match[1]), numberOf(match[2])], period);

  const forms: Array<[ExactOp, RegExp]> = [
    ['lte', new RegExp(String.raw`\b(?:max(?:imum)?|up\s+to)\s+${CURRENCY}${NUMBER}`, 'i')],
    ['lte', new RegExp(String.raw`${CURRENCY}${NUMBER}\s+or\s+less\b`, 'i')],
    ['lt', new RegExp(String.raw`\b(?:under|below|less\s+than|cheaper\s+than)\s+${CURRENCY}${NUMBER}`, 'i')],
    ['gte', new RegExp(String.raw`\b(?:at\s+least|minimum|min)\s+${CURRENCY}${NUMBER}`, 'i')],
    ['gte', new RegExp(String.raw`\bfrom\s+${CURRENCY}${NUMBER}`, 'i')],
    ['gt', new RegExp(String.raw`\b(?:over|above|more\s+than)\s+${CURRENCY}${NUMBER}`, 'i')],
  ];
  for (const [op, pattern] of forms) {
    match = raw.match(pattern);
    if (match?.[1]) return exact(raw, op, numberOf(match[1]), period);
  }
  return undefined;
}

const DAY = 86_400_000;
function durationMs(count: number, unit: string): number {
  if (/week/i.test(unit)) return count * 7 * DAY;
  if (/month/i.test(unit)) return count * 30 * DAY;
  return count * DAY;
}

function parseDate(raw: string, now: Date): Parsed | undefined {
  let match = raw.match(/\b(?:posted|published)\s+(?:in|within)\s+the\s+(?:last|past)\s+(\d+)\s+(day|days|week|weeks|month|months)\b/i)
    ?? raw.match(/\b(?:posted|published)\s+in\s+the\s+last\s+(a\s+week|a\s+fortnight)\b/i)
    ?? raw.match(/\bnewer\s+than\s+(\d+)\s+(day|days|week|weeks|month|months)\b/i);
  if (match) {
    const phrase = match[1] ?? '';
    const count = /fortnight/i.test(phrase) ? 14 : /a\s+week/i.test(phrase) ? 1 : Number(phrase);
    const unit = /fortnight/i.test(phrase) ? 'day' : /a\s+week/i.test(phrase) ? 'week' : (match[2] ?? 'day');
    return { mode: 'exact', raw, field: 'publishedAt', op: 'gte', value: now.getTime() - durationMs(count, unit) };
  }

  match = raw.match(/\b(?:at\s+least|more\s+than)\s+(\d+)\s+(day|days|week|weeks|month|months)\s+(?:to\s+apply|away)\b/i)
    ?? raw.match(/\b(?:at\s+least|more\s+than)\s+(a\s+week|a\s+fortnight)\s+(?:to\s+apply|away)\b/i);
  if (match) {
    const phrase = match[1] ?? '';
    const count = /fortnight/i.test(phrase) ? 14 : /a\s+week/i.test(phrase) ? 1 : Number(phrase);
    const unit = /fortnight/i.test(phrase) ? 'day' : /a\s+week/i.test(phrase) ? 'week' : (match[2] ?? 'day');
    return { mode: 'exact', raw, field: 'deadline', op: 'gte', value: now.getTime() + durationMs(count, unit) };
  }

  match = raw.match(/\bcloses?\s+after\s+(.+)$/i);
  if (match?.[1]) {
    const timestamp = Date.parse(match[1]);
    if (!Number.isNaN(timestamp)) return { mode: 'exact', raw, field: 'deadline', op: 'gt', value: timestamp };
  }
  return undefined;
}

function semantic(raw: string): Parsed {
  const cleaned = raw.trim().replace(/[?.!]+$/, '');
  const negated = cleaned.match(/^(?:not|no)\s+(.+)$/i);
  if (negated?.[1]) return { mode: 'semantic', raw, ask: `Is this ${negated[1]}?`, expect: false };
  return { mode: 'semantic', raw, ask: /^is\b/i.test(cleaned) ? `${cleaned}?` : `Does this ${cleaned}?`, expect: true };
}

export function splitConditions(input: string): string[] {
  return input.split(/\s*,\s+and\s+|\s+and\s+|\s*;\s*|\r?\n+/i).map(value => value.trim()).filter(Boolean);
}

export function parseCondition(rawInput: string, now = new Date()): Parsed {
  const raw = rawInput.trim();
  const parsed = parseDate(raw, now) ?? parseAmount(raw);
  if (parsed) return parsed;
  if (/\d/.test(raw)) return { mode: 'ambiguous', raw, reason: "Found a number but nothing to compare it against. Checking this as text." };
  return semantic(raw);
}

export function parseConditions(input: string, now = new Date()): Parsed[] {
  return splitConditions(input).map(raw => parseCondition(raw, now));
}
