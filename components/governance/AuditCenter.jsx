"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { fetchAuditEvents, fetchMetricOverrides, resetMetricOverride } from "../../lib/data/governanceV2";

function csv(value) {
  const text = String(value ?? "");
  return /[,"\n]/.test(text) ? `"${text.replaceAll('"','""')}"` : text;
}

function downloadAudit(rows) {
  const headers = ["Timestamp","Actor","Event","Entity","Driver","Site","Week","Action"];
  const body = rows.map((row)=>[
    row.created_at,row.actor_name||row.actor_email,row.event_type,row.entity_type,row.driver_name||row.entity_id,row.site,row.week_label,row.action
  ]);
  const content=[headers,...body].map((r)=>r.map(csv).join(",")).join("\r\n");
  const blob=new Blob([content],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="metrixiq-audit-events.csv"; a.click(); setTimeout(()=>URL.revokeObjectURL(url),500);
}

export default function AuditCenter({ organizationId, canReset = false }) {
  const [events,setEvents]=useState([]);
  const [overrides,setOverrides]=useState([]);
  const [tab,setTab]=useState("events");
  const [query,setQuery]=useState("");
  const [type,setType]=useState("all");
  const [site,setSite]=useState("all");
  const [selected,setSelected]=useState(null);
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");

  async function load(){
    if(!organizationId)return;
    setError("");
    try{
      const [nextEvents,nextOverrides]=await Promise.all([
        fetchAuditEvents(getSupabaseBrowserClient(),organizationId,750),
        fetchMetricOverrides(getSupabaseBrowserClient(),organizationId,null),
      ]);
      setEvents(nextEvents); setOverrides(nextOverrides);
    }catch(e){setError(e?.message||"Could not load Audit Center.");}
  }
  useEffect(()=>{load();},[organizationId]);

  const sites=useMemo(()=>[...new Set(events.map((r)=>r.site).filter(Boolean))].sort(),[events]);
  const types=useMemo(()=>[...new Set(events.map((r)=>r.event_type).filter(Boolean))].sort(),[events]);
  const filtered=useMemo(()=>{
    const q=query.trim().toLowerCase();
    return events.filter((row)=>
      (type==="all"||row.event_type===type) &&
      (site==="all"||row.site===site) &&
      (!q||`${row.actor_name||""} ${row.actor_email||""} ${row.driver_name||""} ${row.entity_id||""} ${row.action||""} ${row.week_label||""}`.toLowerCase().includes(q))
    );
  },[events,type,site,query]);

  async function reset(item){
    if(!canReset)return;
    const reason=window.prompt(`Reset ${item.metric_key} override for ${item.driver_name}? Reason:`,"Restore trusted source value");
    if(reason===null)return;
    setBusy(item.id); setError(""); setNotice("");
    try{
      await resetMetricOverride(getSupabaseBrowserClient(),item.id,reason);
      setNotice("Override reset. Source value is active again.");
      await load();
    }catch(e){setError(e?.message||"Could not reset override.");}finally{setBusy("");}
  }

  return <div className="auditv2-root">
    <div className="gov-heading"><div><span className="page-kicker">AUDIT CENTER</span><h1>Change & Override History</h1><p>Traceable evidence for metric edits, resets, bulk actions, identity resolution and access changes.</p></div><button className="btn ghost" onClick={()=>downloadAudit(filtered)}>Export audit CSV</button></div>
    {error&&<div className="gov-notice error">{error}</div>}{notice&&<div className="gov-notice">{notice}</div>}
    <section className="auditv2-kpis"><article><span>Audit events</span><strong>{events.length}</strong><small>Loaded history</small></article><article><span>Active overrides</span><strong>{overrides.filter((x)=>x.status==="active").length}</strong><small>Manual metric values</small></article><article><span>Reset overrides</span><strong>{overrides.filter((x)=>x.status==="reset").length}</strong><small>Restored to source</small></article><article><span>Actors</span><strong>{new Set(events.map((x)=>x.actor_id).filter(Boolean)).size}</strong><small>Users in audit</small></article></section>
    <div className="gov-tabs"><button className={tab==="events"?"active":""} onClick={()=>setTab("events")}>Events</button><button className={tab==="overrides"?"active":""} onClick={()=>setTab("overrides")}>Metric Overrides</button></div>
    {tab==="events"&&<>
      <section className="gov-toolbar"><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search actor, driver, week, action…"/><select value={type} onChange={(e)=>setType(e.target.value)}><option value="all">All event types</option>{types.map((x)=><option key={x} value={x}>{x}</option>)}</select><select value={site} onChange={(e)=>setSite(e.target.value)}><option value="all">All sites</option>{sites.map((x)=><option key={x} value={x}>{x}</option>)}</select><span>{filtered.length} events</span></section>
      <section className="panel auditv2-table"><div className="table-wrap"><table className="data-table"><thead><tr><th>Time</th><th>Actor</th><th>Event</th><th>Driver / Entity</th><th>Site</th><th>Week</th><th>Action</th><th /></tr></thead><tbody>
        {filtered.map((row)=><tr key={row.id}><td>{new Date(row.created_at).toLocaleString("en-GB")}</td><td><b>{row.actor_name||"System"}</b><small>{row.actor_email||""}</small></td><td><span className="gov-status neutral">{row.event_type}</span></td><td>{row.driver_name||row.entity_id||"—"}</td><td>{row.site||"—"}</td><td>{row.week_label||"—"}</td><td>{row.action||"—"}</td><td><button className="profile-link" onClick={()=>setSelected(row)}>Inspect →</button></td></tr>)}
        {!filtered.length&&<tr><td colSpan="8"><div className="gov-empty compact">No audit events match the filters.</div></td></tr>}
      </tbody></table></div></section>
    </>}
    {tab==="overrides"&&<section className="panel"><div className="panel-head"><div><h2>Metric overrides</h2><p>Source value, manual value, reason and reset history.</p></div><span className="panel-badge">{overrides.length}</span></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Driver</th><th>Week</th><th>Metric</th><th>Source</th><th>Override</th><th>Reason</th><th>Status</th><th>Changed</th><th /></tr></thead><tbody>
      {overrides.map((item)=><tr key={item.id}><td><b>{item.driver_name}</b><small>{item.trid} · {item.site||"—"}</small></td><td>{item.week_label}</td><td>{item.metric_key}</td><td>{item.source_value??"—"}</td><td><b>{item.override_value}</b></td><td>{item.reason||"—"}</td><td><span className={`gov-status ${item.status==="active"?"warn":"neutral"}`}>{item.status}</span></td><td>{new Date(item.created_at).toLocaleString("en-GB")}</td><td>{item.status==="active"&&<button className="btn ghost compact" disabled={!canReset||busy===item.id} onClick={()=>reset(item)}>Reset to source</button>}</td></tr>)}
      {!overrides.length&&<tr><td colSpan="9"><div className="gov-empty compact">No metric overrides yet.</div></td></tr>}
    </tbody></table></div></section>}
    {selected&&<div className="gov-modal" role="dialog" aria-modal="true" onClick={()=>setSelected(null)}><div onClick={(e)=>e.stopPropagation()}><header><div><span>AUDIT EVENT</span><h2>{selected.action||selected.event_type}</h2></div><button onClick={()=>setSelected(null)}>×</button></header><section><div className="auditv2-detail-grid"><div><span>Actor</span><b>{selected.actor_name||"System"}</b></div><div><span>Created</span><b>{new Date(selected.created_at).toLocaleString("en-GB")}</b></div><div><span>Entity</span><b>{selected.entity_type||"—"}</b></div><div><span>Week</span><b>{selected.week_label||"—"}</b></div></div><h3>Before</h3><pre>{JSON.stringify(selected.before_data||{},null,2)}</pre><h3>After</h3><pre>{JSON.stringify(selected.after_data||{},null,2)}</pre><h3>Metadata</h3><pre>{JSON.stringify(selected.metadata||{},null,2)}</pre></section></div></div>}
  </div>;
}
