# Cuttings

Cuttings is a small web app for saved searches. Write the conditions once, then open the app later to catch up on new items.

Use Cuttings when you repeatedly check flats, jobs, grants, tenders, used products, or other feeds and want to see:

- **Strong matches**: all required checks passed.
- **Maybes**: a preferred check missed, information is missing, or the answer is uncertain.
- **Rejects**: a required check failed. Rejects stay visible so you can correct the search.

Searches are saved in your browser, so they survive a refresh. One live source (Hacker News) is included, and Jev can check meaning questions in shadow mode.

**Live app:** https://dcr6174.github.io/cuttings/

## See the app

Mobile:

![Cuttings mobile digest](docs/phase3-mobile.png)

Desktop:

![Cuttings desktop digest](docs/phase3-desktop.png)

## Core mode and Jev mode

### Core mode

Core mode needs no API key. It uses deterministic code for facts such as:

- price or amount
- published date
- deadline
- known fields

If the app cannot safely compare a value, it says so. It does not guess.

### Jev shadow mode

Jev can answer narrow meaning questions such as "Does this flat mention a balcony?"

In Phase 3, Jev runs in **shadow mode**:

1. Ranking always stays keyless. Jev answers never change strong, maybe, or reject.
2. Every Jev answer is stored as replayable provenance: the question, criteria, threshold, model version, raw answer, confidence, and time.
3. You label answers as correct or wrong. The app then shows how often Jev agrees with you, bucketed by confidence, and lets you replay the accept line at any threshold.

This is how trust is earned before Jev is allowed to influence ranking in a later phase.

The TypeSafe API key is typed into the Jev tab and is kept for that browser tab only. It is never saved, synced, logged, or committed.

## What you need

- Node.js 22 or newer
- npm, which is included with Node.js
- Git, only if you want to clone the repository

Check Node and npm:

```sh
node --version
npm --version
```

## Install and run

```sh
git clone https://github.com/dcr6174/cuttings.git
cd cuttings
npm install
npm run dev
```

Vite prints a local address, normally `http://localhost:5173/cuttings/`. Open it in your browser.

To stop the app, press `Ctrl+C` in the terminal.

## First working example

1. Run the app.
2. Open the **Search** tab and choose **Flats near Indiranagar**. It uses the offline sample feed.
3. Keep these conditions:

```text
Under ₹30,000 per month
Posted within the last 2 days
One bedroom
Balcony preferred
```

4. Open **Digest**.

Expected sample result:

```text
Strong matches: 1
Maybes: 2
Rejects: 1
```

The strong match is **Sunlit one-bedroom near Indiranagar** at **₹28,000 / month**.

## Create or edit a search

1. Open **Search**.
2. Pick a saved search, or press **New**.
3. Choose a source: the offline sample feed or the live Hacker News source. For the live source, type the words to search for.
4. Edit a condition directly in its text field.
5. Use **Add a condition** to add another rule. Use **×** to remove one.
6. Read the label above each rule:
   - **Exact** means local code can check it.
   - **Meaning** means a semantic evaluator is needed.
   - **Needs attention** means the parser found something unclear.
7. Open **Digest** to inspect strong matches and maybes.
8. Open **Rejects** to inspect failed rules. Use **This should be a maybe** to mark a result for correction.

Every change is saved in this browser automatically. Refresh the page and the searches are still there.

## The live Hacker News source

The app includes one legitimate live source: the official Hacker News API provided by Algolia (`https://hn.algolia.com/api`). It is public, needs no key, and allows browser access.

- Stories are converted into the small `Item` shape in `src/types.ts`.
- The original story URL and "Hacker News" source name are preserved.
- Fields the source does not supply, such as price, stay empty. Exact price checks then report "could not check" and the item becomes a maybe. The app never invents data.

## How catch-up works

Cuttings is local-first:

1. A saved search keeps its source, query, and conditions in your browser.
2. When you open it, the source adapter requests current items.
3. Exact checks run first.
4. Required exact failures are rejected before any semantic work.
5. Remaining results become strong matches, maybes, or rejects.

Cuttings is not an always-on background service yet. It catches up when you open it.

## Use Jev shadow mode

1. Open the **Jev** tab.
2. Paste your TypeSafe API key. It stays in the tab only.
3. Press **Run shadow check**. Jev answers the search's meaning questions for up to 10 items, one batched API call per item.
4. Mark each answer **Correct** or **Wrong**.
5. Watch the calibration summary: agreement percentage and accuracy by confidence bucket.
6. Move the replay threshold to see how many stored answers would be accepted at each level.
7. Use **Download provenance JSON** to keep the full replayable record.

The keyless digest keeps working even if the shadow run fails.

## Add a legitimate source adapter

Do not add fragile portal scraping to the official project. Use a feed or API you are allowed to use.

For each adapter:

1. Confirm that the source permits API or feed access.
2. Document the source URL, permission or terms, authentication, and rate limits.
3. Convert source records into the small `Item` shape in `src/types.ts`.
4. Preserve the original item URL and source name.
5. Store only fields the source supplies. Do not invent missing amounts or dates.
6. Add saved fixtures for offline tests.
7. Test pagination, duplicate IDs, missing fields, rate limits, and errors.
8. Run the full check before opening a pull request.

## Tests and production build

Run everything:

```sh
npm run check
```

This runs TypeScript checks, 97 tests, and a production build.

Run one part:

```sh
npm run typecheck
npm test
npm run build
```

A successful build creates `dist/`.

## No API key behavior

You do not need a key to run the app, parser, exact engine, tests, sources, or sample UI.

Without Jev:

- exact conditions still work
- semantic conditions cannot be confirmed by a live model
- uncertain or unavailable semantic answers must remain **Maybe**
- tests use the deterministic fixture evaluator

Do not put API keys in the repository, source code, screenshots, issues, or chat.

## Deploy

The public app deploys with GitHub Pages and GitHub Actions.

For this repository:

1. Open **Settings → Pages**.
2. Set **Source** to **GitHub Actions**.
3. Push to `main`.
4. Open **Actions → Deploy web app** and wait for a green run.
5. Open https://dcr6174.github.io/cuttings/.

The workflow is `.github/workflows/deploy.yml`. It installs locked dependencies, runs all checks, builds `dist/`, and deploys that folder.

## Common problems

### `node: command not found`

Install Node.js 22 or newer, then open a new terminal.

### `npm install` reports a dependency conflict

Make sure you pulled the latest `package.json` and `package-lock.json`, then run:

```sh
rm -rf node_modules
npm install
```

Do not use `--force` as the first fix.

### The page is blank or assets return 404

Run `npm run build`. The Vite base path must remain `/cuttings/` in `vite.config.ts` for this GitHub Pages URL.

### GitHub Actions fails in `configure-pages`

Enable Pages first: **Settings → Pages → Source → GitHub Actions**. The workflow also requests Pages enablement for a new repository.

### A condition says "Needs attention"

Rewrite it with one clear comparison. Example: change `budget 30000` to `Under ₹30,000 per month`.

### The live source shows an error

The Hacker News API may be down or unreachable. The sample feed keeps working offline. Your searches and labels are not lost.

### Shadow mode fails with a 401

The TypeSafe API key is wrong or expired. Enter a fresh key in the Jev tab. The keyless digest is unaffected.

## Project map

- `src/App.tsx`: mobile-first UI, digest, search editor, rejects, Jev tab
- `src/style.css`: editorial layout, motion, and reduced-motion support
- `src/parser.ts`: condition parser
- `src/engine.ts`: deterministic checks and ranking
- `src/fixture-evaluator.ts`: keyless semantic test evaluator
- `src/jev.ts`: TypeSafe Jev shadow evaluator
- `src/calibration.ts`: confidence calibration and threshold replay
- `src/sources.ts`: source adapters, including live Hacker News
- `src/sample-feed.ts`: offline sample flats feed and fixtures
- `src/store.ts`: browser persistence for searches, provenance, and labels
- `docs/conditions.md`: parser and UI contract
- `test/`: parser fixtures plus engine, source, store, Jev, and calibration tests

## Current status

Phase 3 working web app. Searches persist in the browser, one legitimate live source is included, and Jev runs in shadow mode with replayable provenance and calibration. Jev answers do not influence ranking yet. Cuttings is not an always-on background service.
