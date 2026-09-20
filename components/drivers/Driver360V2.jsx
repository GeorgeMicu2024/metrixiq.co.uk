"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { buildDriver360Snapshot } from "../../lib/drivers/driver360";
import { rootCauseForRow, rootCauseTrend, recoveryPlan } from "../../lib/intelligence/rootCause";
import { addDriverNote, fetchDriver360V2Data } from "../../lib/data/operationsV4";
import RootCausePanel from "../intelligence/RootCausePanel";
import {
  Driver360DeltaGrid,
  Driver360Overview,
  DriverTrajectoryChart,
} from "./Driver360Sections";
import { fmt, initials, tone } from "../dashboard/utils";

function dateLabel(value){
  if(!value)return"—";
  const d=new Date(value);
  return Number.isFinite(d.getTime())?d.toLocaleString("en-GB",{day:"2-digit",month:"short",year:"numeric"}):String(value);
}

function timeLabel(value){
  if(!value)return"—";
  const d=new Date(value);
  return Number.isFinite(d.getTime())?d.toLocaleString("en-GB",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}):String(value);
}

function currentMetric(row,key){
  if(key==="fico")return row?.mentor_score??row?.ementor??row?.fico;
  return row?.[key];
}

function sourceFiles(row){
  const files=row?.raw_data?.source_files;
  return Array.isArray(files)?files:[];
}

function timelineRows(data){
  const rows=[];
  for(const item of data?.incidents||[])rows.push({
    id:"incident:"+item.id,type:"Incident",tone:item.severity==="critical"||item.severity==="high"?"bad":"warn",
    title:item.title,detail:item.description||item.root_cause||item.incident_type,date:item.occurred_at||item.created_at,
    meta:[item.incident_type,item.status,item.tracking_id].filter(Boolean).join(" · "),
  });
  for(const item of data?.coaching||[])rows.push({
    id:"coaching:"+item.id,type:"Coaching",tone:item.status==="closed"?"good":"warn",
    title:item.title,detail:item.reason||item.outcome||"",date:item.created_at,
    meta:[item.metric,item.priority,item.status].filter(Boolean).join(" · "),
  });
  for(const item of data?.feedback||[])rows.push({
    id:"feedback:"+item.id,type:"Customer evidence",tone:item.dnr_concession?"bad":"neutral",
    title:item.feedback_l2||item.feedback_l1||item.feedback_l0||"Feedback event",
    detail:[item.city,item.postal_code].filter(Boolean).join(" · "),date:item.feedback_date||item.created_at,
    meta:[item.tracking_id,item.dnr_concession?"DNR concession":null,item.scanned_over_25m?"Scan >25m":null].filter(Boolean).join(" · "),
  });
  for(const item of data?.notes||[])rows.push({
    id:"note:"+item.id,type:"Manager note",tone:"neutral",title:item.note_type||"Manager note",detail:item.note,
    date:item.created_at,meta:item.author_name||item.author_email||"",
  });
  for(const item of data?.audit||[])rows.push({
    id:"audit:"+item.id,type:"Audit",tone:"neutral",title:item.action||item.event_type,detail:item.event_type,
    date:item.created_at,meta:item.actor_name||item.actor_email||"System",
  });
  return rows.sort((a,b)=>new Date(b.date||0)-new Date(a.date||0));
}

function exportSnapshot(driver,latest,rootCause,data){
  const rows=[
    ["Driver",driver.name||""],
    ["TRID",driver.id||""],
    ["Site",driver.site||""],
    ["Week",latest?.week_label||""],
    ["Total Score",rootCause.score??""],
    ["Tier",rootCause.tier],
    ["Points Lost",rootCause.pointsLost],
    [],
    ["Metric","Value","Points","Max","Points Lost","Next Target"],
    ...rootCause.components.map((item)=>[
      item.label,
      item.value??"",
      item.points,
      item.maxPoints,
      item.lostPoints,
      item.nextTarget?.label||"",
    ]),
    [],
    ["Open incidents",(data?.incidents||[]).filter((x)=>!["closed","resolved"].includes(x.status)).length],
    ["Open coaching",(data?.coaching||[]).filter((x)=>x.status!=="closed").length],
    ["Feedback events",(data?.feedback||[]).length],
    ["Overrides",(data?.overrides||[]).filter((x)=>x.status==="active").length],
  ];
  const q=(v)=>'"'+String(v??"").replaceAll('"','""')+'"';
  const csv=rows.map((r)=>r.map(q).join(",")).join("\r\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob);const a=document.createElement("a");
  a.href=url;a.download=("metrixiq-driver-360-"+String(driver.id||"driver")+".csv").replace(/[^a-z0-9_.-]/gi,"-");
  a.click();setTimeout(()=>URL.revokeObjectURL(url),500);
}

export default function Driver360V2({
  organizationId,
  driver,
  history=[],
  historyLoading=false,
  canManage=false,
  onBack,
  onOpenCoaching,
  onOpenSimulator,
  onOpenEvidence,
}){
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(Boolean(driver?.dbId));
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [tab,setTab]=useState("overview");
  const [busy,setBusy]=useState("");
  const [note,setNote]=useState("");

  async function load(){
    if(!organizationId||!driver?.dbId){setLoading(false);return;}
    setLoading(true);setError("");
    try{setData(await fetchDriver360V2Data(getSupabaseBrowserClient(),organizationId,driver.dbId));}
    catch(e){setError(e?.message||"Could not load Driver 360 V2 evidence.");}
    finally{setLoading(false);}
  }
  useEffect(()=>{load();},[organizationId,driver?.dbId]);

  const metricHistory=(data?.metrics?.length?data.metrics:history)||[];
  const snapshot=useMemo(()=>buildDriver360Snapshot(driver,metricHistory),[driver,metricHistory]);
  const latest=metricHistory.at(-1)||snapshot.current||{};
  const rootCause=useMemo(()=>rootCauseForRow(latest),[latest]);
  const trend=useMemo(()=>rootCauseTrend(metricHistory.slice(-12)),[metricHistory]);
  const recovery=useMemo(()=>recoveryPlan(latest,4),[latest]);
  const timeline=useMemo(()=>timelineRows(data),[data]);

  const openIncidents=(data?.incidents||[]).filter((x)=>!["closed","resolved"].includes(x.status)).length;
  const openCoaching=(data?.coaching||[]).filter((x)=>x.status!=="closed").length;
  const activeAlerts=(data?.alerts||[]).filter((x)=>x.status!=="resolved").length;
  const activeOverrides=(data?.overrides||[]).filter((x)=>x.status==="active").length;
  const dwcScore=latest?.raw_data?.dwc??null;
  const dwcErrors=latest?.raw_data?.dwc_detail?.errors||{};
  const dwcErrorLabels={
    photoDefect:"Photo Defect",
    photoManualBypass:"Photo Manual Bypass",
    geoDistance25m:"Geo Distance >25m",
    contactComplianceMiss:"Contact Compliance Miss",
    otpMiss:"OTP Miss",
  };
  const dwcIssues=Object.entries(dwcErrors).filter(([,value])=>value!=null&&Number(value)>0);

  async function addNote(){
    if(!canManage||!note.trim()||!driver?.dbId)return;
    setBusy("note");setError("");setNotice("");
    try{
      await addDriverNote(getSupabaseBrowserClient(),{
        organizationId,driverId:driver.dbId,note:note.trim(),noteType:"manager",
      });
      setNote("");setNotice("Driver note added to the audit trail.");await load();
    }catch(e){setError(e?.message||"Could not add note.");}
    finally{setBusy("");}
  }

  return <div className="driver360v2-root">
    <div className="driver360v2-top">
      <button className="scorecard-back" onClick={onBack}>← Back</button>
      <div className="driver360v2-actions">
        <button className="btn ghost" onClick={()=>onOpenSimulator?.(driver)}>What-if Simulator</button>
        <button className="btn ghost" onClick={()=>onOpenEvidence?.(driver)}>Evidence & Incidents</button>
        <button className="btn ghost" onClick={()=>exportSnapshot(driver,latest,rootCause,data)}>Export snapshot</button>
        <button className="btn primary" onClick={()=>onOpenCoaching?.(driver)}>Create / View Coaching</button>
      </div>
    </div>

    <section className="driver360v2-hero">
      <div className="driver360v2-person">
        <span>{driver.initials||initials(driver.name)}</span>
        <div><span className="page-kicker">DRIVER 360 V2</span><h1>{driver.name}</h1><p>{driver.site||"No site"} · {driver.id||"No TRID"} · {driver.status||"Active"} · {latest.week_label||latest.period_end||"Latest evidence"}</p></div>
      </div>
      <div className="driver360v2-score">
        <span>TOTAL SCORE</span><strong>{rootCause.score??"—"}<small>/100</small></strong>
        <b className={"tier-"+String(rootCause.tier).toLowerCase().replaceAll(" ","-")}>{rootCause.tier}</b>
      </div>
    </section>

    {error&&<div className="mgrv2-notice error">{error}</div>}
    {notice&&<div className="mgrv2-notice good">{notice}</div>}

    <section className="driver360v2-kpis">
      <article><span>Points lost</span><strong>{rootCause.pointsLost}</strong><small>{rootCause.primary?rootCause.primary.label+" is the largest current gap":"Maximum point bands"}</small></article>
      <article><span>Open incidents</span><strong>{openIncidents}</strong><small>{(data?.incidents||[]).length} total evidence cases</small></article>
      <article><span>Open coaching</span><strong>{openCoaching}</strong><small>{activeAlerts} active alerts</small></article>
      <article><span>Evidence</span><strong>{(data?.feedback||[]).length}</strong><small>Customer / delivery events</small></article>
      <article><span>Manual overrides</span><strong>{activeOverrides}</strong><small>Source value remains preserved</small></article>
      <article><span>Coverage</span><strong>{rootCause.coverage}/9</strong><small>Point-band inputs</small></article>
    </section>

    <div className="driver360v2-tabs">
      {[
        ["overview","Overview"],["root-cause","Root Cause"],["timeline","Timeline"],
        ["evidence","Evidence"],["coaching","Coaching"],["audit","Audit & Notes"],
      ].map(([id,label])=><button key={id} className={tab===id?"active":""} onClick={()=>setTab(id)}>{label}</button>)}
    </div>

    {loading||historyLoading?<section className="panel driver360v2-empty"><div className="auth-spinner"/><b>Loading driver intelligence…</b></section>:<>
      {tab==="overview"&&<>
        <Driver360Overview snapshot={snapshot}/>
        <section className="driver360v2-metric-grid">
          {[
            ["FICO",currentMetric(latest,"fico"),"mentor"],
            ["DCR",currentMetric(latest,"dcr"),"dcr"],
            ["DSC",currentMetric(latest,"dsc_dpmo"),"dsc_dpmo"],
            ["LoR",currentMetric(latest,"lor"),"lor"],
            ["POD",currentMetric(latest,"pod"),"pod"],
            ["CC",currentMetric(latest,"cc"),"cc"],
            ["CE",currentMetric(latest,"ce_dpmo"),"ce_dpmo"],
            ["CDF",currentMetric(latest,"cdf_dpmo"),"cdf_dpmo"],
            ["PSB",currentMetric(latest,"psb"),"psb"],
          ].map(([label,value,key])=><article key={label}><span>{label}</span><strong>{fmt(value,key)}</strong><small>{rootCause.components.find((x)=>x.key===key||((key==="mentor")&&x.key==="fico"))?.points??0} pts</small></article>)}
        </section>
        <section className="driver360v2-overview-grid">
          <article className="panel"><div className="panel-head"><div><h2>Performance trajectory</h2><p>Recent imported periods.</p></div><span className="panel-badge">{snapshot.periods.length} periods</span></div><DriverTrajectoryChart snapshot={snapshot}/></article>
          <article className="panel"><div className="panel-head"><div><h2>Recovery plan</h2><p>Highest recoverable next-band opportunities.</p></div></div><div className="driver360v2-recovery">{recovery.map((item)=><div key={item.metric}><b>{String(item.rank).padStart(2,"0")}</b><p><strong>{item.metric}</strong><small>{item.action}</small></p><em>+{item.recoverableNext} pts</em></div>)}{!recovery.length&&<div className="driver360v2-empty compact">No scorecard recovery action required.</div>}</div></article>
        </section>
        <section className="panel driver360v2-dwc"><div className="panel-head"><div><h2>IADC & DWC compliance detail</h2><p>Exact workflow exceptions extracted from the selected Amazon compliance report.</p></div><span className="panel-badge">DWC {dwcScore==null?"—":Number(dwcScore).toFixed(2)+"%"}</span></div><div className="driver360v2-dwc-summary"><article><span>IADC</span><strong>{latest?.iadc==null?"—":Number(latest.iadc).toFixed(2)+"%"}</strong></article><article><span>DWC</span><strong>{dwcScore==null?"—":Number(dwcScore).toFixed(2)+"%"}</strong></article><article><span>Recorded misses</span><strong>{dwcIssues.reduce((sum,[,value])=>sum+Number(value||0),0)}</strong></article></div><div className="driver360v2-dwc-errors">{Object.entries(dwcErrorLabels).map(([key,label])=>{const value=dwcErrors[key];const known=value!=null;return <div key={key} className={known&&Number(value)>0?"has-miss":"clean"}><span>{label}</span><strong>{known?Number(value):"—"}</strong><small>{!known?"No evidence in this report":Number(value)>0?"Recorded workflow miss":"No miss recorded"}</small></div>})}</div></section>
        <Driver360DeltaGrid snapshot={snapshot}/>
      </>}

      {tab==="root-cause"&&<>
        <RootCausePanel result={rootCause} title="Driver Root-Cause Engine" subtitle={"100 possible → "+(rootCause.score??"—")+" actual → "+rootCause.pointsLost+" points lost."}/>
        <section className="panel driver360v2-trend"><div className="panel-head"><div><h2>12-period score trend</h2><p>Total Score, tier and primary point-loss driver.</p></div></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Week</th><th>Total Score</th><th>Tier</th><th>Points Lost</th><th>Primary Cause</th></tr></thead><tbody>{trend.slice().reverse().map((row)=><tr key={row.weekLabel+"-"+(row.periodEnd||"")}><td><b>{row.weekLabel}</b></td><td>{row.score??"—"}</td><td>{row.tier}</td><td>{row.pointsLost}</td><td>{row.primary||"—"}</td></tr>)}</tbody></table></div></section>
      </>}

      {tab==="timeline"&&<section className="panel">
        <div className="panel-head"><div><h2>Unified driver timeline</h2><p>Incidents, coaching, customer evidence, notes and audited management actions.</p></div><span className="panel-badge">{timeline.length}</span></div>
        <div className="driver360v2-timeline">{timeline.map((item)=><article key={item.id} className={item.tone}><span>{item.type}</span><div><b>{item.title}</b><p>{item.detail||"No detail recorded."}</p><small>{timeLabel(item.date)}{item.meta?" · "+item.meta:""}</small></div></article>)}{!timeline.length&&<div className="driver360v2-empty">No non-scorecard timeline events yet.</div>}</div>
      </section>}

      {tab==="evidence"&&<section className="driver360v2-two">
        <article className="panel"><div className="panel-head"><div><h2>Operational incidents</h2><p>Investigations linked to this driver.</p></div><button className="profile-link" onClick={()=>onOpenEvidence?.(driver)}>Open center →</button></div><div className="driver360v2-list">{(data?.incidents||[]).map((item)=><div key={item.id}><span className={"mgrv2-severity "+item.severity}>{item.severity}</span><p><b>{item.title}</b><small>{item.incident_type} · {item.status} · {dateLabel(item.occurred_at||item.created_at)}</small></p></div>)}{!(data?.incidents||[]).length&&<div className="driver360v2-empty compact">No incidents linked.</div>}</div></article>
        <article className="panel"><div className="panel-head"><div><h2>Customer / delivery evidence</h2><p>CDF, DNR and delivery-quality events.</p></div><span className="panel-badge">{(data?.feedback||[]).length}</span></div><div className="driver360v2-list">{(data?.feedback||[]).slice(0,20).map((item)=><div key={item.id}><span className={item.dnr_concession?"evidence-bad":"evidence-neutral"}>{item.dnr_concession?"DNR":"CDF"}</span><p><b>{item.feedback_l2||item.feedback_l1||item.feedback_l0||"Feedback event"}</b><small>{item.tracking_id||"No tracking ID"} · {dateLabel(item.feedback_date)}</small></p></div>)}{!(data?.feedback||[]).length&&<div className="driver360v2-empty compact">No customer feedback evidence linked.</div>}</div></article>
      </section>}

      {tab==="coaching"&&<section className="panel"><div className="panel-head"><div><h2>Coaching history</h2><p>Open and completed interventions.</p></div><button className="btn primary" onClick={()=>onOpenCoaching?.(driver)}>Open Coaching V3</button></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Created</th><th>Case</th><th>Metric</th><th>Priority</th><th>Status</th><th>Due</th><th>Outcome</th></tr></thead><tbody>{(data?.coaching||[]).map((item)=><tr key={item.id}><td>{dateLabel(item.created_at)}</td><td><b>{item.title}</b></td><td>{item.metric||"—"}</td><td>{item.priority}</td><td>{item.status}</td><td>{dateLabel(item.due_at)}</td><td>{item.outcome||"—"}</td></tr>)}{!(data?.coaching||[]).length&&<tr><td colSpan="7"><div className="driver360v2-empty compact">No coaching cases.</div></td></tr>}</tbody></table></div></section>}

      {tab==="audit"&&<section className="driver360v2-two">
        <article className="panel"><div className="panel-head"><div><h2>Manager notes</h2><p>Permanent driver-level operational notes.</p></div></div>{canManage&&<div className="driver360v2-note-entry"><textarea value={note} onChange={(e)=>setNote(e.target.value)} placeholder="Add evidence, manager context or follow-up note…"/><button className="btn primary" disabled={!note.trim()||busy==="note"} onClick={addNote}>Add note</button></div>}<div className="driver360v2-note-list">{(data?.notes||[]).map((item)=><article key={item.id}><span>{item.author_name||item.author_email||"Team member"} · {timeLabel(item.created_at)}</span><p>{item.note}</p></article>)}{!(data?.notes||[]).length&&<div className="driver360v2-empty compact">No manager notes.</div>}</div></article>
        <article className="panel"><div className="panel-head"><div><h2>Audit trail</h2><p>Metric changes, reviews, coaching and governance actions.</p></div><span className="panel-badge">{(data?.audit||[]).length}</span></div><div className="driver360v2-note-list">{(data?.audit||[]).slice(0,50).map((item)=><article key={item.id}><span>{item.actor_name||item.actor_email||"System"} · {timeLabel(item.created_at)}</span><p><b>{item.action}</b><small>{item.event_type}</small></p></article>)}</div></article>
      </section>}

      <div className="driver360v2-source"><span>Source evidence</span><p>{sourceFiles(latest).length?sourceFiles(latest).join(" · "):driver.dbId?"Supabase driver metrics":"Local analysis"}</p></div>
    </>}
  </div>;
}
