import type { Check, Condition, Item, Period, SemanticEvaluator, SemanticQuestion } from './types.js';

const FACTOR: Record<Period, number> = { hour: 1, week: 24 * 7, month: 24 * 365.25 / 12, year: 24 * 365.25, once: 1 };
function compare(actual: number, op: string, expected: number | number[]): boolean {
  if (op === 'between' && Array.isArray(expected)) return actual >= expected[0]! && actual <= expected[1]!;
  if (Array.isArray(expected)) return false;
  if (op === 'lt') return actual < expected;
  if (op === 'lte') return actual <= expected;
  if (op === 'gt') return actual > expected;
  return actual >= expected;
}

export function runExact(item: Item, condition: Condition): Check {
  if (condition.mode !== 'exact') throw new Error('runExact requires an exact condition');
  if (condition.field === 'amount') {
    if (!item.amount) return { status: 'could-not-check', condition, reason: 'Item has no amount.' };
    if (!item.amount.period || !condition.period) return { status: 'could-not-check', condition, reason: 'Amount period is unknown. No conversion was guessed.' };
    if (item.amount.period === 'once' || condition.period === 'once') {
      if (item.amount.period !== condition.period) return { status: 'could-not-check', condition, reason: 'One-off and recurring amounts are not comparable.' };
    }
    const normalized = item.amount.value / FACTOR[item.amount.period] * FACTOR[condition.period];
    return { status: compare(normalized, condition.op, condition.value) ? 'pass' : 'fail', condition, actual: normalized };
  }
  const raw = item[condition.field];
  if (!raw) return { status: 'could-not-check', condition, reason: `Item has no ${condition.field}.` };
  const timestamp = Date.parse(raw);
  if (Number.isNaN(timestamp)) return { status: 'could-not-check', condition, reason: `Item has an invalid ${condition.field}.` };
  return { status: compare(timestamp, condition.op, condition.value) ? 'pass' : 'fail', condition, actual: raw };
}

export type Evaluation = { outcome: 'strong' | 'maybe' | 'reject'; checks: Check[]; semantic: Record<string, boolean | null> };
export async function evaluateItem(item: Item, conditions: readonly Condition[], evaluator: SemanticEvaluator): Promise<Evaluation> {
  const exacts = conditions.filter(c => c.mode === 'exact');
  const checks: Check[] = [];
  for (const condition of exacts) {
    const check = runExact(item, condition);
    checks.push(check);
    if (condition.requirement === 'required' && check.status === 'fail') return { outcome: 'reject', checks, semantic: {} };
  }
  const semanticConditions = conditions.filter(c => c.mode !== 'exact');
  const questions: SemanticQuestion[] = semanticConditions.map(c => c.mode === 'semantic'
    ? { id: c.id, ask: c.ask, expect: c.expect }
    : { id: c.id, ask: c.raw, expect: true });
  const answers = questions.length ? await evaluator.evaluate(item, questions) : {};
  for (const condition of semanticConditions) {
    if (condition.requirement !== 'required') continue;
    const answer = answers[condition.id];
    const expect = condition.mode === 'semantic' ? condition.expect : true;
    if (answer !== null && answer !== undefined && answer !== expect) return { outcome: 'reject', checks, semantic: answers };
  }
  const unknown = checks.some(c => c.status === 'could-not-check') || Object.values(answers).some(value => value === null);
  const preferredMiss = conditions.some(c => c.requirement === 'preferred' && (c.mode === 'exact'
    ? checks.find(x => x.condition.id === c.id)?.status !== 'pass'
    : answers[c.id] !== (c.mode === 'semantic' ? c.expect : true)));
  return { outcome: unknown || preferredMiss ? 'maybe' : 'strong', checks, semantic: answers };
}
