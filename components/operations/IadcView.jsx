"use client";\n// IADC/DWC workspace: daily + weekly compliance views, direct import, export, share, detail and pagination.

import { useMemo, useRef, useState } from "react";
import { analyseFiles } from "../../lib/analyzer";
import { IMPORT_ACCEPT } from "../../lib/imports/preflight";
import { ErrorBox,Loading,dname,filterRowsBySite,n,openShape,pct,trid,useOperationalRows,weekNo } from "../operations/OperationalShared";

const rowDate=r=>String(r?.raw_data?.metric_date||r?.period_end||r?.period_start||"").slice(0,10);
const calendarWeek=r=>{
  const raw=String(r?.raw_data?.calendar_week||r?.week_label||"");
  const match=raw.match(/W\d+/i);
  return match?match[0].toUpperCase():raw;
};
const granularity=r=>String(r?.raw_data?.metric_granularity||"weekly");
const dwcOf=r=>n(r.raw_data?.dwc);
const METRIC_META={iadc:{label:"IADC",target:80,bands:[90,80,70],title:"IADC & DWC — Driver Compliance",kicker:"WORKFLOW COMPLIANCE",description:"In-App Delivery Compliance (IADC) and Driver Workflow Compliance (DWC). Analyse performance, trends and error breakdowns."},pod:{label:"POD",target:99.6,bands:[99.8,99.6,99],title:"POD — Photo-on-Delivery Compliance",kicker:"DELIVERY QUALITY",description:"Photo-on-Delivery compliance by driver. Weekly values come from scorecards; Daily values are shown only when a true daily source exists."},dcr:{label:"DCR",target:99.2,bands:[99.5,99.2,98],title:"DCR — Delivery Completion Rate",kicker:"DELIVERY PERFORMANCE",description:"Delivery Completion Rate by driver. Weekly values come from scorecards; Daily values are shown only when a true daily source exists."},cc:{label:"CC",target:98,bands:[99,98,95],title:"Customer Compliance",kicker:"CUSTOMER COMPLIANCE",description:"Customer Compliance by driver. Weekly values come from scorecards; Daily values are shown only when a true daily source exists."}};
const errorLabels={photoDefect:"Photo Defect",photoManualBypass:"Photo Manual Bypass",geoDistance25m:"Geo Distance > 25m",contactComplianceMiss:"Contact Compliance",otpMiss:"OTP Miss"};
const average=(a,get)=>{const x=a.map(get).filter(v=>v!=null&&Number.isFinite(Number(v))).map(Number);return x.length?x.reduce((s,v)=>s+v,0)/x.length:null};
const escapeCsv=v=>'"'+String(v??"").replaceAll('"','""')+'"';

export default function IadcView({organizationId,onOpenDriver,onImport,onImported,siteFilter="all",metric="iadc",initialComplianceTab="iadc",refreshKey=0}){
  const load=useOperationalRows(organizationId,metric,refreshKey);
  const rows=filterRowsBySite(load.rows,siteFilter);
  const meta=METRIC_META[metric]||METRIC_META.iadc;
  const metricValue=r=>n(r?.[metric]);
  const [excellentCut,targetCut,riskCut]=meta.bands||[90,80,70];
  const metricBand=v=>v>=excellentCut?"excellent":v>=targetCut?"target":v>=riskCut?"risk":"critical";
  const metricBandLabel=v=>v>=excellentCut?"Excellent":v>=targetCut?"On target":v>=riskCut?"At risk":"Critical";
  const [mode,setMode]=useState("daily"),[week,setWeek]=useState(""),[day,setDay]=useState(""),[query,setQuery]=useState(""),[bandFilter,setBandFilter]=useState("all"),[detail,setDetail]=useState(null),[complianceTab,setComplianceTab]=useState(initialComplianceTab),[page,setPage]=useState(1),[importing,setImporting]=useState(false),[importMessage,setImportMessage]=useState(""),fileInput=useRef(null);
  const weeks=useMemo(()=>[...new Set(rows.map(calendarWeek).filter(w=>/^W\\d+$/i.test(w)))].sort((a,b)=>weekNo(b)-weekNo(a)),[rows]);
  const selectedWeek=week&&weeks.includes(week)?week:(weeks[0]||"");
  const weekRows=useMemo(()=>rows.filter(r=>granularity(r)==="weekly"&&calendarWeek(r)===selectedWeek),[rows,selectedWeek]);
  const dailyRows=useMemo(()=>rows.filter(r=>granularity(r)==="daily"&&calendarWeek(r)===selectedWeek),[rows,selectedWeek]);
  const days=useMemo(()=>[...new Set(dailyRows.map(rowDate).filter(Boolean))].sort().reverse(),[dailyRows]);
  const selectedDay=day&&days.includes(day)?day:(days[0]||"");
  const selected=useMemo(()=>(
    mode==="daily"?dailyRows.filter(r=>rowDate(r)===selectedDay):weekRows
  ).sort((a,b)=>Number(metricValue(b))-Number(metricValue(a))),[mode,dailyRows,weekRows,selectedDay,metric]);
  const officialSummary=selected.find(r=>r.raw_data?.compliance_summary)?.raw_data?.compliance_summary||null;
  const avg=metric==="iadc"?(n(officialSummary?.iadc)??average(selected,r=>r.iadc)):average(selected,metricValue);
  const dwcAvg=n(officialSummary?.dwc)??average(selected,dwcOf);
  const counts={excellent:selected.filter(r=>Number(metricValue(r))>=excellentCut).length,target:selected.filter(r=>Number(metricValue(r))>=targetCut&&Number(metricValue(r))<excellentCut).length,risk:selected.filter(r=>Number(metricValue(r))>=riskCut&&Number(metricValue(r))<targetCut).length,critical:selected.filter(r=>Number(metricValue(r))<riskCut).length};
  const filtered=selected.filter(r=>{const v=Number(metricValue(r));return(bandFilter==="all"||metricBand(v)===bandFilter)&&`${dname(r.drivers)} ${trid(r.drivers)}`.toLowerCase().includes(query.toLowerCase())});
  const pageSize=10,totalPages=Math.max(1,Math.ceil(filtered.length/pageSize)),safePage=Math.min(page,totalPages);\n  const shown=filtered.slice((safePage-1)*pageSize,safePage*pageSize);
  const trend=useMemo(()=>weeks.slice(0,4).reverse().map(w=>{const wr=rows.filter(r=>granularity(r)==="weekly"&&calendarWeek(r)===w);const summary=wr.find(r=>r.raw_data?.compliance_summary)?.raw_data?.compliance_summary;return {label:w,value:metric==="iadc"?(n(summary?.iadc)??average(wr,r=>r.iadc)):average(wr,metricValue)}}),[rows,weeks,metric]);
  const dwcErrors=useMemo(()=>Object.entries(errorLabels).map(([key,label])=>({key,label,value:selected.reduce((s,r)=>s+Number(r.raw_data?.dwc_detail?.errors?.[key]||0),0)})).filter(x=>x.value>0),[selected]);
  const maxTrend=Math.max(80,...trend.map(x=>x.value||0)),minTrend=Math.min(60,...trend.map(x=>x.value||100));
  const trendPoints=trend.map((x,i)=>`${8+i*(84/Math.max(1,trend.length-1))},${82-((x.value||minTrend)-minTrend)/Math.max(1,maxTrend-minTrend)*62}`).join(" ");
  const active=detail||shown[0]||null;
  const latestDwcRow=useMemo(()=>rows.filter(r=>granularity(r)==="daily"&&dwcOf(r)!=null).sort((a,b)=>rowDate(b).localeCompare(rowDate(a)))[0]||null,[rows]);
  const dwcUnavailable=dwcAvg==null;
  const activeErrors=active?.raw_data?.dwc_detail?.errors||{};

  const reset=()=>{setQuery("");setBandFilter("all");setPage(1)};
  const quickImport=async file=>{if(!file||importing)return;setImporting(true);setImportMessage(`Analysing ${file.name}…`);try{const result=await analyseFiles([file]);const types=(result?.fileResults||[]).filter(x=>x.recognized).map(x=>String(x.reportType||"").toLowerCase());if(!result?.recognizedFiles||!types.some(x=>x.includes("iadc")))throw new Error("This is not an IADC / DWC report.");await onImported?.(result,[file]);setImportMessage("IADC / DWC report imported. Select a day or Weekly to review it.");setWeek("");setDay("");setDetail(null);}catch(e){setImportMessage(e?.message||"Could not import IADC / DWC report.");}finally{setImporting(false);if(fileInput.current)fileInput.current.value=""}};
  const exportCsv=()=>{const header=metric==="iadc"?["Driver","TRID",meta.label,"DWC","Band"]:["Driver","TRID",meta.label,"Band"];const body=filtered.map(r=>metric==="iadc"?[dname(r.drivers),trid(r.drivers),metricValue(r),dwcOf(r),metricBandLabel(Number(metricValue(r)))]:[dname(r.drivers),trid(r.drivers),metricValue(r),metricBandLabel(Number(metricValue(r)))]);const blob=new Blob([[header,...body].map(x=>x.map(escapeCsv).join(",")).join("\\r\
")],{type:"text/csv"});const u=URL.createObjectURL(blob),a=document.createElement("a");a.href=u;a.download=`metrixiq-${metric}-${mode==="daily"?selectedDay:selectedWeek}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(u),300)};
  const share=async()=>{const text=`MetrixIQ ${meta.label} · ${mode==="daily"?selectedDay:selectedWeek} · ${meta.label} ${pct(avg,1)} · ${selected.length} drivers`;if(navigator.share)await navigator.share({title:`MetrixIQ ${meta.label}`,text});else await navigator.clipboard?.writeText(text)};

  if(load.loading)return <Loading text={`Loading ${meta.label} compliance…`}/>;
  if(load.error)return <ErrorBox error={load.error}/>;

  return <div className="iadcv3">
    <div className="iadcv3-head"><div><span className="page-kicker">{meta.kicker}</span><h1>{meta.title}</h1><p>{meta.description}</p></div><div className="iadcv3-actions"><input ref={fileInput} type="file" hidden accept={IMPORT_ACCEPT} onChange={e=>quickImport(e.target.files?.[0])}/><button className="btn primary" disabled={importing} onClick={()=>metric==="iadc"?fileInput.current?.click():onImport?.()}>{importing?"Importing…":"⇧  Import IADC / DWC"}</button><button className="btn ghost" onClick={exportCsv}>⇧ &nbsp; Export</button><button className="btn ghost" onClick={share}>↗ &nbsp; Share</button></div></div>

    {metric==="iadc"?<div className="iadcv3-metric-tabs"><button className={complianceTab==="iadc"?"active":""} onClick={()=>setComplianceTab("iadc")}>IADC</button><button className={complianceTab==="dwc"?"active":""} onClick={()=>setComplianceTab("dwc")}>DWC</button></div>:null}
    {importMessage?<div className="ccv2-import-message">{importMessage}</div>:null}
    <section className="iadcv3-toolbar"><div className="iadcv3-tabs"><button className={mode==="daily"?"active":""} onClick={()=>{setMode("daily");}}>Daily</button><button className={mode==="weekly"?"active":""} onClick={()=>{setMode("weekly");}}>Weekly</button></div>{mode==="daily"?<select value={selectedDay} onChange={e=>{setDay(e.target.value);}}>{days.map(d=><option key={d}>{d}</option>)}</select>:<select value={selectedWeek} onChange={e=>{setWeek(e.target.value);}}>{weeks.map(w=><option key={w}>{w}</option>)}</select>}<select value={bandFilter} onChange={e=>{setBandFilter(e.target.value);setPage(1);}}><option value="all">All bands</option><option value="excellent">Excellent ≥{excellentCut}%</option><option value="target">On target ≥{targetCut}%</option><option value="risk">At risk ≥{riskCut}%</option><option value="critical">Critical &lt;{riskCut}%</option></select><input aria-label={`Search ${meta.label} drivers`} value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}} placeholder="⌕  Search driver or TRID…"/><button className="iadcv3-reset" onClick={reset}>Reset</button></section>

    {complianceTab==="iadc"||metric!=="iadc"?<><section className="iadcv3-kpis">
      <article><i>♟</i><div><span>Total Drivers</span><strong>{selected.length}</strong><small>{siteFilter==="all"?"All sites":siteFilter}</small></div></article>
      <article><i>◫</i><div><span>{meta.label} (Average)</span><strong>{pct(avg,1)}</strong><small>Target ≥ {meta.target}%</small></div></article>
      {metric==="iadc"?<article className={"mint "+(dwcUnavailable?"missing":"")}><i>✓</i><div><span>DWC (Average)</span><strong>{dwcUnavailable?"No data":pct(dwcAvg,1)}</strong><small>{dwcUnavailable?(latestDwcRow?`No DWC for selected day · latest ${rowDate(latestDwcRow)} ${pct(dwcOf(latestDwcRow),1)}`:"No DWC evidence in imported report"):"Workflow compliance"}</small></div></article>:null}
      <article className="green"><i>✓</i><div><span>≥ {excellentCut}% (Excellent)</span><strong>{counts.excellent}</strong><small>{selected.length?Math.round(counts.excellent/selected.length*1000)/10:0}%</small></div></article>
      <article className="yellow"><i>◎</i><div><span>{targetCut}–&lt;{excellentCut}% (On target)</span><strong>{counts.target}</strong><small>{selected.length?Math.round(counts.target/selected.length*1000)/10:0}%</small></div></article>
      <article className="amber"><i>!</i><div><span>{riskCut}–&lt;{targetCut}% (At risk)</span><strong>{counts.risk}</strong><small>{selected.length?Math.round(counts.risk/selected.length*1000)/10:0}%</small></div></article>
      <article className="red"><i>×</i><div><span>&lt; {riskCut}% (Critical)</span><strong>{counts.critical}</strong><small>{selected.length?Math.round(counts.critical/selected.length*1000)/10:0}%</small></div></article>
    </section>

    <section className="iadcv3-charts">
      <article className="panel"><div className="panel-head"><div><h2>{meta.label} Distribution</h2><p>Driver performance by {meta.label} band</p></div></div><div className="iadcv3-donut-row"><div className="iadcv3-donut iadc" style={{"--a":`${selected.length?counts.excellent/selected.length*100:0}%`,"--b":`${selected.length?(counts.excellent+counts.target)/selected.length*100:0}%`,"--c":`${selected.length?(counts.excellent+counts.target+counts.risk)/selected.length*100:0}%`}}><div><strong>{selected.length}</strong><span>Drivers</span></div></div><div className="iadcv3-legend">{[["excellent",`Excellent (≥ ${excellentCut}%)`,counts.excellent],["target",`On target (${targetCut}–<${excellentCut}%)`,counts.target],["risk",`At risk (${riskCut}–<${targetCut}%)`,counts.risk],["critical",`Critical (< ${riskCut}%)`,counts.critical]].map(([k,l,v])=><p key={k}><i className={k}/><span>{l}</span><b>{v}</b><em>{selected.length?(v/selected.length*100).toFixed(1):"0.0"}%</em></p>)}</div></div></article>
      <article className="panel"><div className="panel-head"><div><h2>{meta.label} Trend</h2><p>Weekly fleet compliance</p></div><span className="panel-badge">Last 4 weeks</span></div><div className="iadcv3-trend"><div className="iadcv3-target">{meta.label} Target ({meta.target}%)</div><svg viewBox="0 0 100 100" preserveAspectRatio="none"><line x1="5" y1="43" x2="96" y2="43" className="target"/><polyline points={trendPoints} className="line"/>{trend.map((x,i)=><circle key={x.label} cx={8+i*(84/Math.max(1,trend.length-1))} cy={82-((x.value||minTrend)-minTrend)/Math.max(1,maxTrend-minTrend)*62} r="1.8"/>)}</svg><div className="iadcv3-trend-labels">{trend.map(x=><span key={x.label}>{x.label}<b>{pct(x.value,1)}</b></span>)}</div></div></article>
      {metric==="iadc"?<article className="panel"><div className="panel-head"><div><h2>DWC Overview</h2><p>Driver Workflow Compliance · selected period only</p></div></div>{dwcUnavailable?<div className="iadcv3-dwc-missing"><strong>No DWC score was published for {selectedDay||selectedWeek}.</strong><p>This is not a zero score. The Amazon report contains no DWC value for this selected period.</p>{latestDwcRow?<p>Latest available DWC evidence: <b>{rowDate(latestDwcRow)} · {pct(dwcOf(latestDwcRow),1)}</b>. Select that date to inspect the drivers.</p>:null}</div>:<div className="iadcv3-donut-row"><div className="iadcv3-donut dwc"><div><strong>{pct(dwcAvg,1)}</strong><span>DWC</span></div></div><div className="iadcv3-legend">{dwcErrors.length?dwcErrors.map((x,i)=><p key={x.key}><i className={"dwc"+i}/><span>{x.label}</span><b>{x.value}</b></p>):<p className="empty">DWC score is available, but this import does not contain a driver-level error breakdown.</p>}</div></div>}</article>:<article className="panel"><div className="panel-head"><div><h2>{meta.label} Target</h2><p>Metric-specific operational threshold</p></div></div><div className="iadcv3-dwc-missing"><strong>Target ≥ {meta.target}%</strong><p>Weekly values come from the scorecard. Daily values appear only when a genuine daily source has been imported.</p></div></article>}
    </section>

    <section className="iadcv3-lower">
      <article className="panel iadcv3-table"><div className="panel-head"><div><h2>Driver Performance</h2><p>Click a driver to view detailed breakdown</p></div></div><div className="table-wrap"><table><thead><tr><th>#</th><th>Driver name</th><th>Transporter ID</th><th>{meta.label} %</th><th>Band</th>{metric==="iadc"?<th>DWC %</th>:null}<th>Actions</th></tr></thead><tbody>{shown.map((r,i)=>{const v=Number(metricValue(r)),b=metricBand(v);return <tr key={r.driver_id+"-"+i} className={active===r?"active":""} onClick={()=>setDetail(r)}><td><span className="rank-badge">{i+1}</span></td><td><b>{dname(r.drivers)}</b></td><td><code>{trid(r.drivers)}</code></td><td><strong className={"iadcv3-score "+b}>{pct(v)}</strong></td><td><span className={"iadcv3-band "+b}>{metricBandLabel(v)}</span></td>{metric==="iadc"?<td><b>{pct(dwcOf(r))}</b></td>:null}<td><button onClick={e=>{e.stopPropagation();setDetail(r)}}>◉ &nbsp; View</button></td></tr>})}</tbody></table></div><footer className="iadcv3-pagination"><span>Showing {filtered.length?((safePage-1)*pageSize+1):0}–{Math.min(safePage*pageSize,filtered.length)} of {filtered.length} drivers</span><div><button disabled={safePage<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>‹</button>{Array.from({length:Math.min(totalPages,5)},(_,i)=>i+1).map(p=><button key={p} className={safePage===p?"active":""} onClick={()=>setPage(p)}>{p}</button>)}{totalPages>5?<span>… {totalPages}</span>:null}<button disabled={safePage>=totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))}>›</button></div></footer></article>

      <aside className="panel iadcv3-detail">{active?<><div className="iadcv3-detail-head"><div className="driver-avatar">{String(dname(active.drivers)).split(" ").map(x=>x[0]).slice(0,2).join("")}</div><div><h2>{dname(active.drivers)}</h2><p>{trid(active.drivers)}</p></div><button onClick={()=>setDetail(null)}>×</button></div><div className="iadcv3-detail-tabs"><b>Overview</b><span>{meta.label}</span>{metric==="iadc"?<span>DWC</span>:null}</div><div className="iadcv3-detail-kpis"><article><span>{meta.label} (Selected Period)</span><strong>{pct(metricValue(active))}</strong></article>{metric==="iadc"?<article><span>DWC (Selected Period)</span><strong>{pct(dwcOf(active))}</strong></article>:null}</div>{metric==="iadc"?<><h3>DWC error breakdown</h3><div className="iadcv3-errors">{Object.entries(errorLabels).map(([k,l])=><p key={k}><span>{l}</span><b>{activeErrors[k]??"—"}</b></p>)}</div></>:<div className="iadcv3-errors"><p><span>Target</span><b>{meta.target}%</b></p><p><span>Status</span><b>{metricValue(active)>=meta.target?"On target":"Below target"}</b></p></div>}<button className="btn primary full" onClick={()=>onOpenDriver?.(openShape(active,{[metric]:metricValue(active),iadc:n(active.iadc),dwc:dwcOf(active),risk:metricValue(active)<riskCut?"High":metricValue(active)<targetCut?"Medium":"Low"}))}>Open Driver 360 →</button></>:<div className="v10-empty">Select a driver to view details.</div>}</aside>
    </section>
    </>:<section className="iadcv3-dwc-tab">
      <div className="iadcv3-kpis">
        <article className="mint"><i>✓</i><div><span>DWC (Average)</span><strong>{dwcUnavailable?"No data":pct(dwcAvg,1)}</strong><small>{mode==="daily"?selectedDay:selectedWeek}</small></div></article>
        <article><i>♟</i><div><span>Drivers</span><strong>{selected.filter(r=>dwcOf(r)!=null).length}</strong><small>{siteFilter==="all"?"All sites":siteFilter}</small></div></article>
      </div>
      <article className="panel iadcv3-table"><div className="panel-head"><div><h2>DWC — Driver Workflow Compliance</h2><p>Workflow compliance and error breakdown for the selected period.</p></div></div><div className="table-wrap"><table><thead><tr><th>#</th><th>Driver</th><th>DWC %</th>{Object.values(errorLabels).map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{selected.filter(r=>dwcOf(r)!=null).sort((a,b)=>Number(dwcOf(b))-Number(dwcOf(a))).map((r,i)=><tr key={r.driver_id+"-dwc-"+i} onClick={()=>setDetail(r)}><td>{i+1}</td><td><b>{dname(r.drivers)}</b></td><td><strong>{pct(dwcOf(r),2)}</strong></td>{Object.keys(errorLabels).map(k=><td key={k}>{r.raw_data?.dwc_detail?.errors?.[k]??"—"}</td>)}</tr>)}</tbody></table></div></article>
    </section>}
  </div>;
}