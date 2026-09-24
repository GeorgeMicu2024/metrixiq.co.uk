"use client";
import {useEffect,useState} from "react";
import {getSupabaseBrowserClient} from "../../lib/supabase/client";
import {fetchDirectUnreadCounts} from "../../lib/data/managerChat";
export default function ChatHeaderButton({organizationId,userId,onOpen}){
 const [count,setCount]=useState(0);
 async function refresh(){if(!organizationId||!userId){setCount(0);return}try{const x=await fetchDirectUnreadCounts(getSupabaseBrowserClient(),organizationId,userId);setCount(Object.values(x).reduce((a,b)=>a+b,0))}catch{}}
 useEffect(()=>{refresh()},[organizationId,userId]);
 useEffect(()=>{if(!organizationId||!userId)return;const s=getSupabaseBrowserClient(),ch=s.channel(`chat-header-${organizationId}-${userId}`).on("postgres_changes",{event:"INSERT",schema:"public",table:"manager_direct_messages",filter:`organization_id=eq.${organizationId}`},refresh).on("postgres_changes",{event:"UPDATE",schema:"public",table:"manager_direct_messages",filter:`organization_id=eq.${organizationId}`},refresh).subscribe();return()=>s.removeChannel(ch)},[organizationId,userId]);
 return <button className="topbar-chat-button" onClick={onOpen} aria-label={count?`Chat, ${count} unread messages`:"Open chat"} title="Organization Chat"><span>✉</span>{count>0&&<b>{count>99?"99+":count}</b>}</button>
}