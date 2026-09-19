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

The `SemanticEvaluator.evaluate(item, questions[], context)` interface makes batching part of the contract. Each atomic question includes explicit criteria. Core mode uses exact checks and the fixture evaluator. Jev mode can later implement the same interface.

## Confidence and provenance

Every semantic decision persists replayable provenance: condition ID, atomic question, criteria, configured confidence threshold, evaluator/model version, raw result, confidence, accepted result, mode, and any human label used for calibration. A result below the threshold is accepted as `null`, which maps the item to `maybe`; uncertainty is never forced into pass or fail.

The context supports `live` and `shadow` modes plus optional human labels. Shadow mode records the same judgments and provenance without requiring a ranking decision to become a production action. This lets later evaluators be calibrated against deterministic fixtures and human labels while keeping the parser and item schema unchanged.

## Scope

No NLP library, model fallback, or learned parser. The parser is deliberately regex-only and semantic by default. Fixtures include both accepted phrases and deliberate fall-through cases.

## Phase 3 additions

### Persistence

Saved searches, shadow provenance, and human labels live in browser storage under the keys `cuttings:v1:searches`, `cuttings:v1:provenance` (capped at 250 records), and `cuttings:v1:labels`. Corrupt or malformed stored data is discarded safely, never guessed. The app works fully in memory when storage is unavailable.

### Live sources

A source adapter converts an external feed into `Item`. The first legitimate live adapter is the official Hacker News API provided by Algolia (`https://hn.algolia.com/api`, public, keyless, CORS-enabled). Adapters preserve the original URL and source name and never invent fields the source did not supply; a missing amount or date produces `could-not-check`, which maps to `maybe`.

### Shadow mode and calibration

`mode: 'shadow'` runs a second evaluator without letting it influence ranking. The keyless run always decides strong, maybe, and reject. Shadow judgments are stored as replayable provenance (question, criteria, threshold, evaluator version, raw result, confidence, accepted result, timestamp, item and search id). Human labels are collected per question and item. `summarizeCalibration` reports agreement over answered labeled records and accuracy per confidence bucket; a refused answer is never counted as right or wrong. `replayAccepted` recomputes the accept line for any threshold from the stored raw values alone, so calibration never requires calling the evaluator again.

The Jev evaluator speaks to `POST https://api.typesafe.ai/v1/systemone` with a Bearer key, model `jev-latest`, and one `noul` question per semantic condition. A noul answer is the probability of "yes"; the accepted result is `p >= 0.5`, and confidence is `max(p, 1 - p)`. The client backs off once on 429/529 and never retries other failures. The API key is held in memory for the session only and is never written to storage, logs, URLs, or the repository.
