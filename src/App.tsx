import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { evaluateItem, type Evaluation } from './engine';
import { splitConditions } from './parser';
import { buildConditions } from './conditions';
import { FixtureEvaluator } from './fixture-evaluator';
import { JevEvaluator } from './jev';
import { sources } from './sources';
import { SAMPLE_FIXTURES } from './sample-feed';
import { summarizeCalibration, replayAccepted } from './calibration';
import {
  appendProvenance,
  loadLabels,
  loadProvenance,
  loadSearches,
  saveLabels,
  saveSearches,
  seedSearches,
  type SavedSearch,
  type StoredProvenance,
} from './store';
import type { Amount, Condition, Item, SemanticJudgments, SemanticQuestion } from './types';

const THRESHOLD = 0.75;
const SHADOW_ITEM_CAP = 10;

/**
 * A small, dependency-free adaptation of Rare UI's animated-counter motion.
 * The value stays exact while each change settles into place visually.
 * Rare UI: https://rareui.com/components/animatedcounter
 */
function AnimatedNumber({ value, suffix = '' }: { value: number; suffix?: string }) {
  return <span key={`${value}${suffix}`} className="animated-number" aria-label={`${value}${suffix}`}>{value}{suffix}</span>;
}
// The Cuttings proxy holds the TypeSafe key as a server-side secret, so the
// browser never sees it. Self-hosters can deploy worker/proxy.ts and point
// the app at their own Worker URL.
const DEFAULT_JEV_PROXY = 'https://cuttings-jev-proxy.dcr6174.workers.dev';

function ageLabel(publishedAt: string | undefined): string {
  if (!publishedAt) return 'date unknown';
  const hours = Math.max(0, (Date.now() - Date.parse(publishedAt)) / 3_600_000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${Math.round(hours)}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
}

function formatAmount(amount: Amount | undefined): string | undefined {
  if (!amount) return undefined;
  const symbol = amount.currency === 'INR' ? '₹' : amount.currency === 'GBP' ? '£' : amount.currency === 'EUR' ? '€' : '$';
  const period = amount.period && amount.period !== 'once' ? ` / ${amount.period}` : '';
  return `${symbol}${amount.value.toLocaleString('en-IN')}${period}`;
}

function parsedKind(mode: Condition['mode']): string {
  return mode === 'exact' ? 'Exact' : mode === 'semantic' ? 'Meaning' : 'Needs attention';
}

function semanticQuestions(conditions: readonly Condition[]): SemanticQuestion[] {
  return conditions.filter(c => c.mode !== 'exact').map(c => c.mode === 'semantic'
    ? { id: c.id, ask: c.ask, expect: c.expect, criteria: c.raw }
    : { id: c.id, ask: c.raw, expect: true, criteria: c.reason });
}

function reasonData(evaluation: Evaluation, conditions: readonly Condition[]): { reasons: string[]; misses: string[] } {
  const reasons: string[] = [];
  const misses: string[] = [];
  for (const c of conditions) {
    if (c.mode === 'exact') {
      const check = evaluation.checks.find(x => x.condition.id === c.id);
      if (check?.status === 'pass') reasons.push(c.raw);
      else if (check?.status === 'fail') misses.push(`Failed: ${c.raw}`);
      else if (check?.status === 'could-not-check') misses.push(check.reason);
    } else {
      const record = evaluation.provenance.find(x => x.conditionId === c.id);
      if (!record) continue;
      const expect = c.mode === 'semantic' ? c.expect : true;
      if (record.acceptedResult === null) misses.push(`Uncertain: ${c.raw}`);
      else if (record.acceptedResult === expect) reasons.push(c.raw);
      else misses.push(`Failed: ${c.raw}`);
    }
  }
  return { reasons, misses };
}

interface Run {
  status: 'idle' | 'loading' | 'ready' | 'error';
  items: Item[];
  evaluations: Record<string, Evaluation>;
  error?: string;
  ranAt?: Date;
}

export function App() {
  const [searches, setSearches] = useState<SavedSearch[]>(() => {
    const stored = loadSearches();
    return stored.length > 0 ? stored : seedSearches();
  });
  const [selectedId, setSelectedId] = useState(() => searches[0]?.id ?? '');
  const [tab, setTab] = useState<'digest' | 'search' | 'rejects' | 'jev'>('digest');
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [showMaybe, setShowMaybe] = useState(true);
  const [corrections, setCorrections] = useState<Record<string, boolean>>({});
  const [run, setRun] = useState<Run>({ status: 'loading', items: [], evaluations: {} });
  const [proxyUrl, setProxyUrl] = useState(DEFAULT_JEV_PROXY);
  const [shadow, setShadow] = useState<{ status: 'idle' | 'running' | 'done' | 'error'; error?: string; judgments: Record<string, SemanticJudgments> }>({ status: 'idle', judgments: {} });
  const [provenance, setProvenance] = useState<StoredProvenance[]>(() => loadProvenance());
  const [labels, setLabels] = useState<Record<string, boolean>>(() => loadLabels());
  const [replayThreshold, setReplayThreshold] = useState(THRESHOLD);
  const searchEditor = useRef<HTMLElement>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickText, setQuickText] = useState('');
  const [quickSourceId, setQuickSourceId] = useState('sample-flats');
  const [quickQuery, setQuickQuery] = useState('');
  const [quickRun, setQuickRun] = useState<Run>({ status: 'idle', items: [], evaluations: {} });
  const [quickOpenId, setQuickOpenId] = useState<string | null>(null);
  const [quickSaved, setQuickSaved] = useState(false);
  const [showQuickMaybe, setShowQuickMaybe] = useState(true);
  const [showQuickRejects, setShowQuickRejects] = useState(false);

  useEffect(() => { saveSearches(searches); }, [searches]);
  useEffect(() => { saveLabels(labels); }, [labels]);

  const search = searches.find(s => s.id === selectedId) ?? searches[0];
  const conditions: Condition[] = useMemo(() => buildConditions(search?.conditions ?? []), [search]);
  const quickConditions: Condition[] = useMemo(() => buildConditions(quickText), [quickText]);

  const runKey = search ? JSON.stringify({ id: search.id, sourceId: search.sourceId, query: search.query, conditions: search.conditions }) : '';
  useEffect(() => {
    if (!search) return;
    let cancelled = false;
    setRun({ status: 'loading', items: [], evaluations: {} });
    setShadow({ status: 'idle', judgments: {} });
    const source = sources[search.sourceId] ?? sources['sample-flats']!;
    const evaluator = new FixtureEvaluator(SAMPLE_FIXTURES);
    (async () => {
      try {
        const items = await source.fetchItems(search.query);
        const evaluations: Record<string, Evaluation> = {};
        for (const item of items) {
          evaluations[item.id] = await evaluateItem(item, conditions, evaluator, THRESHOLD);
        }
        if (!cancelled) setRun({ status: 'ready', items, evaluations, ranAt: new Date() });
      } catch (error) {
        if (!cancelled) setRun({ status: 'error', items: [], evaluations: {}, error: error instanceof Error ? error.message : 'The source failed.' });
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey]);

  useEffect(() => {
    if (!quickOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setQuickOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [quickOpen]);

  if (!search) return <main><p className="intro">No saved searches yet.</p></main>;

  const updateSearch = (patch: Partial<SavedSearch>) => {
    setSearches(list => list.map(s => s.id === search.id ? { ...s, ...patch, updatedAt: new Date().toISOString() } : s));
  };
  const addSearch = () => {
    const fresh: SavedSearch = { id: `search-${Date.now()}`, name: 'New search', sourceId: 'sample-flats', query: '', conditions: ['Posted within the last 2 days'], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    setSearches(list => [...list, fresh]);
    setSelectedId(fresh.id);
  };
  const removeSearch = () => {
    if (!window.confirm(`Delete "${search.name}"? This cannot be undone.`)) return;
    setSearches(list => {
      const next = list.filter(s => s.id !== search.id);
      setSelectedId(next[0]?.id ?? '');
      return next;
    });
  };
  const addCondition = () => { const value = draft.trim(); if (value) { updateSearch({ conditions: [...search.conditions, value] }); setDraft(''); } };
  const quickSource = sources[quickSourceId] ?? sources['sample-flats']!;
  const runQuick = async () => {
    if (quickConditions.length === 0) return;
    const evaluator = new FixtureEvaluator(SAMPLE_FIXTURES);
    setQuickSaved(false);
    setQuickRun({ status: 'loading', items: [], evaluations: {} });
    try {
      const items = await quickSource.fetchItems(quickQuery.trim());
      const evaluations: Record<string, Evaluation> = {};
      for (const item of items) {
        evaluations[item.id] = await evaluateItem(item, quickConditions, evaluator, THRESHOLD);
      }
      setQuickRun({ status: 'ready', items, evaluations, ranAt: new Date() });
    } catch (error) {
      setQuickRun({ status: 'error', items: [], evaluations: {}, error: error instanceof Error ? error.message : 'The source failed.' });
    }
  };
  const saveQuick = () => {
    const raws = splitConditions(quickText);
    if (raws.length === 0) return;
    const at = new Date().toISOString();
    const first = raws[0]!;
    const fresh: SavedSearch = {
      id: `search-${Date.now()}`,
      name: first.length > 40 ? `${first.slice(0, 40)}…` : first,
      sourceId: quickSourceId,
      query: quickQuery.trim(),
      conditions: raws,
      createdAt: at,
      updatedAt: at,
    };
    setSearches(list => [...list, fresh]);
    setSelectedId(fresh.id);
    setQuickSaved(true);
  };

  const groups = { strong: [] as Item[], maybe: [] as Item[], reject: [] as Item[] };
  for (const item of run.items) {
    const outcome = run.evaluations[item.id]?.outcome ?? 'maybe';
    groups[outcome].push(item);
  }
  const quickGroups = { strong: [] as Item[], maybe: [] as Item[], reject: [] as Item[] };
  for (const item of quickRun.items) {
    const outcome = quickRun.evaluations[item.id]?.outcome ?? 'maybe';
    quickGroups[outcome].push(item);
  }

  const listingCard = (item: Item, kind: string, evaluation: Evaluation | undefined, conds: readonly Condition[], openId: string | null, toggleOpen: (id: string) => void, extra?: ReactNode) => {
    const { reasons, misses } = evaluation ? reasonData(evaluation, conds) : { reasons: [], misses: [] };
    const amount = formatAmount(item.amount);
    return <article key={item.id} className={`listing ${kind} ${openId === item.id ? 'is-open' : ''}`}>
      <button className="listing-head" onClick={() => toggleOpen(item.id)} aria-expanded={openId === item.id}>
        <span><small>{item.source} · {ageLabel(item.publishedAt)}</small><h3>{item.title}</h3><p>{amount ? `${amount} · ` : ''}<a href={item.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>Original ↗</a></p></span>
        <b>{reasons.length}/{conds.length}</b>
      </button>
      <div className="listing-body">
        <p>{item.text || 'No description supplied by the source.'}</p>
        <ul>{reasons.map(x => <li key={x}>✓ {x}</li>)}</ul>
        {misses.map(x => <p className="miss" key={x}>{x}</p>)}
        {extra}
      </div>
    </article>;
  };

  const card = (item: Item, kind: string) => listingCard(item, kind, run.evaluations[item.id], conditions, open, id => setOpen(open === id ? null : id),
    kind === 'reject'
      ? (corrections[item.id]
        ? <p className="note">Marked for correction. Adjust the conditions in the Search tab.</p>
        : <button className="promote" onClick={() => setCorrections(c => ({ ...c, [item.id]: true }))}>This should be a maybe</button>)
      : undefined);

  const quickCard = (item: Item, kind: string) => listingCard(item, kind, quickRun.evaluations[item.id], quickConditions, quickOpenId, id => setQuickOpenId(current => current === id ? null : id));

  const questions = semanticQuestions(conditions);
  const runShadow = async () => {
    const evaluator = new JevEvaluator('', { baseUrl: proxyUrl.trim() });
    setShadow({ status: 'running', judgments: {} });
    const judgments: Record<string, SemanticJudgments> = {};
    const records: StoredProvenance[] = [];
    const at = new Date().toISOString();
    try {
      for (const item of run.items.slice(0, SHADOW_ITEM_CAP)) {
        const result = await evaluator.evaluate(item, questions, { confidenceThreshold: THRESHOLD, mode: 'shadow' });
        judgments[item.id] = result;
        for (const question of questions) {
          const judgment = result[question.id] ?? { result: null, confidence: 0, evaluatorVersion: evaluator.version };
          const label = labels[`${item.id}/${question.id}`];
          records.push({
            searchId: search.id,
            itemId: item.id,
            at,
            conditionId: question.id,
            question: question.ask,
            criteria: question.criteria,
            confidenceThreshold: THRESHOLD,
            evaluatorVersion: judgment.evaluatorVersion,
            confidence: judgment.confidence,
            result: judgment.result,
            acceptedResult: replayAccepted(judgment.result, judgment.confidence, THRESHOLD),
            mode: 'shadow',
            ...(label === undefined ? {} : { humanLabel: label }),
          });
        }
      }
      setProvenance(appendProvenance(records));
      setShadow({ status: 'done', judgments });
    } catch (error) {
      setShadow({ status: 'error', judgments, error: error instanceof Error ? error.message : 'Shadow run failed.' });
    }
  };

  const calibrated = useMemo(() => provenance.map(record => {
    const label = labels[`${record.itemId}/${record.conditionId}`];
    return label === undefined ? record : { ...record, humanLabel: label };
  }), [provenance, labels]);
  const calibration = useMemo(() => summarizeCalibration(calibrated), [calibrated]);
  const replayedAccepted = calibrated.filter(r => replayAccepted(r.result, r.confidence, replayThreshold) !== null).length;

  const exportProvenance = () => {
    const blob = new Blob([JSON.stringify(calibrated, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cuttings-provenance.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const source = sources[search.sourceId] ?? sources['sample-flats']!;

  return <main>
    <header className="mast"><p className="eyebrow">{today}</p><h1>Cuttings</h1><p>Saved searches that catch up when you open them.</p></header>
    <nav className={`fluid-tabs tab-${tab}`} aria-label="Main">
      <button className={tab === 'digest' ? 'active' : ''} onClick={() => setTab('digest')}>Digest</button>
      <button className={tab === 'search' ? 'active' : ''} onClick={() => setTab('search')}>Search</button>
      <button className={tab === 'rejects' ? 'active' : ''} onClick={() => setTab('rejects')}>Rejects <span><AnimatedNumber value={groups.reject.length} /></span></button>
      <button className={tab === 'jev' ? 'active' : ''} onClick={() => setTab('jev')}>Jev</button>
    </nav>
    <button className="universal-search" onClick={() => setQuickOpen(true)} aria-label="Search now">
      <span aria-hidden>⌕</span> Search
    </button>

    {quickOpen && <div className="quick-sheet" role="dialog" aria-modal="true" aria-label="Search now" onClick={e => { if (e.target === e.currentTarget) setQuickOpen(false); }}>
      <div className="quick-panel">
        <div className="section-title"><div><p className="eyebrow">One-off search</p><h2>Search now</h2></div><button className="quick-close" onClick={() => setQuickOpen(false)} aria-label="Close">×</button></div>
        <p className="intro">Type what you are looking for in plain English. Join rules with "and", or put one rule per line. It runs once against the current feed. Nothing is saved unless you press <strong>Save this search</strong>.</p>
        <textarea className="quick-input" rows={3} autoFocus value={quickText} onChange={e => { setQuickText(e.target.value); setQuickSaved(false); }} placeholder="Under ₹30,000 per month and posted within the last 2 days and one bedroom" aria-label="What are you looking for" />
        <div className="picker">
          <select aria-label="Source" value={quickSourceId} onChange={e => setQuickSourceId(e.target.value)}>{Object.values(sources).map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
          <button onClick={runQuick} disabled={quickRun.status === 'loading' || quickConditions.length === 0}>{quickRun.status === 'loading' ? 'Searching…' : 'Search now'}</button>
        </div>
        {quickSource.kind === 'live' && <div className="picker"><input aria-label="Live source query" value={quickQuery} onChange={e => setQuickQuery(e.target.value)} placeholder="Words to search for" /></div>}
        {quickConditions.length > 0 && <div className="diagnosis"><strong>{quickConditions.filter(x => x.mode === 'exact').length} exact</strong><span>{quickConditions.filter(x => x.mode === 'semantic').length} meaning</span><span>{quickConditions.filter(x => x.mode === 'ambiguous').length} needs attention</span></div>}
        {quickRun.status === 'loading' && <p className="intro">Checking {quickSource.label}…</p>}
        {quickRun.status === 'error' && <p className="miss">Could not load {quickSource.label}: {quickRun.error}</p>}
        {quickRun.status === 'ready' && <>
          <section><h2 className="band">Strong matches <span>{quickGroups.strong.length}</span></h2>{quickGroups.strong.map(x => quickCard(x, 'strong'))}</section>
          <section><button className="drawer" onClick={() => setShowQuickMaybe(!showQuickMaybe)} aria-expanded={showQuickMaybe}><span>Maybes <b>{quickGroups.maybe.length}</b></span><span>{showQuickMaybe ? '−' : '+'}</span></button>{showQuickMaybe && <div className="drawer-body">{quickGroups.maybe.map(x => quickCard(x, 'maybe'))}</div>}</section>
          <section><button className="drawer" onClick={() => setShowQuickRejects(!showQuickRejects)} aria-expanded={showQuickRejects}><span>Didn't match <b>{quickGroups.reject.length}</b></span><span>{showQuickRejects ? '−' : '+'}</span></button>{showQuickRejects && <div className="drawer-body">{quickGroups.reject.map(x => quickCard(x, 'reject'))}</div>}</section>
          <div className="quick-save">
            {quickSaved
              ? <><p className="note">Saved to your searches. It will catch up in Digest from now on.</p><button className="promote" onClick={() => { setQuickOpen(false); setTab('digest'); }}>Open digest</button></>
              : <button className="promote" onClick={saveQuick}>Save this search</button>}
          </div>
        </>}
        <p className="quick-editor"><button onClick={() => { setQuickOpen(false); setTab('search'); }}>Edit saved searches instead</button></p>
      </div>
    </div>}

    {tab === 'digest' && <section className="view settle">
      <div className="section-title"><div><p className="eyebrow">{search.name}</p><h2>Your catch-up</h2></div><span><AnimatedNumber value={run.items.length} /> read</span></div>
      {run.status === 'loading' && <p className="intro">Checking {source.label}…</p>}
      {run.status === 'error' && <p className="miss">Could not load {source.label}: {run.error}</p>}
      {run.status === 'ready' && <>
        <section><h2 className="band">Strong matches <span><AnimatedNumber value={groups.strong.length} /></span></h2>{groups.strong.map(x => card(x, 'strong'))}</section>
        <section><button className="drawer" onClick={() => setShowMaybe(!showMaybe)} aria-expanded={showMaybe}><span>Maybes <b><AnimatedNumber value={groups.maybe.length} /></b></span><span>{showMaybe ? '−' : '+'}</span></button>{showMaybe && <div className="drawer-body">{groups.maybe.map(x => card(x, 'maybe'))}</div>}</section>
      </>}
    </section>}

    {tab === 'search' && <section className="view search-editor settle" ref={searchEditor}>
      <div className="section-title"><div><p className="eyebrow">Saved searches</p><h2>{search.name}</h2></div></div>
      <div className="picker">
        <select aria-label="Choose a saved search" value={search.id} onChange={e => setSelectedId(e.target.value)}>{searches.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <button onClick={addSearch}>New</button>
        <button onClick={removeSearch}>Delete</button>
      </div>
      <div className="picker">
        <input aria-label="Search name" value={search.name} onChange={e => updateSearch({ name: e.target.value })} />
        <select aria-label="Source" value={search.sourceId} onChange={e => updateSearch({ sourceId: e.target.value })}>{Object.values(sources).map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
      </div>
      {source.kind === 'live' && <div className="picker"><input aria-label="Live source query" value={search.query} onChange={e => updateSearch({ query: e.target.value })} placeholder="Words to search for" /></div>}
      <p className="intro">Searches are saved in this browser and survive a refresh. Exact checks stay local. Meaning checks are visible and optional.</p>
      <div className="conditions">{conditions.map((c, i) => <div className={`condition ${c.mode}`} key={c.id}>
        <span className="grip" aria-hidden>⠿</span>
        <div><label htmlFor={`c${i}`}>{parsedKind(c.mode)} · {c.requirement}</label>
          <input id={`c${i}`} value={search.conditions[i] ?? ''} onChange={e => updateSearch({ conditions: search.conditions.map((v, n) => n === i ? e.target.value : v) })} />
          {c.mode === 'ambiguous' && <p>{c.reason}</p>}</div>
        <button aria-label="Remove condition" onClick={() => updateSearch({ conditions: search.conditions.filter((_, n) => n !== i) })}>×</button>
      </div>)}</div>
      <div className="add"><input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCondition()} placeholder="Add a condition" /><button onClick={addCondition}>Add</button></div>
      <div className="diagnosis"><strong>{conditions.filter(x => x.mode === 'exact').length} exact</strong><span>{conditions.filter(x => x.mode === 'semantic').length} meaning</span><span>{conditions.filter(x => x.mode === 'ambiguous').length} needs attention</span></div>
    </section>}

    {tab === 'rejects' && <section className="view settle">
      <div className="section-title"><div><p className="eyebrow">Why they missed</p><h2>Rejects</h2></div><span><AnimatedNumber value={groups.reject.length} /></span></div>
      <p className="intro">Nothing disappears. Open a result, inspect the failed condition, or mark it so the search can be corrected.</p>
      {groups.reject.map(x => card(x, 'reject'))}
    </section>}

    {tab === 'jev' && <section className="view settle">
      <div className="section-title"><div><p className="eyebrow">Shadow mode</p><h2>Jev</h2></div></div>
      <p className="intro">Jev answers the meaning questions for this search without changing the ranking. Every answer is stored as replayable provenance so you can calibrate confidence before trusting it. Calls go through the Cuttings proxy, which keeps the TypeSafe key on the server. No key is typed, saved, or sent from this browser.</p>
      <div className="picker">
        <input type="url" aria-label="Jev proxy URL" value={proxyUrl} onChange={e => setProxyUrl(e.target.value)} placeholder="Jev proxy URL" autoComplete="off" spellCheck={false} />
        <button disabled={!proxyUrl.trim() || shadow.status === 'running' || questions.length === 0 || run.status !== 'ready'} onClick={runShadow}>{shadow.status === 'running' ? 'Running…' : 'Run shadow check'}</button>
      </div>
      {questions.length === 0 && <p className="note">This search has no meaning questions yet. Add one in the Search tab, for example “Mentions pricing”.</p>}
      {shadow.status === 'error' && <p className="miss">Shadow run failed: {shadow.error}. The keyless ranking above is unaffected.</p>}
      {shadow.status === 'done' && <p className="note">Shadow run complete on {Math.min(run.items.length, SHADOW_ITEM_CAP)} items. Ranking above is unchanged; these answers are for calibration only.</p>}
      {Object.entries(shadow.judgments).map(([itemId, judgments]) => {
        const item = run.items.find(x => x.id === itemId);
        if (!item) return null;
        return <div className="shadow-item" key={itemId}>
          <h3>{item.title}</h3>
          {questions.map(q => {
            const judgment = judgments[q.id];
            if (!judgment) return null;
            const key = `${itemId}/${q.id}`;
            const label = labels[key];
            return <div className="shadow-row" key={q.id}>
              <span>{q.ask}</span>
              <span className="confidence"><span className="confidence-track" aria-hidden><i style={{ '--confidence': `${Math.round(judgment.confidence * 100)}%` } as CSSProperties} /></span><span>{judgment.result === null ? 'no answer' : judgment.result ? 'yes' : 'no'} · <AnimatedNumber value={Math.round(judgment.confidence * 100)} suffix="%" /></span></span>
              {judgment.result !== null && <span className="label-buttons">
                <button className={label === judgment.result ? 'chosen' : ''} onClick={() => setLabels(l => ({ ...l, [key]: judgment.result as boolean }))}>Correct</button>
                <button className={label !== undefined && label !== judgment.result ? 'chosen' : ''} onClick={() => setLabels(l => ({ ...l, [key]: !(judgment.result as boolean) }))}>Wrong</button>
              </span>}
            </div>;
          })}
        </div>;
      })}
      <div className="calibration">
        <h3>Confidence calibration</h3>
        <p className="intro">{calibration.labeled === 0
          ? 'Label shadow answers as correct or wrong to start calibration.'
          : `${calibration.correct} of ${calibration.answered} answered labels agree${calibration.agreement === null ? '' : ` (${Math.round(calibration.agreement * 100)}%)`} across ${calibration.labeled} labels.`}</p>
        {calibration.labeled > 0 && <div className="diagnosis">{calibration.buckets.map(b => <span key={b.min}>{Math.round(b.min * 100)}–{Math.min(100, Math.round(b.max * 100))}%: {b.labeled === 0 ? 'no labels' : `${b.correct}/${b.labeled} right`}</span>)}</div>}
        <h3>Replay threshold</h3>
        <p className="intro">At a threshold of {Math.round(replayThreshold * 100)}%, {replayedAccepted} of {calibrated.length} stored answers would be accepted; the rest stay uncertain and map to maybe.</p>
        <input type="range" min={0.5} max={0.95} step={0.05} value={replayThreshold} onChange={e => setReplayThreshold(Number(e.target.value))} aria-label="Replay threshold" />
        <p><button className="promote" onClick={exportProvenance} disabled={calibrated.length === 0}>Download provenance JSON ({calibrated.length})</button></p>
      </div>
    </section>}

    <footer><span>{source.label}</span><span>{run.ranAt ? `Last run ${run.ranAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : 'Not run yet'}</span></footer>
  </main>;
  }
