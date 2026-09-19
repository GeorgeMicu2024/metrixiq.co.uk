"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { fetchMobileManagerData } from "../../lib/data/platformV6";
import { addDriverNote } from "../../lib/data/operationsV4";
import DataFreshnessMonitor from "../platform/DataFreshnessMonitor";

function relative(value){
  if(!value)return"—";
  const d=new Date(value);
  if(!Number.isFinite(d.getTime()))return"—";
  const diff=Date.now()-d.getTime();
  const mins=Math.max(0,Math.round(diff/60000));
  if(mins<60)return mins+"m";
  const hours=Math.round(mins/60);
  if(hours<24)return hours+"h";
  return Math.round(hours/24)+"d";
}

function driverShape(item){
  return {
    id:item.id||item.trid||"—",
    dbId:item.dbId||item.driver_id,
    name:item.name||item.driver_name||"Driver",
    site:item.site||"",
    risk:item.risk||"Medium",
    issue:item.issue||"Mobile manager review",
  };
}

export default function MobileManagerMode({
  organizationId,
  siteFilter="all",
  drivers=[],
  canManage=false,
  onOpenDriver,
  onNavigate,
}){
  const [data,setData]=useState({tasks:[],notifications:[],integrations:[]});
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [query,setQuery]=useState("");
  const [selectedDriverId,setSelectedDriverId]=useState("");
  const [note,setNote]=useState("");
  const [busy,setBusy]=useState("");
  const [installAvailable,setInstallAvailable]=useState(false);
  const [standalone,setStandalone]=useState(false);

  async function load(){
    if(!organizationId)return;
    setLoading(true);setError("");
    try{setData(await fetchMobileManagerData(getSupabaseBrowserClient(),organizationId));}
    catch(e){setError(e?.message||"Could not load Mobile Manager Mode.");}
    finally{setLoading(false);}
  }

  useEffect(()=>{load();},[organizationId]);

  useEffect(()=>{
    function sync(){
      setInstallAvailable(Boolean(window.__metrixiqInstallPrompt));
      setStandalone(window.matchMedia?.("(display-mode: standalone)")?.matches||window.navigator.standalone===true);
    }
    sync();
    window.addEventListener("metrixiq:pwa-install-available",sync);
    window.addEventListener("metrixiq:pwa-installed",sync);
    return()=>{
      window.removeEventListener("metrixiq:pwa-install-available",sync);
      window.removeEventListener("metrixiq:pwa-installed",sync);
    };
  },[]);

  const scopedTasks=useMemo(()=>data.tasks.filter((item)=>
    !["done","dismissed"].includes(item.status)&&
    (siteFilter==="all"||!item.site||String(item.site).toUpperCase()===siteFilter)
  ),[data.tasks,siteFilter]);

  const scopedNotifications=useMemo(()=>data.notifications.filter((item)=>
    !["reviewed","dismissed"].includes(item.status)&&
    (siteFilter==="all"||!item.site||String(item.site).toUpperCase()===siteFilter)
  ),[data.notifications,siteFilter]);

  const scopedIntegrations=useMemo(()=>data.integrations.filter((item)=>item.enabled!==false),[data.integrations]);

  const driverMatches=useMemo(()=>{
    const q=query.trim().toLowerCase();
    if(!q)return[];
    return drivers.filter((driver)=>
      [driver.name,driver.id,driver.site].filter(Boolean).join(" ").toLowerCase().includes(q)
    ).slice(0,8);
  },[drivers,query]);

  const selectedDriver=drivers.find((driver)=>String(driver.dbId||driver.driver_id)===String(selectedDriverId))||null;
  const criticalTasks=scopedTasks.filter((item)=>item.priority==="critical").length;
  const highTasks=scopedTasks.filter((item)=>item.priority==="high").length;
  const criticalNotifications=scopedNotifications.filter((item)=>item.severity==="critical").length;
  const staleSources=scopedIntegrations.filter((item)=>["stale","missing"].includes(item.freshness_status)).length;

  async function installApp(){
    const prompt=window.__metrixiqInstallPrompt;
    if(!prompt){
      setNotice("Install option is not currently offered by this browser. On iPhone, use Share → Add to Home Screen.");
      return;
    }
    await prompt.prompt();
    await prompt.userChoice.catch(()=>null);
    window.__metrixiqInstallPrompt=null;
    setInstallAvailable(false);
  }

  async function saveQuickNote(){
    if(!canManage||!selectedDriver?.dbId||!note.trim())return;
    setBusy("note");setError("");setNotice("");
    try{
      await addDriverNote(getSupabaseBrowserClient(),{
        organizationId,
        driverId:selectedDriver.dbId,
        note:note.trim(),
        noteType:"mobile_manager",
      });
      setNote("");
      setNotice("Driver note saved to Driver 360 audit history.");
    }catch(e){setError(e?.message||"Could not save driver note.");}
    finally{setBusy("");}
  }

  if(loading)return <section className="panel mobilev6-empty"><div className="auth-spinner"/><b>Loading Manager Mode…</b></section>;

  return <div className="mobilev6-root">
    <section className="mobilev6-hero">
      <div><span className="page-kicker">MOBILE MANAGER MODE</span><h1>Today</h1><p>{siteFilter==="all"?"All sites":siteFilter} · operational actions designed for phone use.</p></div>
      {!standalone&&<button className="mobilev6-install" onClick={installApp}>{installAvailable?"Install app":"Add to Home Screen"}</button>}
      {standalone&&<span className="mobilev6-installed">Installed PWA</span>}
    </section>

    {error&&<div className="mgrv2-notice error">{error}</div>}
    {notice&&<div className="mgrv2-notice good">{notice}</div>}

    <section className="mobilev6-kpis">
      <button onClick={()=>onNavigate?.("manager-control")} className={criticalTasks?"bad":highTasks?"warn":""}><span>Action queue</span><strong>{scopedTasks.length}</strong><small>{criticalTasks} critical · {highTasks} high</small></button>
      <button onClick={()=>onNavigate?.("notifications")} className={criticalNotifications?"bad":""}><span>Notifications</span><strong>{scopedNotifications.length}</strong><small>{criticalNotifications} critical</small></button>
      <button onClick={()=>onNavigate?.("integrations")} className={staleSources?"warn":""}><span>Data freshness</span><strong>{staleSources}</strong><small>stale / missing sources</small></button>
      <button onClick={()=>onNavigate?.("coaching")}><span>Coaching</span><strong>→</strong><small>Open follow-up queue</small></button>
    </section>

    <section className="panel mobilev6-search">
      <div className="panel-head"><div><h2>Quick driver search</h2><p>Open Driver 360 without leaving Manager Mode.</p></div></div>
      <input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Name, TRID or site…"/>
      {driverMatches.length>0&&<div className="mobilev6-driver-results">{driverMatches.map((driver)=><button key={driver.dbId||driver.id} onClick={()=>onOpenDriver?.(driverShape(driver))}><span>{driver.name?.split(" ").map((x)=>x[0]).slice(0,2).join("")||"DA"}</span><p><b>{driver.name}</b><small>{driver.id||"—"} · {driver.site||"—"}</small></p><em>Open →</em></button>)}</div>}
    </section>

    <section className="mobilev6-two">
      <article className="panel mobilev6-priority">
        <div className="panel-head"><div><h2>Needs attention</h2><p>Highest-priority manager actions.</p></div><button className="profile-link" onClick={()=>onNavigate?.("manager-control")}>All →</button></div>
        <div>{scopedTasks.slice(0,8).map((item)=><button key={item.id} onClick={()=>item.driver_id?onOpenDriver?.(driverShape({driver_id:item.driver_id,trid:item.trid,name:item.driver_name,site:item.site,issue:item.detail||item.title})):onNavigate?.("manager-control")}><span className={"mgrv2-severity "+item.priority}>{item.priority}</span><p><b>{item.title}</b><small>{item.driver_name||item.site||"Workspace"} · {item.due_at?relative(item.due_at)+" due":"No due date"}</small></p></button>)}{!scopedTasks.length&&<div className="mobilev6-empty compact">No open manager tasks.</div>}</div>
      </article>

      <article className="panel mobilev6-priority">
        <div className="panel-head"><div><h2>Latest alerts</h2><p>Unread and active workspace notifications.</p></div><button className="profile-link" onClick={()=>onNavigate?.("notifications")}>All →</button></div>
        <div>{scopedNotifications.slice(0,8).map((item)=><button key={item.id} onClick={()=>item.driver_id?onOpenDriver?.(driverShape({driver_id:item.driver_id,trid:item.trid,name:item.driver_name,site:item.site,issue:item.message||item.title})):onNavigate?.(item.action_target||"notifications")}><span className={"mgrv2-severity "+item.severity}>{item.severity}</span><p><b>{item.title}</b><small>{item.driver_name||item.category||"Workspace"} · {relative(item.created_at)} ago</small></p></button>)}{!scopedNotifications.length&&<div className="mobilev6-empty compact">No active notifications.</div>}</div>
      </article>
    </section>

    {canManage&&<section className="panel mobilev6-note">
      <div className="panel-head"><div><h2>Quick manager note</h2><p>Save context directly into the driver’s audited Driver 360 history.</p></div></div>
      <select value={selectedDriverId} onChange={(e)=>setSelectedDriverId(e.target.value)}><option value="">Choose driver…</option>{drivers.filter((d)=>d.dbId).sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""))).map((driver)=><option key={driver.dbId} value={driver.dbId}>{driver.name} · {driver.id||"—"} · {driver.site||"—"}</option>)}</select>
      <textarea value={note} onChange={(e)=>setNote(e.target.value)} placeholder="Add evidence, compound conversation, follow-up or coaching context…"/>
      <button className="btn primary" disabled={!selectedDriverId||!note.trim()||busy==="note"} onClick={saveQuickNote}>{busy==="note"?"Saving…":"Save driver note"}</button>
    </section>}

    <DataFreshnessMonitor compact integrations={scopedIntegrations} onOpenSource={(item)=>onNavigate?.(item.metadata?.destination||"integrations")} title="Data freshness" subtitle="Latest operational source status."/>

    <section className="mobilev6-actions">
      <button onClick={()=>onNavigate?.("driver-scorecards")}><span>◫</span><b>Scorecards</b></button>
      <button onClick={()=>onNavigate?.("evidence")}><span>⌕</span><b>Incidents</b></button>
      <button onClick={()=>onNavigate?.("reports")}><span>▤</span><b>Reports</b></button>
      <button onClick={()=>onNavigate?.("reliability")}><span>◴</span><b>Health</b></button>
    </section>
  </div>;
}
