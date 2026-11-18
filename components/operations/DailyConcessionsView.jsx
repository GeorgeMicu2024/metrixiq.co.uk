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
 const positive=rows.filter(r=>Number(r.dnr)>0);
 const total=positive.reduce((n,r)=>n+Number(r.dnr),0);
 async function ingest(file){
  if(!file||!organizationId)return;
  const token=++generation.current;setBusy(true);setError("");setNotice("");setRows([]);setReview(false);
  try{
   let next=[],nextDate=date;
   if(/\.csv$/i.test(file.name)){
    const XLSX=await import("xlsx");const book=XLSX.read(await file.text(),{type:"string"});const data=XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{header:1,defval:"",raw:false});
    const h=(data.shift()||[]).map(x=>String(x).replace(/^\uFEFF/,"").trim().toLowerCase());const di=h.indexOf("date"),ti=h.indexOf("transporter id"),ni=h.indexOf("dnr");
    if(di<0||ti<0||ni<0)throw Error("CSV must contain Date, Transporter ID and DNR.");
    const detected=file.name.match(/Quality_DNR_[A-Z0-9]+_([A-Z]{2,5}\d{1,3})_/i)?.[1];
    if(detected&&norm(detected)!==norm(site))throw Error("CSV belongs to "+detected+", not "+site+".");
    const dates=new Set(),seen=new Set();for(const line of data){if(!line.some(x=>String(x).trim()))continue;const d=String(line[di]||"").trim(),id=norm(line[ti]),v=String(line[ni]??"").trim(),n=Number(v);if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||!id||!v||!Number.isInteger(n)||n<0)throw Error("Invalid CSV row.");if(seen.has(id))throw Error("Duplicate Transporter ID: "+id);seen.add(id);dates.add(d);if(n>0)next.push({id,name:id,dnr:n});}
    if(dates.size!==1)throw Error("Import exactly one report date.");nextDate=[...dates][0];
    const client=getSupabaseBrowserClient();const names=new Map();for(let i=0;i<next.length;i+=100){const {data:drivers,error}=await client.from("drivers").select("trid,full_name").eq("organization_id",organizationId).in("trid",next.slice(i,i+100).map(r=>r.id));if(error)throw error;for(const d of drivers||[])names.set(norm(d.trid),d.full_name);}
    next=next.map(r=>({...r,name:names.get(r.id)||r.id}));setReview(next.some(r=>r.name===r.id));
   }else if(file.type.startsWith("image/")||/\.(png|jpe?g|webp)$/i.test(file.name)){
    const {createWorker}=await import("tesseract.js");const worker=await createWorker("eng",1);let result;try{await worker.setParameters({tessedit_pageseg_mode:"6",preserve_interword_spaces:"1"});result=await worker.recognize(file);}finally{await worker.terminate();}
    for(const line of result.data.text.split(/\r?\n/)){const clean=line.trim().replace(/^\d+\s+/,"");if(/delivery associate|total concessions|^dnr|^#|concessions$/i.test(clean))continue;const m=clean.match(/^(.+?)\s+(\d+)(?:\s*[↑↓↕|]\s*\d+)?$/);if(m&&/[a-z]{2}/i.test(m[1])&&Number(m[2])>0)next.push({id:"ocr-"+next.length,name:m[1].trim(),dnr:Number(m[2])});}
    if(!next.length)throw Error("No DNR rows recognized. Crop to the table or use CSV.");setReview(true);
   }else throw Error("Choose a CSV or screenshot (PNG/JPG/WebP).");
   if(token!==generation.current)return;setDate(nextDate);setRows(next);setNotice(next.length+" affected drivers detected. "+(file.type.startsWith("image/")?"Review OCR names, counts and report date before export.":"CSV report loaded."));
  }catch(e){if(token===generation.current)setError(e.message||"Import failed.");}finally{if(token===generation.current)setBusy(false);}
 }
 function save(){
  const canvas=document.createElement("canvas");canvas.width=1536;const rh=92;canvas.height=280+rh*positive.length+130;const ctx=canvas.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
  function rect(x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(x,y,w,h);}
  function label(t,x,y,size,color,align="left",max){ctx.font="bold "+size+"px Arial";ctx.fillStyle=color;ctx.textAlign=align;ctx.textBaseline="middle";if(max)ctx.fillText(t,x,y,max);else ctx.fillText(t,x,y);}
  rect(0,0,1536,145,navy);label(day+" Concessions",768,73,82,"#fff","center",1450);
  rect(7,156,1522,96,navy);label("#",83,204,54,"#fff","center");label("Delivery Associate",195,204,56,"#fff");label("DNR",1380,204,56,"#fff","center");
  positive.forEach((r,i)=>{const y=252+i*rh;rect(7,y,1522,rh,i%2?"#f8fafc":"#fff");rect(1230,y,299,rh,"#ffe0df");ctx.strokeStyle="#a6adb5";ctx.lineWidth=2;ctx.strokeRect(7,y,1522,rh);ctx.beginPath();ctx.moveTo(162,y);ctx.lineTo(162,y+rh);ctx.moveTo(1230,y);ctx.lineTo(1230,y+rh);ctx.stroke();label(String(i+1),83,y+rh/2,56,"#071b30","center");label(r.name,195,y+rh/2,54,"#071b30","left",1010);label(String(r.dnr),1380,y+rh/2,60,red,"center");});
  const y=287+positive.length*rh;rect(7,y,1220,104,navy);rect(1230,y,299,104,red);label("Total Concessions ("+day+")",615,y+52,56,"#fff","center",1170);label(String(total),1380,y+52,76,"#fff","center");
  const a=document.createElement("a");a.download=site+"-Daily-Concessions-"+date+".png";a.href=canvas.toDataURL("image/png");a.click();
 }
 const update=(i,key,value)=>{setRows(old=>old.map((r,j)=>j===i?{...r,[key]:value}:r));setReview(true)};
 return <div style={{padding:24,maxWidth:1500,margin:"0 auto"}} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(!busy)ingest(e.dataTransfer.files[0]);}}>
 <div className="page-heading"><div><span className="page-kicker">{site} · DAILY QUALITY</span><h1>Daily Concessions</h1><p>Upload an Amazon DNR CSV or screenshot to generate a WhatsApp-ready report.</p></div></div>
 <section className="panel" style={{padding:18,display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}><input type="date" value={date} onChange={e=>{setDate(e.target.value);setReview(true)}}/><input ref={upload} type="file" accept=".csv,image/*" hidden onChange={e=>{ingest(e.target.files[0]);e.target.value=""}}/><button className="btn primary" disabled={busy} onClick={()=>upload.current.click()}>{busy?"Reading report…":"Import CSV / Screenshot"}</button><button className="btn" disabled={busy||review||!notice||!date} onClick={save}>Save Image</button><span>Drag & drop supported</span></section>
 {error&&<p role="alert" style={{color:red}}>{error}</p>}{notice&&<p>{notice}</p>}
 {review&&<section className="panel" style={{padding:16,marginTop:12}}><b>Review imported rows</b><p>Confirm names, DNR counts and date. Unresolved IDs must be corrected before export.</p>{rows.map((r,i)=><div key={r.id} style={{display:"flex",gap:8,margin:"6px 0"}}><input aria-label="Driver name" value={r.name} onChange={e=>update(i,"name",e.target.value)}/><input aria-label="DNR" type="number" min="0" step="1" value={r.dnr} onChange={e=>update(i,"dnr",e.target.value)}/></div>)}<button className="btn primary" disabled={!date||rows.some(r=>!r.name.trim()||r.name===r.id||!Number.isInteger(Number(r.dnr))||Number(r.dnr)<0||String(r.dnr).trim()==="")} onClick={()=>setReview(false)}>Confirm report</button></section>}
 {notice&&<section ref={report} style={{maxWidth:1000,margin:"24px auto",background:"#fff",color:"#071b30",border:"2px solid #a6adb5",borderRadius:14,overflow:"hidden"}}><h2 style={{margin:0,padding:22,textAlign:"center",background:navy,color:"#fff",fontSize:"clamp(24px,4vw,48px)"}}>▦ {day} Concessions</h2><table style={{width:"100%",borderCollapse:"collapse",fontSize:"clamp(15px,2.4vw,30px)",fontWeight:800}}><thead><tr style={{background:navy,color:"#fff"}}><th style={{padding:14,width:"10%"}}>#</th><th style={{textAlign:"left",padding:14}}>Delivery Associate</th><th style={{padding:14,width:"20%"}}>DNR</th></tr></thead><tbody>{positive.map((r,i)=><tr key={r.id} style={{background:i%2?"#f8fafc":"#fff"}}><td style={{padding:14,textAlign:"center",border:"1px solid #a6adb5"}}>{i+1}</td><td style={{padding:14,border:"1px solid #a6adb5"}}>{r.name}</td><td style={{padding:14,textAlign:"center",background:"#ffe0df",color:red,border:"1px solid #a6adb5"}}>{r.dnr}</td></tr>)}</tbody><tfoot><tr style={{background:navy,color:"#fff"}}><td colSpan={2} style={{padding:20,textAlign:"center"}}>Total Concessions ({day})</td><td style={{background:red,textAlign:"center",fontSize:"1.4em"}}>{total}</td></tr></tfoot></table></section>}
 <p style={{color:"#64748b"}}>Report generator only · does not change weekly concessions or scorecards.</p></div>
}
