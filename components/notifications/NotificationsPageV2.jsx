"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import {
  fetchNotificationsV2,
  markAllNotificationsRead,
  refreshNotificationsV2,
  setNotificationStatus,
} from "../../lib/data/notificationsV2";

const severityRank={critical:0,high:1,medium:2,low:3,info:4};

function driverShape(item){
  return {id:item.trid||"—",dbId:item.driver_id,name:item.driver_name||"Driver",site:item.site||"",risk:["critical","high"].includes(item.severity)?"High":"Medium",issue:item.message||item.title};
}

function dateLabel(value){
  if(!value)return"—";
  const d=new Date(value);
  return Number.isFinite(d.getTime())?d.toLocaleString("en-GB",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}):"—";
}

export default function NotificationsPageV2({
  organizationId,
  siteFilter="all",
  canManage=false,
  onOpenDriver,
  onOpenCoaching,
  onOpenImports,
  onOpenDataQuality,
}){
  const [rows,setRows]=useState([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState("");
  const [status,setStatus]=useState("active");
  const [severity,setSeverity]=useState("all");
  const [category,setCategory]=useState("all");
  const [query,setQuery]=useState("");

  async function load(refresh=false){
    if(!organizationId)return;
    setLoading(true);setError("");
    try{
      const supabase=getSupabaseBrowserClient();
      if(refresh)await refreshNotificationsV2(supabase,organizationId);
      setRows(await fetchNotificationsV2(supabase,organizationId,500,null));
    }catch(e){setError(e?.message||"Could not load notifications.");}
    finally{setLoading(false);}
  }
  useEffect(()=>{load(true);},[organizationId]);

  const categories=useMemo(()=>[...new Set(rows.map((item)=>item.category).filter(Boolean))].sort(),[rows]);
  const visible=useMemo(()=>{
    const q=query.trim().toLowerCase();
    return rows.filter((item)=>{
      if(siteFilter!=="all"&&item.site&&String(item.site).toUpperCase()!==siteFilter)return false;
      if(status==="active"&&["reviewed","dismissed"].includes(item.status))return false;
      if(status!=="all"&&status!=="active"&&item.status!==status)return false;
      if(severity!=="all"&&item.severity!==severity)return false;
      if(category!=="all"&&item.category!==category)return false;
      if(q&&![(item.title||""),(item.message||""),(item.driver_name||""),(item.trid||"")].join(" ").toLowerCase().includes(q))return false;
      return true;
    }).sort((a,b)=>(severityRank[a.severity]??9)-(severityRank[b.severity]??9)||new Date(b.created_at||0)-new Date(a.created_at||0));
  },[rows,siteFilter,status,severity,category,query]);

  async function change(item,next){
    setBusy(item.id);setError("");setNotice("");
    try{
      await setNotificationStatus(getSupabaseBrowserClient(),item.id,next);
      setRows((current)=>current.map((row)=>row.id===item.id?{...row,status:next}:row));
      setNotice("Notification updated.");
    }catch(e){setError(e?.message||"Could not update notification.");}
    finally{setBusy("");}
  }

  async function allRead(){
    setBusy("all");
    try{
      await markAllNotificationsRead(getSupabaseBrowserClient(),organizationId);
      setRows((current)=>current.map((row)=>row.status==="unread"?{...row,status:"read"}:row));
      setNotice("All notifications marked read.");
    }catch(e){setError(e?.message||"Could not mark all read.");}
    finally{setBusy("");}
  }

  function open(item){
    if(item.status==="unread")change(item,"read");
    if(item.driver_id)return onOpenDriver?.(driverShape(item));
    if(item.action_target==="coaching")return onOpenCoaching?.();
    if(item.action_target==="imports")return onOpenImports?.();
    if(item.action_target==="data-quality")return onOpenDataQuality?.();
  }

  const unread=rows.filter((x)=>x.status==="unread").length;
  const critical=rows.filter((x)=>x.status!=="dismissed"&&x.severity==="critical").length;

  return <div className="notifpagev2-root">
    <div className="notifpagev2-heading">
      <div><span className="page-kicker">NOTIFICATIONS V2</span><h1>Action Feed</h1><p>Performance, coaching, import and data-quality events in one auditable feed.</p></div>
      <div><button className="btn ghost" disabled={busy==="all"} onClick={allRead}>Mark all read</button><button className="btn primary" onClick={()=>load(true)}>Refresh feed</button></div>
    </div>
    {error&&<div className="mgrv2-notice error">{error}</div>}{notice&&<div className="mgrv2-notice good">{notice}</div>}
    <section className="notifpagev2-kpis"><article><span>Unread</span><strong>{unread}</strong><small>Needs attention</small></article><article className={critical?"bad":""}><span>Critical</span><strong>{critical}</strong><small>Highest severity</small></article><article><span>Active</span><strong>{rows.filter((x)=>!["reviewed","dismissed"].includes(x.status)).length}</strong><small>Open feed items</small></article><article><span>Reviewed</span><strong>{rows.filter((x)=>x.status==="reviewed").length}</strong><small>Management checked</small></article></section>
    <section className="notifpagev2-controls"><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search notifications…"/><select value={status} onChange={(e)=>setStatus(e.target.value)}><option value="active">Active</option><option value="all">All statuses</option><option value="unread">Unread</option><option value="read">Read</option><option value="reviewed">Reviewed</option><option value="dismissed">Dismissed</option></select><select value={severity} onChange={(e)=>setSeverity(e.target.value)}><option value="all">All severities</option><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select><select value={category} onChange={(e)=>setCategory(e.target.value)}><option value="all">All categories</option>{categories.map((x)=><option key={x} value={x}>{x}</option>)}</select></section>
    <section className="panel notifpagev2-list">
      {loading?<div className="mgrv2-empty"><div className="auth-spinner"/><span>Loading feed…</span></div>:visible.map((item)=><article key={item.id} className={"notifpagev2-item "+item.severity+" "+item.status}>
        <span className={"mgrv2-severity "+item.severity}>{item.severity}</span>
        <button className="notifpagev2-main" onClick={()=>open(item)}><div><b>{item.title}</b><em>{item.category}</em></div><p>{item.message||"No detail recorded."}</p><small>{item.driver_name?item.driver_name+" · "+(item.trid||"—")+" · ":""}{item.site||"Workspace"} · {dateLabel(item.created_at)}</small></button>
        <div className="notifpagev2-actions">
          {item.status==="unread"&&<button disabled={busy===item.id} onClick={()=>change(item,"read")}>Read</button>}
          {canManage&&!["reviewed","dismissed"].includes(item.status)&&<button disabled={busy===item.id} onClick={()=>change(item,"reviewed")}>Reviewed</button>}
          {canManage&&item.status!=="dismissed"&&<button disabled={busy===item.id} onClick={()=>change(item,"dismissed")}>Dismiss</button>}
        </div>
      </article>)}
      {!loading&&!visible.length&&<div className="mgrv2-empty"><b>No notifications</b><span>The current filters have no results.</span></div>}
    </section>
  </div>;
}
