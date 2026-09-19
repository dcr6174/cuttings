import type { EvaluationContext, Item, SemanticEvaluator, SemanticJudgment, SemanticJudgments, SemanticQuestion } from './types.js';

export type FixtureLabel = boolean | null | { result: boolean | null; confidence?: number };
export class FixtureEvaluator implements SemanticEvaluator {
  readonly version = 'fixture:v1';
  constructor(private readonly fixtures: Record<string, Record<string, FixtureLabel>>) {}
  async evaluate(item: Item, questions: readonly SemanticQuestion[], _context: EvaluationContext): Promise<SemanticJudgments> {
    const row = this.fixtures[item.id] ?? {};
    return Object.fromEntries(questions.map(question => {
      const label = row[question.id];
      const judgment: SemanticJudgment = typeof label === 'object' && label !== null
        ? { result: label.result, confidence: label.confidence ?? 1, evaluatorVersion: this.version }
        : { result: label ?? null, confidence: label === undefined || label === null ? 0 : 1, evaluatorVersion: this.version };
      return [question.id, judgment];
    }));
  }
}
