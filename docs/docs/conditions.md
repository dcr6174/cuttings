# Conditions contract

Cuttings has exactly three comparable fields: `amount`, `publishedAt`, and `deadline`. The parser answers one question: does a sentence resolve safely to one of those fields? If not, it is semantic. Falling through is normal.

## Output

```ts
type Parsed =
  | { mode: 'exact'; raw: string; field: 'amount'|'publishedAt'|'deadline';
      op: 'lt'|'lte'|'gt'|'gte'|'between'; value: number|number[];
      period?: 'hour'|'week'|'month'|'year'|'once' }
  | { mode: 'semantic'; raw: string; ask: string; expect: boolean }
  | { mode: 'ambiguous'; raw: string; reason: string };
```

## Split before parsing

Split on ` and `, `;`, `, and `, and newlines. Never split on ` or `. Disjunction belongs inside one condition. Decomposition matters: `Allows cats and has a garden` becomes two semantic checks.

## Exact grammar

Amount:

- `lt` / `lte`: under, below, less than, cheaper than, max, up to, `£X or less`
- `gt` / `gte`: over, above, more than, at least, minimum, `from £X`
- `between`: `between X and Y`, `£X–£Y`
- period: per hour, week, month, year, or once, including common forms such as pcm, pw, pa, monthly and per annum

Adapters must provide `amount.period`. The engine normalizes recurring periods before comparison. If either period is unknown, the condition does not run and reports `could-not-check`. One-off and recurring amounts are never converted.

Dates:

- `publishedAt`: posted or published in the last N days/weeks/months; newer than N days
- `deadline`: closes after DATE; at least or more than N days/weeks/months to apply or away
- `a week` and `a fortnight` are accepted

Relative dates are resolved when the condition is parsed. Months are thirty days in v1 and this is explicit rather than calendar-sensitive.

## Semantic and ambiguous conditions

A semantic condition is phrased as a positive question. Negation is represented by `expect: false`, so `Not a basement flat` becomes `Is this a basement flat?` with `expect: false`.

A number that binds to none of the three fields is `ambiguous`, for example `under 5 miles from the station`. The UI explains: `Found a number but nothing to compare it against. Checking this as text.` It renders in the semantic lane, visibly flagged.

## UI contract

- Exact: editable controls such as `[under] [1600] [£ per month]`, plus `check as text instead`.
- Semantic: the question as text.
- Ambiguous: semantic presentation with the reason and an option to `check as a number`.

The user always sees which lane a condition is in.

## Pipeline

1. Split conjunctions.
2. Parse each condition.
3. Run exact checks in code, cheapest first. Short-circuit on a failed required condition.
4. Send all remaining semantic questions for one item to the evaluator in one batched call.
5. Keep three outcomes: `strong`, `maybe`, `reject`. Missing comparable data produces `maybe`, never a guessed pass or silent deletion.

The `SemanticEvaluator.evaluate(item, questions[])` interface makes batching part of the contract. Core mode uses exact checks and the fixture evaluator. Jev mode can later implement the same interface.

## Scope

No NLP library, model fallback, or learned parser. The parser is deliberately regex-only and semantic by default. Fixtures include both accepted phrases and deliberate fall-through cases.
