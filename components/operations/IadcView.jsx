"use client";

import { useMemo, useState } from "react";
import { TARGETS, targetLabel } from "../../lib/config/performance";
import {
  ErrorBox,
  Loading,
  dname,
  filterRowsBySite,
  n,
  openShape,
  pct,
  toneIadc,
  trid,
  useOperationalRows,
  weekNo,
} from "../operations/OperationalShared";

export default function IadcView({organizationId,onOpenDriver,onImport,siteFilter="all"}){
  const load=useOperationalRows(organizationId,"iadc");
  const rows=filterRowsBySite(load.rows,siteFilter);
  const weeks=useMemo(()=>[...new Set(rows.map(r=>r.week_label).filter(Boolean))].sort((a,b)=>weekNo(b)-weekNo(a)),[rows]);
  const [week,setWeek]=useState("");
  const [query,setQuery]=useState("");
  const selectedWeek=week||weeks[0]||"";
  const selected=useMemo(()=>rows.filter(r=>r.week_label===selectedWeek).sort((a,b)=>Number(b.iadc)-Number(a.iadc)),[rows,selectedWeek]);
  const filtered=selected.filter(r=>`${dname(r.drivers)} ${trid(r.drivers)} ${r.drivers?.site||""}`.toLowerCase().includes(query.toLowerCase()));
  const avg=selected.length?selected.reduce((s,r)=>s+Number(r.iadc),0)/selected.length:null;
  const below=selected.filter(r=>Number(r.iadc)<80).length;
  const onTarget=selected.filter(r=>Number(r.iadc)>=TARGETS.iadc).length;
  const excellent=selected.filter(r=>Number(r.iadc)>=90).length;
  const top=selected.slice(0,5);
  const bottom=[...selected].sort((a,b)=>Number(a.iadc)-Number(b.iadc)).slice(0,5);

  if(load.loading)return <Loading text="Loading IADC directly from saved driver metrics…"/>;
  if(load.error)return <ErrorBox error={load.error}/>;

  return <>
    <div className="page-heading v10-heading">
      <div><span className="page-kicker">WORKFLOW COMPLIANCE</span><h1>IADC intelligence</h1><p>Direct database view: driver name, Transporter ID and exact weekly IADC percentage.</p></div>
      <div className="scorecard-filter-row"><select aria-label="Select IADC week" value={selectedWeek} onChange={e=>setWeek(e.target.value)}>{weeks.map(w=><option key={w}>{w}</option>)}</select><button className="btn primary" onClick={onImport}>Import IADC</button></div>
    </div>

    <section className="v10-kpi-grid six">
      <article><span>Fleet IADC</span><strong>{pct(avg,1)}</strong><small>{targetLabel("iadc")}</small></article>
      <article><span>Measured drivers</span><strong>{selected.length}</strong><small>{selectedWeek||"No period"}</small></article>
      <article className={below?"warn":""}><span>Below target</span><strong>{below}</strong><small>Coaching priority</small></article>
      <article><span>On target</span><strong>{onTarget}</strong><small>{`${TARGETS.iadc}%+`}</small></article>
      <article><span>Excellent</span><strong>{excellent}</strong><small>90%+</small></article>
      <article><span>Best result</span><strong>{top[0]?pct(top[0].iadc,1):"—"}</strong><small>{top[0]?dname(top[0].drivers):"No evidence"}</small></article>
    </section>

    <section className="dashboard-grid lower">
      <article className="panel v10-rank-card"><div className="panel-head"><div><h2>Top 5 IADC</h2><p>Best in-app delivery workflow compliance.</p></div></div>{top.map((r,i)=><button key={`${r.driver_id}-${i}`} onClick={()=>onOpenDriver?.(openShape(r,{iadc:n(r.iadc)}))}><span className="rank-badge">{i+1}</span><div><b>{dname(r.drivers)}</b><small>{trid(r.drivers)}</small></div><strong>{pct(r.iadc)}</strong></button>)}</article>
      <article className="panel v10-rank-card attention"><div className="panel-head"><div><h2>Bottom 5 — coaching</h2><p>Lowest IADC results first.</p></div></div>{bottom.map((r,i)=><button key={`${r.driver_id}-${i}`} onClick={()=>onOpenDriver?.(openShape(r,{iadc:n(r.iadc),risk:"Medium",issue:"IADC below target"}))}><span className="rank-badge">{i+1}</span><div><b>{dname(r.drivers)}</b><small>{trid(r.drivers)}</small></div><strong>{pct(r.iadc)}</strong></button>)}</article>
    </section>

    <section className="panel v10-table-panel">
      <div className="panel-head"><div><h2>Driver IADC register</h2><p>Driver workflow register: Name + Transporter ID + IADC %.</p></div><input className="v10-search" aria-label="Search IADC drivers" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search driver or Transporter ID…"/></div>
      <div className="table-wrap"><table className="data-table v10-iadc-table"><thead><tr><th>#</th><th>Driver</th><th>Transporter ID</th><th>IADC %</th><th>Visual score</th><th>Gap to 80%</th><th>DWC</th><th>Band</th><th /></tr></thead><tbody>
      {filtered.map((r,i)=>{const value=Number(r.iadc),gap=value-TARGETS.iadc,t=toneIadc(value);return <tr key={`${r.driver_id}-${selectedWeek}-${i}`}><td><span className="rank-badge">{i+1}</span></td><td><b>{dname(r.drivers)}</b><small className="history-date">{r.drivers?.site||"Unassigned"}</small></td><td><code className="v10-trid">{trid(r.drivers)}</code></td><td><b className={`v10-score ${t}`}>{pct(value)}</b></td><td><div className="v10-progress"><i className={t} style={{width:`${Math.max(0,Math.min(100,value))}%`}}/></div></td><td><span className={gap>=0?"v10-positive":"v10-negative"}>{gap>=0?"+":""}{gap.toFixed(2)} pp</span></td><td>{pct(r.raw_data?.dwc)}</td><td><span className={`v10-band ${t}`}>{value>=90?"Excellent":value>=TARGETS.iadc?"On target":value>=70?"Watch":"Priority"}</span></td><td><button className="profile-link" onClick={()=>onOpenDriver?.(openShape(r,{iadc:value,risk:value<TARGETS.iadc?"Medium":"Low",issue:value<TARGETS.iadc?`IADC below ${TARGETS.iadc}% target`:"No active concern"}))}>Open →</button></td></tr>})}
      {!filtered.length&&<tr><td colSpan="9"><div className="v10-empty">No IADC rows returned for this week.</div></td></tr>}
      </tbody></table></div>
    </section>
  </>;
}


