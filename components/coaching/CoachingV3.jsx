"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import {
  acknowledgePerformanceAlert,
  addCoachingCaseNote,
  addTemplateChecklistNote,
  evaluateCoachingImprovement,
  fetchCoachingCaseNotes,
  fetchCoachingV3,
  openCoachingCaseDirect,
  openCoachingCaseFromAlert,
  resolvePerformanceAlert,
  updateCoachingCaseV3,
} from "../../lib/data/coachingV3";
import { COACHING_TEMPLATES, coachingTemplate, templateForMetric } from "../../lib/coaching/templates";

const severityRank={critical:0,high:1,medium:2,low:3};

function statusLabel(value){return String(value||"open").replaceAll("_"," ");}

function driverShape(row){
  return {
    id:row.trid||"—",
    dbId:row.driver_id,
    name:row.driver_name||"Driver",
    site:row.site||"",
    risk:["critical","high"].includes(row.severity||row.priority)?"High":"Medium",
    issue:row.message||row.reason||row.title||"Performance coaching",
  };
}

function dateInput(value){
  if(!value)return"";
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))return"";
  const local=new Date(date.getTime()-date.getTimezoneOffset()*60000);
  return local.toISOString().slice(0,16);
}

function dateLabel(value){
  if(!value)return"—";
  const date=new Date(value);
  return Number.isFinite(date.getTime())?date.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}):"—";
}

export default function CoachingV3({
  organizationId,
  siteFilter="all",
  drivers=[],
  canManage=false,
  onOpenDriver,
}){
  const [tab,setTab]=useState("overview");
  const [alerts,setAlerts]=useState([]);
  const [cases,setCases]=useState([]);
  const [assignees,setAssignees]=useState([]);
  const [selectedCaseId,setSelectedCaseId]=useState("");
  const [notes,setNotes]=useState([]);
  const [note,setNote]=useState("");
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [evaluation,setEvaluation]=useState(null);

  const [status,setStatus]=useState("open");
  const [priority,setPriority]=useState("medium");
  const [assignedTo,setAssignedTo]=useState("");
  const [dueAt,setDueAt]=useState("");
  const [followUpAt,setFollowUpAt]=useState("");
  const [outcome,setOutcome]=useState("");

  const [newDriverId,setNewDriverId]=useState("");
  const [newTemplateId,setNewTemplateId]=useState("general");
  const [newReason,setNewReason]=useState("");
  const [newPriority,setNewPriority]=useState("medium");

  async function load(){
    if(!organizationId)return;
    setLoading(true);setError("");
    try{
      const data=await fetchCoachingV3(getSupabaseBrowserClient(),organizationId);
      setAlerts(data.alerts||[]);
      setCases(data.cases||[]);
      setAssignees(data.assignees||[]);
    }catch(e){setError(e?.message||"Could not load Coaching V3.");}
    finally{setLoading(false);}
  }

  useEffect(()=>{load();},[organizationId]);

  const scopedAlerts=useMemo(()=>alerts.filter((row)=>siteFilter==="all"||String(row.site||"").toUpperCase()===siteFilter).sort((a,b)=>(severityRank[a.severity]??9)-(severityRank[b.severity]??9)||new Date(b.created_at||0)-new Date(a.created_at||0)),[alerts,siteFilter]);
  const scopedCases=useMemo(()=>cases.filter((row)=>siteFilter==="all"||String(row.site||"").toUpperCase()===siteFilter).sort((a,b)=>(severityRank[a.priority]??9)-(severityRank[b.priority]??9)||new Date(b.updated_at||0)-new Date(a.updated_at||0)),[cases,siteFilter]);
  const selectedCase=scopedCases.find((item)=>item.id===selectedCaseId)||null;

  useEffect(()=>{
    if(!selectedCase)return;
    setStatus(selectedCase.status||"open");
    setPriority(selectedCase.priority||"medium");
    setAssignedTo(selectedCase.assigned_to||"");
    setDueAt(dateInput(selectedCase.due_at));
    setFollowUpAt(dateInput(selectedCase.follow_up_at));
    setOutcome(selectedCase.outcome||"");
    setEvaluation(null);
  },[selectedCaseId,selectedCase?.updated_at]);

  useEffect(()=>{
    let alive=true;
    if(!selectedCaseId){setNotes([]);return()=>{};}
    (async()=>{
      try{
        const next=await fetchCoachingCaseNotes(getSupabaseBrowserClient(),selectedCaseId);
        if(alive)setNotes(next);
      }catch(e){if(alive)setError(e?.message||"Could not load coaching notes.");}
    })();
    return()=>{alive=false;};
  },[selectedCaseId]);

  async function run(key,fn,success){
    if(!canManage)return;
    setBusy(key);setError("");setNotice("");
    try{await fn();if(success)setNotice(success);await load();}
    catch(e){setError(e?.message||"Action failed.");}
    finally{setBusy("");}
  }

  async function coachAlert(alert){
    await run("coach-"+alert.id,async()=>{
      const caseId=await openCoachingCaseFromAlert(getSupabaseBrowserClient(),alert.id);
      setSelectedCaseId(caseId);setTab("cases");
    },"Coaching case opened.");
  }

  async function acknowledge(alert){
    await run("ack-"+alert.id,()=>acknowledgePerformanceAlert(getSupabaseBrowserClient(),alert.id),"Alert acknowledged.");
  }

  async function resolveAlert(alert){
    await run("resolve-"+alert.id,()=>resolvePerformanceAlert(getSupabaseBrowserClient(),alert.id),"Alert resolved.");
  }

  async function saveCase(){
    if(!selectedCase)return;
    await run("save-"+selectedCase.id,()=>updateCoachingCaseV3(getSupabaseBrowserClient(),selectedCase,{
      status,priority,assignedTo:assignedTo||null,
      dueAt:dueAt?new Date(dueAt).toISOString():null,
      followUpAt:followUpAt?new Date(followUpAt).toISOString():null,
      outcome,
    }),"Coaching case updated.");
  }

  async function addNote(){
    if(!selectedCase||!note.trim())return;
    setBusy("note-"+selectedCase.id);setError("");
    try{
      await addCoachingCaseNote(getSupabaseBrowserClient(),selectedCase.id,note);
      setNote("");
      setNotes(await fetchCoachingCaseNotes(getSupabaseBrowserClient(),selectedCase.id));
      setNotice("Coaching note added.");
      await load();
    }catch(e){setError(e?.message||"Could not add note.");}
    finally{setBusy("");}
  }

  async function evaluate(){
    if(!selectedCase)return;
    setBusy("evaluate-"+selectedCase.id);setError("");
    try{setEvaluation(await evaluateCoachingImprovement(getSupabaseBrowserClient(),selectedCase.id));}
    catch(e){setError(e?.message||"Could not evaluate next-week improvement.");}
    finally{setBusy("");}
  }

  async function createCase(){
    if(!newDriverId)return;
    const driver=drivers.find((item)=>String(item.dbId||item.driver_id)===String(newDriverId));
    const template=coachingTemplate(newTemplateId);
    setBusy("create");setError("");setNotice("");
    try{
      const caseId=await openCoachingCaseDirect(getSupabaseBrowserClient(),{
        organizationId,
        driverId:newDriverId,
        title:template.title,
        reason:newReason.trim()||template.reason,
        metric:template.metric,
        priority:newPriority||template.priority,
        periodLabel:driver?.weekLabel||driver?.week_label||null,
        templateId:template.id,
        signalKey:"manual:"+newDriverId+":"+template.id+":"+new Date().toISOString().slice(0,10),
        metadata:{source:"coaching-v3",template_id:template.id},
      });
      await addTemplateChecklistNote(getSupabaseBrowserClient(),caseId,template);
      setSelectedCaseId(caseId);
      setNewReason("");
      setTab("cases");
      setNotice("Coaching case created with template checklist.");
      await load();
    }catch(e){setError(e?.message||"Could not create coaching case.");}
    finally{setBusy("");}
  }

  const activeAlerts=scopedAlerts.filter((x)=>x.status!=="resolved");
  const activeCases=scopedCases.filter((x)=>x.status!=="closed");
  const overdue=activeCases.filter((x)=>x.due_at&&new Date(x.due_at)<new Date()).length;
  const dueSoon=activeCases.filter((x)=>{
    if(!x.due_at)return false;
    const diff=new Date(x.due_at).getTime()-Date.now();
    return diff>=0&&diff<=3*86400000;
  }).length;
  const improved=scopedCases.filter((x)=>x.status==="improved").length;

  if(loading)return <section className="panel coachv3-empty"><div className="auth-spinner"/><b>Loading Coaching V3…</b></section>;

  return <div className="coachv3-root">
    <div className="coachv3-heading">
      <div><span className="page-kicker">COACHING V3</span><h1>Performance Coaching</h1><p>Turn alerts into assigned, evidenced and measurable improvement plans.</p></div>
      <button className="btn primary" disabled={!canManage} onClick={()=>setTab("new")}>+ New coaching</button>
    </div>
    {error&&<div className="mgrv2-notice error">{error}</div>}{notice&&<div className="mgrv2-notice good">{notice}</div>}

    <section className="coachv3-kpis">
      <article><span>Active alerts</span><strong>{activeAlerts.length}</strong><small>Available for coaching</small></article>
      <article className={overdue?"bad":""}><span>Overdue cases</span><strong>{overdue}</strong><small>Past due date</small></article>
      <article className={dueSoon?"warn":""}><span>Due in 3 days</span><strong>{dueSoon}</strong><small>Follow-up window</small></article>
      <article><span>Active cases</span><strong>{activeCases.length}</strong><small>Open interventions</small></article>
      <article><span>Improved</span><strong>{improved}</strong><small>Documented outcomes</small></article>
    </section>

    <div className="coachv3-tabs">
      {["overview","alerts","cases","new"].map((value)=><button key={value} className={tab===value?"active":""} onClick={()=>setTab(value)}>{value==="new"?"New Coaching":value.charAt(0).toUpperCase()+value.slice(1)}</button>)}
    </div>

    {tab==="overview"&&<section className="coachv3-overview">
      <article className="panel">
        <div className="panel-head"><div><h2>Coach next</h2><p>Highest severity alerts not yet resolved.</p></div><span className="panel-badge">{activeAlerts.length}</span></div>
        <div className="coachv3-alert-stack">
          {activeAlerts.slice(0,8).map((alert)=><article key={alert.id}><span className={"mgrv2-severity "+alert.severity}>{alert.severity}</span><button onClick={()=>onOpenDriver?.(driverShape(alert))}><b>{alert.driver_name||"Driver"}</b><small>{alert.trid||"—"} · {alert.site||"—"}</small></button><div><b>{alert.title}</b><p>{alert.message||alert.metric}</p></div><button disabled={!canManage||!!busy} onClick={()=>coachAlert(alert)}>Coach</button></article>)}
          {!activeAlerts.length&&<div className="coachv3-empty">No active alerts.</div>}
        </div>
      </article>
      <article className="panel">
        <div className="panel-head"><div><h2>Follow-up queue</h2><p>Open cases ordered by due date and priority.</p></div></div>
        <div className="coachv3-case-stack compact">
          {activeCases.slice(0,8).map((item)=><button key={item.id} onClick={()=>{setSelectedCaseId(item.id);setTab("cases");}}><span className={"mgrv2-severity "+item.priority}>{item.priority}</span><div><b>{item.driver_name}</b><p>{item.title}</p><small>{statusLabel(item.status)} · Due {dateLabel(item.due_at)}</small></div></button>)}
        </div>
      </article>
    </section>}

    {tab==="alerts"&&<section className="panel">
      <div className="panel-head"><div><h2>Performance alert register</h2><p>Acknowledge, coach or resolve the current server-generated signals.</p></div></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Severity</th><th>Driver</th><th>Signal</th><th>Actual / Target</th><th>Week</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {scopedAlerts.map((alert)=><tr key={alert.id}><td><span className={"mgrv2-severity "+alert.severity}>{alert.severity}</span></td><td><button className="driver-text-button" onClick={()=>onOpenDriver?.(driverShape(alert))}><b>{alert.driver_name||"Driver"}</b><small>{alert.trid||"—"} · {alert.site||"—"}</small></button></td><td><b>{alert.title}</b><small className="history-date">{alert.metric||alert.alert_type}</small></td><td><b>{alert.actual_value??"—"}</b><small className="history-date">Target {alert.threshold??"—"}</small></td><td>{alert.period_label||"—"}</td><td>{statusLabel(alert.status)}</td><td><div className="coachv3-row-actions">{alert.status==="open"&&<button disabled={!canManage||!!busy} onClick={()=>acknowledge(alert)}>Acknowledge</button>}{alert.status!=="resolved"&&<button className="primary" disabled={!canManage||!!busy} onClick={()=>coachAlert(alert)}>Coach</button>}{alert.status!=="resolved"&&<button disabled={!canManage||!!busy} onClick={()=>resolveAlert(alert)}>Resolve</button>}</div></td></tr>)}
      </tbody></table></div>
    </section>}

    {tab==="cases"&&<div className="coachv3-case-layout">
      <section className="panel coachv3-case-list"><div className="panel-head"><div><h2>Coaching cases</h2><p>Open and historical interventions.</p></div></div><div className="coachv3-case-stack">
        {scopedCases.map((item)=><button key={item.id} className={selectedCaseId===item.id?"active":""} onClick={()=>setSelectedCaseId(item.id)}><span className={"mgrv2-severity "+item.priority}>{item.priority}</span><div><b>{item.driver_name||"Driver"}</b><p>{item.title}</p><small>{statusLabel(item.status)} · Due {dateLabel(item.due_at)}</small></div></button>)}
        {!scopedCases.length&&<div className="coachv3-empty">No coaching cases yet.</div>}
      </div></section>
      <section className="panel coachv3-case-detail">
        {!selectedCase?<div className="coachv3-empty"><b>Select a coaching case</b><span>Case controls and evidence will appear here.</span></div>:<>
          <div className="panel-head"><div><h2>{selectedCase.driver_name}</h2><p>{selectedCase.title}</p></div><button className="profile-link" onClick={()=>onOpenDriver?.(driverShape(selectedCase))}>Open driver →</button></div>
          <div className="coachv3-meta"><div><span>Metric</span><b>{selectedCase.metric||"—"}</b></div><div><span>Priority</span><b>{selectedCase.priority}</b></div><div><span>Created</span><b>{dateLabel(selectedCase.created_at)}</b></div><div><span>Template</span><b>{selectedCase.metadata?.template_id||"Alert / manual"}</b></div></div>
          <div className="coachv3-reason"><span>Evidence / reason</span><p>{selectedCase.reason||"No reason recorded."}</p></div>
          <div className="coachv3-form">
            <label><span>Status</span><select value={status} disabled={!canManage} onChange={(e)=>setStatus(e.target.value)}>{["open","assigned","acknowledged","follow_up","improved","not_improved","closed"].map((x)=><option key={x} value={x}>{statusLabel(x)}</option>)}</select></label>
            <label><span>Priority</span><select value={priority} disabled={!canManage} onChange={(e)=>setPriority(e.target.value)}>{["low","medium","high","critical"].map((x)=><option key={x}>{x}</option>)}</select></label>
            <label><span>Assigned manager</span><select value={assignedTo} disabled={!canManage} onChange={(e)=>setAssignedTo(e.target.value)}><option value="">Unassigned</option>{assignees.map((x)=><option key={x.user_id} value={x.user_id}>{x.full_name||x.email||x.user_id}</option>)}</select></label>
            <label><span>Due</span><input type="datetime-local" value={dueAt} disabled={!canManage} onChange={(e)=>setDueAt(e.target.value)}/></label>
            <label><span>Follow-up</span><input type="datetime-local" value={followUpAt} disabled={!canManage} onChange={(e)=>setFollowUpAt(e.target.value)}/></label>
            <label className="wide"><span>Outcome / next action</span><input value={outcome} disabled={!canManage} onChange={(e)=>setOutcome(e.target.value)} placeholder="What changed and what happens next?"/></label>
            <button className="btn primary" disabled={!canManage||busy==="save-"+selectedCase.id} onClick={saveCase}>Save case</button>
          </div>
          <section className="coachv3-evaluation"><div><span>NEXT-WEEK CHECK</span><h3>Did performance improve?</h3><p>MetrixIQ compares the case baseline period with the next available driver period for the coached metric.</p></div><button className="btn ghost" disabled={busy==="evaluate-"+selectedCase.id} onClick={evaluate}>Evaluate improvement</button>{evaluation&&<div className={"coachv3-eval-result "+(evaluation.improved===true?"good":evaluation.improved===false?"bad":"neutral")}><b>{evaluation.label||"No result"}</b><span>{evaluation.baseline_value??"—"} → {evaluation.follow_up_value??"—"}{evaluation.delta!=null?" · "+(evaluation.delta>0?"+":"")+evaluation.delta:""}</span><small>{evaluation.detail||""}</small></div>}</section>
          <section className="coachv3-notes"><h3>Audit notes</h3><div className="coachv3-note-entry"><textarea value={note} disabled={!canManage} onChange={(e)=>setNote(e.target.value)} placeholder="Conversation notes, evidence, agreed action or follow-up result…"/><button className="btn primary" disabled={!canManage||!note.trim()||busy==="note-"+selectedCase.id} onClick={addNote}>Add note</button></div><div className="coachv3-note-list">{notes.map((item)=><article key={item.id}><span>{item.author_name||"Team member"} · {dateLabel(item.created_at)} · {item.note_type||"note"}</span><p>{item.note}</p></article>)}{!notes.length&&<div className="coachv3-empty compact">No notes recorded yet.</div>}</div></section>
        </>}
      </section>
    </div>}

    {tab==="new"&&<section className="panel coachv3-new">
      <div className="panel-head"><div><h2>Create coaching plan</h2><p>Start from a professional template, then document the outcome through follow-up.</p></div></div>
      <div className="coachv3-new-grid">
        <label><span>Driver</span><select value={newDriverId} onChange={(e)=>setNewDriverId(e.target.value)}><option value="">Choose driver…</option>{drivers.filter((d)=>d.dbId||d.driver_id).map((d)=><option key={d.dbId||d.driver_id} value={d.dbId||d.driver_id}>{d.name||d.driver_name} · {d.id||d.trid||"—"} · {d.site||"—"}</option>)}</select></label>
        <label><span>Template</span><select value={newTemplateId} onChange={(e)=>{const id=e.target.value;setNewTemplateId(id);setNewPriority(coachingTemplate(id).priority);}}>{COACHING_TEMPLATES.map((item)=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label><span>Priority</span><select value={newPriority} onChange={(e)=>setNewPriority(e.target.value)}>{["low","medium","high","critical"].map((x)=><option key={x}>{x}</option>)}</select></label>
        <label className="wide"><span>Reason / evidence</span><textarea value={newReason} onChange={(e)=>setNewReason(e.target.value)} placeholder={coachingTemplate(newTemplateId).reason}/></label>
      </div>
      <div className="coachv3-template-preview"><span>CHECKLIST</span>{coachingTemplate(newTemplateId).checklist.map((item,index)=><div key={item}><b>{String(index+1).padStart(2,"0")}</b><p>{item}</p></div>)}</div>
      <button className="btn primary" disabled={!canManage||!newDriverId||busy==="create"} onClick={createCase}>{busy==="create"?"Creating…":"Create coaching case"}</button>
    </section>}
  </div>;
}
