# Cuttings

Saved searches that catch up automatically.

Cuttings turns a short list of plain-English conditions into visible exact checks and optional semantic questions. Exact price and date rules run locally. Anything the parser cannot prove becomes a text question instead of a risky guess.

Phase 1 contains the trust-critical core:

- three-field item schema: `amount`, `publishedAt`, `deadline`
- regex-only parser with editable exact, semantic, and ambiguous states
- deterministic exact-filter engine with safe period normalization
- one batched semantic-evaluator interface per item
- keyless fixture evaluator for tests and demos
- 60+ table-driven parser fixtures

## Modes

**Core mode** runs exact amount, published-date, and deadline checks without an API key.

**Jev mode** will add semantic questions through a replaceable evaluator. It is intentionally optional, but semantic checks are unavailable without an evaluator.

## Local-first means catch-up

The v1 app is not an always-on standing search. It stores saved searches locally and catches up from the last run when opened. An always-on deployment can come later and earn the name `standing search`.

## Run

```sh
npm install
npm run check
```

## Architecture

- [`docs/conditions.md`](docs/conditions.md): parser and UI contract
- `src/parser.ts`: split and parse conditions
- `src/engine.ts`: exact checks, required short-circuiting, and result ranking
- `src/fixture-evaluator.ts`: deterministic keyless evaluator
- `test/`: table-driven fixtures and pipeline tests

Official adapters must use legitimate feeds or APIs. Every adapter will need source permission notes, rate limits, fixtures, and terms-of-service notes. Fragile portal scrapers are out of scope for official adapters.

## Design direction

The future app uses flat paper surfaces and fluid movement, not glass cards: an editorial full-width layout, strong ultramarine only for strong matches, spring promotion, weighted drawers, finger-tracking reorder, one coordinated digest settle, and reduced-motion support.

## Status

Phase 1 foundation. No live source adapter or UI yet.
