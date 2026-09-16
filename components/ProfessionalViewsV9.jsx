"use client";

import { useMemo, useState } from "react";

const TARGETS = { iadc: 80, mentor: 815 };
const RANGE_OPTIONS = [1, 2, 4, 8, 12, 26, 52, "all"];
const n = (value) => value == null || value === "" || Number.isNaN(Number(value)) ? null : Number(value);
const pct = (value, digits = 2) => n(value) == null ? "—" : `${Number(value).toFixed(digits)}%`;
const weekNo = (label) => Number(String(label || "").replace(/\D/g, "")) || 0;
const driverName = (driver) => driver?.full_name || driver?.name || "Unresolved driver";
const driverTrid = (driver) => driver?.trid || driver?.id || "—";

function RangeTabs({ value, onChange }) {
  return <div className="v9-range-tabs">{RANGE_OPTIONS.map((item)=><button type="button" key={String(item)} className={value===item?"active":""} onClick={()=>onChange(item)}>{item==="all"?"All":`${item}W`}</button>)}</div>;
}
function Empty({ columns, text }) { return <tr><td colSpan={columns}><div className="v9-empty">{text}</div></td></tr>; }
function toneForIadc(value){ const x=n(value); return x==null?"neutral":x>=90?"excellent":x>=80?"good":x>=70?"warn":"bad"; }
function mentorTone(value){ const x=n(value); return x==null?"neutral":x>=830?"excellent":x>=815?"good":x>=790?"warn":"bad"; }
function openShape(row, extras={}) {
  const d=row?.drivers||{};
  return { id:driverTrid(d), dbId:row?.driver_id, name:driverName(d), site:d.site||"DLS2", ...extras };
}

export function ProIadcView({ rows = [], onOpenDriver, onImport }) {
  const allRows = useMemo(()=>rows.filter((r)=>n(r.iadc)!=null),[rows]);
  const weeks = useMemo(()=>[...new Set(allRows.map((r)=>r.week_label).filter(Boolean))].sort((a,b)=>weekNo(b)-weekNo(a)),[allRows]);
  const [week,setWeek]=useState("");
  const [query,setQuery]=useState("");
  const selectedWeek = week || weeks[0] || "";
  const selected = useMemo(()=>allRows.filter((r)=>r.week_label===selectedWeek).sort((a,b)=>(n(b.iadc)||0)-(n(a.iadc)||0)),[allRows,selectedWeek]);
  const filtered = selected.filter((r)=>`${driverName(r.drivers)} ${driverTrid(r.drivers)} ${r.drivers?.site||""}`.toLowerCase().includes(query.toLowerCase()));
  const avg = selected.length ? selected.reduce((s,r)=>s+Number(r.iadc),0)/selected.length : null;
  const below = selected.filter((r)=>Number(r.iadc)<80).length;
  const onTarget = selected.filter((r)=>Number(r.iadc)>=80).length;
  const excellent = selected.filter((r)=>Number(r.iadc)>=90).length;
  const best = selected[0];
  const bottom = selected.slice().sort((a,b)=>(n(a.iadc)||0)-(n(b.iadc)||0)).slice(0,5);
  const top = selected.slice(0,5);

  return <>
    <div className="page-heading v9-heading"><div><span className="page-kicker">WORKFLOW COMPLIANCE</span><h1>IADC intelligence</h1><p>Transporter-ID level compliance view inspired by your operational spreadsheet, with cleaner scoring and coaching signals.</p></div><div className="scorecard-filter-row"><select value={selectedWeek} onChange={(e)=>setWeek(e.target.value)}>{weeks.map((w)=><option key={w}>{w}</option>)}</select><button className="btn primary" onClick={onImport}>Import IADC</button></div></div>

    <section className="v9-kpi-grid six">
      <article><span>Fleet IADC</span><strong>{avg==null?"—":pct(avg,1)}</strong><small>Target ≥ 80%</small></article>
      <article><span>Measured drivers</span><strong>{selected.length}</strong><small>{selectedWeek||"No period"}</small></article>
      <article className={below?"warn":""}><span>Below target</span><strong>{below}</strong><small>Coaching priority</small></article>
      <article><span>On target</span><strong>{onTarget}</strong><small>80%+</small></article>
      <article><span>Excellent</span><strong>{excellent}</strong><small>90%+</small></article>
      <article><span>Best result</span><strong>{best?pct(best.iadc,1):"—"}</strong><small>{best?driverName(best.drivers):"No evidence"}</small></article>
    </section>

    <section className="dashboard-grid lower">
      <article className="panel v9-list-card"><div className="panel-head"><div><h2>Top 5 IADC</h2><p>Highest in-app delivery compliance.</p></div></div>{top.map((row,i)=><button key={`${row.driver_id}-${i}`} onClick={()=>onOpenDriver?.(openShape(row,{iadc:n(row.iadc)}))}><span>{i+1}</span><div><b>{driverName(row.drivers)}</b><small>{driverTrid(row.drivers)}</small></div><strong>{pct(row.iadc,2)}</strong></button>)}</article>
      <article className="panel v9-list-card attention"><div className="panel-head"><div><h2>Bottom 5 — coaching</h2><p>Lowest IADC results in the selected week.</p></div></div>{bottom.map((row,i)=><button key={`${row.driver_id}-${i}`} onClick={()=>onOpenDriver?.(openShape(row,{iadc:n(row.iadc),risk:"Medium",issue:"IADC below target"}))}><span>{i+1}</span><div><b>{driverName(row.drivers)}</b><small>{driverTrid(row.drivers)}</small></div><strong>{pct(row.iadc,2)}</strong></button>)}</article>
    </section>

    <section className="panel v9-table-panel">
      <div className="panel-head"><div><h2>Driver IADC register</h2><p>Name + Transporter ID + exact percentage, with gap-to-target and DWC evidence when available.</p></div><input className="v9-search" placeholder="Search driver or Transporter ID…" value={query} onChange={(e)=>setQuery(e.target.value)}/></div>
      <div className="table-wrap"><table className="data-table v9-iadc-table"><thead><tr><th>#</th><th>Driver</th><th>Transporter ID</th><th>IADC</th><th>Visual score</th><th>Gap to 80%</th><th>DWC</th><th>Band</th><th /></tr></thead><tbody>
        {filtered.map((row,index)=>{const value=Number(row.iadc); const gap=value-80; const tone=toneForIadc(value); return <tr key={`${row.driver_id}-${selectedWeek}-${index}`}><td><span className="rank-badge">{index+1}</span></td><td><b>{driverName(row.drivers)}</b><small className="history-date">{row.drivers?.site||"DLS2"}</small></td><td><code className="v9-trid">{driverTrid(row.drivers)}</code></td><td><b className={`v9-score ${tone}`}>{pct(value,2)}</b></td><td><div className="v9-progress"><i className={tone} style={{width:`${Math.max(0,Math.min(100,value))}%`}}/></div></td><td><span className={gap>=0?"v9-positive":"v9-negative"}>{gap>=0?"+":""}{gap.toFixed(2)} pp</span></td><td>{pct(row.raw_data?.dwc,2)}</td><td><span className={`v9-band ${tone}`}>{value>=90?"Excellent":value>=80?"On target":value>=70?"Watch":"Priority"}</span></td><td><button className="profile-link" onClick={()=>onOpenDriver?.(openShape(row,{iadc:value,risk:value<80?"Medium":"Low",issue:value<80?"IADC below 80% target":"No active concern"}))}>Open →</button></td></tr>})}
        {!filtered.length&&<Empty columns={9} text="No IADC evidence for this selection."/>}
      </tbody></table></div>
    </section>
  </>;
}

function riskBadge(value){ const text=String(value||"").toLowerCase(); return text.includes("high")?"high":text.includes("medium")?"med":text.includes("low")?"low":"neutral"; }
export function ProMentorViewV9({ rows = [], onOpenDriver }) {
  const [range,setRange]=useState(4); const [query,setQuery]=useState("");
  const mentorRows=useMemo(()=>rows.filter((r)=>n(r.mentor_score ?? r.ementor ?? r.fico)!=null || r.raw_data?.mentor),[rows]);
  const presentWeeks=useMemo(()=>[...new Set(mentorRows.map((r)=>r.week_label).filter(Boolean))].sort((a,b)=>weekNo(a)-weekNo(b)),[mentorRows]);
  const weeks=range==="all"?presentWeeks:presentWeeks.slice(-Number(range)); const weekSet=new Set(weeks);
  const drivers=useMemo(()=>{const map=new Map(); for(const row of mentorRows){if(!weekSet.has(row.week_label))continue; const d=row.drivers||{}; const id=row.driver_id||driverTrid(d); if(!id)continue; const cur=map.get(id)||{id,driver:d,scores:[],details:null,row}; const score=n(row.mentor_score ?? row.ementor ?? row.fico); if(score!=null)cur.scores.push(score); if(row.raw_data?.mentor)cur.details=row.raw_data.mentor; cur.row=row; map.set(id,cur);} return [...map.values()].map((x)=>({...x,score:x.scores.length?x.scores.reduce((a,b)=>a+b,0)/x.scores.length:null})).filter((x)=>x.score!=null||x.details).sort((a,b)=>(b.score??-1)-(a.score??-1));},[mentorRows,weeks.join("|")]);
  const filtered=drivers.filter((x)=>`${driverName(x.driver)} ${driverTrid(x.driver)}`.toLowerCase().includes(query.toLowerCase()));
  const avg=drivers.length?drivers.map((x)=>x.score).filter((x)=>x!=null).reduce((a,b)=>a+b,0)/Math.max(1,drivers.filter((x)=>x.score!=null).length):null;
  const below=drivers.filter((x)=>n(x.score)!=null&&x.score<815).length;
  const highRisk=drivers.filter((x)=>Object.values(x.details||{}).some((v)=>String(v).toLowerCase().includes("high risk"))).length;
  const trainingOutstanding=drivers.filter((x)=>n(x.details?.training)!=null&&n(x.details?.completed)!=null&&Number(x.details.completed)<Number(x.details.training)).length;
  const top=drivers.slice(0,5); const bottom=drivers.slice().sort((a,b)=>(a.score??9999)-(b.score??9999)).slice(0,5);

  return <>
    <div className="page-heading v9-heading"><div><span className="page-kicker">SAFETY</span><h1>Mentor intelligence</h1><p>Score, driving behaviour and training status resolved against your Mentor alias master.</p></div><RangeTabs value={range} onChange={setRange}/></div>
    <section className="v9-kpi-grid"><article><span>Average score</span><strong>{avg==null?"—":Math.round(avg)}</strong><small>Target ≥ 815</small></article><article className={below?"warn":""}><span>Below target</span><strong>{below}</strong><small>Needs attention</small></article><article className={highRisk?"bad":""}><span>High-risk behaviour</span><strong>{highRisk}</strong><small>Any high-risk category</small></article><article><span>Training outstanding</span><strong>{trainingOutstanding}</strong><small>Completed below assigned</small></article></section>
    <section className="dashboard-grid lower"><article className="panel v9-list-card"><div className="panel-head"><div><h2>Top 5 Mentor scores</h2><p>Highest score in the selected period.</p></div></div>{top.map((x,i)=><button key={x.id} onClick={()=>onOpenDriver?.(openShape(x.row,{mentor_score:x.score,fico:x.score,ementor:x.score}))}><span>{i+1}</span><div><b>{driverName(x.driver)}</b><small>{driverTrid(x.driver)}</small></div><strong>{x.score==null?"—":Math.round(x.score)}</strong></button>)}</article><article className="panel v9-list-card attention"><div className="panel-head"><div><h2>Bottom 5 — attention</h2><p>Lowest Mentor score first.</p></div></div>{bottom.map((x,i)=><button key={x.id} onClick={()=>onOpenDriver?.(openShape(x.row,{mentor_score:x.score,fico:x.score,ementor:x.score,risk:"Medium",issue:"Mentor score below target"}))}><span>{i+1}</span><div><b>{driverName(x.driver)}</b><small>{driverTrid(x.driver)}</small></div><strong>{x.score==null?"—":Math.round(x.score)}</strong></button>)}</article></section>
    <section className="panel v9-table-panel"><div className="panel-head"><div><h2>Mentor driver register</h2><p>Behavioural categories and training evidence from the uploaded report.</p></div><input className="v9-search" value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search driver or TRID…"/></div><div className="table-wrap"><table className="data-table v9-mentor-table"><thead><tr><th>Driver</th><th>TRID</th><th>Score</th><th>Acceleration</th><th>Braking</th><th>Cornering</th><th>Distraction</th><th>Speeding</th><th>Events</th><th>Training</th><th>Completed</th><th /></tr></thead><tbody>{filtered.map((x)=>{const d=x.details||{}; return <tr key={x.id}><td><b>{driverName(x.driver)}</b><small className="history-date">{x.driver?.site||"DLS2"}</small></td><td><code className="v9-trid">{driverTrid(x.driver)}</code></td><td><span className={`v9-score ${mentorTone(x.score)}`}>{x.score==null?"—":Math.round(x.score)}</span></td>{["acceleration","braking","cornering","distraction","speedingRisk"].map((k)=><td key={k}><span className={`v9-risk-tag ${riskBadge(d[k])}`}>{d[k]||"—"}</span></td>)}<td>{d.speedingEvents??"—"}</td><td>{d.training??"—"}</td><td>{d.completed??"—"}</td><td><button className="profile-link" onClick={()=>onOpenDriver?.(openShape(x.row,{mentor_score:x.score,fico:x.score,ementor:x.score,risk:x.score!=null&&x.score<815?"Medium":"Low",issue:x.score!=null&&x.score<815?"Mentor score below 815":"No active concern"}))}>Open →</button></td></tr>})}{!filtered.length&&<Empty columns={12} text="No Mentor evidence matches this period. Re-import the Mentor workbook after applying V9."/>}</tbody></table></div></section>
  </>;
}

function contiguousWeeks(rows,range){
  const present=[...new Set(rows.map((r)=>r.week_label).filter(Boolean))].sort((a,b)=>weekNo(a)-weekNo(b));
  if(!present.length)return [];
  const min=weekNo(present[0]), max=weekNo(present[present.length-1]);
  if(range==="all") return Array.from({length:max-min+1},(_,i)=>`W${String(min+i).padStart(2,"0")}`);
  const count=Number(range); const start=Math.max(1,max-count+1); return Array.from({length:max-start+1},(_,i)=>`W${String(start+i).padStart(2,"0")}`);
}
export function ProConcessionsViewV9({ rows = [], onOpenDriver }) {
  const [range,setRange]=useState(8); const [query,setQuery]=useState("");
  const concessionRows=useMemo(()=>rows.filter((r)=>n(r.concessions)!=null),[rows]);
  const weeks=useMemo(()=>contiguousWeeks(concessionRows,range),[concessionRows,range]); const weekSet=new Set(weeks);
  const importedWeeks=new Set(concessionRows.map((r)=>r.week_label).filter(Boolean));
  const ranking=useMemo(()=>{const map=new Map(); for(const row of concessionRows){if(!weekSet.has(row.week_label))continue; const d=row.drivers||{}; const id=row.driver_id||driverTrid(d); if(!id)continue; const cur=map.get(id)||{id,driver:d,row,byWeek:{}}; cur.byWeek[row.week_label]=n(row.concessions); cur.row=row; map.set(id,cur);} return [...map.values()].map((x)=>{const values=weeks.map((w)=>Object.prototype.hasOwnProperty.call(x.byWeek,w)?x.byWeek[w]:null); const reported=values.filter((v)=>v!=null); const total=reported.reduce((a,b)=>a+b,0); const affected=reported.filter((v)=>v>0).length; return {...x,values,total,affected,reported:reported.length,average:reported.length?total/reported.length:0};}).filter((x)=>x.reported>0).sort((a,b)=>b.total-a.total||b.affected-a.affected);},[concessionRows,weeks.join("|")]);
  const filtered=ranking.filter((x)=>`${driverName(x.driver)} ${driverTrid(x.driver)}`.toLowerCase().includes(query.toLowerCase()));
  const weeklyTotals=weeks.map((w)=>ranking.reduce((s,x)=>s+(n(x.byWeek[w])||0),0));
  const weeklyAffected=weeks.map((w)=>ranking.filter((x)=>n(x.byWeek[w])>0).length);
  const total=weeklyTotals.reduce((a,b)=>a+b,0); const affected=ranking.filter((x)=>x.total>0).length; const repeats=ranking.filter((x)=>x.affected>=2).length; const top=ranking[0]?.total||0;
  return <>
    <div className="page-heading v9-heading"><div><span className="page-kicker">QUALITY</span><h1>Concessions intelligence</h1><p>Week-by-week DNR concession history, including missing reporting weeks so W37 never silently disappears.</p></div><RangeTabs value={range} onChange={setRange}/></div>
    <section className="v9-kpi-grid"><article><span>Total concessions</span><strong>{total}</strong><small>{weeks.filter((w)=>importedWeeks.has(w)).length} imported weeks</small></article><article><span>Drivers affected</span><strong>{affected}</strong><small>At least one concession</small></article><article className={repeats?"warn":""}><span>Repeat drivers</span><strong>{repeats}</strong><small>2+ affected weeks</small></article><article className={top>=5?"bad":"warn"}><span>Highest driver total</span><strong>{top}</strong><small>Selected period</small></article></section>
    <section className="v9-week-cards">{weeks.map((w,i)=><article key={w} className={importedWeeks.has(w)?"imported":"missing"}><div><span>{w}</span><small>{importedWeeks.has(w)?"Imported":"Not imported"}</small></div><strong>{importedWeeks.has(w)?weeklyTotals[i]:"—"}</strong><em>{importedWeeks.has(w)?`${weeklyAffected[i]} drivers affected`:"Upload concession report"}</em></article>)}</section>
    <section className="panel v9-table-panel"><div className="panel-head"><div><h2>Driver concession matrix</h2><p>Each week stays separate. A dash means no source data was imported for that driver/week — never silently converted to zero.</p></div><input className="v9-search" placeholder="Search driver or TRID…" value={query} onChange={(e)=>setQuery(e.target.value)}/></div><div className="table-wrap"><table className="data-table v9-concessions-table"><thead><tr><th>#</th><th>Driver</th><th>TRID</th>{weeks.map((w)=><th key={w} className={!importedWeeks.has(w)?"missing-week":""}>{w}</th>)}<th className="v9-sticky-total">Total</th><th>Weeks affected</th><th>Avg/reporting week</th><th /></tr></thead><tbody>{filtered.map((x,index)=><tr key={x.id}><td><span className="rank-badge">{index+1}</span></td><td><b>{driverName(x.driver)}</b><small className="history-date">{x.driver?.site||"DLS2"}</small></td><td><code className="v9-trid">{driverTrid(x.driver)}</code></td>{x.values.map((value,i)=><td key={weeks[i]} className={!importedWeeks.has(weeks[i])?"missing-week":""}>{value==null?<span className="missing-cell">—</span>:<span className={`v9-concession-cell ${value>=3?"high":value>=1?"med":"zero"}`}>{value}</span>}</td>)}<td className="v9-sticky-total"><b className={x.total>=5?"v9-total bad":x.total>=2?"v9-total warn":"v9-total good"}>{x.total}</b></td><td>{x.affected}/{x.reported}</td><td>{x.average.toFixed(2)}</td><td><button className="profile-link" onClick={()=>onOpenDriver?.(openShape(x.row,{concessions:x.total,risk:x.total>=5?"High":x.total>=2?"Medium":"Low",issue:x.total>=2?"Repeat concessions":"No active concern"}))}>Open →</button></td></tr>)}{!filtered.length&&<Empty columns={7+weeks.length} text="No concession evidence matches this selection."/>}</tbody><tfoot><tr><td colSpan="3"><b>Weekly totals</b></td>{weeklyTotals.map((value,i)=><td key={weeks[i]} className={!importedWeeks.has(weeks[i])?"missing-week":""}><b>{importedWeeks.has(weeks[i])?value:"—"}</b></td>)}<td className="v9-sticky-total"><b>{total}</b></td><td colSpan="3">Selected period</td></tr></tfoot></table></div></section>
  </>;
}
