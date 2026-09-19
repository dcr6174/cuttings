import type { Item, SemanticAnswers, SemanticEvaluator, SemanticQuestion } from './types.js';

export class FixtureEvaluator implements SemanticEvaluator {
  constructor(private readonly fixtures: Record<string, SemanticAnswers>) {}
  async evaluate(item: Item, questions: readonly SemanticQuestion[]): Promise<SemanticAnswers> {
    const row = this.fixtures[item.id] ?? {};
    return Object.fromEntries(questions.map(question => [question.id, row[question.id] ?? null]));
  }
}
