"use client";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";

function csvRows(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((x) => x.trim());
  const split = (line) => { const out = []; let v = "", q = false; for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(q&&line[i+1]==='"'){v+='"';i++;}else q=!q;}else if(c===','&&!q){out.push(v.trim());v="";}else v+=c;}out.push(v.trim());return out;};
  const headers = split(lines.shift() || "").map((x)=>x.toLowerCase());
  const required = ["tracking number","service area","dsp","concession date","da","delivery associate name"];
  for (const h of required) if(!headers.includes(h)) throw Error("Missing column: " + h);
  return lines.map((line)=>{const c=split(line);return Object.fromEntries(headers.map((h,i)=>[h,c[i]||""]));});
}
export default function Dzm1DeliveryConcessions({organizationId}) {
  const [rows,setRows]=useState([]),[error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
  async function refresh(){if(!organizationId)return;const {data,error}=await getSupabaseBrowserClient().from("dzm1_delivery_concessions_weekly").select("week_label,driver_trid,driver_name,concessions_count,source_file").eq("organization_id",organizationId).order("week_label",{ascending:false}).order("concessions_count",{ascending:false});if(error)throw error;setRows(data||[]);}
  useEffect(()=>{refresh().catch(e=>setError(e.message));},[organizationId]);
  async function upload(file){
    if(!file||!organizationId)return;setBusy(true);setError("");setNotice("");
    try{
      const match=/^DSP_Delivery_Concessions_DZM1_(\d{4})-W(\d{2})(?:\s*\(\d+\))?\.csv$/i.exec(file.name);
      if(!match)throw Error("Use a DSP_Delivery_Concessions_DZM1_YYYY-WNN.csv file.");
      const week="W"+match[2], year=Number(match[1]);
      const input=csvRows(await file.text());if(!input.length)throw Error("The file is empty.");
      const ids=new Set(),counts=new Map();
      for(const r of input){
        if(r["service area"].toUpperCase()!=="DZM1"||r.dsp.toUpperCase()!=="DCSL")throw Error("File contains records outside DZM1/DCSL.");
        const date=r["concession date"].slice(0,10);
        if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date)))throw Error("Invalid Concession Date.");
        const dt=new Date(date+"T00:00:00Z");const weekday=(dt.getUTCDay()+6)%7;dt.setUTCDate(dt.getUTCDate()-weekday+3);
        const isoYear=dt.getUTCFullYear();const jan4=new Date(Date.UTC(isoYear,0,4));jan4.setUTCDate(jan4.getUTCDate()-((jan4.getUTCDay()+6)%7)+3);const isoWeek=1+Math.round((dt-jan4)/604800000);
        if(isoYear!==year||isoWeek!==Number(match[2]))throw Error("Concession Date outside "+year+"-"+week+": "+date);
        const tracking=r["tracking number"],trid=r.da.toUpperCase();
        if(!tracking||!trid)throw Error("Missing tracking number or DA.");
        if(ids.has(tracking))throw Error("Duplicate tracking number in CSV.");ids.add(tracking);
        const item=counts.get(trid)||{driver_trid:trid,driver_name:r["delivery associate name"]||trid,concessions_count:0};
        item.concessions_count++;counts.set(trid,item);
      }
      const client=getSupabaseBrowserClient();
      const {data:existing,error:readError}=await client.from("dzm1_delivery_concessions_weekly").select("driver_trid").eq("organization_id",organizationId).eq("week_label",week);
      if(readError)throw readError;
      if((existing||[]).some(r=>!counts.has(r.driver_trid)))throw Error("This week already contains different drivers. Import cancelled to avoid mixing reports.");
      const payload=[...counts.values()].map(r=>({...r,organization_id:organizationId,week_label:week,source_file:file.name,updated_at:new Date().toISOString()}));
      const {error:writeError}=await client.from("dzm1_delivery_concessions_weekly").upsert(payload,{onConflict:"organization_id,week_label,driver_trid"});if(writeError)throw writeError;
      await refresh();setNotice(ids.size+" delivery concessions recognized for "+week+" across "+counts.size+" drivers.");
    }catch(e){setError(e.message||"Import failed");}finally{setBusy(false);}
  }
  const latest=rows[0]?.week_label||"";const weekly=rows.filter(r=>r.week_label===latest);const total=weekly.reduce((n,r)=>n+Number(r.concessions_count),0);
  return <section className="panel" style={{padding:20,marginBottom:20}}>
    <div style={{display:"flex",justifyContent:"space-between",gap:14,alignItems:"center",flexWrap:"wrap"}}>
      <div><h2 style={{margin:0}}>DZM1 · Delivery Concessions</h2><p style={{color:"#64748b",margin:"5px 0"}}>Separate per-parcel report, grouped by Concession Date and driver. Does not replace Associates Concessions.</p></div>
      <label className="btn primary" style={{cursor:busy?"wait":"pointer"}}>{busy?"Importing…":"Import Delivery Concessions CSV"}<input type="file" accept=".csv" disabled={busy} hidden onChange={e=>{upload(e.target.files?.[0]);e.target.value="";}}/></label>
    </div>
    {error&&<p role="alert" style={{color:"#b91c1c"}}>{error}</p>}{notice&&<p role="status" style={{color:"#047857"}}>{notice}</p>}
    {latest?<><p><b>{latest}:</b> {total} concessions · {weekly.length} affected drivers</p><div style={{maxHeight:350,overflowY:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr><th style={{textAlign:"left"}}>Driver</th><th style={{textAlign:"right"}}>Concessions</th></tr></thead><tbody>{weekly.map(r=><tr key={r.driver_trid} style={{borderBottom:"1px solid #e2e8f0"}}><td style={{padding:7}}>{r.driver_name}</td><td style={{padding:7,textAlign:"right",fontWeight:700}}>{r.concessions_count}</td></tr>)}</tbody></table></div></>:<p style={{color:"#64748b"}}>No Delivery Concessions report imported yet.</p>}
  </section>;
}
