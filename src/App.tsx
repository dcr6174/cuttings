import { useMemo, useState } from 'react';
import { parseCondition } from './parser';
import type { Condition, Parsed } from './types';

type Result = {id:string; title:string; source:string; place:string; rent:string; age:string; summary:string; reasons:string[]; misses:string[]; score:number};
const items: Result[] = [
  {id:'1',title:'Sunlit one-bedroom near Indiranagar',source:'NoBroker',place:'Indiranagar',rent:'₹28,000 / month',age:'2h',summary:'Fourth-floor flat with a balcony, lift, and backup power. Owner-listed.',reasons:['Under ₹30,000','Posted today','Balcony mentioned'],misses:[],score:98},
  {id:'2',title:'Quiet 1BHK off 12th Main',source:'Housing',place:'HAL 2nd Stage',rent:'₹29,500 / month',age:'5h',summary:'Recently painted, semi-furnished home on a low-traffic lane.',reasons:['Under ₹30,000','Near Indiranagar'],misses:['Balcony unclear'],score:78},
  {id:'3',title:'Compact studio by the metro',source:'Magicbricks',place:'Domlur',rent:'₹25,000 / month',age:'Yesterday',summary:'Bright studio with a separate kitchen, 900 m from the metro.',reasons:['Under ₹30,000','Metro nearby'],misses:['Not a one-bedroom'],score:54},
  {id:'4',title:'Furnished one-bedroom with terrace',source:'Housing',place:'Ulsoor',rent:'₹34,000 / month',age:'3h',summary:'Top-floor flat with terrace access and lake views.',reasons:['One bedroom','Balcony or terrace'],misses:['₹4,000 over budget'],score:42}
];
const initial = ['Under ₹30,000 per month','Posted within the last 2 days','One bedroom','Balcony preferred'];
function parsedKind(p: Parsed){return p.mode==='exact'?'Exact':p.mode==='semantic'?'Meaning':'Needs attention'}
export function App(){
 const [tab,setTab]=useState<'digest'|'search'|'rejects'>('digest');
 const [conditions,setConditions]=useState(initial);
 const [draft,setDraft]=useState('');
 const [open,setOpen]=useState<string|null>('1');
 const [showMaybe,setShowMaybe]=useState(true);
 const parsed=useMemo(()=>conditions.map((raw,i)=>({...parseCondition(raw),id:`c${i}`,requirement:raw.toLowerCase().includes('preferred')?'preferred':'required'} as Condition)),[conditions]);
 const add=()=>{const value=draft.trim();if(value){setConditions(x=>[...x,value]);setDraft('')}};
 const strong=items.filter(x=>x.score>=90), maybe=items.filter(x=>x.score>=50&&x.score<90), rejected=items.filter(x=>x.score<50);
 const card=(r:Result,kind:string)=><article key={r.id} className={`listing ${kind} ${open===r.id?'is-open':''}`}><button className="listing-head" onClick={()=>setOpen(open===r.id?null:r.id)} aria-expanded={open===r.id}><span><small>{r.source} · {r.age}</small><h3>{r.title}</h3><p>{r.place} · {r.rent}</p></span><b>{r.score}</b></button><div className="listing-body"><p>{r.summary}</p><ul>{r.reasons.map(x=><li key={x}>✓ {x}</li>)}</ul>{r.misses.map(x=><p className="miss" key={x}>{x}</p>)}{kind==='reject'&&<button className="promote" onClick={()=>alert('Marked for correction in this local demo.')}>This should be a maybe</button>}</div></article>;
 return <main><header className="mast"><p className="eyebrow">Saturday, 19 September</p><h1>Cuttings</h1><p>Saved searches that catch up when you open them.</p></header>
 <nav aria-label="Main"><button className={tab==='digest'?'active':''} onClick={()=>setTab('digest')}>Digest</button><button className={tab==='search'?'active':''} onClick={()=>setTab('search')}>Search</button><button className={tab==='rejects'?'active':''} onClick={()=>setTab('rejects')}>Rejects <span>{rejected.length}</span></button></nav>
 {tab==='digest'&&<section className="view settle"><div className="section-title"><div><p className="eyebrow">Flats near Indiranagar</p><h2>Your morning cut</h2></div><span>{items.length} read</span></div><section><h2 className="band">Strong matches <span>{strong.length}</span></h2>{strong.map(x=>card(x,'strong'))}</section><section><button className="drawer" onClick={()=>setShowMaybe(!showMaybe)} aria-expanded={showMaybe}><span>Maybes <b>{maybe.length}</b></span><span>{showMaybe?'−':'+'}</span></button>{showMaybe&&<div className="drawer-body">{maybe.map(x=>card(x,'maybe'))}</div>}</section></section>}
 {tab==='search'&&<section className="view"><div className="section-title"><div><p className="eyebrow">Editable rules</p><h2>Flats near Indiranagar</h2></div></div><p className="intro">Exact checks stay local. Meaning checks are visible and optional. Fix anything we cannot read.</p><div className="conditions">{parsed.map((c,i)=><div className={`condition ${c.mode}`} key={c.id}><span className="grip" aria-hidden>⠿</span><div><label htmlFor={`c${i}`}>{parsedKind(c)} · {c.requirement}</label><input id={`c${i}`} value={conditions[i]} onChange={e=>setConditions(x=>x.map((v,n)=>n===i?e.target.value:v))}/>{c.mode==='ambiguous'&&<p>{c.reason}</p>}</div><button aria-label="Remove condition" onClick={()=>setConditions(x=>x.filter((_,n)=>n!==i))}>×</button></div>)}</div><div className="add"><input value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>e.key==='Enter'&&add()} placeholder="Add a condition"/><button onClick={add}>Add</button></div><div className="diagnosis"><strong>{parsed.filter(x=>x.mode==='exact').length} exact</strong><span>{parsed.filter(x=>x.mode==='semantic').length} meaning</span><span>{parsed.filter(x=>x.mode==='ambiguous').length} needs attention</span></div></section>}
 {tab==='rejects'&&<section className="view"><div className="section-title"><div><p className="eyebrow">Why they missed</p><h2>Rejects</h2></div><span>{rejected.length}</span></div><p className="intro">Nothing disappears. Open a result, inspect the failed condition, or promote it so the search can be corrected.</p>{rejected.map(x=>card(x,'reject'))}</section>}
 <footer><span>Local sample feed</span><span>Last run 09:42</span></footer></main>;
}
