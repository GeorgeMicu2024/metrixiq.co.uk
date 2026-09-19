"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import {
  addIncidentNote,
  createOperationalIncident,
  fetchIncidentCenterData,
  fetchIncidentNotes,
  promoteFeedbackToIncident,
  updateOperationalIncident,
} from "../../lib/data/operationsV4";

const TYPE_OPTIONS=[
  ["dnr","DNR / concession"],
  ["cdf","CDF / customer feedback"],
  ["pod","POD failure"],
  ["failed_delivery","Failed delivery"],
  ["customer_escalation","Customer escalation"],
  ["contact_compliance","Contact compliance"],
  ["route_failure","Route / completion"],
  ["safety","Safety"],
  ["vehicle","Vehicle"],
  ["other","Other"],
];

function dateLabel(value){
  if(!value)return"—";
  const d=new Date(value);
  return Number.isFinite(d.getTime())?d.toLocaleString("en-GB",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}):String(value);
}

function driverShape(item){
  return {id:item.trid||item.trid_raw||"—",dbId:item.driver_id,name:item.driver_name||item.drivers?.full_name||"Driver",site:item.site||item.drivers?.site||"",risk:["critical","high"].includes(item.severity)?"High":"Medium",issue:item.title||item.feedback_l2||item.feedback_l1||"Operational evidence"};
}

function evidenceType(item){
  if(item.dnr_concession)return"DNR";
  if(item.scanned_over_25m)return"Scan >25m";
  if(String(item.contact_compliance||"").toLowerCase().includes("fail"))return"Contact";
  return"CDF";
}

export default function EvidenceIncidentCenter({
  organizationId,
  siteFilter="all",
  drivers=[],
  initialDriverId="",
  canManage=false,
  onOpenDriver,
  onOpenCoaching,
}){
  const [data,setData]=useState({incidents:[],feedback:[],assignees:[]});
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [tab,setTab]=useState("incidents");
  const [status,setStatus]=useState("active");
  const [type,setType]=useState("all");
  const [severity,setSeverity]=useState("all");
  const [query,setQuery]=useState("");
  const [selectedId,setSelectedId]=useState("");
  const [notes,setNotes]=useState([]);
  const [note,setNote]=useState("");
  const [busy,setBusy]=useState("");
  const [newOpen,setNewOpen]=useState(false);
  const [draft,setDraft]=useState({
    driverId:"",site:siteFilter==="all"?"":siteFilter,weekLabel:"",trackingId:"",
    incidentType:"dnr",severity:"medium",title:"",description:"",occurredAt:"",
  });
  const [edit,setEdit]=useState({status:"open",severity:"medium",assignedTo:"",dueAt:"",rootCause:"",outcome:"",description:""});

  async function load(){
    if(!organizationId)return;
    setLoading(true);setError("");
    try{setData(await fetchIncidentCenterData(getSupabaseBrowserClient(),organizationId));}
    catch(e){setError(e?.message||"Could not load Evidence & Incident Center.");}
    finally{setLoading(false);}
  }
  useEffect(()=>{load();},[organizationId]);

  useEffect(()=>{
    if(!initialDriverId)return;
    const driver=drivers.find((item)=>String(item.dbId||item.driver_id)===String(initialDriverId));
    if(driver)setQuery(driver.name||driver.id||"");
    const incident=data.incidents.find((item)=>String(item.driver_id)===String(initialDriverId));
    if(incident){setSelectedId(incident.id);setTab("incidents");}
  },[initialDriverId,data.incidents.length,drivers.length]);

  const incidents=useMemo(()=>data.incidents.filter((item)=>siteFilter==="all"||!item.site||String(item.site).toUpperCase()===siteFilter),[data.incidents,siteFilter]);
  const feedback=useMemo(()=>data.feedback.filter((item)=>siteFilter==="all"||!item.site||String(item.site).toUpperCase()===siteFilter),[data.feedback,siteFilter]);
  const selected=incidents.find((item)=>item.id===selectedId)||null;

  useEffect(()=>{
    if(!selected){setNotes([]);return;}
    setEdit({
      status:selected.status||"open",severity:selected.severity||"medium",assignedTo:selected.assigned_to||"",
      dueAt:selected.due_at?new Date(new Date(selected.due_at).getTime()-new Date(selected.due_at).getTimezoneOffset()*60000).toISOString().slice(0,16):"",
      rootCause:selected.root_cause||"",outcome:selected.outcome||"",description:selected.description||"",
    });
    let alive=true;
    (async()=>{try{const next=await fetchIncidentNotes(getSupabaseBrowserClient(),selected.id);if(alive)setNotes(next);}catch(e){if(alive)setError(e?.message||"Could not load incident notes.");}})();
    return()=>{alive=false;};
  },[selectedId,selected?.updated_at]);

  const visibleIncidents=useMemo(()=>{
    const q=query.trim().toLowerCase();
    return incidents.filter((item)=>{
      if(status==="active"&&["closed","resolved"].includes(item.status))return false;
      if(status!=="all"&&status!=="active"&&item.status!==status)return false;
      if(type!=="all"&&item.incident_type!==type)return false;
      if(severity!=="all"&&item.severity!==severity)return false;
      if(q&&![
        item.title,item.description,item.root_cause,item.outcome,item.driver_name,item.trid,item.tracking_id,item.week_label
      ].filter(Boolean).join(" ").toLowerCase().includes(q))return false;
      return true;
    });
  },[incidents,status,type,severity,query]);

  const openCount=incidents.filter((x)=>!["closed","resolved"].includes(x.status)).length;
  const highCount=incidents.filter((x)=>!["closed","resolved"].includes(x.status)&&["critical","high"].includes(x.severity)).length;
  const dnrEvidence=feedback.filter((x)=>x.dnr_concession).length;
  const cdfEvidence=feedback.length;
  const unlinkedEvidence=feedback.filter((x)=>!x.driver_id).length;

  async function saveIncident(){
    if(!selected||!canManage)return;
    setBusy("save");setError("");setNotice("");
    try{
      await updateOperationalIncident(getSupabaseBrowserClient(),selected.id,{
        status:edit.status,severity:edit.severity,assignedTo:edit.assignedTo||null,
        dueAt:edit.dueAt?new Date(edit.dueAt).toISOString():null,
        rootCause:edit.rootCause,outcome:edit.outcome,description:edit.description,
      });
      setNotice("Incident updated with audit trail.");await load();
    }catch(e){setError(e?.message||"Could not update incident.");}
    finally{setBusy("");}
  }

  async function createIncident(){
    if(!draft.title.trim()||!canManage)return;
    setBusy("create");setError("");setNotice("");
    try{
      const id=await createOperationalIncident(getSupabaseBrowserClient(),{
        organizationId,...draft,
        occurredAt:draft.occurredAt?new Date(draft.occurredAt).toISOString():null,
      });
      setNewOpen(false);setDraft({driverId:"",site:siteFilter==="all"?"":siteFilter,weekLabel:"",trackingId:"",incidentType:"dnr",severity:"medium",title:"",description:"",occurredAt:""});
      setSelectedId(id);setTab("incidents");setNotice("Operational incident created.");await load();
    }catch(e){setError(e?.message||"Could not create incident.");}
    finally{setBusy("");}
  }

  async function addNote(){
    if(!selected||!note.trim()||!canManage)return;
    setBusy("note");
    try{
      await addIncidentNote(getSupabaseBrowserClient(),selected.id,note.trim());
      setNote("");setNotes(await fetchIncidentNotes(getSupabaseBrowserClient(),selected.id));setNotice("Incident note added.");
    }catch(e){setError(e?.message||"Could not add incident note.");}
    finally{setBusy("");}
  }

  async function promote(item){
    if(!canManage)return;
    setBusy("feedback-"+item.id);setError("");setNotice("");
    try{
      const id=await promoteFeedbackToIncident(getSupabaseBrowserClient(),organizationId,item.id);
      setSelectedId(id);setTab("incidents");setNotice("Evidence promoted to an incident investigation.");await load();
    }catch(e){setError(e?.message||"Could not create incident from evidence.");}
    finally{setBusy("");}
  }

  if(loading)return <section className="panel incidentv4-empty"><div className="auth-spinner"/><b>Loading operational evidence…</b></section>;

  return <div className="incidentv4-root">
    <div className="incidentv4-heading">
      <div><span className="page-kicker">EVIDENCE & INCIDENT CENTER</span><h1>Operational Investigations</h1><p>Centralise DNR, CDF, POD, failed delivery, contact and escalation evidence with a complete management audit trail.</p></div>
      <div><button className="btn ghost" onClick={load}>Refresh evidence</button><button className="btn primary" disabled={!canManage} onClick={()=>setNewOpen(true)}>+ New incident</button></div>
    </div>
    {error&&<div className="mgrv2-notice error">{error}</div>}{notice&&<div className="mgrv2-notice good">{notice}</div>}

    <section className="incidentv4-kpis">
      <article className={highCount?"bad":""}><span>Open incidents</span><strong>{openCount}</strong><small>{highCount} high / critical</small></article>
      <article><span>Customer evidence</span><strong>{cdfEvidence}</strong><small>CDF / delivery events</small></article>
      <article className={dnrEvidence?"warn":""}><span>DNR evidence</span><strong>{dnrEvidence}</strong><small>Concession-linked events</small></article>
      <article className={unlinkedEvidence?"warn":""}><span>Unlinked evidence</span><strong>{unlinkedEvidence}</strong><small>No trusted driver identity</small></article>
      <article><span>Resolved</span><strong>{incidents.filter((x)=>["closed","resolved"].includes(x.status)).length}</strong><small>Completed investigations</small></article>
    </section>

    <div className="incidentv4-tabs"><button className={tab==="incidents"?"active":""} onClick={()=>setTab("incidents")}>Incidents</button><button className={tab==="evidence"?"active":""} onClick={()=>setTab("evidence")}>Evidence Inbox</button></div>

    {tab==="incidents"&&<>
      <section className="incidentv4-controls">
        <input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search driver, TRID, tracking ID, cause…"/>
        <select value={status} onChange={(e)=>setStatus(e.target.value)}><option value="active">Active</option><option value="all">All statuses</option><option value="open">Open</option><option value="investigating">Investigating</option><option value="actioned">Actioned</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select>
        <select value={type} onChange={(e)=>setType(e.target.value)}><option value="all">All types</option>{TYPE_OPTIONS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
        <select value={severity} onChange={(e)=>setSeverity(e.target.value)}><option value="all">All severities</option>{["critical","high","medium","low"].map((x)=><option key={x}>{x}</option>)}</select>
        <span>{visibleIncidents.length} results</span>
      </section>

      <div className="incidentv4-layout">
        <section className="panel incidentv4-list">
          <div className="panel-head"><div><h2>Incident register</h2><p>Investigation state, owner and evidence context.</p></div></div>
          <div>{visibleIncidents.map((item)=><button key={item.id} className={selectedId===item.id?"active":""} onClick={()=>setSelectedId(item.id)}>
            <span className={"mgrv2-severity "+item.severity}>{item.severity}</span>
            <div><b>{item.title}</b><p>{item.driver_name||"Workspace / unassigned driver"}{item.trid?" · "+item.trid:""}</p><small>{item.incident_type} · {item.status} · {item.week_label||dateLabel(item.occurred_at)}</small></div>
            <em>{item.assigned_name||"Unassigned"}</em>
          </button>)}{!visibleIncidents.length&&<div className="incidentv4-empty">No incidents match the filters.</div>}</div>
        </section>

        <section className="panel incidentv4-detail">
          {!selected?<div className="incidentv4-empty"><b>Select an incident</b><span>Investigation controls, root cause and notes will appear here.</span></div>:<>
            <div className="panel-head"><div><span className="page-kicker">{selected.incident_type}</span><h2>{selected.title}</h2><p>{selected.tracking_id?"Tracking "+selected.tracking_id+" · ":""}{dateLabel(selected.occurred_at||selected.created_at)}</p></div><span className={"mgrv2-severity "+selected.severity}>{selected.severity}</span></div>
            {selected.driver_id&&<button className="incidentv4-driver" onClick={()=>onOpenDriver?.(driverShape(selected))}><b>{selected.driver_name}</b><span>{selected.trid||"—"} · {selected.site||"—"} · Open Driver 360 →</span></button>}
            <div className="incidentv4-form">
              <label><span>Status</span><select disabled={!canManage} value={edit.status} onChange={(e)=>setEdit((x)=>({...x,status:e.target.value}))}>{["open","investigating","actioned","resolved","closed"].map((x)=><option key={x}>{x}</option>)}</select></label>
              <label><span>Severity</span><select disabled={!canManage} value={edit.severity} onChange={(e)=>setEdit((x)=>({...x,severity:e.target.value}))}>{["low","medium","high","critical"].map((x)=><option key={x}>{x}</option>)}</select></label>
              <label><span>Assigned manager</span><select disabled={!canManage} value={edit.assignedTo} onChange={(e)=>setEdit((x)=>({...x,assignedTo:e.target.value}))}><option value="">Unassigned</option>{data.assignees.map((x)=><option key={x.user_id} value={x.user_id}>{x.full_name||x.email||x.user_id}</option>)}</select></label>
              <label><span>Due</span><input type="datetime-local" disabled={!canManage} value={edit.dueAt} onChange={(e)=>setEdit((x)=>({...x,dueAt:e.target.value}))}/></label>
              <label className="wide"><span>Description / evidence</span><textarea disabled={!canManage} value={edit.description} onChange={(e)=>setEdit((x)=>({...x,description:e.target.value}))}/></label>
              <label className="wide"><span>Root cause</span><textarea disabled={!canManage} value={edit.rootCause} onChange={(e)=>setEdit((x)=>({...x,rootCause:e.target.value}))} placeholder="Confirmed root cause after evidence review…"/></label>
              <label className="wide"><span>Outcome / prevention action</span><textarea disabled={!canManage} value={edit.outcome} onChange={(e)=>setEdit((x)=>({...x,outcome:e.target.value}))} placeholder="Action taken, coaching, process change or final outcome…"/></label>
              <div className="incidentv4-form-actions">{selected.driver_id&&<button className="btn ghost" onClick={()=>onOpenCoaching?.(driverShape(selected))}>Open Coaching</button>}<button className="btn primary" disabled={!canManage||busy==="save"} onClick={saveIncident}>Save investigation</button></div>
            </div>
            <section className="incidentv4-notes"><h3>Investigation notes</h3>{canManage&&<div><textarea value={note} onChange={(e)=>setNote(e.target.value)} placeholder="Add evidence review, customer context, coaching or follow-up note…"/><button className="btn primary" disabled={!note.trim()||busy==="note"} onClick={addNote}>Add note</button></div>}<article>{notes.map((item)=><div key={item.id}><span>{item.author_name||item.author_email||"Team member"} · {dateLabel(item.created_at)}</span><p>{item.note}</p></div>)}{!notes.length&&<div className="incidentv4-empty compact">No notes yet.</div>}</article></section>
          </>}
        </section>
      </div>
    </>}

    {tab==="evidence"&&<section className="panel incidentv4-evidence">
      <div className="panel-head"><div><h2>Evidence inbox</h2><p>Imported CDF / delivery events that can be promoted into formal investigations.</p></div><span className="panel-badge">{feedback.length}</span></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Type</th><th>Date</th><th>Driver</th><th>Tracking ID</th><th>Feedback</th><th>Compliance</th><th>Action</th></tr></thead><tbody>
        {feedback.map((item)=><tr key={item.id}><td><span className={item.dnr_concession?"incidentv4-evidence-bad":"incidentv4-evidence-neutral"}>{evidenceType(item)}</span></td><td>{dateLabel(item.feedback_date)}</td><td>{item.drivers?.full_name||item.trid_raw||"Unresolved"}<small className="history-date">{item.drivers?.trid||item.site||"—"}</small></td><td>{item.tracking_id||"—"}</td><td><b>{item.feedback_l2||item.feedback_l1||item.feedback_l0||"Feedback event"}</b><small className="history-date">{[item.city,item.postal_code].filter(Boolean).join(" · ")}</small></td><td>{item.contact_compliance||item.phr_compliance||"—"}</td><td><button className="btn ghost compact" disabled={!canManage||busy==="feedback-"+item.id} onClick={()=>promote(item)}>Investigate</button></td></tr>)}
        {!feedback.length&&<tr><td colSpan="7"><div className="incidentv4-empty compact">No imported feedback evidence.</div></td></tr>}
      </tbody></table></div>
    </section>}

    {newOpen&&<div className="gov-modal" onClick={()=>setNewOpen(false)}><div className="incidentv4-modal" onClick={(e)=>e.stopPropagation()}><header><div><span>NEW INCIDENT</span><h2>Create operational investigation</h2></div><button onClick={()=>setNewOpen(false)}>×</button></header><section>
      <div className="incidentv4-new-grid">
        <label><span>Driver</span><select value={draft.driverId} onChange={(e)=>{const id=e.target.value;const d=drivers.find((x)=>String(x.dbId||x.driver_id)===id);setDraft((x)=>({...x,driverId:id,site:d?.site||x.site}));}}><option value="">No driver / workspace incident</option>{drivers.filter((x)=>x.dbId||x.driver_id).map((d)=><option key={d.dbId||d.driver_id} value={d.dbId||d.driver_id}>{d.name||d.driver_name} · {d.id||d.trid||"—"} · {d.site||"—"}</option>)}</select></label>
        <label><span>Site</span><input value={draft.site} onChange={(e)=>setDraft((x)=>({...x,site:e.target.value.toUpperCase()}))} placeholder="DLS2"/></label>
        <label><span>Week</span><input value={draft.weekLabel} onChange={(e)=>setDraft((x)=>({...x,weekLabel:e.target.value.toUpperCase()}))} placeholder="W37"/></label>
        <label><span>Tracking ID</span><input value={draft.trackingId} onChange={(e)=>setDraft((x)=>({...x,trackingId:e.target.value}))}/></label>
        <label><span>Type</span><select value={draft.incidentType} onChange={(e)=>setDraft((x)=>({...x,incidentType:e.target.value}))}>{TYPE_OPTIONS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label><span>Severity</span><select value={draft.severity} onChange={(e)=>setDraft((x)=>({...x,severity:e.target.value}))}>{["low","medium","high","critical"].map((x)=><option key={x}>{x}</option>)}</select></label>
        <label><span>Occurred</span><input type="datetime-local" value={draft.occurredAt} onChange={(e)=>setDraft((x)=>({...x,occurredAt:e.target.value}))}/></label>
        <label className="wide"><span>Title</span><input value={draft.title} onChange={(e)=>setDraft((x)=>({...x,title:e.target.value}))} placeholder="Short investigation title"/></label>
        <label className="wide"><span>Description / initial evidence</span><textarea value={draft.description} onChange={(e)=>setDraft((x)=>({...x,description:e.target.value}))}/></label>
      </div>
      <div className="incidentv4-modal-actions"><button className="btn ghost" onClick={()=>setNewOpen(false)}>Cancel</button><button className="btn primary" disabled={!draft.title.trim()||busy==="create"} onClick={createIncident}>{busy==="create"?"Creating…":"Create incident"}</button></div>
    </section></div></div>}
  </div>;
}
