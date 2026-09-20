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
  const [mode,setMode]=useState("weekly");\n  const [week,setWeek]=useState("");\n  const [day,setDay]=useState("");
  const [query,setQuery]=useState("");\n  const days=useMemo(()=>[...new Set(rows.map(r=>r.period_end||r.period_start).filter(Boolean))].sort().reverse(),[rows]);
  const selectedWeek=week&&weeks.includes(week)?week:(weeks[0]||"");\n  const selectedDay=day&&days.includes(day)?day:(days[0]||"");
  const selected=useMemo(()=>rows.filter(r=>mode==="daily"?(r.period_end||r.period_start)===selectedDay:r.week_label===selectedWeek).sort((a,b)=>Number(b.iadc)-Number(a.iadc)),[rows,mode,selectedDay,selectedWeek]);
  const filtered=selected.filter(r=>`${dname(r.drivers)} ${trid(r.drivers)} ${r.drivers?.site||""}`.toLowerCase().includes(query.toLowerCase()));
  const avg=selected.length?selected.reduce((s,r)=>s+Number(r.iadc),0)/selected.length:null;\n  const dwcRows=selected.map(r=>Number(r.raw_data?.dwc)).filter(Number.isFinite);\n  const dwcAvg=dwcRows.length?dwcRows.reduce((a,b)=>a+b,0)/dwcRows.length:null;\n  const atRisk=selected.filter(r=>Number(r.iadc)>=70&&Number(r.iadc)<80).length;\n  const critical=selected.filter(r=>Number(r.iadc)<70).length;
  const below=selected.filter(r=>Number(r.iadc)<80).length;
  const onTarget=selected.filter(r=>Number(r.iadc)>=TARGETS.iadc).length;
  const excellent=selected.filter(r=>Number(r.iadc)>=90).length;
  const top=selected.slice(0,5);
  const bottom=[...selected].sort((a,b)=>Number(a.iadc)-Number(b.iadc)).slice(0,5);

  if(load.loading)return <Loading text="Loading IADC directly from saved driver metrics…"/>;
  if(load.error)return <ErrorBox error={load.error}/>;

  return <>
    <div className="page-heading v10-heading">
      <div><span className="page-kicker">WORKFLOW COMPLIANCE</span><h1>IADC & DWC — Driver Compliance</h1><p>Analyse driver compliance, selected-period performance and workflow exceptions.</p></div>
      <div className="scorecard-filter-row"><button className="btn primary" onClick={onImport}>Import DWC/IADC Report</button></div>
    </div>

    <section className="iadc-period-toolbar"><div className="iadc-period-tabs"><button className={mode==="daily"?"active":""} onClick={()=>setMode("daily")}>Daily</button><button className={mode==="weekly"?"active":""} onClick={()=>setMode("weekly")}>Weekly</button></div>{mode==="daily"?<select value={selectedDay} onChange={e=>setDay(e.target.value)}>{days.map(d=><option key={d} value={d}>{d}</option>)}</select>:<select value={selectedWeek} onChange={e=>setWeek(e.target.value)}>{weeks.map(w=><option key={w}>{w}</option>)}</select>}<input className="v10-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search driver or TRID…"/></section>\n\n    <section className="v10-kpi-grid six">
      <article><span>Fleet IADC</span><strong>{pct(avg,1)}</strong><small>{targetLabel("iadc")}</small></article>
      <article><span>Measured drivers</span><strong>{selected.length}</strong><small>{mode==="daily"?(selectedDay||"No date"):(selectedWeek||"No period")}</small></article>
      <article><span>DWC average</span><strong>{pct(dwcAvg,1)}</strong><small>{dwcAvg==null?"Awaiting DWC evidence":"Workflow compliance"}</small></article>
      <article><span>On target</span><strong>{onTarget}</strong><small>{`${TARGETS.iadc}%+`}</small></article>
      <article><span>At risk</span><strong>{atRisk}</strong><small>70–79%</small></article>
      <article className={critical?"warn":""}><span>Critical</span><strong>{critical}</strong><small>&lt;70%</small></article>
    </section>

    <section className="iadc-visual-grid"><article className="panel"><div className="panel-head"><div><h2>IADC Distribution</h2><p>Excellent / on target / at risk / critical.</p></div></div><div className="iadc-distribution"><strong>{pct(avg,1)}</strong><span>Fleet IADC</span><div className="iadc-band-row"><i className="excellent" style={{flex:excellent||0}}/><i className="good" style={{flex:(onTarget-excellent)||0}}/><i className="warn" style={{flex:atRisk||0}}/><i className="bad" style={{flex:critical||0}}/></div><small>{excellent} excellent · {Math.max(0,onTarget-excellent)} on target · {atRisk} at risk · {critical} critical</small></div></article><article className="panel"><div className="panel-head"><div><h2>DWC Overview</h2><p>Driver Workflow Compliance for the selected period.</p></div></div><div className="dwc-simple"><div className="dwc-ring"><strong>{pct(dwcAvg,1)}</strong><span>DWC</span></div><p>{dwcAvg==null?"No DWC values are stored for this period yet. Import a DWC/IADC report to populate this view.":"DWC is shown alongside IADC without adding a second heavy dashboard."}</p></div></article></section>\n\n    <section className="dashboard-grid lower">
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


