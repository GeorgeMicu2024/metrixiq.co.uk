"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import {
  claimActionCenterItem,
  completeWorkflowStep,
  decideApprovalRequest,
  fetchActionCenterV2,
  refreshSlaEscalations,
  requestActionCloseApproval,
} from "../../lib/data/automationV8";

const SLA_ORDER={breached:0,at_risk:1,within_sla:2};
const PRIORITY_ORDER={critical:0,high:1,medium:2,low:3};

function dateTime(value){
  if(!value)return"—";
  const d=new Date(value);
  return Number.isFinite(d.getTime())?d.toLocaleString("en-GB",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}):String(value);
}
function human(value){return String(value||"").replaceAll("_"," ").replace(/\b\w/g,(m)=>m.toUpperCase());}
function driverShape(item){
  return {id:item.trid||"—",dbId:item.driver_id,name:item.driver_name||"Driver",site:item.site||"",risk:["critical","high"].includes(item.priority)?"High":"Medium",issue:item.detail||item.title};
}

export default function ActionCenterV2({
  organizationId,
  siteFilter="all",
  canManage=false,
  canApprove=false,
  onOpenDriver,
  onNavigate,
}){
  const [items,setItems]=useState([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState("");
  const [query,setQuery]=useState("");
  const [type,setType]=useState("all");
  const [sla,setSla]=useState("all");
  const [priority,setPriority]=useState("all");
  const [selected,setSelected]=useState(null);

  async function load(){
    if(!organizationId)return;
    setLoading(true);setError("");
    try{
      const rows=await fetchActionCenterV2(getSupabaseBrowserClient(),organizationId,siteFilter,1500);
      setItems(rows);
      if(selected)setSelected(rows.find((x)=>x.entity_type===selected.entity_type&&x.entity_id===selected.entity_id)||null);
    }catch(e){setError(e?.message||"Could not load Action Center V2.");}
    finally{setLoading(false);}
  }
  useEffect(()=>{load();},[organizationId,siteFilter]);

  const visible=useMemo(()=>{
    const q=query.trim().toLowerCase();
    return items.filter((item)=>{
      if(type!=="all"&&item.entity_type!==type)return false;
      if(sla!=="all"&&item.sla_status!==sla)return false;
      if(priority!=="all"&&item.priority!==priority)return false;
      if(q&&![
        item.driver_name,item.trid,item.site,item.title,item.detail,item.entity_type,item.status,item.source
      ].filter(Boolean).join(" ").toLowerCase().includes(q))return false;
      return true;
    }).sort((a,b)=>
      (SLA_ORDER[a.sla_status]??9)-(SLA_ORDER[b.sla_status]??9)||
      (PRIORITY_ORDER[a.priority]??9)-(PRIORITY_ORDER[b.priority]??9)||
      new Date(a.sla_deadline||a.due_at||0)-new Date(b.sla_deadline||b.due_at||0)
    );
  },[items,query,type,sla,priority]);

  const summary=useMemo(()=>({
    total:items.length,
    breached:items.filter((x)=>x.sla_status==="breached").length,
    atRisk:items.filter((x)=>x.sla_status==="at_risk").length,
    approvals:items.filter((x)=>x.entity_type==="approval").length,
    workflows:items.filter((x)=>x.entity_type==="workflow").length,
    unassigned:items.filter((x)=>!x.assigned_to&&x.entity_type!=="approval").length,
  }),[items]);

  async function run(key,fn,success){
    setBusy(key);setError("");setNotice("");
    try{await fn();setNotice(success);await load();}
    catch(e){setError(e?.message||"Action failed.");}
    finally{setBusy("");}
  }

  async function escalate(){
    await run("sla",async()=>{
      const created=await refreshSlaEscalations(getSupabaseBrowserClient(),organizationId);
      setNotice(created+" new SLA escalation notification"+(created===1?"":"s")+" created.");
    },"");
  }

  function openRelated(item){
    if(item.driver_id&&onOpenDriver)return onOpenDriver(driverShape(item));
    if(item.action_target)return onNavigate?.(item.action_target);
  }

  if(loading)return <section className="panel actionv8-empty"><div className="auth-spinner"/><b>Building Action Center V2…</b></section>;

  return <div className="actionv8-root">
    <div className="actionv8-heading">
      <div><span className="page-kicker">ACTION CENTER V2</span><h1>Today</h1><p>One governed queue for tasks, coaching, incidents, workflows, approvals and SLA escalation.</p></div>
      <div><button className="btn ghost" onClick={load}>Refresh</button><button className="btn ghost" disabled={!canManage||busy==="sla"} onClick={escalate}>Refresh SLA escalations</button><button className="btn primary" onClick={()=>onNavigate?.("automation")}>Automation Engine</button></div>
    </div>

    {error&&<div className="mgrv2-notice error">{error}</div>}
    {notice&&<div className="mgrv2-notice good">{notice}</div>}

    <section className="actionv8-hero">
      <div><span>CURRENT CONTROL STATE</span><h2>{summary.breached?summary.breached+" SLA breach"+(summary.breached===1?"":"es")+" require action":summary.atRisk?summary.atRisk+" items are approaching SLA":"No current SLA breach"}</h2><p>{summary.approvals} approvals · {summary.workflows} workflows · {summary.unassigned} unassigned.</p></div>
      <div><span>Action queue</span><strong>{summary.total}</strong><small>{siteFilter==="all"?"All sites":siteFilter}</small></div>
    </section>

    <section className="actionv8-kpis">
      <article className={summary.breached?"bad":""}><span>SLA breached</span><strong>{summary.breached}</strong><small>Escalation required</small></article>
      <article className={summary.atRisk?"warn":""}><span>At risk</span><strong>{summary.atRisk}</strong><small>Deadline approaching</small></article>
      <article className={summary.approvals?"warn":""}><span>Approvals</span><strong>{summary.approvals}</strong><small>Pending decision</small></article>
      <article><span>Workflows</span><strong>{summary.workflows}</strong><small>Active playbooks</small></article>
      <article><span>Unassigned</span><strong>{summary.unassigned}</strong><small>Needs owner</small></article>
    </section>

    <section className="actionv8-controls">
      <input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search driver, TRID, site, title…"/>
      <select value={type} onChange={(e)=>setType(e.target.value)}><option value="all">All work types</option>{["manager_task","coaching","incident","workflow","approval"].map((x)=><option key={x} value={x}>{human(x)}</option>)}</select>
      <select value={sla} onChange={(e)=>setSla(e.target.value)}><option value="all">All SLA states</option><option value="breached">Breached</option><option value="at_risk">At risk</option><option value="within_sla">Within SLA</option></select>
      <select value={priority} onChange={(e)=>setPriority(e.target.value)}><option value="all">All priorities</option>{["critical","high","medium","low"].map((x)=><option key={x}>{x}</option>)}</select>
      <span>{visible.length} visible</span>
    </section>

    <div className="actionv8-layout">
      <section className="panel actionv8-list">
        <div className="panel-head"><div><h2>Operational queue</h2><p>Sorted by SLA state, priority and deadline.</p></div><span className="panel-badge">{visible.length}</span></div>
        <div>{visible.map((item)=><button key={item.entity_type+"-"+item.entity_id} className={selected?.entity_id===item.entity_id&&selected?.entity_type===item.entity_type?"active":""} onClick={()=>setSelected(item)}>
          <span className={"actionv8-sla "+item.sla_status}>{item.sla_status==="within_sla"?"SLA":item.sla_status==="at_risk"?"RISK":"LATE"}</span>
          <div><b>{item.title}</b><p>{item.detail||human(item.entity_type)}</p><small>{item.driver_name||"Workspace"}{item.trid?" · "+item.trid:""} · {item.site||"All sites"} · {human(item.entity_type)}</small></div>
          <div><span className={"mgrv2-severity "+item.priority}>{item.priority}</span><small>{item.sla_status==="breached"?item.overdue_hours+"h overdue":dateTime(item.sla_deadline)}</small></div>
        </button>)}{!visible.length&&<div className="actionv8-empty"><b>Queue clear</b><span>No item matches the current filters.</span></div>}</div>
      </section>

      <aside className="panel actionv8-detail">
        {!selected?<div className="actionv8-empty"><b>Select an action</b><span>Ownership, SLA, workflow and approval controls appear here.</span></div>:<>
          <div className="panel-head"><div><span className="page-kicker">{human(selected.entity_type)}</span><h2>{selected.title}</h2><p>{selected.detail||"No additional detail."}</p></div><span className={"actionv8-sla "+selected.sla_status}>{human(selected.sla_status)}</span></div>

          <div className="actionv8-detail-grid">
            <div><span>Driver</span><b>{selected.driver_name||"Workspace"}</b></div>
            <div><span>Site</span><b>{selected.site||"All sites"}</b></div>
            <div><span>Status</span><b>{human(selected.status)}</b></div>
            <div><span>Priority</span><b>{human(selected.priority)}</b></div>
            <div><span>SLA deadline</span><b>{dateTime(selected.sla_deadline)}</b></div>
            <div><span>Owner</span><b>{selected.assigned_name||"Unassigned"}</b></div>
          </div>

          <button className="actionv8-open" onClick={()=>openRelated(selected)}>{selected.driver_id?"Open Driver 360 →":"Open related module →"}</button>

          <div className="actionv8-actions">
            {!["approval"].includes(selected.entity_type)&&<button disabled={!canManage||!!busy} onClick={()=>run("claim",()=>claimActionCenterItem(getSupabaseBrowserClient(),selected.entity_type,selected.entity_id),"Action claimed.")}>Claim</button>}

            {selected.entity_type==="workflow"&&selected.metadata?.current_step_id&&selected.metadata?.current_step_type!=="approval"&&<button disabled={!canManage||!!busy} onClick={()=>run("workflow-step",()=>completeWorkflowStep(getSupabaseBrowserClient(),selected.metadata.current_step_id,"Completed from Action Center V2"),"Workflow advanced.")}>Complete current step</button>}

            {["manager_task","coaching","incident"].includes(selected.entity_type)&&<button className="primary" disabled={!canManage||!!busy} onClick={()=>run("approval",()=>requestActionCloseApproval(getSupabaseBrowserClient(),selected.entity_type,selected.entity_id,"Closure requested from Action Center V2"),"Closure approval requested.")}>Request closure approval</button>}

            {selected.entity_type==="approval"&&<><button disabled={!canApprove||!!busy} onClick={()=>run("reject",()=>decideApprovalRequest(getSupabaseBrowserClient(),selected.entity_id,"rejected","Rejected from Action Center V2"),"Approval rejected.")}>Reject</button><button className="primary" disabled={!canApprove||!!busy} onClick={()=>run("approve",()=>decideApprovalRequest(getSupabaseBrowserClient(),selected.entity_id,"approved","Approved from Action Center V2"),"Approval approved.")}>Approve</button></>}
          </div>

          {selected.entity_type==="workflow"&&<div className="actionv8-workflow">
            <span>CURRENT PLAYBOOK STEP</span>
            <b>{selected.metadata?.current_step_title||"Workflow step"}</b>
            <small>{human(selected.metadata?.current_step_type)} · {human(selected.metadata?.current_step_status)}</small>
          </div>}
        </>}
      </aside>
    </div>
  </div>;
}
