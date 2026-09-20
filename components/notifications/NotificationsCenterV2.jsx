"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import {
  fetchNotificationsV2,
  refreshNotificationsV2,
  setNotificationStatus,
  markAllNotificationsRead,
} from "../../lib/data/notificationsV2";

const severityRank = { critical:0, high:1, medium:2, low:3, info:4 };

function driverShape(item) {
  return {
    id: item.trid || "—",
    dbId: item.driver_id,
    name: item.driver_name || "Driver",
    site: item.site || "",
    risk: ["critical","high"].includes(item.severity) ? "High" : "Medium",
    issue: item.message || item.title || "Notification",
  };
}

function relativeTime(value) {
  if (!value) return "Recently";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Recently";
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return "Now";
  if (minutes < 60) return minutes + "m ago";
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours + "h ago";
  return Math.round(hours / 24) + "d ago";
}

export default function NotificationsCenterV2({
  organizationId,
  siteFilter = "all",
  refreshKey = "",
  canManage = false,
  onOpenDriver,
  onOpenNotifications,
  onOpenCoaching,
  onOpenImports,
  onOpenDataQuality,
  onNavigate,
}) {
  const [open,setOpen]=useState(false);
  const [rows,setRows]=useState([]);
  const [loaded,setLoaded]=useState(false);
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");
  const rootRef=useRef(null);

  async function load(refresh=false){
    if(!organizationId){setRows([]);setLoaded(true);return;}
    setError("");
    try{
      const supabase=getSupabaseBrowserClient();
      if(refresh) await refreshNotificationsV2(supabase,organizationId);
      setRows(await fetchNotificationsV2(supabase,organizationId,80,null));
    }catch(e){setError(e?.message||"Could not load notifications.");}
    finally{setLoaded(true);}
  }

  useEffect(()=>{setLoaded(false);load(true);},[organizationId,refreshKey]);

  useEffect(()=>{
    function outside(event){if(rootRef.current&&!rootRef.current.contains(event.target))setOpen(false);}
    function escape(event){if(String(event.key||"").toLowerCase()==="escape")setOpen(false);}
    document.addEventListener("mousedown",outside);
    window.addEventListener("keydown",escape);
    return()=>{document.removeEventListener("mousedown",outside);window.removeEventListener("keydown",escape);};
  },[]);

  const visible=useMemo(()=>{
    const scoped=siteFilter==="all"?rows:rows.filter((item)=>!item.site||String(item.site).toUpperCase()===siteFilter);
    return [...scoped].filter((item)=>item.status!=="dismissed").sort((a,b)=>
      (severityRank[a.severity]??9)-(severityRank[b.severity]??9)||
      new Date(b.created_at||0)-new Date(a.created_at||0)
    );
  },[rows,siteFilter]);

  const unread=visible.filter((item)=>item.status==="unread").length;

  async function mark(item,status){
    if(busy)return;
    setBusy(item.id);
    try{
      await setNotificationStatus(getSupabaseBrowserClient(),item.id,status);
      setRows((current)=>current.map((row)=>row.id===item.id?{...row,status}:row));
    }catch(e){setError(e?.message||"Could not update notification.");}
    finally{setBusy("");}
  }

  async function markAllRead(){
    if(!unread||busy)return;
    setBusy("all");setError("");
    try{await markAllNotificationsRead(getSupabaseBrowserClient(),organizationId);setRows(current=>current.map(row=>row.status==="unread"?{...row,status:"read"}:row));}
    catch(e){setError(e?.message||"Could not mark notifications as read.");}
    finally{setBusy("");}
  }

  function openItem(item){
    if(item.status==="unread")mark(item,"read");
    setOpen(false);
    if(item.driver_id&&onOpenDriver)return onOpenDriver(driverShape(item));
    if(item.action_target==="coaching")return onOpenCoaching?.();
    if(item.action_target==="imports")return onOpenImports?.();
    if(item.action_target==="data-quality")return onOpenDataQuality?.();
    if(item.action_target)return onNavigate?.(item.action_target);
    return onOpenNotifications?.();
  }

  return <div className="notifications-center notification-v2" ref={rootRef}>
    <button
      type="button"
      className={open?"notification-bell active":"notification-bell"}
      aria-label={"Notifications"+(unread?" ("+unread+")":"")}
      aria-expanded={open}
      onClick={()=>setOpen((value)=>!value)}
    >
      <span aria-hidden="true">🔔</span>
      {unread>0&&<b>{unread>99?"99+":unread}</b>}
    </button>

    {open&&<section className="notifications-popover notifv2-popover">
      <div className="notifications-head">
        <div><span>NOTIFICATIONS V2</span><h3>Action feed</h3></div>
        <button type="button" onClick={()=>{setOpen(false);onOpenNotifications?.();}}>View all →</button>
      </div>
      {error&&<div className="notifications-error">{error}</div>}
      <div className="notifv2-summary">
        <span><b>{unread}</b> unread</span>
        <span><b>{visible.filter((item)=>item.severity==="critical").length}</b> critical</span>
        <button disabled={!unread||busy==="all"} onClick={markAllRead}>Mark all as read</button><button onClick={()=>load(true)}>Refresh</button>
      </div>
      <div className="notifications-list">
        {!loaded&&<div className="notifications-empty"><div className="auth-spinner"/><span>Loading notifications…</span></div>}
        {loaded&&visible.slice(0,9).map((item)=><article key={item.id} className={"notification-item "+(item.severity||"medium")+" "+item.status}>
          <button className="notification-main" type="button" onClick={()=>openItem(item)}>
            <span className={"notification-severity "+(item.severity||"medium")}>{String(item.severity||"medium").slice(0,1).toUpperCase()}</span>
            <div><b>{item.title}</b><p>{item.driver_name?item.driver_name+" · ":""}{item.message||item.category}</p><small>{relativeTime(item.created_at)} · {item.category||"workspace"}</small></div>
          </button>
          <div className="notifv2-row-actions">
            {item.status==="unread"&&<button disabled={busy===item.id} onClick={()=>mark(item,"read")}>Read</button>}
            {canManage&&!["reviewed","dismissed"].includes(item.status)&&<button disabled={busy===item.id} onClick={()=>mark(item,"reviewed")}>Reviewed</button>}
          </div>
        </article>)}
        {loaded&&!visible.length&&<div className="notifications-empty"><b>All clear</b><span>No active notifications in this scope.</span></div>}
      </div>
    </section>}
  </div>;
}
