"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { fetchManagerChatMessages, sendManagerChatMessage } from "../../lib/data/managerChat";

export default function ManagerChat({ organizationId, sites=[], siteFilter="all", session }) {
  const [channel,setChannel]=useState(siteFilter!=="all"?siteFilter:"all");
  const [messages,setMessages]=useState([]),[text,setText]=useState(""),[loading,setLoading]=useState(true),[error,setError]=useState("");
  const endRef=useRef(null);
  const site=channel==="all"?null:channel;
  async function load(){if(!organizationId)return;setLoading(true);setError("");try{setMessages(await fetchManagerChatMessages(getSupabaseBrowserClient(),organizationId,site));}catch(e){setError(e?.message||"Could not load chat.");}finally{setLoading(false)}}
  useEffect(()=>{load();},[organizationId,channel]);
  useEffect(()=>{if(!organizationId)return;const supabase=getSupabaseBrowserClient();const ch=supabase.channel(`manager-chat-${organizationId}-${channel}`).on("postgres_changes",{event:"INSERT",schema:"public",table:"manager_chat_messages",filter:`organization_id=eq.${organizationId}`},p=>{const row=p.new;if((site==null&&row.site==null)||(site&&row.site===site))load();}).subscribe();return()=>{supabase.removeChannel(ch)};},[organizationId,channel]);
  useEffect(()=>{endRef.current?.scrollIntoView({behavior:"smooth"});},[messages.length]);
  const channels=useMemo(()=>["all",...sites],[sites]);
  async function send(e){e.preventDefault();const body=text.trim();if(!body)return;setText("");try{await sendManagerChatMessage(getSupabaseBrowserClient(),{organizationId,site,body});await load();}catch(e){setText(body);setError(e?.message||"Message could not be sent.");}}
  return <section className="manager-chat-page"><header className="manager-chat-head"><div><span className="page-kicker">MANAGER CHAT · REALTIME</span><h1>Team communication</h1><p>Private to managers inside this MetrixIQ workspace.</p></div><span className="chat-live">● LIVE</span></header><div className="manager-chat-shell"><aside className="chat-channels"><b>CHANNELS</b>{channels.map(c=><button key={c} className={channel===c?"active":""} onClick={()=>setChannel(c)}><span>{c==="all"?"#":"⌂"}</span>{c==="all"?"All Sites":c}</button>)}</aside><main className="chat-room"><div className="chat-room-title"><div><b>{channel==="all"?"# All Sites":`# ${channel}`}</b><small>{channel==="all"?"Managers across all sites":"Site manager channel"}</small></div></div>{error&&<div className="mgrv2-notice error">{error}</div>}<div className="chat-messages">{loading?<div className="chat-empty">Loading conversation…</div>:messages.length===0?<div className="chat-empty"><b>No messages yet</b><span>Start the conversation with your management team.</span></div>:messages.map(m=><article key={m.id}><i>{String(m.sender_name||"M").split(/\s+/).map(x=>x[0]).join("").slice(0,2).toUpperCase()}</i><div><header><b>{m.sender_name}</b><time>{new Date(m.created_at).toLocaleString([], {day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}</time></header><p>{m.body}</p></div></article>)}<div ref={endRef}/></div><form className="chat-compose" onSubmit={send}><textarea value={text} maxLength={4000} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send(e)}}} placeholder={`Message ${channel==="all"?"All Sites":channel}…`}/><button disabled={!text.trim()} aria-label="Send message">➤</button></form></main></div></section>;
}
