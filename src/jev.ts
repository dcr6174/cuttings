import type { EvaluationContext, Item, SemanticEvaluator, SemanticJudgments, SemanticQuestion } from './types.js';

export class JevError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'JevError';
  }
}

interface JevNoulAnswer { type?: string; noul?: number }
interface JevResponse { model?: string; answers?: Record<string, JevNoulAnswer> }

export interface JevOptions {
  baseUrl?: string;
  model?: string;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
}

// TypeSafe Jev evaluator. Contract verified at https://docs.typesafe.ai/api:
// POST /v1/systemone, Bearer key, { state, model, questions } in, one typed
// answer per question out. A noul answer is the probability of "yes" on 0..1.
export class JevEvaluator implements SemanticEvaluator {
  readonly version: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchFn: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxRetries: number;

  constructor(private readonly apiKey: string, options: JevOptions = {}) {
    this.model = options.model ?? 'jev-latest';
    this.baseUrl = (options.baseUrl ?? 'https://api.typesafe.ai').replace(/\/+$/, '');
    this.fetchFn = options.fetchFn ?? fetch;
    this.sleep = options.sleep ?? ((ms: number) => new Promise(resolve => setTimeout(resolve, ms)));
    this.maxRetries = options.maxRetries ?? 1;
    this.version = `jev:${this.model}`;
  }

  async evaluate(item: Item, questions: readonly SemanticQuestion[], _context: EvaluationContext): Promise<SemanticJudgments> {
    if (!this.apiKey) throw new JevError('A TypeSafe API key is required for Jev mode.');
    if (questions.length === 0) return {};
    const body = {
      state: { title: item.title, source: item.source, url: item.url, text: item.text },
      model: this.model,
      questions: Object.fromEntries(questions.map(question => [question.id, {
        type: 'noul',
        instructions: question.ask,
        criteria: {
          true: question.criteria,
          false: `The item does not satisfy: ${question.criteria}`,
        },
      }])),
    };
    const response = await this.request(body);
    return Object.fromEntries(questions.map(question => {
      const raw = response.answers?.[question.id]?.noul;
      const p = typeof raw === 'number' && Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0.5;
      const result = p >= 0.5;
      return [question.id, { result, confidence: result ? p : 1 - p, evaluatorVersion: this.version }];
    }));
  }

  private async request(body: unknown): Promise<JevResponse> {
    let attempt = 0;
    for (;;) {
      const response = await this.fetchFn(`${this.baseUrl}/v1/systemone`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify(body),
      });
      if (response.ok) return await response.json() as JevResponse;
      if ((response.status === 429 || response.status === 529) && attempt < this.maxRetries) {
        attempt += 1;
        await this.sleep(500 * attempt);
        continue;
      }
      const detail = (await response.text().catch(() => '')).slice(0, 200);
      throw new JevError(`Jev request failed with ${response.status}.${detail ? ` ${detail}` : ''}`, response.status);
    }
  }
}
