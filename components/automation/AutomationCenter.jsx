"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import {
  completeWorkflowStep,
  decideApprovalRequest,
  fetchAutomationWorkspaceData,
  runAutomationEngine,
  runAutomationRule,
  saveAutomationRule,
  saveNotificationRoute,
  saveSlaPolicy,
  setAutomationRuleEnabled,
  startPlaybookWorkflow,
} from "../../lib/data/automationV8";

const TRIGGERS=[
  ["fico_below","FICO below threshold"],
  ["total_score_below","Total Score below threshold"],
  ["concessions_above","Concessions above threshold"],
  ["dcr_wow_drop","DCR WoW drop"],
  ["stale_source","Data source stale"],
  ["overdue_coaching","Coaching overdue"],
  ["overdue_incident","Incident overdue"],
  ["scheduled_digest","Scheduled digest"],
];

const ACTIONS=[
  ["manager_task","Create manager task"],
  ["notification","Create notification"],
  ["coaching","Create coaching case"],
  ["incident","Open incident"],
  ["playbook","Start playbook"],
  ["approval","Request approval"],
];

function dateTime(value){
  if(!value)return"—";
  const d=new Date(value);
  return Number.isFinite(d.getTime())?d.toLocaleString("en-GB",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}):String(value);
}
function human(value){return String(value||"").replaceAll("_"," ").replace(/\b\w/g,(m)=>m.toUpperCase());}
function driverKey(d){return d.dbId||d.driver_id||"";}
function driverName(d){return d.name||d.driver_name||d.full_name||"Driver";}

function emptyRule(){
  return {
    id:null,name:"",description:"",enabled:false,site:"",
    triggerType:"fico_below",threshold:"815",consecutivePeriods:"1",sourceKey:"scorecard",
    actionType:"playbook",priority:"high",dueHours:"48",playbookKey:"fico_recovery",
    title:"",message:"",incidentType:"other",
    scheduleMode:"event",scheduleDay:"1",scheduleHour:"8",
  };
}

function ruleToDraft(rule){
  return {
    id:rule.id,name:rule.name||"",description:rule.description||"",enabled:rule.enabled===true,site:rule.site||"",
    triggerType:rule.trigger_type,
    threshold:String(rule.condition_config?.threshold??""),
    consecutivePeriods:String(rule.condition_config?.consecutive_periods??1),
    sourceKey:rule.condition_config?.source_key||"scorecard",
    actionType:rule.action_type,
    priority:rule.action_config?.priority||"medium",
    dueHours:String(rule.action_config?.due_hours??48),
    playbookKey:rule.action_config?.playbook_key||"fico_recovery",
    title:rule.action_config?.title||"",
    message:rule.action_config?.message||"",
    incidentType:rule.action_config?.incident_type||"other",
    scheduleMode:rule.schedule_mode||"event",
    scheduleDay:String(rule.schedule_day??1),
    scheduleHour:String(rule.schedule_hour??8),
  };
}

function conditionConfig(draft){
  if(draft.triggerType==="stale_source")return{source_key:draft.sourceKey};
  if(["overdue_coaching","overdue_incident","scheduled_digest"].includes(draft.triggerType)){
    return draft.triggerType==="scheduled_digest"?{digest:"custom"}:{};
  }
  const out={threshold:Number(draft.threshold||0)};
  if(draft.triggerType==="total_score_below")out.consecutive_periods=Math.max(1,Number(draft.consecutivePeriods||1));
  return out;
}

function actionConfig(draft){
  const out={priority:draft.priority,title:draft.title||undefined};
  if(draft.dueHours)out.due_hours=Math.max(1,Number(draft.dueHours));
  if(draft.message)out.message=draft.message;
  if(draft.actionType==="playbook")out.playbook_key=draft.playbookKey;
  if(draft.actionType==="incident")out.incident_type=draft.incidentType;
  return out;
}

export default function AutomationCenter({
  organizationId,
  sites=[],
  drivers=[],
  canManage=false,
  canApprove=false,
  onOpenDriver,
  onNavigate,
}){
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [tab,setTab]=useState("rules");
  const [busy,setBusy]=useState("");
  const [draft,setDraft]=useState(emptyRule());
  const [editorOpen,setEditorOpen]=useState(false);
  const [workflowDraft,setWorkflowDraft]=useState({playbookKey:"fico_recovery",driverId:"",site:"",weekLabel:"",title:""});
  const [slaDraft,setSlaDraft]=useState({site:"",entityType:"manager_task",priority:"any",ack:"24",resolution:"72",escalation:"24"});
  const [routeDraft,setRouteDraft]=useState({category:"automation",minimumSeverity:"medium",channel:"in_app",recipientRole:"manager"});

  async function load(){
    if(!organizationId)return;
    setLoading(true);setError("");
    try{setData(await fetchAutomationWorkspaceData(getSupabaseBrowserClient(),organizationId));}
    catch(e){setError(e?.message||"Could not load Automation & Workflow Engine.");}
    finally{setLoading(false);}
  }
  useEffect(()=>{load();},[organizationId]);

  const activeRules=(data?.rules||[]).filter((x)=>x.enabled).length;
  const pendingApprovals=(data?.approvals||[]).filter((x)=>x.status==="pending").length;
  const activeWorkflows=(data?.workflows||[]).filter((x)=>!["completed","cancelled"].includes(x.status)).length;
  const failedRuns=(data?.runs||[]).filter((x)=>x.status==="failed").length;
  const queuedDeliveries=(data?.deliveryQueue||[]).filter((x)=>x.status==="queued").length;

  async function run(key,fn,success){
    setBusy(key);setError("");setNotice("");
    try{await fn();if(success)setNotice(success);await load();}
    catch(e){setError(e?.message||"Action failed.");}
    finally{setBusy("");}
  }

  function openNewRule(){
    setDraft(emptyRule());setEditorOpen(true);
  }
  function editRule(rule){
    setDraft(ruleToDraft(rule));setEditorOpen(true);
  }

  async function saveRule(){
    if(!canManage||!draft.name.trim())return;
    await run("save-rule",async()=>{
      await saveAutomationRule(getSupabaseBrowserClient(),{
        organizationId,id:draft.id,name:draft.name.trim(),description:draft.description,
        enabled:draft.enabled,site:draft.site||null,triggerType:draft.triggerType,
        conditionConfig:conditionConfig(draft),actionType:draft.actionType,actionConfig:actionConfig(draft),
        scheduleMode:draft.scheduleMode,
        scheduleDay:draft.scheduleMode==="weekly"?Number(draft.scheduleDay):null,
        scheduleHour:["daily","weekly"].includes(draft.scheduleMode)?Number(draft.scheduleHour):null,
      });
      setEditorOpen(false);
    },"Automation rule saved.");
  }

  async function runEngine(force=false){
    setBusy("engine");setError("");setNotice("");
    try{
      const result=await runAutomationEngine(getSupabaseBrowserClient(),organizationId,force,force?"manual_force":"manual_due");
      setNotice("Engine complete: "+result.rules_run+" rules · "+result.matched_count+" matches · "+result.action_count+" new actions · "+result.failed_count+" failed.");
      await load();
    }catch(e){setError(e?.message||"Automation engine failed.");}
    finally{setBusy("");}
  }

  async function startWorkflow(){
    if(!canManage||!workflowDraft.playbookKey)return;
    await run("start-workflow",async()=>{
      const driver=drivers.find((d)=>String(driverKey(d))===String(workflowDraft.driverId));
      await startPlaybookWorkflow(getSupabaseBrowserClient(),{
        organizationId,playbookKey:workflowDraft.playbookKey,
        driverId:workflowDraft.driverId||null,
        site:driver?.site||workflowDraft.site||null,
        weekLabel:workflowDraft.weekLabel||null,
        title:workflowDraft.title||null,sourceType:"manual",
        metadata:{source:"automation_center_v8"},
      });
      setWorkflowDraft((x)=>({...x,driverId:"",title:""}));
    },"Playbook workflow started.");
  }

  if(loading)return <section className="panel autov8-empty"><div className="auth-spinner"/><b>Loading Automation & Workflow Engine…</b></section>;

  return <div className="autov8-root">
    <div className="autov8-heading">
      <div><span className="page-kicker">AUTOMATION & WORKFLOW ENGINE V8</span><h1>Rules, Playbooks & Approvals</h1><p>Detect operational conditions, create governed actions, enforce SLA and track the workflow through resolution.</p></div>
      <div><button className="btn ghost" onClick={load}>Refresh</button><button className="btn ghost" disabled={!canManage||busy==="engine"} onClick={()=>runEngine(false)}>Run due engine</button><button className="btn primary" disabled={!canManage||busy==="engine"} onClick={()=>runEngine(true)}>Run enabled rules now</button></div>
    </div>

    {error&&<div className="mgrv2-notice error">{error}</div>}
    {notice&&<div className="mgrv2-notice good">{notice}</div>}

    <section className="autov8-kpis">
      <article><span>Rules enabled</span><strong>{activeRules}</strong><small>{data?.rules?.length||0} templates / rules</small></article>
      <article className={activeWorkflows?"warn":""}><span>Active workflows</span><strong>{activeWorkflows}</strong><small>Playbooks in progress</small></article>
      <article className={pendingApprovals?"warn":""}><span>Approvals</span><strong>{pendingApprovals}</strong><small>Pending decision</small></article>
      <article className={failedRuns?"bad":""}><span>Failed runs</span><strong>{failedRuns}</strong><small>Recent engine history</small></article>
      <article><span>Delivery queue</span><strong>{queuedDeliveries}</strong><small>External-ready summaries</small></article>
    </section>

    <div className="autov8-tabs">
      {[
        ["rules","Rules Builder"],["playbooks","Playbooks"],["workflows","Active Workflows"],["approvals","Approvals"],
        ["sla","SLA Policies"],["routing","Notification Routing"],["runs","Run History"],["delivery","Delivery Queue"],
      ].map(([id,label])=><button key={id} className={tab===id?"active":""} onClick={()=>setTab(id)}>{label}</button>)}
    </div>

    {tab==="rules"&&<section className="panel autov8-rules">
      <div className="panel-head"><div><h2>Automation Rules</h2><p>Default templates are created disabled so no workflow starts until management explicitly enables it.</p></div><button className="btn primary" disabled={!canManage} onClick={openNewRule}>+ New rule</button></div>
      <div className="autov8-rule-grid">
        {(data?.rules||[]).map((rule)=><article key={rule.id} className={rule.enabled?"enabled":""}>
          <header><span className={"autov8-toggle "+(rule.enabled?"on":"off")}>{rule.enabled?"ENABLED":"DISABLED"}</span><em>{human(rule.schedule_mode)}</em></header>
          <h3>{rule.name}</h3><p>{rule.description||"No description."}</p>
          <div className="autov8-rule-flow"><span>{human(rule.trigger_type)}</span><b>→</b><span>{human(rule.action_type)}</span></div>
          <small>{rule.site||"All sites"} · next {dateTime(rule.next_run_at)} · last {dateTime(rule.last_run_at)}</small>
          <footer><button disabled={!canManage||!!busy} onClick={()=>editRule(rule)}>Edit</button><button disabled={!canManage||!!busy} onClick={()=>run("toggle-"+rule.id,()=>setAutomationRuleEnabled(getSupabaseBrowserClient(),rule.id,!rule.enabled),rule.enabled?"Rule disabled.":"Rule enabled.")}>{rule.enabled?"Disable":"Enable"}</button><button className="primary" disabled={!canManage||!!busy} onClick={()=>run("run-"+rule.id,()=>runAutomationRule(getSupabaseBrowserClient(),rule.id,true),"Rule executed.")}>Run now</button></footer>
        </article>)}
      </div>
    </section>}

    {tab==="playbooks"&&<section className="autov8-playbook-layout">
      <article className="panel">
        <div className="panel-head"><div><h2>Operational Playbooks</h2><p>Structured resolution workflows with automatic approval gates.</p></div></div>
        <div className="autov8-playbooks">{(data?.playbooks||[]).map((p)=><article key={p.id}>
          <div><span>{p.category}</span><h3>{p.name}</h3><p>{p.description}</p></div>
          <ol>{(p.steps||[]).map((step,index)=><li key={step.key}><b>{String(index+1).padStart(2,"0")}</b><p><strong>{step.title}</strong><small>{human(step.type)} · due +{step.due_hours||24}h</small></p></li>)}</ol>
        </article>)}</div>
      </article>
      <article className="panel autov8-start">
        <div className="panel-head"><div><h2>Start playbook</h2><p>Create a governed workflow manually.</p></div></div>
        <label><span>Playbook</span><select disabled={!canManage} value={workflowDraft.playbookKey} onChange={(e)=>setWorkflowDraft((x)=>({...x,playbookKey:e.target.value}))}>{(data?.playbooks||[]).filter((x)=>x.enabled).map((p)=><option key={p.playbook_key} value={p.playbook_key}>{p.name}</option>)}</select></label>
        <label><span>Driver</span><select disabled={!canManage} value={workflowDraft.driverId} onChange={(e)=>setWorkflowDraft((x)=>({...x,driverId:e.target.value}))}><option value="">Workspace / no driver</option>{drivers.filter((d)=>driverKey(d)).sort((a,b)=>driverName(a).localeCompare(driverName(b))).map((d)=><option key={driverKey(d)} value={driverKey(d)}>{driverName(d)} · {d.id||d.trid||"—"} · {d.site||"—"}</option>)}</select></label>
        <label><span>Week</span><input disabled={!canManage} value={workflowDraft.weekLabel} onChange={(e)=>setWorkflowDraft((x)=>({...x,weekLabel:e.target.value.toUpperCase()}))} placeholder="W37"/></label>
        <label><span>Title override</span><input disabled={!canManage} value={workflowDraft.title} onChange={(e)=>setWorkflowDraft((x)=>({...x,title:e.target.value}))} placeholder="Optional"/></label>
        <button className="btn primary" disabled={!canManage||busy==="start-workflow"} onClick={startWorkflow}>Start workflow</button>
      </article>
    </section>}

    {tab==="workflows"&&<section className="panel">
      <div className="panel-head"><div><h2>Workflow Register</h2><p>Current playbook step, owner, deadline and approval state.</p></div><span className="panel-badge">{data?.workflows?.length||0}</span></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Playbook</th><th>Driver</th><th>Current Step</th><th>Status</th><th>Due</th><th>Owner</th><th>Action</th></tr></thead><tbody>
        {(data?.workflows||[]).map((w)=><tr key={w.id}><td><b>{w.playbook_name}</b><small className="history-date">{w.week_label||"Current"} · {w.site||"Workspace"}</small></td><td>{w.driver_name||"Workspace"}<small className="history-date">{w.trid||"—"}</small></td><td>{w.current_step_title||"Complete"}<small className="history-date">{human(w.current_step_type)}</small></td><td><span className={"autov8-status "+w.status}>{human(w.status)}</span></td><td>{dateTime(w.current_step_due_at||w.due_at)}</td><td>{w.assigned_name||"Unassigned"}</td><td>{w.current_step_id&&w.current_step_type!=="approval"&&w.status!=="completed"?<button className="btn ghost compact" disabled={!canManage||!!busy} onClick={()=>run("step-"+w.current_step_id,()=>completeWorkflowStep(getSupabaseBrowserClient(),w.current_step_id,"Completed from Automation Center"),"Workflow advanced.")}>Complete step</button>:w.current_step_type==="approval"?<button className="profile-link" onClick={()=>setTab("approvals")}>Approval required →</button>:"—"}</td></tr>)}
      </tbody></table></div>
    </section>}

    {tab==="approvals"&&<section className="panel">
      <div className="panel-head"><div><h2>Approval Center</h2><p>Governed decisions for workflow gates and operational closure.</p></div><span className="panel-badge">{pendingApprovals} pending</span></div>
      <div className="autov8-approval-list">{(data?.approvals||[]).map((a)=><article key={a.id} className={a.status}>
        <span className={"mgrv2-severity "+a.priority}>{a.priority}</span><div><b>{a.title}</b><p>{a.detail||"No additional detail."}</p><small>{a.driver_name||"Workspace"} · {a.site||"All sites"} · requested {dateTime(a.requested_at)} by {a.requested_by_name||"Team member"}</small>{a.decision_note&&<em>{a.decision_note}</em>}</div><strong>{human(a.status)}</strong>
        {a.status==="pending"&&<footer><button disabled={!canApprove||!!busy} onClick={()=>run("reject-"+a.id,()=>decideApprovalRequest(getSupabaseBrowserClient(),a.id,"rejected","Rejected from Approval Center"),"Approval rejected.")}>Reject</button><button className="primary" disabled={!canApprove||!!busy} onClick={()=>run("approve-"+a.id,()=>decideApprovalRequest(getSupabaseBrowserClient(),a.id,"approved","Approved from Approval Center"),"Approval approved.")}>Approve</button></footer>}
      </article>)}</div>
    </section>}

    {tab==="sla"&&<div className="autov8-sla-layout">
      <section className="panel">
        <div className="panel-head"><div><h2>SLA Policies</h2><p>Resolution deadlines and escalation windows used by Action Center V2.</p></div></div>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Scope</th><th>Entity</th><th>Priority</th><th>Acknowledge</th><th>Resolve</th><th>Escalate</th></tr></thead><tbody>{(data?.slaPolicies||[]).map((p)=><tr key={p.id}><td>{p.site||"All sites"}</td><td>{human(p.entity_type)}</td><td>{human(p.priority)}</td><td>{p.acknowledgement_hours}h</td><td>{p.resolution_hours}h</td><td>{p.escalation_hours}h before/after</td></tr>)}</tbody></table></div>
      </section>
      <section className="panel autov8-sla-editor">
        <div className="panel-head"><div><h2>Set SLA policy</h2><p>Site-specific policies override workspace defaults.</p></div></div>
        <label><span>Site</span><select disabled={!canManage} value={slaDraft.site} onChange={(e)=>setSlaDraft((x)=>({...x,site:e.target.value}))}><option value="">All sites</option>{sites.map((s)=><option key={s}>{s}</option>)}</select></label>
        <label><span>Entity</span><select disabled={!canManage} value={slaDraft.entityType} onChange={(e)=>setSlaDraft((x)=>({...x,entityType:e.target.value}))}>{["manager_task","coaching","incident","approval","workflow"].map((x)=><option key={x} value={x}>{human(x)}</option>)}</select></label>
        <label><span>Priority</span><select disabled={!canManage} value={slaDraft.priority} onChange={(e)=>setSlaDraft((x)=>({...x,priority:e.target.value}))}>{["any","low","medium","high","critical"].map((x)=><option key={x}>{x}</option>)}</select></label>
        <div><label><span>Ack h</span><input type="number" min="1" value={slaDraft.ack} onChange={(e)=>setSlaDraft((x)=>({...x,ack:e.target.value}))}/></label><label><span>Resolve h</span><input type="number" min="1" value={slaDraft.resolution} onChange={(e)=>setSlaDraft((x)=>({...x,resolution:e.target.value}))}/></label><label><span>Escalate h</span><input type="number" min="1" value={slaDraft.escalation} onChange={(e)=>setSlaDraft((x)=>({...x,escalation:e.target.value}))}/></label></div>
        <button className="btn primary" disabled={!canManage||!!busy} onClick={()=>run("sla-save",()=>saveSlaPolicy(getSupabaseBrowserClient(),{organizationId,site:slaDraft.site,entityType:slaDraft.entityType,priority:slaDraft.priority,acknowledgementHours:slaDraft.ack,resolutionHours:slaDraft.resolution,escalationHours:slaDraft.escalation,enabled:true}),"SLA policy saved.")}>Save SLA</button>
      </section>
    </div>}

    {tab==="routing"&&<div className="autov8-sla-layout">
      <section className="panel">
        <div className="panel-head"><div><h2>Notification Routing</h2><p>Route operational events to in-app, Email, WhatsApp Cloud, Slack, Teams or a generic webhook through V9.</p></div></div>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Category</th><th>Minimum Severity</th><th>Channel</th><th>Recipient Role</th><th>Enabled</th></tr></thead><tbody>{(data?.routes||[]).map((r)=><tr key={r.id}><td>{r.category}</td><td>{r.minimum_severity}</td><td>{human(r.channel)}</td><td>{r.recipient_role}</td><td>{r.enabled?"Yes":"No"}</td></tr>)}</tbody></table></div>
      </section>
      <section className="panel autov8-sla-editor">
        <div className="panel-head"><div><h2>Add / update route</h2><p>Routes are severity-aware and auditable.</p></div></div>
        <label><span>Category</span><input disabled={!canManage} value={routeDraft.category} onChange={(e)=>setRouteDraft((x)=>({...x,category:e.target.value.toLowerCase()}))}/></label>
        <label><span>Minimum severity</span><select disabled={!canManage} value={routeDraft.minimumSeverity} onChange={(e)=>setRouteDraft((x)=>({...x,minimumSeverity:e.target.value}))}>{["info","low","medium","high","critical"].map((x)=><option key={x}>{x}</option>)}</select></label>
        <label><span>Channel</span><select disabled={!canManage} value={routeDraft.channel} onChange={(e)=>setRouteDraft((x)=>({...x,channel:e.target.value}))}><option value="in_app">In-app</option><option value="email_digest">Email</option><option value="whatsapp_summary">WhatsApp Cloud</option><option value="slack">Slack</option><option value="teams">Microsoft Teams</option><option value="webhook">Generic webhook</option></select></label>
        <label><span>Recipient role</span><select disabled={!canManage} value={routeDraft.recipientRole} onChange={(e)=>setRouteDraft((x)=>({...x,recipientRole:e.target.value}))}>{["owner","admin","manager","dispatcher"].map((x)=><option key={x}>{x}</option>)}</select></label>
        <button className="btn primary" disabled={!canManage||!!busy||!routeDraft.category.trim()} onClick={()=>run("route-save",()=>saveNotificationRoute(getSupabaseBrowserClient(),{organizationId,...routeDraft,enabled:true}),"Notification route saved.")}>Save route</button>
      </section>
    </div>}

    {tab==="runs"&&<section className="panel">
      <div className="panel-head"><div><h2>Automation Run History</h2><p>Every engine execution records matches, actions, failures and operator context.</p></div><span className="panel-badge">{data?.runs?.length||0}</span></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Started</th><th>Rule</th><th>Status</th><th>Matches</th><th>Actions</th><th>Operator</th><th>Error</th></tr></thead><tbody>{(data?.runs||[]).map((r)=><tr key={r.id}><td>{dateTime(r.started_at)}</td><td><b>{r.rule_name||"Deleted rule"}</b></td><td><span className={"autov8-status "+r.status}>{human(r.status)}</span></td><td>{r.matched_count}</td><td>{r.action_count}</td><td>{r.triggered_by_name||"System"}</td><td>{r.error_message||"—"}</td></tr>)}</tbody></table></div>
    </section>}

    {tab==="delivery"&&<section className="panel">
      <div className="panel-head"><div><h2>External Delivery Queue</h2><p>Prepared Email, WhatsApp, Slack, Teams and webhook messages processed by the V9 delivery worker.</p></div><span className="panel-badge">{data?.deliveryQueue?.length||0}</span></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Created</th><th>Channel</th><th>Severity</th><th>Title</th><th>Site</th><th>Status</th></tr></thead><tbody>{(data?.deliveryQueue||[]).map((q)=><tr key={q.id}><td>{dateTime(q.created_at)}</td><td>{human(q.channel)}</td><td><span className={"mgrv2-severity "+q.severity}>{q.severity}</span></td><td><b>{q.title}</b><small className="history-date">{q.message||""}</small></td><td>{q.site||"Workspace"}</td><td>{human(q.status)}</td></tr>)}</tbody></table></div>
    </section>}

    {editorOpen&&<div className="gov-modal" onClick={()=>setEditorOpen(false)}><div className="autov8-modal" onClick={(e)=>e.stopPropagation()}>
      <header><div><span>{draft.id?"EDIT RULE":"NEW RULE"}</span><h2>Automation Rule Builder</h2></div><button onClick={()=>setEditorOpen(false)}>×</button></header>
      <section>
        <div className="autov8-form">
          <label className="wide"><span>Name</span><input value={draft.name} onChange={(e)=>setDraft((x)=>({...x,name:e.target.value}))} placeholder="Rule name"/></label>
          <label className="wide"><span>Description</span><textarea value={draft.description} onChange={(e)=>setDraft((x)=>({...x,description:e.target.value}))}/></label>
          <label><span>Site scope</span><select value={draft.site} onChange={(e)=>setDraft((x)=>({...x,site:e.target.value}))}><option value="">All sites</option>{sites.map((s)=><option key={s}>{s}</option>)}</select></label>
          <label><span>Enabled</span><select value={draft.enabled?"yes":"no"} onChange={(e)=>setDraft((x)=>({...x,enabled:e.target.value==="yes"}))}><option value="no">Disabled</option><option value="yes">Enabled</option></select></label>
          <label><span>Trigger</span><select value={draft.triggerType} onChange={(e)=>setDraft((x)=>({...x,triggerType:e.target.value}))}>{TRIGGERS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
          {["fico_below","total_score_below","concessions_above","dcr_wow_drop"].includes(draft.triggerType)&&<label><span>Threshold</span><input type="number" step="0.01" value={draft.threshold} onChange={(e)=>setDraft((x)=>({...x,threshold:e.target.value}))}/></label>}
          {draft.triggerType==="total_score_below"&&<label><span>Consecutive periods</span><input type="number" min="1" max="12" value={draft.consecutivePeriods} onChange={(e)=>setDraft((x)=>({...x,consecutivePeriods:e.target.value}))}/></label>}
          {draft.triggerType==="stale_source"&&<label><span>Source</span><select value={draft.sourceKey} onChange={(e)=>setDraft((x)=>({...x,sourceKey:e.target.value}))}>{["scorecard","mentor","iadc","cdf","concessions","driver_master","daily_report","pod","contact_compliance","customer_escalation"].map((s)=><option key={s}>{s}</option>)}</select></label>}
          <label><span>Action</span><select value={draft.actionType} onChange={(e)=>setDraft((x)=>({...x,actionType:e.target.value}))}>{ACTIONS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
          <label><span>Priority</span><select value={draft.priority} onChange={(e)=>setDraft((x)=>({...x,priority:e.target.value}))}>{["low","medium","high","critical"].map((x)=><option key={x}>{x}</option>)}</select></label>
          {draft.actionType==="playbook"&&<label><span>Playbook</span><select value={draft.playbookKey} onChange={(e)=>setDraft((x)=>({...x,playbookKey:e.target.value}))}>{(data?.playbooks||[]).map((p)=><option key={p.playbook_key} value={p.playbook_key}>{p.name}</option>)}</select></label>}
          {draft.actionType==="incident"&&<label><span>Incident type</span><select value={draft.incidentType} onChange={(e)=>setDraft((x)=>({...x,incidentType:e.target.value}))}>{["dnr","cdf","pod","failed_delivery","customer_escalation","contact_compliance","route_failure","safety","vehicle","other"].map((x)=><option key={x}>{human(x)}</option>)}</select></label>}
          {["manager_task","coaching","incident"].includes(draft.actionType)&&<label><span>Due in hours</span><input type="number" min="1" value={draft.dueHours} onChange={(e)=>setDraft((x)=>({...x,dueHours:e.target.value}))}/></label>}
          <label className="wide"><span>Action title</span><input value={draft.title} onChange={(e)=>setDraft((x)=>({...x,title:e.target.value}))} placeholder="Optional custom title"/></label>
          {draft.actionType==="notification"&&<label className="wide"><span>Message</span><textarea value={draft.message} onChange={(e)=>setDraft((x)=>({...x,message:e.target.value}))}/></label>}
          <label><span>Schedule mode</span><select value={draft.scheduleMode} onChange={(e)=>setDraft((x)=>({...x,scheduleMode:e.target.value}))}><option value="event">After data/event refresh</option><option value="manual">Manual only</option><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label>
          {draft.scheduleMode==="weekly"&&<label><span>Day</span><select value={draft.scheduleDay} onChange={(e)=>setDraft((x)=>({...x,scheduleDay:e.target.value}))}>{[["0","Sunday"],["1","Monday"],["2","Tuesday"],["3","Wednesday"],["4","Thursday"],["5","Friday"],["6","Saturday"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>}
          {["daily","weekly"].includes(draft.scheduleMode)&&<label><span>Hour</span><select value={draft.scheduleHour} onChange={(e)=>setDraft((x)=>({...x,scheduleHour:e.target.value}))}>{Array.from({length:24},(_,i)=><option key={i} value={i}>{String(i).padStart(2,"0")}:00</option>)}</select></label>}
        </div>
        <div className="autov8-modal-actions"><button className="btn ghost" onClick={()=>setEditorOpen(false)}>Cancel</button><button className="btn primary" disabled={!canManage||!draft.name.trim()||busy==="save-rule"} onClick={saveRule}>Save rule</button></div>
      </section>
    </div></div>}
  </div>;
}
