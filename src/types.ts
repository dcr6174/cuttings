export type Period = 'hour' | 'week' | 'month' | 'year' | 'once';
export type ExactField = 'amount' | 'publishedAt' | 'deadline';
export type ExactOp = 'lt' | 'lte' | 'gt' | 'gte' | 'between';

export type Parsed =
  | { mode: 'exact'; raw: string; field: ExactField; op: ExactOp; value: number | number[]; period?: Period }
  | { mode: 'semantic'; raw: string; ask: string; expect: boolean }
  | { mode: 'ambiguous'; raw: string; reason: string };

export type Requirement = 'required' | 'preferred';
export type Condition = Parsed & { id: string; requirement: Requirement };

export interface Amount { value: number; period?: Period; currency?: string }
export interface Item {
  id: string;
  title: string;
  source: string;
  url: string;
  text: string;
  amount?: Amount;
  publishedAt?: string;
  deadline?: string;
}

export type Check =
  | { status: 'pass' | 'fail'; condition: Condition; actual: number | string }
  | { status: 'could-not-check'; condition: Condition; reason: string };

export interface SemanticQuestion { id: string; ask: string; expect: boolean }
export type SemanticAnswers = Record<string, boolean | null>;
export interface SemanticEvaluator {
  evaluate(item: Item, questions: readonly SemanticQuestion[]): Promise<SemanticAnswers>;
}
