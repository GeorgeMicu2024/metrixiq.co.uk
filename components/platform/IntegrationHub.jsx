"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { fetchIntegrationHealth, updateIntegrationConfig } from "../../lib/data/platformV6";
import DataFreshnessMonitor from "./DataFreshnessMonitor";

function dateTime(value){
  if(!value)return"—";
  const d=new Date(value);
  return Number.isFinite(d.getTime())?d.toLocaleString("en-GB",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}):String(value);
}

export default function IntegrationHub({
  organizationId,
  canManage=false,
  onNavigate,
}){
  const [rows,setRows]=useState([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [query,setQuery]=useState("");
  const [status,setStatus]=useState("all");
  const [selected,setSelected]=useState(null);
  const [busy,setBusy]=useState("");

  async function load(){
    if(!organizationId)return;
    setLoading(true);setError("");
    try{
      const next=await fetchIntegrationHealth(getSupabaseBrowserClient(),organizationId);
      setRows(next);
      if(selected){
        setSelected(next.find((item)=>item.source_key===selected.source_key)||null);
      }
    }catch(e){setError(e?.message||"Could not load Integration Hub.");}
    finally{setLoading(false);}
  }
  useEffect(()=>{load();},[organizationId]);

  const visible=useMemo(()=>{
    const q=query.trim().toLowerCase();
    return rows.filter((item)=>{
      if(status!=="all"&&item.freshness_status!==status)return false;
      if(q&&![
        item.label,item.source_key,item.category,item.metadata?.description
      ].filter(Boolean).join(" ").toLowerCase().includes(q))return false;
      return true;
    });
  },[rows,query,status]);

  const active=rows.filter((item)=>item.enabled!==false);
  const fresh=active.filter((item)=>item.freshness_status==="fresh").length;
  const needsAttention=active.filter((item)=>["warning","stale","missing"].includes(item.freshness_status)).length;
  const critical=active.filter((item)=>item.criticality==="critical"&&["stale","missing"].includes(item.freshness_status)).length;

  async function saveConfig(item,patch){
    if(!canManage)return;
    setBusy(item.source_key);setError("");setNotice("");
    try{
      await updateIntegrationConfig(getSupabaseBrowserClient(),organizationId,item.source_key,{
        enabled: patch.enabled ?? item.enabled,
        expectedFrequencyHours: patch.expectedFrequencyHours ?? item.expected_frequency_hours,
        criticality: patch.criticality ?? item.criticality,
      });
      setNotice(item.label+" configuration updated.");
      await load();
    }catch(e){setError(e?.message||"Could not update integration configuration.");}
    finally{setBusy("");}
  }

  function openSource(item){
    const destination=item?.metadata?.destination;
    if(destination)onNavigate?.(destination);
  }

  if(loading)return <section className="panel integrationv6-empty"><div className="auth-spinner"/><b>Loading Integration Hub…</b></section>;

  return <div className="integrationv6-root">
    <div className="integrationv6-heading">
      <div><span className="page-kicker">INTEGRATION HUB V1</span><h1>Operational Data Sources</h1><p>One control layer for every report family feeding MetrixIQ: freshness, cadence, criticality and destination.</p></div>
      <button className="btn ghost" onClick={load}>Refresh status</button>
    </div>

    {error&&<div className="mgrv2-notice error">{error}</div>}
    {notice&&<div className="mgrv2-notice good">{notice}</div>}

    <section className="integrationv6-kpis">
      <article><span>Configured sources</span><strong>{rows.length}</strong><small>{active.length} enabled</small></article>
      <article className="good"><span>Fresh</span><strong>{fresh}</strong><small>Within expected cadence</small></article>
      <article className={needsAttention?"warn":""}><span>Needs attention</span><strong>{needsAttention}</strong><small>Warning / stale / missing</small></article>
      <article className={critical?"bad":""}><span>Critical stale</span><strong>{critical}</strong><small>Critical source health</small></article>
    </section>

    <section className="integrationv6-controls">
      <input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search data source…"/>
      <select value={status} onChange={(e)=>setStatus(e.target.value)}>
        <option value="all">All freshness states</option>
        <option value="fresh">Fresh</option>
        <option value="warning">Warning</option>
        <option value="stale">Stale</option>
        <option value="missing">Missing</option>
        <option value="disabled">Disabled</option>
      </select>
      <span>{visible.length} sources</span>
    </section>

    <div className="integrationv6-layout">
      <section className="panel integrationv6-list">
        <div className="panel-head"><div><h2>Source registry</h2><p>Freshness is based on the latest stored report period, not merely the upload timestamp.</p></div></div>
        <div>
          {visible.map((item)=><button key={item.source_key} className={selected?.source_key===item.source_key?"active":""} onClick={()=>setSelected(item)}>
            <span className={"freshnessv6-dot "+item.freshness_status}/>
            <div><b>{item.label}</b><p>{item.metadata?.description||item.category}</p><small>{item.import_count} stored imports · last upload {dateTime(item.last_imported_at)}</small></div>
            <span className={"integrationv6-status "+item.freshness_status}>{item.freshness_status}</span>
          </button>)}
          {!visible.length&&<div className="integrationv6-empty">No sources match the current filters.</div>}
        </div>
      </section>

      <aside className="panel integrationv6-detail">
        {!selected?<div className="integrationv6-empty"><b>Select a source</b><span>Cadence, criticality and direct workflow links appear here.</span></div>:<>
          <div className="panel-head"><div><span className="page-kicker">{selected.category}</span><h2>{selected.label}</h2><p>{selected.metadata?.description||"Operational source"}</p></div><span className={"integrationv6-status "+selected.freshness_status}>{selected.freshness_status}</span></div>

          <div className="integrationv6-detail-grid">
            <div><span>Latest period</span><b>{selected.last_period_end||"—"}</b></div>
            <div><span>Last imported</span><b>{dateTime(selected.last_imported_at)}</b></div>
            <div><span>Imports stored</span><b>{selected.import_count}</b></div>
            <div><span>Latest pipeline status</span><b>{selected.last_status||"—"}</b></div>
          </div>

          <button className="integrationv6-open" onClick={()=>openSource(selected)}>Open {selected.metadata?.destination||"workflow"} →</button>

          <div className="integrationv6-config">
            <h3>Freshness policy</h3>
            <label><span>Enabled</span><select disabled={!canManage||busy===selected.source_key} value={selected.enabled?"yes":"no"} onChange={(e)=>saveConfig(selected,{enabled:e.target.value==="yes"})}><option value="yes">Enabled</option><option value="no">Disabled</option></select></label>
            <label><span>Expected every</span><select disabled={!canManage||busy===selected.source_key} value={selected.expected_frequency_hours} onChange={(e)=>saveConfig(selected,{expectedFrequencyHours:Number(e.target.value)})}><option value="24">24 hours</option><option value="48">48 hours</option><option value="72">3 days</option><option value="168">7 days</option><option value="240">10 days</option><option value="336">14 days</option><option value="720">30 days</option></select></label>
            <label><span>Criticality</span><select disabled={!canManage||busy===selected.source_key} value={selected.criticality} onChange={(e)=>saveConfig(selected,{criticality:e.target.value})}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label>
            {!canManage&&<p>Read-only access. Integration policy changes require manager/admin permission.</p>}
          </div>
        </>}
      </aside>
    </div>

    <DataFreshnessMonitor integrations={rows} onOpenSource={openSource}/>
  </div>;
}
