"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import {
  fetchApiHealth,
  fetchIntegrationHealth,
  fetchReliabilityChecks,
  fetchReliabilitySnapshot,
  saveReliabilityCheck,
} from "../../lib/data/platformV6";
import DataFreshnessMonitor from "./DataFreshnessMonitor";

function dateTime(value){
  if(!value)return"—";
  const d=new Date(value);
  return Number.isFinite(d.getTime())?d.toLocaleString("en-GB",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}):String(value);
}

function overallStatus(api,snapshot,integrations){
  if(!api||api.status!=="ok"||snapshot?.database_status!=="healthy")return"critical";
  const criticalStale=(integrations||[]).filter((x)=>x.enabled!==false&&x.criticality==="critical"&&["stale","missing"].includes(x.freshness_status)).length;
  if(criticalStale>0||Number(snapshot?.failed_imports_7d||0)>0||Number(snapshot?.critical_notifications||0)>0)return"critical";
  const warningSignals=[
    Number(snapshot?.stale_sources||0),
    Number(snapshot?.missing_sources||0),
    Number(snapshot?.unmatched_open||0)>0?1:0,
    Number(snapshot?.overdue_manager_tasks||0)>0?1:0,
  ].reduce((sum,x)=>sum+Number(x||0),0);
  return warningSignals>0?"warning":"healthy";
}

function checklist(api,snapshot,integrations){
  const criticalFresh=(integrations||[]).filter((x)=>x.enabled!==false&&x.criticality==="critical");
  return [
    {key:"api",label:"Application health endpoint",ok:api?.status==="ok",detail:api?.status==="ok"?"API responded normally":"API health check failed"},
    {key:"db",label:"Supabase database access",ok:snapshot?.database_status==="healthy",detail:snapshot?.database_status==="healthy"?"Database RPC responded normally":"Database health unavailable"},
    {key:"critical-data",label:"Critical data freshness",ok:criticalFresh.every((x)=>x.freshness_status==="fresh"||x.freshness_status==="warning"),detail:criticalFresh.filter((x)=>["stale","missing"].includes(x.freshness_status)).length+" stale/missing critical sources"},
    {key:"imports",label:"Import pipeline",ok:Number(snapshot?.failed_imports_7d||0)===0,detail:(snapshot?.failed_imports_7d||0)+" failed imports in 7 days"},
    {key:"identity",label:"Identity / data quality",ok:Number(snapshot?.unmatched_open||0)===0,detail:(snapshot?.unmatched_open||0)+" unmatched records open"},
    {key:"notifications",label:"Critical notification backlog",ok:Number(snapshot?.critical_notifications||0)===0,detail:(snapshot?.critical_notifications||0)+" critical notifications active"},
    {key:"tasks",label:"Manager task deadlines",ok:Number(snapshot?.overdue_manager_tasks||0)===0,detail:(snapshot?.overdue_manager_tasks||0)+" overdue manager tasks"},
  ];
}

export default function ReliabilityCenter({
  organizationId,
  canRun=false,
  onNavigate,
}){
  const [api,setApi]=useState(null);
  const [snapshot,setSnapshot]=useState(null);
  const [integrations,setIntegrations]=useState([]);
  const [checks,setChecks]=useState([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");

  async function load(){
    if(!organizationId)return;
    setLoading(true);setError("");
    try{
      const supabase=getSupabaseBrowserClient();
      const [apiResult,dbResult,integrationRows,history]=await Promise.all([
        fetchApiHealth().catch((e)=>({status:"error",message:e?.message||"Health endpoint failed"})),
        fetchReliabilitySnapshot(supabase,organizationId),
        fetchIntegrationHealth(supabase,organizationId),
        fetchReliabilityChecks(supabase,organizationId,30),
      ]);
      setApi(apiResult);setSnapshot(dbResult);setIntegrations(integrationRows);setChecks(history);
    }catch(e){setError(e?.message||"Could not load Reliability Center.");}
    finally{setLoading(false);}
  }
  useEffect(()=>{load();},[organizationId]);

  const status=useMemo(()=>overallStatus(api,snapshot,integrations),[api,snapshot,integrations]);
  const releaseChecklist=useMemo(()=>checklist(api,snapshot,integrations),[api,snapshot,integrations]);
  const passed=releaseChecklist.filter((item)=>item.ok).length;

  async function runFullCheck(){
    if(!organizationId||busy)return;
    setBusy(true);setError("");setNotice("");
    try{
      const supabase=getSupabaseBrowserClient();
      const [apiResult,dbResult,integrationRows]=await Promise.all([
        fetchApiHealth(),
        fetchReliabilitySnapshot(supabase,organizationId),
        fetchIntegrationHealth(supabase,organizationId),
      ]);
      const nextStatus=overallStatus(apiResult,dbResult,integrationRows);
      const nextChecklist=checklist(apiResult,dbResult,integrationRows);
      const recorded={
        api:apiResult,
        database:dbResult,
        integrations:integrationRows.map((item)=>({
          source_key:item.source_key,
          label:item.label,
          freshness_status:item.freshness_status,
          criticality:item.criticality,
          last_period_end:item.last_period_end,
          age_hours:item.age_hours,
        })),
        checklist:nextChecklist,
      };
      if(canRun){
        await saveReliabilityCheck(supabase,organizationId,nextStatus,recorded);
      }
      setApi(apiResult);setSnapshot(dbResult);setIntegrations(integrationRows);
      setChecks(await fetchReliabilityChecks(supabase,organizationId,30));
      setNotice(canRun?"Full platform check completed and audited.":"Health check completed in read-only mode.");
    }catch(e){setError(e?.message||"Reliability check failed.");}
    finally{setBusy(false);}
  }

  function openSource(item){
    if(item?.metadata?.destination)onNavigate?.(item.metadata.destination);
  }

  if(loading)return <section className="panel reliabilityv6-empty"><div className="auth-spinner"/><b>Loading reliability telemetry…</b></section>;

  return <div className="reliabilityv6-root">
    <div className="reliabilityv6-heading">
      <div><span className="page-kicker">RELIABILITY & RELEASE CENTER</span><h1>Platform Health</h1><p>Runtime health, data freshness, pipeline quality and release-readiness in one operational control surface.</p></div>
      <button className="btn primary" disabled={busy} onClick={runFullCheck}>{busy?"Running checks…":"Run full check"}</button>
    </div>

    {error&&<div className="mgrv2-notice error">{error}</div>}
    {notice&&<div className="mgrv2-notice good">{notice}</div>}

    <section className={"reliabilityv6-hero "+status}>
      <div><span>OVERALL STATUS</span><h2>{status==="healthy"?"Platform healthy":status==="warning"?"Platform operational with warnings":"Attention required"}</h2><p>{passed}/{releaseChecklist.length} release checks currently pass.</p></div>
      <div><span>Environment</span><strong>{api?.environment||"unknown"}</strong><small>{api?.version?String(api.version).slice(0,10):"No runtime commit exposed"}</small></div>
    </section>

    <section className="reliabilityv6-kpis">
      <article className={api?.status==="ok"?"good":"bad"}><span>Application API</span><strong>{api?.status==="ok"?"OK":"FAIL"}</strong><small>{dateTime(api?.timestamp)}</small></article>
      <article className={snapshot?.database_status==="healthy"?"good":"bad"}><span>Database</span><strong>{snapshot?.database_status==="healthy"?"OK":"FAIL"}</strong><small>{dateTime(snapshot?.database_time)}</small></article>
      <article className={Number(snapshot?.failed_imports_7d||0)?"bad":"good"}><span>Failed imports</span><strong>{snapshot?.failed_imports_7d||0}</strong><small>Last 7 days</small></article>
      <article className={Number(snapshot?.unmatched_open||0)?"warn":"good"}><span>Unmatched</span><strong>{snapshot?.unmatched_open||0}</strong><small>Open identity records</small></article>
      <article className={Number(snapshot?.overdue_manager_tasks||0)?"warn":"good"}><span>Overdue tasks</span><strong>{snapshot?.overdue_manager_tasks||0}</strong><small>Manager workflow</small></article>
      <article className={Number(snapshot?.critical_notifications||0)?"bad":"good"}><span>Critical alerts</span><strong>{snapshot?.critical_notifications||0}</strong><small>Notification backlog</small></article>
    </section>

    <section className="reliabilityv6-grid">
      <article className="panel reliabilityv6-checklist">
        <div className="panel-head"><div><h2>Release-readiness checklist</h2><p>Operational gates before a production release or management reporting cycle.</p></div><span className={"reliabilityv6-score "+(passed===releaseChecklist.length?"good":passed>=releaseChecklist.length-2?"warn":"bad")}>{passed}/{releaseChecklist.length}</span></div>
        <div>{releaseChecklist.map((item)=><div key={item.key} className={item.ok?"pass":"fail"}><span>{item.ok?"✓":"!"}</span><p><b>{item.label}</b><small>{item.detail}</small></p></div>)}</div>
      </article>

      <article className="panel reliabilityv6-runtime">
        <div className="panel-head"><div><h2>Runtime & workflow telemetry</h2><p>Current operational signals from the workspace.</p></div></div>
        <div>
          <div><span>Last import</span><b>{dateTime(snapshot?.last_import_at)}</b></div>
          <div><span>Last report snapshot</span><b>{dateTime(snapshot?.last_report_at)}</b></div>
          <div><span>Last audited reliability check</span><b>{dateTime(snapshot?.last_reliability_check_at)}</b></div>
          <div><span>Unread notifications</span><b>{snapshot?.unread_notifications||0}</b></div>
          <div><span>Open incidents</span><b>{snapshot?.open_incidents||0}</b></div>
          <div><span>Stale sources</span><b>{snapshot?.stale_sources||0}</b></div>
        </div>
        <div className="reliabilityv6-links">
          <button onClick={()=>onNavigate?.("imports")}>Import Center →</button>
          <button onClick={()=>onNavigate?.("data-quality")}>Data Quality →</button>
          <button onClick={()=>onNavigate?.("audit")}>Audit Center →</button>
        </div>
      </article>
    </section>

    <DataFreshnessMonitor integrations={integrations} onOpenSource={openSource}/>

    <section className="panel reliabilityv6-history">
      <div className="panel-head"><div><h2>Reliability check history</h2><p>Audited manual platform checks.</p></div><span className="panel-badge">{checks.length}</span></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Checked</th><th>Status</th><th>Operator</th><th>API</th><th>Failed imports</th><th>Unmatched</th><th>Stale sources</th></tr></thead><tbody>
        {checks.map((item)=><tr key={item.id}><td>{dateTime(item.created_at)}</td><td><span className={"reliabilityv6-status "+item.overall_status}>{item.overall_status}</span></td><td>{item.created_by_name||"Team member"}</td><td>{item.snapshot?.api?.status||"—"}</td><td>{item.snapshot?.database?.failed_imports_7d??"—"}</td><td>{item.snapshot?.database?.unmatched_open??"—"}</td><td>{item.snapshot?.database?.stale_sources??"—"}</td></tr>)}
        {!checks.length&&<tr><td colSpan="7"><div className="reliabilityv6-empty compact">No audited reliability checks yet.</div></td></tr>}
      </tbody></table></div>
    </section>
  </div>;
}
