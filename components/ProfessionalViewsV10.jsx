"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "../lib/supabase/client";

const TARGETS = { iadc: 80, mentor: 815 };
const RANGE_OPTIONS = [1,2,4,8,12,26,52,"all"];

const n = (v) => v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v);
const pct = (v,d=2) => n(v)==null ? "—" : `${Number(v).toFixed(d)}%`;
const weekNo = (label) => Number(String(label||"").replace(/\D/g,"")) || 0;
const dname = (d) => d?.full_name || d?.name || "Unresolved driver";
const trid = (d) => d?.trid || d?.id || "—";

function useDbRows(organizationId, kind){
  const [state,setState]=useState({loading:true,error:"",rows:[]});
  useEffect(()=>{
    let alive=true;
    if(!organizationId){setState({loading:false,error:"",rows:[]});return ()=>{};}
    (async()=>{
      try{
        setState((s)=>({...s,loading:true,error:""}));
        const supabase=getSupabaseBrowserClient();
        let query=supabase.from("driver_metrics")
          .select("driver_id,week_label,period_start,period_end,iadc,mentor_score,ementor,fico,concessions,raw_data,risk,issue,drivers(id,trid,full_name,site,status)")
          .eq("organization_id",organizationId)
          .order("period_end",{ascending:true})
          .limit(10000);
        if(kind==="iadc") query=query.not("iadc","is",null);
        if(kind==="concessions") query=query.not("concessions","is",null);
        const {data,error}=await query;
        if(error)throw error;
        const rows=(data||[]).filter((row)=>{
          if(kind==="mentor") return n(row.mentor_score ?? row.ementor ?? row.fico)!=null || row.raw_data?.mentor;
          return true;
        });
        if(alive)setState({loading:false,error:"",rows});
      }catch(error){
        if(alive)setState({loading:false,error:error?.message||"Could not load data.",rows:[]});
      }
    })();
    return ()=>{alive=false;};
  },[organizationId,kind]);
  return state;
}
function Loading({text}){return <section className="panel ops-empty"><div className="auth-spinner"/><b>{text}</b></section>;}
function ErrorBox({error}){return <section className="panel ops-empty error"><b>Unable to load this view</b><span>{error}</span></section>;}
function RangeTabs({value,onChange}){return <div className="v10-range-tabs">{RANGE_OPTIONS.map((x)=><button type="button" key={String(x)} className={value===x?"active":""} onClick={()=>onChange(x)}>{x==="all"?"All":`${x}W`}</button>)}</div>;}
function toneIadc(v){const x=n(v);return x==null?"neutral":x>=90?"excellent":x>=80?"good":x>=70?"warn":"bad";}
function toneMentor(v){const x=n(v);return x==null?"neutral":x>=830?"excellent":x>=815?"good":x>=790?"warn":"bad";}
function riskTone(v){const s=String(v||"").toLowerCase();return s.includes("high")?"high":s.includes("medium")?"med":s.includes("low")?"low":"neutral";}
function openShape(row,extra={}){
  const d=row?.drivers||{};
  return {id:trid(d),dbId:row?.driver_id,name:dname(d),site:d.site||"DLS2",...extra};
}

export function DirectIadcView({organizationId,onOpenDriver,onImport}){
  const load=useDbRows(organizationId,"iadc");
  const rows=load.rows;
  const weeks=useMemo(()=>[...new Set(rows.map(r=>r.week_label).filter(Boolean))].sort((a,b)=>weekNo(b)-weekNo(a)),[rows]);
  const [week,setWeek]=useState("");
  const [query,setQuery]=useState("");
  const selectedWeek=week||weeks[0]||"";
  const selected=useMemo(()=>rows.filter(r=>r.week_label===selectedWeek).sort((a,b)=>Number(b.iadc)-Number(a.iadc)),[rows,selectedWeek]);
  const filtered=selected.filter(r=>`${dname(r.drivers)} ${trid(r.drivers)} ${r.drivers?.site||""}`.toLowerCase().includes(query.toLowerCase()));
  const avg=selected.length?selected.reduce((s,r)=>s+Number(r.iadc),0)/selected.length:null;
  const below=selected.filter(r=>Number(r.iadc)<80).length;
  const onTarget=selected.filter(r=>Number(r.iadc)>=80).length;
  const excellent=selected.filter(r=>Number(r.iadc)>=90).length;
  const top=selected.slice(0,5);
  const bottom=[...selected].sort((a,b)=>Number(a.iadc)-Number(b.iadc)).slice(0,5);

  if(load.loading)return <Loading text="Loading IADC directly from saved driver metrics…"/>;
  if(load.error)return <ErrorBox error={load.error}/>;

  return <>
    <div className="page-heading v10-heading">
      <div><span className="page-kicker">WORKFLOW COMPLIANCE</span><h1>IADC intelligence</h1><p>Direct database view: driver name, Transporter ID and exact weekly IADC percentage.</p></div>
      <div className="scorecard-filter-row"><select value={selectedWeek} onChange={e=>setWeek(e.target.value)}>{weeks.map(w=><option key={w}>{w}</option>)}</select><button className="btn primary" onClick={onImport}>Import IADC</button></div>
    </div>

    <section className="v10-kpi-grid six">
      <article><span>Fleet IADC</span><strong>{pct(avg,1)}</strong><small>Target ≥ 80%</small></article>
      <article><span>Measured drivers</span><strong>{selected.length}</strong><small>{selectedWeek||"No period"}</small></article>
      <article className={below?"warn":""}><span>Below target</span><strong>{below}</strong><small>Coaching priority</small></article>
      <article><span>On target</span><strong>{onTarget}</strong><small>80%+</small></article>
      <article><span>Excellent</span><strong>{excellent}</strong><small>90%+</small></article>
      <article><span>Best result</span><strong>{top[0]?pct(top[0].iadc,1):"—"}</strong><small>{top[0]?dname(top[0].drivers):"No evidence"}</small></article>
    </section>

    <section className="dashboard-grid lower">
      <article className="panel v10-rank-card"><div className="panel-head"><div><h2>Top 5 IADC</h2><p>Best in-app delivery workflow compliance.</p></div></div>{top.map((r,i)=><button key={`${r.driver_id}-${i}`} onClick={()=>onOpenDriver?.(openShape(r,{iadc:n(r.iadc)}))}><span className="rank-badge">{i+1}</span><div><b>{dname(r.drivers)}</b><small>{trid(r.drivers)}</small></div><strong>{pct(r.iadc)}</strong></button>)}</article>
      <article className="panel v10-rank-card attention"><div className="panel-head"><div><h2>Bottom 5 — coaching</h2><p>Lowest IADC results first.</p></div></div>{bottom.map((r,i)=><button key={`${r.driver_id}-${i}`} onClick={()=>onOpenDriver?.(openShape(r,{iadc:n(r.iadc),risk:"Medium",issue:"IADC below target"}))}><span className="rank-badge">{i+1}</span><div><b>{dname(r.drivers)}</b><small>{trid(r.drivers)}</small></div><strong>{pct(r.iadc)}</strong></button>)}</article>
    </section>

    <section className="panel v10-table-panel">
      <div className="panel-head"><div><h2>Driver IADC register</h2><p>Modelled after your George DLS2 spreadsheet: Name + Transporter ID + IADC %.</p></div><input className="v10-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search driver or Transporter ID…"/></div>
      <div className="table-wrap"><table className="data-table v10-iadc-table"><thead><tr><th>#</th><th>Driver</th><th>Transporter ID</th><th>IADC %</th><th>Visual score</th><th>Gap to 80%</th><th>DWC</th><th>Band</th><th /></tr></thead><tbody>
      {filtered.map((r,i)=>{const value=Number(r.iadc),gap=value-80,t=toneIadc(value);return <tr key={`${r.driver_id}-${selectedWeek}-${i}`}><td><span className="rank-badge">{i+1}</span></td><td><b>{dname(r.drivers)}</b><small className="history-date">{r.drivers?.site||"DLS2"}</small></td><td><code className="v10-trid">{trid(r.drivers)}</code></td><td><b className={`v10-score ${t}`}>{pct(value)}</b></td><td><div className="v10-progress"><i className={t} style={{width:`${Math.max(0,Math.min(100,value))}%`}}/></div></td><td><span className={gap>=0?"v10-positive":"v10-negative"}>{gap>=0?"+":""}{gap.toFixed(2)} pp</span></td><td>{pct(r.raw_data?.dwc)}</td><td><span className={`v10-band ${t}`}>{value>=90?"Excellent":value>=80?"On target":value>=70?"Watch":"Priority"}</span></td><td><button className="profile-link" onClick={()=>onOpenDriver?.(openShape(r,{iadc:value,risk:value<80?"Medium":"Low",issue:value<80?"IADC below 80% target":"No active concern"}))}>Open →</button></td></tr>})}
      {!filtered.length&&<tr><td colSpan="9"><div className="v10-empty">No IADC rows returned for this week.</div></td></tr>}
      </tbody></table></div>
    </section>
  </>;
}

export function DirectMentorView({organizationId,onOpenDriver}){
  const load=useDbRows(organizationId,"mentor");
  const [range,setRange]=useState(4);
  const [query,setQuery]=useState("");
  const presentWeeks=useMemo(()=>[...new Set(load.rows.map(r=>r.week_label).filter(Boolean))].sort((a,b)=>weekNo(a)-weekNo(b)),[load.rows]);
  const weeks=range==="all"?presentWeeks:presentWeeks.slice(-Number(range));
  const set=new Set(weeks);
  const map=useMemo(()=>{
    const m=new Map();
    for(const row of load.rows){
      if(!set.has(row.week_label))continue;
      const d=row.drivers||{};
      const id=row.driver_id||trid(d);
      const cur=m.get(id)||{id,driver:d,scores:[],details:null,row};
      const score=n(row.mentor_score ?? row.ementor ?? row.fico);
      if(score!=null)cur.scores.push(score);
      if(row.raw_data?.mentor)cur.details=row.raw_data.mentor;
      cur.row=row;
      m.set(id,cur);
    }
    return [...m.values()].map(x=>({...x,score:x.scores.length?x.scores.reduce((a,b)=>a+b,0)/x.scores.length:null})).filter(x=>x.score!=null||x.details).sort((a,b)=>(b.score??-1)-(a.score??-1));
  },[load.rows,weeks.join("|")]);

  if(load.loading)return <Loading text="Loading Mentor directly from saved driver metrics…"/>;
  if(load.error)return <ErrorBox error={load.error}/>;

  const filtered=map.filter(x=>`${dname(x.driver)} ${trid(x.driver)}`.toLowerCase().includes(query.toLowerCase()));
  const scored=map.filter(x=>x.score!=null);
  const avg=scored.length?scored.reduce((s,x)=>s+x.score,0)/scored.length:null;
  const below=scored.filter(x=>x.score<815).length;
  const highRisk=map.filter(x=>Object.values(x.details||{}).some(v=>String(v).toLowerCase().includes("high risk"))).length;
  const training=map.filter(x=>n(x.details?.training)!=null&&n(x.details?.completed)!=null&&Number(x.details.completed)<Number(x.details.training)).length;
  const top=scored.slice(0,5);
  const bottom=[...scored].sort((a,b)=>a.score-b.score).slice(0,5);

  return <>
    <div className="page-heading v10-heading"><div><span className="page-kicker">SAFETY</span><h1>Mentor intelligence</h1><p>Direct database view using the saved Mentor score and behaviour evidence.</p></div><RangeTabs value={range} onChange={setRange}/></div>
    <section className="v10-kpi-grid"><article><span>Average score</span><strong>{avg==null?"—":Math.round(avg)}</strong><small>Target ≥ 815</small></article><article className={below?"warn":""}><span>Below target</span><strong>{below}</strong><small>Needs attention</small></article><article className={highRisk?"bad":""}><span>High-risk behaviour</span><strong>{highRisk}</strong><small>Any high-risk category</small></article><article><span>Training outstanding</span><strong>{training}</strong><small>Completed below assigned</small></article></section>
    <section className="dashboard-grid lower"><article className="panel v10-rank-card"><div className="panel-head"><div><h2>Top 5 Mentor</h2><p>Highest driving scores.</p></div></div>{top.map((x,i)=><button key={x.id} onClick={()=>onOpenDriver?.(openShape(x.row,{mentor_score:x.score,fico:x.score,ementor:x.score}))}><span className="rank-badge">{i+1}</span><div><b>{dname(x.driver)}</b><small>{trid(x.driver)}</small></div><strong>{Math.round(x.score)}</strong></button>)}</article><article className="panel v10-rank-card attention"><div className="panel-head"><div><h2>Bottom 5 — attention</h2><p>Lowest Mentor scores first.</p></div></div>{bottom.map((x,i)=><button key={x.id} onClick={()=>onOpenDriver?.(openShape(x.row,{mentor_score:x.score,fico:x.score,ementor:x.score,risk:"Medium",issue:"Mentor score below target"}))}><span className="rank-badge">{i+1}</span><div><b>{dname(x.driver)}</b><small>{trid(x.driver)}</small></div><strong>{Math.round(x.score)}</strong></button>)}</article></section>
    <section className="panel v10-table-panel"><div className="panel-head"><div><h2>Mentor driver register</h2><p>Score, risk categories and training evidence.</p></div><input className="v10-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search driver or TRID…"/></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Driver</th><th>TRID</th><th>Score</th><th>Acceleration</th><th>Braking</th><th>Cornering</th><th>Distraction</th><th>Speeding</th><th>Events</th><th>Training</th><th>Completed</th><th /></tr></thead><tbody>
    {filtered.map(x=>{const d=x.details||{},t=toneMentor(x.score);return <tr key={x.id}><td><b>{dname(x.driver)}</b><small className="history-date">{x.driver?.site||"DLS2"}</small></td><td><code className="v10-trid">{trid(x.driver)}</code></td><td><span className={`v10-score ${t}`}>{x.score==null?"—":Math.round(x.score)}</span></td>{["acceleration","braking","cornering","distraction","speedingRisk"].map(k=><td key={k}><span className={`v10-risk ${riskTone(d[k])}`}>{d[k]||"—"}</span></td>)}<td>{d.speedingEvents??"—"}</td><td>{d.training??"—"}</td><td>{d.completed??"—"}</td><td><button className="profile-link" onClick={()=>onOpenDriver?.(openShape(x.row,{mentor_score:x.score,fico:x.score,ementor:x.score}))}>Open →</button></td></tr>})}
    {!filtered.length&&<tr><td colSpan="12"><div className="v10-empty">No Mentor evidence returned for this period.</div></td></tr>}
    </tbody></table></div></section>
  </>;
}

function contiguousWeeks(rows,range){
  const present=[...new Set(rows.map(r=>r.week_label).filter(Boolean))].sort((a,b)=>weekNo(a)-weekNo(b));
  if(!present.length)return [];
  const min=weekNo(present[0]),max=weekNo(present[present.length-1]);
  const start=range==="all"?min:Math.max(min,max-Number(range)+1);
  return Array.from({length:max-start+1},(_,i)=>`W${String(start+i).padStart(2,"0")}`);
}
export function DirectConcessionsView({organizationId,onOpenDriver}){
  const load=useDbRows(organizationId,"concessions");
  const [range,setRange]=useState(8);
  const [query,setQuery]=useState("");
  if(load.loading)return <Loading text="Loading concessions directly from saved driver metrics…"/>;
  if(load.error)return <ErrorBox error={load.error}/>;

  const weeks=contiguousWeeks(load.rows,range);
  const weekSet=new Set(weeks);
  const weekTotals=weeks.map(w=>load.rows.filter(r=>r.week_label===w).reduce((s,r)=>s+(n(r.concessions)||0),0));
  const presentSet=new Set(load.rows.map(r=>r.week_label));
  const m=new Map();
  for(const row of load.rows){
    if(!weekSet.has(row.week_label))continue;
    const d=row.drivers||{},id=row.driver_id||trid(d);
    const cur=m.get(id)||{id,driver:d,byWeek:{},row};
    cur.byWeek[row.week_label]=n(row.concessions);
    cur.row=row;
    m.set(id,cur);
  }
  const ranking=[...m.values()].map(x=>{
    const values=weeks.map(w=>Object.prototype.hasOwnProperty.call(x.byWeek,w)?x.byWeek[w]:null);
    const reported=values.filter(v=>v!=null);
    const total=reported.reduce((a,b)=>a+b,0);
    const affected=reported.filter(v=>v>0).length;
    return {...x,values,total,reported:reported.length,affected,avg:reported.length?total/reported.length:0};
  }).sort((a,b)=>b.total-a.total||b.affected-a.affected);
  const filtered=ranking.filter(x=>`${dname(x.driver)} ${trid(x.driver)}`.toLowerCase().includes(query.toLowerCase()));
  const total=weekTotals.reduce((a,b)=>a+b,0);
  const missingWeeks=weeks.filter(w=>!presentSet.has(w));

  return <>
    <div className="page-heading v10-heading"><div><span className="page-kicker">QUALITY</span><h1>Concessions intelligence</h1><p>Professional weekly matrix with explicit missing-report weeks and cumulative totals.</p></div><RangeTabs value={range} onChange={setRange}/></div>
    {missingWeeks.length>0&&<div className="v10-info-banner"><b>Missing report:</b> {missingWeeks.join(", ")} {missingWeeks.length===1?"has":"have"} no concessions data stored yet. It is shown as “Not imported”, never as zero.</div>}
    <section className="v10-week-cards">{weeks.map((w,i)=><article key={w} className={!presentSet.has(w)?"missing":""}><span>{w}</span><strong>{presentSet.has(w)?weekTotals[i]:"—"}</strong><small>{presentSet.has(w)?"Total concessions":"Not imported"}</small></article>)}</section>
    <section className="v10-kpi-grid"><article><span>Total concessions</span><strong>{total}</strong><small>Selected period</small></article><article><span>Drivers tracked</span><strong>{ranking.length}</strong><small>With reported evidence</small></article><article><span>Repeat drivers</span><strong>{ranking.filter(x=>x.affected>=2).length}</strong><small>2+ affected weeks</small></article><article className={missingWeeks.length?"warn":""}><span>Missing weeks</span><strong>{missingWeeks.length}</strong><small>{missingWeeks.join(", ")||"Complete reporting"}</small></article></section>
    <section className="panel v10-table-panel"><div className="panel-head"><div><h2>Driver concession matrix</h2><p>Each reporting week remains visible. Total is the cumulative selected-period count.</p></div><input className="v10-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search driver or TRID…"/></div><div className="table-wrap"><table className="data-table v10-concessions"><thead><tr><th>#</th><th>Driver</th><th>TRID</th>{weeks.map(w=><th key={w}>{w}</th>)}<th>Total</th><th>Weeks affected</th><th>Avg/week</th><th /></tr></thead><tbody>
    {filtered.map((x,i)=><tr key={x.id}><td><span className="rank-badge">{i+1}</span></td><td><b>{dname(x.driver)}</b><small className="history-date">{x.driver?.site||"DLS2"}</small></td><td><code className="v10-trid">{trid(x.driver)}</code></td>{x.values.map((v,j)=><td key={weeks[j]}>{!presentSet.has(weeks[j])?<span className="v10-missing">Not imported</span>:v==null?<span className="missing-cell">—</span>:<span className={`concession-cell ${v>=3?"high":v>=2?"med":v>=1?"low":""}`}>{v}</span>}</td>)}<td><b className={x.total>=5?"v10-total bad":x.total>=2?"v10-total warn":"v10-total good"}>{x.total}</b></td><td>{x.affected}/{x.reported}</td><td>{x.avg.toFixed(2)}</td><td><button className="profile-link" onClick={()=>onOpenDriver?.(openShape(x.row,{concessions:x.total}))}>Open →</button></td></tr>)}
    {!filtered.length&&<tr><td colSpan={7+weeks.length}><div className="v10-empty">No concessions data matches this selection.</div></td></tr>}
    </tbody><tfoot><tr><td colSpan="3"><b>Weekly total</b></td>{weeks.map((w,i)=><td key={w}><b>{presentSet.has(w)?weekTotals[i]:"—"}</b></td>)}<td><b>{total}</b></td><td colSpan="3">Selected period</td></tr></tfoot></table></div></section>
  </>;
}
