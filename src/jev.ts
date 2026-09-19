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

// The proxy (worker/proxy.ts) accepts at most 4 boolean questions per call, so
// larger searches are split into batches and merged back together.
export const MAX_QUESTIONS_PER_REQUEST = 4;

// TypeSafe Jev evaluator. Contract verified at https://docs.typesafe.ai/api:
// POST /v1/systemone, Bearer key, { state, model, questions } in, one typed
// answer per question out. A noul answer is the probability of "yes" on 0..1.
// From the browser the evaluator talks to the Cuttings proxy (baseUrl), which
// holds the key server-side; no key is sent from the browser then.
export class JevEvaluator implements SemanticEvaluator {
  readonly version: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchFn: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxRetries: number;
  private readonly keyless: boolean;

  constructor(private readonly apiKey: string, options: JevOptions = {}) {
    this.model = options.model ?? 'jev-latest';
    this.baseUrl = (options.baseUrl ?? 'https://api.typesafe.ai').replace(/\/+$/, '');
    this.fetchFn = options.fetchFn ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
    this.sleep = options.sleep ?? ((ms: number) => new Promise(resolve => setTimeout(resolve, ms)));
    this.maxRetries = options.maxRetries ?? 1;
    this.keyless = options.baseUrl !== undefined;
    this.version = `jev:${this.model}`;
  }

  async evaluate(item: Item, questions: readonly SemanticQuestion[], _context: EvaluationContext): Promise<SemanticJudgments> {
    if (!this.apiKey && !this.keyless) throw new JevError('A TypeSafe API key or a proxy URL is required for Jev mode.');
    if (questions.length === 0) return {};
    const answers: Record<string, JevNoulAnswer> = {};
    for (let start = 0; start < questions.length; start += MAX_QUESTIONS_PER_REQUEST) {
      const batch = questions.slice(start, start + MAX_QUESTIONS_PER_REQUEST);
      const response = await this.request({
        state: { title: item.title, source: item.source, url: item.url, text: item.text },
        model: this.model,
        questions: Object.fromEntries(batch.map(question => [question.id, {
          type: 'noul',
          instructions: question.ask,
          criteria: {
            true: question.criteria,
            false: `The item does not satisfy: ${question.criteria}`,
          },
        }])),
      });
      Object.assign(answers, response.answers);
    }
    return Object.fromEntries(questions.map(question => {
      const raw = answers[question.id]?.noul;
      const p = typeof raw === 'number' && Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0.5;
      const result = p >= 0.5;
      return [question.id, { result, confidence: result ? p : 1 - p, evaluatorVersion: this.version }];
    }));
  }

  private async request(body: unknown): Promise<JevResponse> {
    let attempt = 0;
    for (;;) {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;
      const response = await this.fetchFn(`${this.baseUrl}/v1/systemone`, {
        method: 'POST',
        headers,
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
