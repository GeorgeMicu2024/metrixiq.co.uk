"use client";
import {useState,useRef,useEffect} from "react";
import {getSupabaseBrowserClient} from "../../lib/supabase/client";

const navy="#07365e";const red="#c81020";
const today=()=>new Date().toLocaleDateString("en-CA",{timeZone:"Europe/London"});
const norm=s=>String(s||"").trim().toUpperCase();
export default function DailyConcessionsView({organizationId,site}){
 const [date,setDate]=useState(today),[rows,setRows]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState(""),[review,setReview]=useState(false);
 const upload=useRef(null),report=useRef(null),generation=useRef(0);
 useEffect(()=>{generation.current++;setRows([]);setError("");setNotice("");setReview(false);setBusy(false)},[organizationId,site]);
 const day=date&&Number.isFinite(new Date(date+"T12:00:00").getTime())?new Date(date+"T12:00:00").toLocaleDateString("en-GB",{weekday:"long"}):"Daily";
 const positive=rows.filter(r=>Number(r.dnr)>0).sort((a,b)=>Number(b.dnr)-Number(a.dnr)||a.name.localeCompare(b.name));
 const total=positive.reduce((n,r)=>n+Number(r.dnr),0);
 const [tab,setTab]=useState("report"),[draft,setDraft]=useState(""),[copied,setCopied]=useState("");
 const message=notice&&date&&!review?("🚨 *"+day+" Concessions – "+site+"*\n\n"+(total===0?"No DNR concessions recorded in the uploaded report. Well done, team! Please maintain this standard.":"*"+total+" DNR "+(total===1?"concession":"concessions")+" across "+positive.length+" "+(positive.length===1?"driver":"drivers")+".*\n\nPlease pay more attention to where you leave parcels. Follow customer instructions, use Notify of Arrival, leave a clear note in the app explaining where the parcel was left and take a clear POD photo.\n\nQuality over speed. Every delivery matters.")):"";
 useEffect(()=>{setDraft(message);setCopied("");},[message]);
 async function copyMessage(){try{await navigator.clipboard.writeText(draft);setCopied("Message copied");}catch{setCopied("Copy unavailable — select and copy the text manually.");}}

 async function ingest(file){
  if(!file||!organizationId)return;
  const token=++generation.current;setBusy(true);setError("");setNotice("");setRows([]);setReview(false);
  try{
   let next=[],nextDate=date,missing=0;
   if(/\.csv$/i.test(file.name)){
    const XLSX=await import("xlsx");const book=XLSX.read(await file.text(),{type:"string",raw:true});const data=XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{header:1,defval:"",raw:true});
    const h=(data.shift()||[]).map(x=>String(x).replace(/^\uFEFF/,"").trim().toLowerCase());const di=h.indexOf("date"),ti=h.indexOf("transporter id"),ni=h.indexOf("dnr");
    if(di<0||ti<0||ni<0)throw Error("CSV must contain Date, Transporter ID and DNR.");
    const detected=file.name.match(/Quality_DNR_[A-Z0-9]+_([A-Z]{2,5}\d{1,3})_/i)?.[1];
    if(detected&&norm(detected)!==norm(site))throw Error("CSV belongs to "+detected+", not "+site+".");
    const dates=new Set(),seen=new Set();for(const line of data){if(!line.some(x=>String(x).trim()))continue;const d=String(line[di]||"").trim(),id=norm(line[ti]),v=String(line[ni]??"").trim(),n=Number(v);if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||!id||(v!==""&&(!Number.isInteger(n)||n<0)))throw Error("Invalid CSV row.");if(seen.has(id))throw Error("Duplicate Transporter ID: "+id);seen.add(id);dates.add(d);if(!v){missing++;continue;}if(n>0)next.push({id,name:id,dnr:n});}
    if(dates.size!==1)throw Error("Import exactly one report date.");nextDate=[...dates][0];
    const client=getSupabaseBrowserClient();const names=new Map();for(let i=0;i<next.length;i+=100){const {data:drivers,error}=await client.from("drivers").select("trid,full_name").eq("organization_id",organizationId).in("trid",next.slice(i,i+100).map(r=>r.id));if(error)throw error;for(const d of drivers||[])names.set(norm(d.trid),d.full_name);}
    next=next.map(r=>({...r,name:names.get(r.id)||r.id})).sort((a,b)=>a.name.localeCompare(b.name));setReview(next.some(r=>r.name===r.id));
   }else if(file.type.startsWith("image/")||/\.(png|jpe?g|webp)$/i.test(file.name)){
    const {createWorker}=await import("tesseract.js");const worker=await createWorker("eng",1);let result;try{await worker.setParameters({tessedit_pageseg_mode:"6",preserve_interword_spaces:"1"});result=await worker.recognize(file);}finally{await worker.terminate();}
    for(const line of result.data.text.split(/\r?\n/)){const clean=line.trim().replace(/^\d+\s+/,"");if(/delivery associate|total concessions|^dnr|^#|concessions$/i.test(clean))continue;const m=clean.match(/^(.+?)\s+(\d+)(?:\s*[↑↓↕|]\s*\d+)?$/);if(m&&/[a-z]{2}/i.test(m[1])&&Number(m[2])>0)next.push({id:"ocr-"+next.length,name:m[1].trim(),dnr:Number(m[2])});}
    if(!next.length)throw Error("No DNR rows recognized. Crop to the table or use CSV.");setReview(true);
   }else throw Error("Choose a CSV or screenshot (PNG/JPG/WebP).");
   if(token!==generation.current)return;setDate(nextDate);setRows(next);setNotice(next.length+" affected drivers detected. "+(file.type.startsWith("image/")?"Review OCR names, counts and report date before export.":"CSV report loaded."+(missing?" "+missing+" blank DNR value(s) excluded.":"")));
  }catch(e){if(token===generation.current)setError(e.message||"Import failed.");}finally{if(token===generation.current)setBusy(false);}
 }
 function drawReport(){
  const canvas=document.createElement("canvas");canvas.width=1536;const rh=92;canvas.height=400+rh*positive.length;const ctx=canvas.getContext("2d");
  ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
  function round(x,y,w,h,r,c){ctx.fillStyle=c;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
  function rect(x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(x,y,w,h);}
  function label(t,x,y,size,color,align="left",max){ctx.font="800 "+size+"px Arial, sans-serif";ctx.fillStyle=color;ctx.textAlign=align;ctx.textBaseline="middle";if(max)ctx.fillText(t,x,y,max);else ctx.fillText(t,x,y);}
  const grad=ctx.createLinearGradient(0,0,1536,145);grad.addColorStop(0,"#063961");grad.addColorStop(1,"#032749");
  round(1,0,1534,146,[20,20,0,0],grad);
  const title=day+" Concessions";ctx.font="800 86px Arial, sans-serif";const tw=ctx.measureText(title).width;const x=Math.max(35,(1536-tw-140)/2);
  ctx.strokeStyle="#fff";ctx.lineWidth=9;ctx.beginPath();ctx.roundRect(x,33,83,79,9);ctx.stroke();ctx.beginPath();ctx.moveTo(x,53);ctx.lineTo(x+83,53);ctx.stroke();for(const dx of [20,63]){ctx.beginPath();ctx.moveTo(x+dx,18);ctx.lineTo(x+dx,38);ctx.stroke();}for(let i=0;i<3;i++)for(let j=0;j<2;j++)round(x+13+i*23,65+j*22,14,13,2,"#fff");
  label(title,x+125,73,86,"#fff","left",1536-x-145);
  round(7,156,1522,98,[20,20,0,0],grad);label("#",83,205,56,"#fff","center");label("Delivery Associate",195,205,56,"#fff");label("DNR",1380,205,56,"#fff","center");
  positive.forEach((r,i)=>{const y=254+i*rh;rect(7,y,155,rh,"#edefef");rect(162,y,1068,rh,"#fff");const pink=ctx.createLinearGradient(1230,y,1529,y+rh);pink.addColorStop(0,"#ffd9d7");pink.addColorStop(1,"#fff0ef");rect(1230,y,299,rh,pink);label(String(i+1),83,y+rh/2,60,"#101820","center");label(r.name,195,y+rh/2,56,"#061c35","left",1010);label(String(r.dnr),1380,y+rh/2,64,"#d20a0a","center");ctx.strokeStyle="#a5adb5";ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(7,y+rh);ctx.lineTo(1529,y+rh);ctx.stroke();});
  ctx.strokeStyle="#a5adb5";ctx.lineWidth=2.5;for(const xx of [7,162,1230,1529]){ctx.beginPath();ctx.moveTo(xx,254);ctx.lineTo(xx,254+positive.length*rh);ctx.stroke();}ctx.strokeStyle="#fff";for(const xx of [162,1230]){ctx.beginPath();ctx.moveTo(xx,156);ctx.lineTo(xx,254);ctx.stroke();}
  const y=286+positive.length*rh;round(7,y,1220,104,[15,0,0,15],grad);round(1230,y,299,104,[0,15,15,0],"#cf080e");label("Total Concessions ("+day+")",615,y+52,58,"#fff","center",1170);label(String(total),1380,y+52,86,"#fff","center");
  ctx.strokeStyle="#b7bdc2";ctx.lineWidth=5;ctx.beginPath();ctx.roundRect(3,3,1530,canvas.height-6,23);ctx.stroke();return canvas;
 }
 function save(){const canvas=drawReport();const a=document.createElement("a");a.download=site+"-Daily-Concessions-"+date+".png";a.href=canvas.toDataURL("image/png");a.click();}
 const [previewImage,setPreviewImage]=useState("");
 useEffect(()=>{if(notice&&date)setPreviewImage(drawReport().toDataURL("image/png"));else setPreviewImage("");},[rows,date,notice]);
 const update=(i,key,value)=>{setRows(old=>old.map((r,j)=>j===i?{...r,[key]:value}:r));setReview(true)};
 return <div style={{padding:24,maxWidth:1500,margin:"0 auto"}} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(!busy)ingest(e.dataTransfer.files[0]);}}>
 <div className="page-heading"><div><span className="page-kicker">{site} · DAILY QUALITY</span><h1>Daily Concessions</h1><p>Upload an Amazon DNR CSV or screenshot to generate a WhatsApp-ready report.</p></div></div>
 <section className="panel" style={{padding:18,display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}><input type="date" value={date} onChange={e=>{setDate(e.target.value);setReview(true)}}/><input ref={upload} type="file" accept=".csv,image/*" hidden onChange={e=>{ingest(e.target.files[0]);e.target.value=""}}/><button className="btn primary" disabled={busy} onClick={()=>upload.current.click()}>{busy?"Reading report…":"Import CSV / Screenshot"}</button><button className="btn" disabled={busy||review||!notice||!date} onClick={save}>Save Image</button><span>Drag & drop supported</span></section>
 {error&&<p role="alert" style={{color:red}}>{error}</p>}{notice&&<p>{notice}</p>}
 {review&&<section className="panel" style={{padding:16,marginTop:12}}><b>Review imported rows</b><p>Confirm names, DNR counts and date. Unresolved IDs must be corrected before export.</p>{rows.map((r,i)=><div key={r.id} style={{display:"flex",gap:8,margin:"6px 0"}}><input aria-label="Driver name" value={r.name} onChange={e=>update(i,"name",e.target.value)}/><input aria-label="DNR" type="number" min="0" step="1" value={r.dnr} onChange={e=>update(i,"dnr",e.target.value)}/></div>)}<button className="btn primary" disabled={!date||rows.some(r=>!r.name.trim()||r.name===r.id||!Number.isInteger(Number(r.dnr))||Number(r.dnr)<0||String(r.dnr).trim()==="")} onClick={()=>setReview(false)}>Confirm report</button></section>}
 {notice&&<div style={{display:"flex",gap:8,marginTop:20}}><button className={"btn "+(tab==="report"?"primary":"")} onClick={()=>setTab("report")}>Report Image</button><button className={"btn "+(tab==="message"?"primary":"")} onClick={()=>setTab("message")}>Daily Message</button></div>}
 {notice&&tab==="message"&&<section className="panel" style={{padding:20,margin:"16px auto",maxWidth:1000}}><h2>Daily WhatsApp Message</h2><p>Automatically generated for {day} · {date} · {site}</p>{review?<p>Confirm imported rows before generating the message.</p>:<><textarea aria-label="Daily WhatsApp message" value={draft} onChange={e=>{setDraft(e.target.value);setCopied("")}} rows={10} style={{width:"100%",padding:14,resize:"vertical",fontSize:15,lineHeight:1.6}}/><div style={{display:"flex",gap:10,alignItems:"center",marginTop:12}}><button className="btn primary" disabled={!draft.trim()} onClick={copyMessage}>Copy Message</button><button className="btn" onClick={()=>{setDraft(message);setCopied("")}}>Regenerate</button><span role="status">{copied}</span></div></>}</section>}
 {tab==="report"&&previewImage&&<section style={{maxWidth:1000,margin:"24px auto"}}><img src={previewImage} alt={day+" Concessions report"} style={{display:"block",width:"100%",height:"auto",borderRadius:14}}/></section>}
 <p style={{color:"#64748b"}}>Report generator only · does not change weekly concessions or scorecards.</p></div>
}
