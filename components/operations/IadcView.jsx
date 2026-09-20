"use client";

import { useMemo, useState } from "react";
import { TARGETS } from "../../lib/config/performance";
import { ErrorBox,Loading,dname,filterRowsBySite,n,openShape,pct,trid,useOperationalRows,weekNo } from "../operations/OperationalShared";

const rowDate=r=>r.period_end||r.period_start||"";
const dwcOf=r=>n(r.raw_data?.dwc);
const band=v=>v>=90?"excellent":v>=80?"target":v>=70?"risk":"critical";
const bandLabel=v=>v>=90?"Excellent":v>=80?"On target":v>=70?"At risk":"Critical";
const errorLabels={photoDefect:"Photo Defect",photoManualBypass:"Photo Manual Bypass",geoDistance25m:"Geo Distance > 25m",contactComplianceMiss:"Contact Compliance",otpMiss:"OTP Miss"};
const average=(a,get)=>{const x=a.map(get).filter(v=>v!=null&&Number.isFinite(Number(v))).map(Number);return x.length?x.reduce((s,v)=>s+v,0)/x.length:null};
const escapeCsv=v=>'"'+String(v??"").replaceAll('"','""')+'"';

export default function IadcView({organizationId,onOpenDriver,onImport,siteFilter="all"}){
  const load=useOperationalRows(organizationId,"iadc");
  const rows=filterRowsBySite(load.rows,siteFilter);
  const [mode,setMode]=useState("daily"),[week,setWeek]=useState(""),[day,setDay]=useState(""),[query,setQuery]=useState(""),[bandFilter,setBandFilter]=useState("all"),[page,setPage]=useState(1),[detail,setDetail]=useState(null);
  const weeks=useMemo(()=>[...new Set(rows.map(r=>r.week_label).filter(Boolean))].sort((a,b)=>weekNo(b)-weekNo(a)),[rows]);
  const days=useMemo(()=>[...new Set(rows.map(rowDate).filter(Boolean))].sort().reverse(),[rows]);
  const selectedWeek=week&&weeks.includes(week)?week:(weeks[0]||""),selectedDay=day&&days.includes(day)?day:(days[0]||"");
  const selected=useMemo(()=>rows.filter(r=>mode==="daily"?rowDate(r)===selectedDay:r.week_label===selectedWeek).sort((a,b)=>Number(b.iadc)-Number(a.iadc)),[rows,mode,selectedDay,selectedWeek]);
  const avg=average(selected,r=>r.iadc),dwcAvg=average(selected,dwcOf);
  const counts={excellent:selected.filter(r=>Number(r.iadc)>=90).length,target:selected.filter(r=>Number(r.iadc)>=80&&Number(r.iadc)<90).length,risk:selected.filter(r=>Number(r.iadc)>=70&&Number(r.iadc)<80).length,critical:selected.filter(r=>Number(r.iadc)<70).length};
  const filtered=selected.filter(r=>{const v=Number(r.iadc);return(bandFilter==="all"||band(v)===bandFilter)&&`${dname(r.drivers)} ${trid(r.drivers)}`.toLowerCase().includes(query.toLowerCase())});
  const shown=filtered;
  const trend=useMemo(()=>weeks.slice(0,4).reverse().map(w=>({label:w,value:average(rows.filter(r=>r.week_label===w),r=>r.iadc)})),[rows,weeks]);
  const dwcErrors=useMemo(()=>Object.entries(errorLabels).map(([key,label])=>({key,label,value:selected.reduce((s,r)=>s+Number(r.raw_data?.dwc_detail?.errors?.[key]||0),0)})).filter(x=>x.value>0),[selected]);
  const maxTrend=Math.max(80,...trend.map(x=>x.value||0)),minTrend=Math.min(60,...trend.map(x=>x.value||100));
  const trendPoints=trend.map((x,i)=>`${8+i*(84/Math.max(1,trend.length-1))},${82-((x.value||minTrend)-minTrend)/Math.max(1,maxTrend-minTrend)*62}`).join(" ");
  const active=detail||shown[0]||null;\n  const latestDwcRow=useMemo(()=>rows.filter(r=>dwcOf(r)!=null).sort((a,b)=>String(rowDate(b)).localeCompare(String(rowDate(a))))[0]||null,[rows]);\n  const dwcUnavailable=dwcAvg==null;
  const activeErrors=active?.raw_data?.dwc_detail?.errors||{};

  const reset=()=>{setQuery("");setBandFilter("all");setPage(1)};
  const exportCsv=()=>{const header=["Driver","TRID","IADC","DWC","Band"];const body=filtered.map(r=>[dname(r.drivers),trid(r.drivers),r.iadc,dwcOf(r),bandLabel(Number(r.iadc))]);const blob=new Blob([[header,...body].map(x=>x.map(escapeCsv).join(",")).join("\r\n")],{type:"text/csv"});const u=URL.createObjectURL(blob),a=document.createElement("a");a.href=u;a.download=`metrixiq-iadc-dwc-${mode==="daily"?selectedDay:selectedWeek}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(u),300)};
  const share=async()=>{const text=`MetrixIQ IADC/DWC · ${mode==="daily"?selectedDay:selectedWeek} · IADC ${pct(avg,1)} · DWC ${pct(dwcAvg,1)} · ${selected.length} drivers`;if(navigator.share)await navigator.share({title:"MetrixIQ IADC & DWC",text});else await navigator.clipboard?.writeText(text)};

  if(load.loading)return <Loading text="Loading IADC & DWC compliance…"/>;
  if(load.error)return <ErrorBox error={load.error}/>;

  return <div className="iadcv3">
    <div className="iadcv3-head"><div><span className="page-kicker">WORKFLOW COMPLIANCE</span><h1>IADC & DWC — Driver Compliance</h1><p>In-App Delivery Compliance (IADC) and Driver Workflow Compliance (DWC). Analyse performance, trends and error breakdowns.</p></div><div className="iadcv3-actions"><button className="btn primary" onClick={onImport}>⇧ &nbsp; Import DWC/IADC Report</button><button className="btn ghost" onClick={exportCsv}>⇧ &nbsp; Export</button><button className="btn ghost" onClick={share}>↗ &nbsp; Share</button></div></div>

    <section className="iadcv3-toolbar"><div className="iadcv3-tabs"><button className={mode==="daily"?"active":""} onClick={()=>{setMode("daily");setPage(1)}}>Daily</button><button className={mode==="weekly"?"active":""} onClick={()=>{setMode("weekly");setPage(1)}}>Weekly</button></div>{mode==="daily"?<select value={selectedDay} onChange={e=>{setDay(e.target.value);setPage(1)}}>{days.map(d=><option key={d}>{d}</option>)}</select>:<select value={selectedWeek} onChange={e=>{setWeek(e.target.value);setPage(1)}}>{weeks.map(w=><option key={w}>{w}</option>)}</select>}<select value={bandFilter} onChange={e=>{setBandFilter(e.target.value);setPage(1)}}><option value="all">All bands</option><option value="excellent">Excellent ≥90%</option><option value="target">On target 80–89%</option><option value="risk">At risk 70–79%</option><option value="critical">Critical &lt;70%</option></select><input aria-label="Search IADC drivers" value={query} onChange={e=>{setQuery(e.target.value);setPage(1)}} placeholder="⌕  Search driver or TRID…"/><button className="iadcv3-reset" onClick={reset}>Reset</button></section>

    <section className="iadcv3-kpis">
      <article><i>♟</i><div><span>Total Drivers</span><strong>{selected.length}</strong><small>{siteFilter==="all"?"All sites":siteFilter}</small></div></article>
      <article><i>◫</i><div><span>IADC (Average)</span><strong>{pct(avg,1)}</strong><small>Target ≥ {TARGETS.iadc}%</small></div></article>
      <article className={"mint "+(dwcUnavailable?"missing":"")}><i>✓</i><div><span>DWC (Average)</span><strong>{dwcUnavailable?"No data":pct(dwcAvg,1)}</strong><small>{dwcUnavailable?(latestDwcRow?`No DWC for selected day · latest ${rowDate(latestDwcRow)} ${pct(dwcOf(latestDwcRow),1)}`:"No DWC evidence in imported report"):"Workflow compliance"}</small></div></article>
      <article className="green"><i>✓</i><div><span>≥ 90% (Excellent)</span><strong>{counts.excellent}</strong><small>{selected.length?Math.round(counts.excellent/selected.length*1000)/10:0}%</small></div></article>
      <article className="yellow"><i>◎</i><div><span>80–89% (On target)</span><strong>{counts.target}</strong><small>{selected.length?Math.round(counts.target/selected.length*1000)/10:0}%</small></div></article>
      <article className="amber"><i>!</i><div><span>70–79% (At risk)</span><strong>{counts.risk}</strong><small>{selected.length?Math.round(counts.risk/selected.length*1000)/10:0}%</small></div></article>
      <article className="red"><i>×</i><div><span>&lt; 70% (Critical)</span><strong>{counts.critical}</strong><small>{selected.length?Math.round(counts.critical/selected.length*1000)/10:0}%</small></div></article>
    </section>

    <section className="iadcv3-charts">
      <article className="panel"><div className="panel-head"><div><h2>IADC Distribution</h2><p>Driver performance by IADC band</p></div></div><div className="iadcv3-donut-row"><div className="iadcv3-donut iadc" style={{"--a":`${selected.length?counts.excellent/selected.length*100:0}%`,"--b":`${selected.length?(counts.excellent+counts.target)/selected.length*100:0}%`,"--c":`${selected.length?(counts.excellent+counts.target+counts.risk)/selected.length*100:0}%`}}><div><strong>{selected.length}</strong><span>Drivers</span></div></div><div className="iadcv3-legend">{[["excellent","Excellent (≥ 90%)",counts.excellent],["target","On target (80–89%)",counts.target],["risk","At risk (70–79%)",counts.risk],["critical","Critical (< 70%)",counts.critical]].map(([k,l,v])=><p key={k}><i className={k}/><span>{l}</span><b>{v}</b><em>{selected.length?(v/selected.length*100).toFixed(1):"0.0"}%</em></p>)}</div></div></article>
      <article className="panel"><div className="panel-head"><div><h2>IADC Trend</h2><p>Weekly fleet compliance</p></div><span className="panel-badge">Last 4 weeks</span></div><div className="iadcv3-trend"><div className="iadcv3-target">Station Target (80%)</div><svg viewBox="0 0 100 100" preserveAspectRatio="none"><line x1="5" y1="43" x2="96" y2="43" className="target"/><polyline points={trendPoints} className="line"/>{trend.map((x,i)=><circle key={x.label} cx={8+i*(84/Math.max(1,trend.length-1))} cy={82-((x.value||minTrend)-minTrend)/Math.max(1,maxTrend-minTrend)*62} r="1.8"/>)}</svg><div className="iadcv3-trend-labels">{trend.map(x=><span key={x.label}>{x.label}<b>{pct(x.value,1)}</b></span>)}</div></div></article>
      <article className="panel"><div className="panel-head"><div><h2>DWC Overview</h2><p>Driver Workflow Compliance · selected period only</p></div></div>{dwcUnavailable?<div className="iadcv3-dwc-missing"><strong>No DWC score was published for {selectedDay||selectedWeek}.</strong><p>This is not a zero score. The Amazon report contains no DWC value for this selected period.</p>{latestDwcRow?<p>Latest available DWC evidence: <b>{rowDate(latestDwcRow)} · {pct(dwcOf(latestDwcRow),1)}</b>. Select that date to inspect the drivers.</p>:null}</div>:<div className="iadcv3-donut-row"><div className="iadcv3-donut dwc"><div><strong>{pct(dwcAvg,1)}</strong><span>DWC</span></div></div><div className="iadcv3-legend">{dwcErrors.length?dwcErrors.map((x,i)=><p key={x.key}><i className={"dwc"+i}/><span>{x.label}</span><b>{x.value}</b></p>):<p className="empty">DWC score is available, but this import does not contain a driver-level error breakdown.</p>}</div></div>}</article>
    </section>

    <section className="iadcv3-lower">
      <article className="panel iadcv3-table"><div className="panel-head"><div><h2>Driver Performance</h2><p>Click a driver to view detailed breakdown</p></div></div><div className="table-wrap"><table><thead><tr><th>#</th><th>Driver name</th><th>Transporter ID</th><th>IADC %</th><th>Band</th><th>DWC %</th><th>Actions</th></tr></thead><tbody>{shown.map((r,i)=>{const v=Number(r.iadc),b=band(v);return <tr key={r.driver_id+"-"+i} className={active===r?"active":""} onClick={()=>setDetail(r)}><td><span className="rank-badge">{i+1}</span></td><td><b>{dname(r.drivers)}</b></td><td><code>{trid(r.drivers)}</code></td><td><strong className={"iadcv3-score "+b}>{pct(v)}</strong></td><td><span className={"iadcv3-band "+b}>{bandLabel(v)}</span></td><td><b>{pct(dwcOf(r))}</b></td><td><button onClick={e=>{e.stopPropagation();setDetail(r)}}>◉ &nbsp; View</button></td></tr>})}</tbody></table></div><footer><span>Showing all {filtered.length} drivers · highest IADC to lowest IADC</span></footer></article>

      <aside className="panel iadcv3-detail">{active?<><div className="iadcv3-detail-head"><div className="driver-avatar">{String(dname(active.drivers)).split(" ").map(x=>x[0]).slice(0,2).join("")}</div><div><h2>{dname(active.drivers)}</h2><p>{trid(active.drivers)}</p></div><button onClick={()=>setDetail(null)}>×</button></div><div className="iadcv3-detail-tabs"><b>Overview</b><span>IADC</span><span>DWC</span></div><div className="iadcv3-detail-kpis"><article><span>IADC (Selected Period)</span><strong>{pct(active.iadc)}</strong></article><article><span>DWC (Selected Period)</span><strong>{pct(dwcOf(active))}</strong></article></div><h3>DWC error breakdown</h3><div className="iadcv3-errors">{Object.entries(errorLabels).map(([k,l])=><p key={k}><span>{l}</span><b>{activeErrors[k]??"—"}</b></p>)}</div><button className="btn primary full" onClick={()=>onOpenDriver?.(openShape(active,{iadc:n(active.iadc),dwc:dwcOf(active),risk:Number(active.iadc)<70?"High":Number(active.iadc)<80?"Medium":"Low"}))}>Open Driver 360 →</button></>:<div className="v10-empty">Select a driver to view details.</div>}</aside>
    </section>
  </div>;
}