import type { CSSProperties, ReactNode } from 'react';
import type { Evaluation } from './engine';
import type { Amount, Condition, Item } from './types';

export function AnimatedNumber({ value, suffix = '' }: { value: number; suffix?: string }) {
  return <span key={`${value}${suffix}`} className="animated-number" aria-label={`${value}${suffix}`}>{value}{suffix}</span>;
}

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

function reasonData(evaluation: Evaluation, conditions: readonly Condition[]): { reasons: string[]; misses: string[] } {
  const reasons: string[] = [];
  const misses: string[] = [];
  for (const condition of conditions) {
    if (condition.mode === 'exact') {
      const check = evaluation.checks.find(candidate => candidate.condition.id === condition.id);
      if (check?.status === 'pass') reasons.push(condition.raw);
      else if (check?.status === 'fail') misses.push(`Failed: ${condition.raw}`);
      else if (check?.status === 'could-not-check') misses.push(check.reason);
      continue;
    }
    const record = evaluation.provenance.find(candidate => candidate.conditionId === condition.id);
    if (!record) continue;
    const expect = condition.mode === 'semantic' ? condition.expect : true;
    if (record.acceptedResult === null) misses.push(`Uncertain: ${condition.raw}`);
    else if (record.acceptedResult === expect) reasons.push(condition.raw);
    else misses.push(`Failed: ${condition.raw}`);
  }
  return { reasons, misses };
}

interface ListingCardProps {
  item: Item;
  kind: string;
  evaluation: Evaluation | undefined;
  conditions: readonly Condition[];
  expanded: boolean;
  onToggle(): void;
  extra?: ReactNode;
}

export function ListingCard({ item, kind, evaluation, conditions, expanded, onToggle, extra }: ListingCardProps) {
  const { reasons, misses } = evaluation ? reasonData(evaluation, conditions) : { reasons: [], misses: [] };
  const amount = formatAmount(item.amount);
  return <article className={`listing ${kind} ${expanded ? 'is-open' : ''}`}>
    <button className="listing-head" onClick={onToggle} aria-expanded={expanded}>
      <span className="listing-copy"><small>{item.source} · {ageLabel(item.publishedAt)}</small><h3>{item.title}</h3>{amount && <p>{amount}</p>}</span>
      <span className="match-score" style={{ '--frac': (conditions.length ? reasons.length / conditions.length : 0).toFixed(3) } as CSSProperties}><b>{reasons.length}</b><small>of {conditions.length}</small></span>
    </button>
    <div className="listing-body">
      <p>{item.text || 'No description supplied by the source.'}</p>
      {item.url && <p><a className="source-link" href={item.url} target="_blank" rel="noopener noreferrer">View original source <span aria-hidden>↗</span></a></p>}
      <ul>{reasons.map(reason => <li key={reason}>✓ {reason}</li>)}</ul>
      {misses.map(miss => <p className="miss" key={miss}>{miss}</p>)}
      {extra}
    </div>
  </article>;
}
