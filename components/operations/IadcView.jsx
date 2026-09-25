"use client";
// IADC/DWC workspace: daily + weekly compliance views, direct import, export, share, driver detail and pagination.

import { useMemo, useRef, useState } from "react";
import { analyseFiles } from "../../lib/analyzer";
import { ErrorBox,Loading,dname,filterRowsBySite,n,openShape,pct,trid,useOperationalRows,weekNo } from "../operations/OperationalShared";

const rowDate=r=>String(r?.raw_data?.metric_date||r?.period_end||r?.period_start||"").slice(0,10);
const calendarWeek=r=>{
  const raw=String(r?.raw_data?.calendar_week||r?.week_label||"");
  const match=raw.match(/W\d+/i);
  return match?match[0].toUpperCase():raw;
};
const granularity=r=>String(r?.raw_data?.metric_granularity||"weekly");
const dwcOf=r=>n(r.raw_data?.dwc);
const IADC_ACCEPT=".xlsx,.xls,.html,.htm,.pdf";
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
  const [mode,setMode]=useState(metric==="iadc"?"daily":"weekly"),[week,setWeek]=useState(""),[day,setDay]=useState(""),[query,setQuery]=useState(""),[detail,setDetail]=useState(null),[complianceTab,setComplianceTab]=useState(initialComplianceTab),[importing,setImporting]=useState(false),[importMessage,setImportMessage]=useState(""),[importError,setImportError]=useState(""),[editMode,setEditMode]=useState(false),[sortDir,setSortDir]=useState("desc"),fileInput=useRef(null);
  const weeks=useMemo(()=>[...new Set(rows.map(calendarWeek).filter(w=>/^W\d+$/i.test(w)))].sort((a,b)=>weekNo(b)-weekNo(a)),[rows]);
  const dailyWeeks=useMemo(()=>[...new Set(rows.filter(r=>granularity(r)==="daily").map(calendarWeek).filter(w=>/^W\d+$/i.test(w)))].sort((a,b)=>weekNo(b)-weekNo(a)),[rows]);
  const weeklyWeeks=useMemo(()=>[...new Set(rows.filter(r=>granularity(r)==="weekly").map(calendarWeek).filter(w=>/^W\d+$/i.test(w)))].sort((a,b)=>weekNo(b)-weekNo(a)),[rows]);
  const availableWeeks=mode==="daily"?dailyWeeks:weeklyWeeks;
  const selectedWeek=week&&availableWeeks.includes(week)?week:(availableWeeks[0]||weeks[0]||"");
  const weekRows=useMemo(()=>rows.filter(r=>granularity(r)==="weekly"&&calendarWeek(r)===selectedWeek),[rows,selectedWeek]);
  const dailyRows=useMemo(()=>rows.filter(r=>granularity(r)==="daily"&&calendarWeek(r)===selectedWeek),[rows,selectedWeek]);
  const days=useMemo(()=>[...new Set(dailyRows.map(rowDate).filter(Boolean))].sort().reverse(),[dailyRows]);
  const selectedDay=day&&days.includes(day)?day:(days[0]||"");
  const dwcDailyWeeks=useMemo(()=>[...new Set(rows.filter(r=>granularity(r)==="daily"&&dwcOf(r)!=null).map(calendarWeek).filter(w=>/^W\d+$/i.test(w)))].sort((a,b)=>weekNo(b)-weekNo(a)),[rows]);
  const dwcWeeklyWeeks=useMemo(()=>[...new Set(rows.filter(r=>granularity(r)==="weekly"&&dwcOf(r)!=null).map(calendarWeek).filter(w=>/^W\d+$/i.test(w)))].sort((a,b)=>weekNo(b)-weekNo(a)),[rows]);
  const dwcSelectedWeek=(mode==="daily"?dwcDailyWeeks:dwcWeeklyWeeks).includes(selectedWeek)?selectedWeek:((mode==="daily"?dwcDailyWeeks:dwcWeeklyWeeks)[0]||selectedWeek);
  const dwcDailyRows=useMemo(()=>rows.filter(r=>granularity(r)==="daily"&&calendarWeek(r)===dwcSelectedWeek&&dwcOf(r)!=null),[rows,dwcSelectedWeek]);
  const dwcWeekRows=useMemo(()=>rows.filter(r=>granularity(r)==="weekly"&&calendarWeek(r)===dwcSelectedWeek&&dwcOf(r)!=null),[rows,dwcSelectedWeek]);
  const dwcDays=useMemo(()=>[...new Set(dwcDailyRows.map(rowDate).filter(Boolean))].sort().reverse(),[dwcDailyRows]);
  const dwcSelectedDay=selectedDay&&dwcDays.includes(selectedDay)?selectedDay:(dwcDays[0]||"");
  const selected=useMemo(()=>{
    const base=mode==="daily"?dailyRows.filter(r=>rowDate(r)===selectedDay):weekRows;
    // A scorecard row with delivered=0 and DCR=0 means no DCR opportunity,
    // not a genuine 0% completion rate. Do not rank it as a failure.
    const usable=metric==="dcr"?base.filter(r=>!(Number(r.dcr)===0&&Number(r.delivered||0)===0)):base;
    return usable.sort((a,b)=>Number(metricValue(b))-Number(metricValue(a)));
  },[mode,dailyRows,weekRows,selectedDay,metric]);
  const officialSummary=selected.find(r=>r.raw_data?.compliance_summary)?.raw_data?.compliance_summary||null;
  const avg=metric==="iadc"?(n(officialSummary?.iadc)??average(selected,r=>r.iadc)):average(selected,metricValue);
  const dwcAvg=n(officialSummary?.dwc)??average(selected,dwcOf);
  const counts={excellent:selected.filter(r=>Number(metricValue(r))>=excellentCut).length,target:selected.filter(r=>Number(metricValue(r))>=targetCut&&Number(metricValue(r))<excellentCut).length,risk:selected.filter(r=>Number(metricValue(r))>=riskCut&&Number(metricValue(r))<targetCut).length,critical:selected.filter(r=>Number(metricValue(r))<riskCut).length};
  const filtered=selected.filter(r=>dname(r.drivers).toLowerCase().includes(query.toLowerCase()));
  const shown=[...filtered].sort((a,b)=>sortDir==="asc"?Number(metricValue(a))-Number(metricValue(b)):Number(metricValue(b))-Number(metricValue(a)));
  const trend=useMemo(()=>weeks.slice(0,4).reverse().map(w=>{const wr=rows.filter(r=>granularity(r)==="weekly"&&calendarWeek(r)===w);const summary=wr.find(r=>r.raw_data?.compliance_summary)?.raw_data?.compliance_summary;return {label:w,value:metric==="iadc"?(n(summary?.iadc)??average(wr,r=>r.iadc)):average(wr,metricValue)}}),[rows,weeks,metric]);
  const dwcPeriodRows=useMemo(()=>{
    if(metric!=="iadc")return selected;
    const base=mode==="daily"?dwcDailyRows.filter(r=>rowDate(r)===dwcSelectedDay):dwcWeekRows;
    return base;
  },[metric,mode,dwcDailyRows,dwcWeekRows,dwcSelectedDay]);
  const dwcPeriodAvg=average(dwcPeriodRows,dwcOf);
  const dwcErrors=useMemo(()=>Object.entries(errorLabels).map(([key,label])=>({key,label,value:dwcPeriodRows.reduce((s,r)=>s+Number(r.raw_data?.dwc_detail?.errors?.[key]||0),0)})).filter(x=>x.value>0),[dwcPeriodRows]);
  const maxTrend=Math.max(80,...trend.map(x=>x.value||0)),minTrend=Math.min(60,...trend.map(x=>x.value||100));
  const trendPoints=trend.map((x,i)=>`${8+i*(84/Math.max(1,trend.length-1))},${82-((x.value||minTrend)-minTrend)/Math.max(1,maxTrend-minTrend)*62}`).join(" ");
  const active=detail||shown[0]||null;
  const latestDwcRow=useMemo(()=>rows.filter(r=>granularity(r)==="daily"&&dwcOf(r)!=null).sort((a,b)=>rowDate(b).localeCompare(rowDate(a)))[0]||null,[rows]);
  const dwcUnavailable=dwcAvg==null;
  const activeErrors=active?.raw_data?.dwc_detail?.errors||{};

  const reset=()=>{setQuery("");setDetail(null);setEditMode(false)};
  const quickImport=async file=>{
    if(!file||importing)return;
    const ext=String(file.name||"").toLowerCase().match(/\.[^.]+$/)?.[0]||"";
    if(![".xlsx",".xls",".html",".htm",".pdf"].includes(ext)){
      setImportMessage("");
      setImportError("This doesn’t look like a valid Amazon IADC report. Please upload the correct Excel, HTML or PDF file.");
      if(fileInput.current)fileInput.current.value="";
      return;
    }
    setImporting(true);setImportError("");setImportMessage(`Analysing ${file.name}…`);
    try{
      const result=await analyseFiles([file]);
      const recognized=(result?.fileResults||[]).filter(x=>x.recognized);
      const iadcLike=recognized.some(x=>{
        const type=String(x.reportType||"").toLowerCase();
        const rows=Array.isArray(x.rows)?x.rows:[];
        return type.includes("iadc")||rows.some(r=>n(r?.iadc)!=null||n(r?.metrics?.iadc)!=null);
      });
      if(!result?.recognizedFiles||!iadcLike)throw new Error("This doesn’t look like a valid Amazon IADC report. Please upload the correct IADC file.");
      const importSite=String(siteFilter||"").toLowerCase()==="all"?null:String(siteFilter||"").trim().toUpperCase();
      const saved=await onImported?.(result,[file],importSite);
      if(saved&&Number(saved.savedMetrics||0)===0){
        const unmatched=Number(saved?.reconciliation?.unmatchedRows??saved?.unmatched??0);
        throw new Error(unmatched>0?`IADC report was recognised, but ${unmatched} driver row${unmatched===1?"":"s"} could not be matched to the driver directory. No IADC data was saved.`:"IADC report was recognised, but no driver metrics were saved. Please check the report and selected site.");
      }
      const importedTypes=recognized.flatMap(x=>String(x.reportType||"").toLowerCase().split(",").map(v=>v.trim()));
      const hasDaily=importedTypes.some(x=>x.includes("iadc-daily"));
      const hasWeekly=importedTypes.some(x=>x.includes("iadc-weekly"));
      setMode(hasDaily?"daily":hasWeekly?"weekly":mode);
      setImportMessage(hasDaily?"IADC daily report imported successfully.":hasWeekly?"IADC weekly report imported successfully.":"IADC report imported successfully.");
      setWeek("");setDay("");setDetail(null);
    }catch(e){setImportMessage("");setImportError(e?.message||"Could not import IADC report.");}
    finally{setImporting(false);if(fileInput.current)fileInput.current.value=""}
  };
  const exportCsv=()=>{const header=metric==="iadc"?["Driver","TRID",meta.label,"DWC","Status"]:["Driver","TRID",meta.label,"Status"];const body=filtered.map(r=>metric==="iadc"?[dname(r.drivers),trid(r.drivers),metricValue(r),dwcOf(r),metricBandLabel(Number(metricValue(r)))]:[dname(r.drivers),trid(r.drivers),metricValue(r),metricBandLabel(Number(metricValue(r)))]);const blob=new Blob([[header,...body].map(x=>x.map(escapeCsv).join(",")).join("\\r\
")],{type:"text/csv"});const u=URL.createObjectURL(blob),a=document.createElement("a");a.href=u;a.download=`metrixiq-${metric}-${mode==="daily"?selectedDay:selectedWeek}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(u),300)};
  const share=async()=>{const text=`MetrixIQ ${meta.label} · ${mode==="daily"?selectedDay:selectedWeek} · ${meta.label} ${pct(avg,1)} · ${selected.length} drivers`;if(navigator.share)await navigator.share({title:`MetrixIQ ${meta.label}`,text});else await navigator.clipboard?.writeText(text)};

  if(load.loading)return <Loading text={`Loading ${meta.label} compliance…`}/>;
  if(load.error)return <ErrorBox error={load.error}/>;

  return <div className="iadcv3">
    <div className="iadcv3-head"><div><span className="page-kicker">{meta.kicker}</span><h1>{metric==="iadc"?"IADC Compliance":meta.title}</h1><p>{metric==="iadc"?"Track driver IADC performance. Use NOA, first option and reattempts to keep compliance high.":meta.description}</p></div></div>

    {metric==="iadc"?<div className="iadcv3-metric-tabs"><button className={complianceTab==="iadc"?"active":""} onClick={()=>setComplianceTab("iadc")}>IADC</button><button className={complianceTab==="dwc"?"active":""} onClick={()=>setComplianceTab("dwc")}>DWC</button></div>:null}
    {metric==="iadc"?<section className="iadcv3-import-panel"><div className="iadcv3-period">{mode==="daily"?<><select aria-label="Daily IADC week" value={selectedWeek} onChange={e=>{setWeek(e.target.value);setDay("");}}>{dailyWeeks.length?dailyWeeks.map(w=><option key={w}>{w}</option>):<option value="">No daily week</option>}</select><select aria-label="Daily IADC date" value={selectedDay} onChange={e=>setDay(e.target.value)}>{days.length?days.map(d=><option key={d}>{d}</option>):<option value="">No daily report</option>}</select></>:<select value={selectedWeek} onChange={e=>setWeek(e.target.value)}>{weeklyWeeks.length?weeklyWeeks.map(w=><option key={w}>{w}</option>):<option value="">No weekly report</option>}</select>}</div><div className="iadcv3-dropzone"><input ref={fileInput} type="file" hidden accept={IADC_ACCEPT} onChange={e=>quickImport(e.target.files?.[0])}/><div><strong>⇧ Upload IADC Report</strong><span>Amazon IADC report · .xlsx, .xls, .html, .htm or .pdf</span></div><button className="btn primary" disabled={importing} onClick={()=>fileInput.current?.click()}>{importing?"Importing…":"Choose File"}</button></div><div className="iadcv3-import-actions"><input aria-label="Search IADC drivers" value={query} onChange={e=>setQuery(e.target.value)} placeholder="⌕  Search driver…"/><select className="iadcv3-sort" aria-label="Sort IADC score" value={sortDir} onChange={e=>setSortDir(e.target.value)}><option value="desc">IADC ↓ High to Low</option><option value="asc">IADC ↑ Low to High</option></select><button className="btn ghost" onClick={()=>setEditMode(v=>!v)}>{editMode?"Done":"✎  Edit"}</button><button className="btn ghost danger" onClick={reset}>↻  Clear</button><button className="btn ghost" onClick={exportCsv}>⇩  Export</button></div></section>:<section className="iadcv3-toolbar"><div className="iadcv3-tabs"><button className={mode==="daily"?"active":""} onClick={()=>setMode("daily")}>Daily</button><button className={mode==="weekly"?"active":""} onClick={()=>setMode("weekly")}>Weekly</button></div>{mode==="daily"?<><select aria-label={`Select ${meta.label} week`} value={selectedWeek} onChange={e=>{setWeek(e.target.value);setDay("");}}>{dailyWeeks.map(w=><option key={w}>{w}</option>)}</select><select value={selectedDay} onChange={e=>setDay(e.target.value)}>{days.map(d=><option key={d}>{d}</option>)}</select></>:<select value={selectedWeek} onChange={e=>setWeek(e.target.value)}>{weeklyWeeks.map(w=><option key={w}>{w}</option>)}</select>}<input aria-label={`Search ${meta.label} drivers`} value={query} onChange={e=>setQuery(e.target.value)} placeholder="⌕  Search driver…"/><button className="iadcv3-reset" onClick={reset}>Reset</button></section>}
    {importMessage?<div className="ccv2-import-message">{importMessage}</div>:null}
    {importError?<div className="iadcv3-modal-backdrop" role="presentation" onClick={()=>setImportError("")}><div className="iadcv3-error-modal" role="alertdialog" aria-modal="true" aria-labelledby="iadc-import-error-title" onClick={e=>e.stopPropagation()}><button className="iadcv3-error-close" aria-label="Close error" onClick={()=>setImportError("")}>×</button><div className="iadcv3-error-icon">×</div><h2 id="iadc-import-error-title">Invalid file format</h2><p>{importError}</p><button className="btn danger full" onClick={()=>setImportError("")}>OK</button></div></div>:null}

    {complianceTab==="iadc"||metric!=="iadc"?<><section className={"iadcv3-kpis compact "+(metric==="dcr"?"iadcv3-dcr-kpis":"")}>
      <article><i>♟</i><div><span>Total Drivers</span><strong>{selected.length}</strong><small>{siteFilter==="all"?"All sites":siteFilter}</small></div></article>
      <article><i>◫</i><div><span>{meta.label} (Average)</span><strong>{pct(avg,1)}</strong><small>Target ≥ {meta.target}%</small></div></article>
      {metric==="dcr"?<><article className="mint"><i>✓</i><div><span>On Target</span><strong>{selected.filter(r=>Number(metricValue(r))>=meta.target).length}</strong><small>Drivers ≥ {meta.target}%</small></div></article><article className="dwc-alert"><i>!</i><div><span>Below Target</span><strong>{selected.filter(r=>Number(metricValue(r))<meta.target).length}</strong><small>Needs attention</small></div></article></>:null}
      {metric==="iadc"?<article className={"mint "+(dwcUnavailable?"missing":"")}><i>✓</i><div><span>DWC (Average)</span><strong>{dwcUnavailable?"No data":pct(dwcAvg,1)}</strong><small>{dwcUnavailable?(latestDwcRow?`No DWC for selected day · latest ${rowDate(latestDwcRow)} ${pct(dwcOf(latestDwcRow),1)}`:"No DWC evidence in imported report"):"Workflow compliance"}</small></div></article>:null}
      
    </section>

    <section className="iadcv3-lower">
      <article className={"panel iadcv3-table "+(metric==="dcr"?"iadcv3-dcr-table":"")}><div className="panel-head"><div><h2>{metric==="dcr"?"DCR Driver Ranking":"Driver Performance"}</h2><p>{metric==="dcr"?"Ranked delivery completion performance for the selected period.":"Click a driver to view detailed breakdown"}</p></div>{metric==="dcr"?<select className="iadcv3-sort" value={sortDir} onChange={e=>setSortDir(e.target.value)}><option value="desc">DCR ↓ High to Low</option><option value="asc">DCR ↑ Low to High</option></select>:null}</div><div className="table-wrap"><table><thead><tr><th>#</th><th>Driver name</th><th>{meta.label} %</th><th>Status</th><th>Actions</th></tr></thead><tbody>{shown.map((r,i)=>{const v=Number(metricValue(r)),b=metricBand(v);return <tr key={r.driver_id+"-"+i} className={active===r?"active":""} onClick={()=>setDetail(r)}><td><span className="rank-badge">{i+1}</span></td><td><span className="iadcv3-driver-name">{dname(r.drivers)}</span></td><td className={"iadcv3-heat "+b}><strong className={"iadcv3-score "+b}>{pct(v)}</strong></td><td><span className={"iadcv3-status "+b}>{v>=meta.target?"Compliant":v>=riskCut?"Watch":"Urgent"}</span></td><td><button onClick={e=>{e.stopPropagation();setDetail(r)}}>{editMode?"✎ Edit":"◉ View"}</button></td></tr>})}</tbody></table></div><footer className="iadcv3-scroll-footer"><span>Showing all {filtered.length} drivers</span></footer></article>

      <aside className={"panel iadcv3-detail "+(metric==="dcr"?"iadcv3-dcr-detail":"")}>{active?<><div className="iadcv3-detail-head"><div className="driver-avatar">{String(dname(active.drivers)).split(" ").map(x=>x[0]).slice(0,2).join("")}</div><div><h2>{dname(active.drivers)}</h2></div><button onClick={()=>setDetail(null)}>×</button></div><div className="iadcv3-detail-tabs"><b>Overview</b><span>{meta.label}</span>{metric==="iadc"?<span>DWC</span>:null}</div><div className="iadcv3-detail-kpis"><article><span>{meta.label} (Selected Period)</span><strong>{pct(metricValue(active))}</strong></article>{metric==="iadc"?<article><span>DWC (Selected Period)</span><strong>{pct(dwcOf(active))}</strong></article>:null}</div>{metric==="dcr"?<><h3>DCR Overview</h3><div className="iadcv3-dcr-overview"><div><span>Selected period</span><strong>{pct(metricValue(active),1)}</strong></div><div><span>Target</span><strong>{meta.target}%</strong></div><div><span>Gap to target</span><strong>{Number(metricValue(active))>=meta.target?"On target":`${(meta.target-Number(metricValue(active))).toFixed(1)} pp`}</strong></div></div><div className="iadcv3-dcr-tip">Focus on NOA, reattempts and first-attempt delivery completion to reduce failed deliveries.</div></> : metric==="iadc"?<><h3>DWC error breakdown</h3><div className="iadcv3-errors">{Object.entries(errorLabels).map(([k,l])=><p key={k}><span>{l}</span><b>{activeErrors[k]??"—"}</b></p>)}</div></>:<div className="iadcv3-errors"><p><span>Target</span><b>{meta.target}%</b></p><p><span>Status</span><b>{metricValue(active)>=meta.target?"On target":"Below target"}</b></p></div>}<button className="btn primary full" onClick={()=>onOpenDriver?.(openShape(active,{[metric]:metricValue(active),iadc:n(active.iadc),dwc:dwcOf(active),risk:metricValue(active)<riskCut?"High":metricValue(active)<targetCut?"Medium":"Low"}))}>Open Driver 360 →</button></>:<div className="v10-empty">Select a driver to view details.</div>}</aside>
    </section>
    </>:<section className="iadcv3-dwc-tab">
      {(()=>{const dwcRows=dwcPeriodRows.filter(r=>dname(r.drivers).toLowerCase().includes(query.toLowerCase())).sort((a,b)=>sortDir==="asc"?Number(dwcOf(a))-Number(dwcOf(b)):Number(dwcOf(b))-Number(dwcOf(a)));const compliant=dwcRows.filter(r=>Number(dwcOf(r))>=85).length;const below=dwcRows.length-compliant;const dwcActive=(detail&&dwcOf(detail)!=null)?detail:(dwcRows[0]||null);const issues=r=>Object.entries(errorLabels).filter(([k])=>Number(r.raw_data?.dwc_detail?.errors?.[k]||0)>0).map(([,l])=>l);return <>
      <div className="iadcv3-dwc-toolbar">
        <div className="iadcv3-tabs"><button className={mode==="daily"?"active":""} onClick={()=>setMode("daily")}>Daily</button><button className={mode==="weekly"?"active":""} onClick={()=>setMode("weekly")}>Weekly</button></div>
        {mode==="daily"?<select value={dwcSelectedDay} onChange={e=>setDay(e.target.value)}>{dwcDays.map(d=><option key={d}>{d}</option>)}</select>:<select value={dwcSelectedWeek} onChange={e=>setWeek(e.target.value)}>{dwcWeeklyWeeks.map(w=><option key={w}>{w}</option>)}</select>}
        <input aria-label="Search DWC drivers" value={query} onChange={e=>setQuery(e.target.value)} placeholder="⌕  Search driver…"/>
        <select className="iadcv3-sort" value={sortDir} onChange={e=>setSortDir(e.target.value)}><option value="desc">DWC ↓ High to Low</option><option value="asc">DWC ↑ Low to High</option></select>
        <button className="btn ghost" onClick={exportCsv}>⇩ Export</button><button className="btn ghost danger" onClick={reset}>↻ Clear</button>
      </div>
      <div className="iadcv3-kpis iadcv3-dwc-kpis">
        <article><i>♟</i><div><span>Total Drivers</span><strong>{dwcRows.length}</strong><small>{siteFilter==="all"?"All sites":siteFilter}</small></div></article>
        <article className="mint"><i>◫</i><div><span>DWC (Average)</span><strong>{dwcPeriodRows.length?pct(dwcPeriodAvg,1):"No data"}</strong><small>{mode==="daily"?dwcSelectedDay:dwcSelectedWeek}</small></div></article>
        <article className="mint"><i>✓</i><div><span>Compliant (≥85%)</span><strong>{compliant}</strong><small>{dwcRows.length?pct(compliant/dwcRows.length*100,1):"—"} of drivers</small></div></article>
        <article className="dwc-alert"><i>!</i><div><span>Below 85%</span><strong>{below}</strong><small>{dwcRows.length?pct(below/dwcRows.length*100,1):"—"} of drivers</small></div></article>
      </div>
      <section className="iadcv3-lower iadcv3-dwc-lower">
        <article className="panel iadcv3-table"><div className="panel-head"><div><h2>DWC — Driver Workflow Compliance</h2><p>Workflow compliance and report-derived issues for the selected period.</p></div></div><div className="table-wrap"><table><thead><tr><th>#</th><th>Driver name</th><th>DWC %</th><th>Status</th><th>Key issues</th><th>Actions</th></tr></thead><tbody>{dwcRows.map((r,i)=>{const v=Number(dwcOf(r)),b=v>=95?"excellent":v>=85?"target":v>=75?"risk":"critical",ri=issues(r);return <tr key={r.driver_id+"-dwc-"+i} className={dwcActive===r?"active":""} onClick={()=>setDetail(r)}><td><span className="rank-badge">{i+1}</span></td><td><b>{dname(r.drivers)}</b></td><td className={"iadcv3-heat "+b}><strong className={"iadcv3-score "+b}>{pct(v,1)}</strong></td><td><span className={"iadcv3-status "+b}>{v>=85?"Compliant":"Below 85%"}</span></td><td className="iadcv3-issues">{ri.length?ri.slice(0,2).join(", "):"—"}</td><td><button onClick={e=>{e.stopPropagation();setDetail(r)}}>◉ View</button></td></tr>})}</tbody></table></div><footer className="iadcv3-scroll-footer">Showing all {dwcRows.length} drivers</footer></article>
        <aside className="panel iadcv3-detail iadcv3-dwc-detail">{dwcActive?<><div className="iadcv3-detail-head"><div className="driver-avatar">{String(dname(dwcActive.drivers)).split(" ").map(x=>x[0]).slice(0,2).join("")}</div><div><h2>{dname(dwcActive.drivers)}</h2><span className={"iadcv3-status "+(Number(dwcOf(dwcActive))>=85?"target":"critical")}>{Number(dwcOf(dwcActive))>=85?"Compliant":"Below 85%"}</span></div></div><div className="iadcv3-detail-kpis"><article><span>DWC</span><strong>{pct(dwcOf(dwcActive),1)}</strong></article></div><h3>Report issue breakdown</h3><div className="iadcv3-errors">{Object.entries(errorLabels).map(([k,l])=><p key={k}><span>{l}</span><b>{dwcActive.raw_data?.dwc_detail?.errors?.[k]??"—"}</b></p>)}</div><button className="btn primary full" onClick={()=>onOpenDriver?.(openShape(dwcActive,{iadc:n(dwcActive.iadc),dwc:dwcOf(dwcActive),risk:Number(dwcOf(dwcActive))<75?"High":Number(dwcOf(dwcActive))<85?"Medium":"Low"}))}>Open Driver 360 →</button></>:<div className="v10-empty">No DWC driver data for this period.</div>}</aside>
      </section></>})()}
    </section>}
  </div>;
}