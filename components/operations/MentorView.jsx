"use client";

import { useMemo, useState } from "react";
import { TARGETS, targetLabel } from "../../lib/config/performance";
import {
  ErrorBox,
  Loading,
  RangeTabs,
  dname,
  filterRowsBySite,
  n,
  openShape,
  riskTone,
  toneMentor,
  trid,
  useOperationalRows,
  weekNo,
} from "../operations/OperationalShared";

export default function MentorView({organizationId,onOpenDriver,siteFilter="all"}){
  const load=useOperationalRows(organizationId,"mentor");
  const [range,setRange]=useState(4);
  const [query,setQuery]=useState("");
  const rows=useMemo(()=>filterRowsBySite(load.rows,siteFilter),[load.rows,siteFilter]);
  const presentWeeks=useMemo(()=>[...new Set(rows.map(r=>r.week_label).filter(Boolean))].sort((a,b)=>weekNo(a)-weekNo(b)),[rows]);
  const weeks=range==="all"?presentWeeks:presentWeeks.slice(-Number(range));
  const set=new Set(weeks);
  const map=useMemo(()=>{
    const m=new Map();
    for(const row of rows){
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
  },[rows,weeks.join("|")]);

  if(load.loading)return <Loading text="Loading Mentor directly from saved driver metrics…"/>;
  if(load.error)return <ErrorBox error={load.error}/>;

  const filtered=map.filter(x=>`${dname(x.driver)} ${trid(x.driver)}`.toLowerCase().includes(query.toLowerCase()));
  const scored=map.filter(x=>x.score!=null);
  const avg=scored.length?scored.reduce((s,x)=>s+x.score,0)/scored.length:null;
  const below=scored.filter(x=>x.score<TARGETS.mentor).length;
  const highRisk=map.filter(x=>Object.values(x.details||{}).some(v=>String(v).toLowerCase().includes("high risk"))).length;
  const training=map.filter(x=>n(x.details?.training)!=null&&n(x.details?.completed)!=null&&Number(x.details.completed)<Number(x.details.training)).length;
  const top=scored.slice(0,5);
  const bottom=[...scored].sort((a,b)=>a.score-b.score).slice(0,5);

  return <>
    <div className="page-heading v10-heading"><div><span className="page-kicker">SAFETY</span><h1>Mentor intelligence</h1><p>Direct database view using the saved Mentor score and behaviour evidence.</p></div><RangeTabs value={range} onChange={setRange}/></div>
    <section className="v10-kpi-grid"><article><span>Average score</span><strong>{avg==null?"—":Math.round(avg)}</strong><small>{targetLabel("mentor")}</small></article><article className={below?"warn":""}><span>Below target</span><strong>{below}</strong><small>Needs attention</small></article><article className={highRisk?"bad":""}><span>High-risk behaviour</span><strong>{highRisk}</strong><small>Any high-risk category</small></article><article><span>Training outstanding</span><strong>{training}</strong><small>Completed below assigned</small></article></section>
    <section className="dashboard-grid lower"><article className="panel v10-rank-card"><div className="panel-head"><div><h2>Top 5 Mentor</h2><p>Highest driving scores.</p></div></div>{top.map((x,i)=><button key={x.id} onClick={()=>onOpenDriver?.(openShape(x.row,{mentor_score:x.score,fico:x.score,ementor:x.score}))}><span className="rank-badge">{i+1}</span><div><b>{dname(x.driver)}</b><small>{trid(x.driver)}</small></div><strong>{Math.round(x.score)}</strong></button>)}</article><article className="panel v10-rank-card attention"><div className="panel-head"><div><h2>Bottom 5 — attention</h2><p>Lowest Mentor scores first.</p></div></div>{bottom.map((x,i)=><button key={x.id} onClick={()=>onOpenDriver?.(openShape(x.row,{mentor_score:x.score,fico:x.score,ementor:x.score,risk:"Medium",issue:"Mentor score below target"}))}><span className="rank-badge">{i+1}</span><div><b>{dname(x.driver)}</b><small>{trid(x.driver)}</small></div><strong>{Math.round(x.score)}</strong></button>)}</article></section>
    <section className="panel v10-table-panel"><div className="panel-head"><div><h2>Mentor driver register</h2><p>Score, risk categories and training evidence.</p></div><input className="v10-search" aria-label="Search Mentor drivers" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search driver or TRID…"/></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Driver</th><th>TRID</th><th>Score</th><th>Acceleration</th><th>Braking</th><th>Cornering</th><th>Distraction</th><th>Speeding</th><th>Events</th><th>Training</th><th>Completed</th><th /></tr></thead><tbody>
    {filtered.map(x=>{const d=x.details||{},t=toneMentor(x.score, TARGETS.mentor);return <tr key={x.id}><td><b>{dname(x.driver)}</b><small className="history-date">{x.driver?.site||"Unassigned"}</small></td><td><code className="v10-trid">{trid(x.driver)}</code></td><td><span className={`v10-score ${t}`}>{x.score==null?"—":Math.round(x.score)}</span></td>{["acceleration","braking","cornering","distraction","speedingRisk"].map(k=><td key={k}><span className={`v10-risk ${riskTone(d[k])}`}>{d[k]||"—"}</span></td>)}<td>{d.speedingEvents??"—"}</td><td>{d.training??"—"}</td><td>{d.completed??"—"}</td><td><button className="profile-link" onClick={()=>onOpenDriver?.(openShape(x.row,{mentor_score:x.score,fico:x.score,ementor:x.score}))}>Open →</button></td></tr>})}
    {!filtered.length&&<tr><td colSpan="12"><div className="v10-empty">No Mentor evidence returned for this period.</div></td></tr>}
    </tbody></table></div></section>
  </>;
}


