"use client";

import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";

const COLORS={PURPLE:"#762db3",BLUE:"#087fcf",GREEN:"#05ad58",RED:"#d62828",YELLOW:"#d7ad00",ORANGE:"#e67e22"};
const clean=v=>String(v??"").trim();
const norm=v=>clean(v).toUpperCase().replace(/\s+/g," ");
const routeOf=c=>{const m=c.map(clean).join(" ").match(/\b(?:CA|SA)[_\s-]*A?[0-9O]{2,4}\b/i);return m?m[0].replace(/\s+/g,"_").replace(/O/g,"0").toUpperCase():""};
const timeOf=c=>c.map(clean).join(" ").match(/\b\d{1,2}[:.]\d{2}\s*(?:AM|PM)?\b/i)?.[0]?.replace(".",":")||"";
const stageOf=c=>{const t=c.map(clean).join(" ");return t.match(/\bSTG\s*[-.]?\s*[A-Z]\s*[. -]?\s*\d*\b/i)?.[0]?.replace(/\s+/g,"").replace(/^STG([A-Z])/i,"STG-$1").toUpperCase()||t.match(/\b(?:PURPLE|BLUE|GREEN|RED|YELLOW|ORANGE)\.\d+\b/i)?.[0]?.toUpperCase()||""};
const stageLoose=t=>{const s=clean(t).toUpperCase().replace(/\s+/g,"");const n=s.match(/(?:STG)?[-.]?[A-Z][.-]?(\d{1,2})\b/)?.[1];return n?`STG-A.${n}`:""};
const waveOf=(stage,c)=>Object.keys(COLORS).find(x=>norm(stage+" "+c.join(" ")).includes(x))||(()=>{
 const n=Number(clean(stage).match(/(?:\.|-|\s)(\d+)$/)?.[1]);
 if(!Number.isFinite(n))return "OTHER";
 if(n>=15&&n<=20)return "PURPLE";
 if(n>=1&&n<=14)return "BLUE";
 return "OTHER";
})();
const companyLike=s=>/\b(DANUBE|COURIER|SERVICES|LIMITED|LTD|DCSL|DSP)\b/i.test(s);
const candidate=(c,route,time,stage)=>c.map(clean).find(x=>x&&x!==route&&x!==time&&x!==stage&&/[A-Za-z]/.test(x)&&!companyLike(x)&&!/STG|WAVE|ROUTE|DRIVER|TIME|LOCATION|STATION/i.test(x)&&!/^(STANDARD|LARGE|SMALL)\b/i.test(x)&&!/^\d+$/.test(x))||"";
const toMinutes=v=>{const m=clean(v).match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);if(!m)return null;let h=+m[1],n=+m[2],a=(m[3]||"").toUpperCase();if(a==="PM"&&h<12)h+=12;if(a==="AM"&&h===12)h=0;return h*60+n};
const formatMinutes=n=>{n=(n+1440)%1440;let h=Math.floor(n/60),m=n%60,a=h>=12?"PM":"AM";return `${h%12||12}:${String(m).padStart(2,"0")} ${a}`};
const adjustTime=(v,delta)=>{const n=toMinutes(v);return n==null?clean(v):formatMinutes(n+delta)};
async function workbookRows(file){const b=await file.arrayBuffer(),wb=XLSX.read(b,{type:"array",cellStyles:true}),rows=[];for(const sheet of wb.SheetNames){XLSX.utils.sheet_to_json(wb.Sheets[sheet],{header:1,defval:"",raw:false}).forEach((cells,i)=>rows.push({sheet,row:i+1,cells}))}return rows}

async function imageRows(file,onProgress){
 const {createWorker}=await import("tesseract.js");
 const worker=await createWorker("eng",1,{logger:m=>m.status==="recognizing text"&&onProgress?.(Math.round((m.progress||0)*100))});
 const {data}=await worker.recognize(file); await worker.terminate();
 const rows=[];
 for(const [i,raw] of data.text.split(/\r?\n/).entries()){
   const line=raw.replace(/[|]/g," ").replace(/\s+/g," ").trim();
   if(!line)continue;
   const route=line.match(/\b(?:CA|SA)[_ -]?A?\d+\b/i)?.[0]?.replace(/[ -]/g,"_").toUpperCase();
   const time=line.match(/\b\d{1,2}:\d{2}\s*(?:AM|PM)?\b/i)?.[0];
   const stage=line.match(/\bSTG[- ]?[A-Z][. -]?\d*\b/i)?.[0]?.replace(/ /g,"-").toUpperCase();
   if(route||time||stage){rows.push({sheet:"Image",row:i+1,cells:[route||line,time,stage].filter(Boolean)});continue}
   rows.push({sheet:"Image",row:i+1,cells:[line]});
 }
 return rows;
}
export default function WavePlanView({site="DLS2",drivers=[]}){
 const [tab,setTab]=useState("wave"),[routeFile,setRouteFile]=useState(null),[waveFile,setWaveFile]=useState(null),[routeRows,setRouteRows]=useState([]),[waveRows,setWaveRows]=useState([]),[generated,setGenerated]=useState(false),[history,setHistory]=useState([]),[atlasText,setAtlasText]=useState(""),[adjust,setAdjust]=useState(-20),[overrides,setOverrides]=useState({}),[dismissedConflicts,setDismissedConflicts]=useState(new Set()),[ocrProgress,setOcrProgress]=useState(null);
 const routeInput=useRef(null),waveInput=useRef(null),sheetRef=useRef(null);
 const load=async(file,setFile,setRows)=>{if(!file)return;setFile(file);setGenerated(false);try{if(file.type?.startsWith("image/")){setOcrProgress(0);setRows(await imageRows(file,setOcrProgress));setOcrProgress(null)}else setRows(await workbookRows(file))}catch(e){setOcrProgress(null);console.error(e);alert("Could not read this file. Try a clearer image or Excel/CSV.")}};
 const driverByTrid=useMemo(()=>new Map(drivers.map(d=>{
   const trid=d?.trid||d?.id||d?.transporter_id||d?.rawData?.trid||d?.raw_data?.trid;
   const name=d?.full_name||d?.name||d?.driver_name;
   return [norm(trid),name];
 }).filter(([trid,name])=>trid&&name&&name!=="Unresolved identity")),[drivers]);
 const routeIdentity=useMemo(()=>{const m=new Map();for(const x of routeRows){const route=routeOf(x.cells);if(!route)continue;const trids=[...new Set(x.cells.flatMap(v=>clean(v).split(/[\/|,;\s]+/)).filter(v=>/^A[A-Z0-9]{8,}$/i.test(v)).map(norm))];const names=[...new Set(trids.map(t=>driverByTrid.get(t)).filter(Boolean))];const fallback=candidate(x.cells,route,timeOf(x.cells),stageOf(x.cells));m.set(norm(route),{trids,names,fallback:!companyLike(fallback)?fallback:""})}return m},[routeRows,driverByTrid]);
 const conflicts=useMemo(()=>[...routeIdentity.entries()].filter(([route,v])=>(v.trids.length>1||v.names.length>1)&&!dismissedConflicts.has(route)),[routeIdentity,dismissedConflicts]);
 const routeDrivers=useMemo(()=>{const m=new Map();for(const [route,v] of routeIdentity){const manual=overrides[route];const name=manual||((v.trids.length===1||v.names.length===1)?v.names[0]:"")||v.fallback;if(name)m.set(route,name)}return m},[routeIdentity,overrides]);
 const plan=useMemo(()=>waveRows.map(x=>{const route=routeOf(x.cells),amazon=timeOf(x.cells),staging=stageOf(x.cells)||stageLoose(x.cells.join(" "));if(!route||!amazon||!staging)return null;const trid=x.cells.map(clean).find(v=>/^A[A-Z0-9]{8,}$/i.test(v));const name=(trid&&driverByTrid.get(norm(trid)))||routeDrivers.get(norm(route))||candidate(x.cells,route,amazon,staging)||"UNASSIGNED";return{route,driver:name,amazonTime:amazon,time:adjustTime(amazon,adjust),staging,wave:waveOf(staging,x.cells)}}).filter(Boolean),[waveRows,routeDrivers,driverByTrid,adjust]);
 const groups=useMemo(()=>{const m=new Map();for(const r of plan){const stg=r.staging.match(/STG[- ]?[A-Z]/i)?.[0]?.replace(" ","-").toUpperCase()||"STG-A",key=[r.time,r.wave,stg].join("|");if(!m.has(key))m.set(key,[]);m.get(key).push(r)}return [...m.entries()].sort((a,b)=>(toMinutes(a[0].split("|")[0])??9999)-(toMinutes(b[0].split("|")[0])??9999)||a[0].localeCompare(b[0]))},[plan]);
 const atlasRows=useMemo(()=>atlasText.split(/\r?\n/).map(line=>{const m=line.match(/\b(UK\d+)\s*-\s*(CA[_ -]?A?\d+)\s*-\s*([A-Z0-9]{8,})\b/i);if(!m)return null;const trid=m[3].toUpperCase();return{tracking:m[1],route:m[2].replace(/ /g,"_").toUpperCase(),trid,name:driverByTrid.get(trid)||""}}).filter(Boolean),[atlasText,driverByTrid]);
 const atlasOutput=useMemo(()=>atlasRows.map(r=>`${r.tracking} - ${r.route} - ${r.name||"DRIVER NOT FOUND"}`).join("\n"),[atlasRows]);
 const clear=()=>{if(!confirm("Clear current Wave Plan?"))return;setRouteFile(null);setWaveFile(null);setRouteRows([]);setWaveRows([]);setOverrides({});setDismissedConflicts(new Set());setGenerated(false);if(routeInput.current)routeInput.current.value="";if(waveInput.current)waveInput.current.value=""};
 const generate=()=>{if(!plan.length){alert(`No Wave Plan rows were recognised from ${waveFile?.name||"the file"}. OCR read ${waveRows.length} text rows. Try a clearer/cropped image if needed.`);return}setGenerated(true);setHistory(h=>[{id:Date.now(),date:new Date().toLocaleDateString("en-GB"),route:routeFile?.name,wave:waveFile?.name},...h].slice(0,8))};
 const exportPng=async(share=false)=>{
   if(!sheetRef.current)return;
   try{
     const {toPng}=await import("html-to-image");
     const dataUrl=await toPng(sheetRef.current,{pixelRatio:2.5,cacheBust:true,backgroundColor:"#ffffff"});
     const blob=await (await fetch(dataUrl)).blob();
     const file=new File([blob],`DCSL-Wave-Plan-${new Date().toISOString().slice(0,10)}.png`,{type:"image/png"});
     if(share&&navigator.share&&navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:"DCSL Wave Plan",text:`${site} Wave Plan`});return}
     const a=document.createElement("a");a.href=dataUrl;a.download=file.name;document.body.appendChild(a);a.click();a.remove();
   }catch(e){console.error("Wave Plan image export failed",e);alert("Could not create the Wave Plan image. Please try again.")}
 };
 return <div className="waveplan-root daily-dispatch">
  <div className="waveplan-heading"><div><span className="page-kicker">SITE OPERATIONS › DAILY DISPATCH</span><h1>Daily Dispatch</h1><p>Generate the DCSL Wave Plan in the approved format.</p></div><span className={"waveplan-ready "+(generated?"ok":"")}>{generated?"✓ Ready":"Waiting for files"}</span></div>
  <div className="dispatch-tabs"><button className={tab==="wave"?"active":""} onClick={()=>setTab("wave")}>Wave Plan</button><button className={tab==="atlas"?"active":""} onClick={()=>setTab("atlas")}>Atlas</button></div>
  {tab==="atlas"?<section className="panel atlas-converter"><div className="panel-head"><div><h2>Atlas Driver Converter</h2><p>Paste the Amazon message. TRIDs are replaced only when an exact driver match exists.</p></div><span className="panel-badge">{atlasRows.filter(r=>r.name).length}/{atlasRows.length} matched</span></div><div className="atlas-grid"><label><span>Paste Atlas message</span><textarea value={atlasText} onChange={e=>setAtlasText(e.target.value)}/></label><label><span>Ready to copy</span><textarea readOnly value={atlasOutput}/></label></div><div className="atlas-actions"><button className="btn ghost" onClick={()=>setAtlasText("")}>Clear</button><button className="btn primary" disabled={!atlasOutput} onClick={()=>navigator.clipboard.writeText(atlasOutput)}>Copy with driver names</button></div>{atlasRows.some(r=>!r.name)&&<p className="atlas-warning">Unmatched TRIDs are flagged as DRIVER NOT FOUND — TRIDs are never shown as driver names.</p>}</section>:<>
   <section className="waveplan-files"><article><input ref={routeInput} hidden type="file" accept=".xlsx,.xls,.csv" onChange={e=>load(e.target.files?.[0],setRouteFile,setRouteRows)}/><div className="waveplan-file-icon">X</div><div><b>Route Plan</b><span>{routeFile?.name||"Upload Amazon Route Plan"}</span><small>{routeRows.length?routeRows.length+" rows detected":""}</small></div><button onClick={()=>routeInput.current?.click()}>{routeFile?"Replace file":"Choose file"}</button></article><article><input ref={waveInput} hidden type="file" accept=".xlsx,.xls,.csv,image/png,image/jpeg,image/webp" onChange={e=>load(e.target.files?.[0],setWaveFile,setWaveRows)}/><div className="waveplan-file-icon">X</div><div><b>Wave Plan</b><span>{waveFile?.name||"Upload Excel or Wave Plan image"}</span><small>{ocrProgress!=null?`Reading image… ${ocrProgress}%`:(waveRows.length?waveRows.length+" rows detected":"Excel / CSV / PNG / JPG")}</small></div><button onClick={()=>waveInput.current?.click()}>{waveFile?"Replace file":"Choose file"}</button></article></section>
   {conflicts.length>0&&<section className="panel dispatch-attention"><div className="panel-head"><div><h2>⚠ Driver identity needs attention</h2><p>More than one TRID was detected on these routes. Choose the correct driver or type the name manually.</p></div><button className="btn ghost" onClick={()=>setDismissedConflicts(new Set(conflicts.map(([r])=>r)))}>Done / Hide</button></div>{conflicts.map(([route,v])=><div className="identity-fix" key={route}><b>{route}</b><span>{v.trids.join(" / ")}</span><select value={overrides[route]||""} onChange={e=>setOverrides(o=>({...o,[route]:e.target.value}))}><option value="">Select driver…</option>{v.trids.map(t=>driverByTrid.get(t)&&<option key={t} value={driverByTrid.get(t)}>{driverByTrid.get(t)} · {t}</option>)}</select><input placeholder="or type driver name" value={overrides[route]||""} onChange={e=>setOverrides(o=>({...o,[route]:e.target.value}))}/><button className="btn ghost" onClick={()=>setDismissedConflicts(d=>new Set([...d,route]))}>✓ Save & close</button></div>)}</section>}
   <section className="panel waveplan-settings"><h2>Settings</h2><div className="dispatch-settings-grid"><label>Time adjustment<div className="time-adjust"><button onClick={()=>setAdjust(v=>v-5)}>−</button><input type="number" value={adjust} onChange={e=>setAdjust(Number(e.target.value)||0)}/><button onClick={()=>setAdjust(v=>v+5)}>+</button><span>minutes</span></div><small>Negative subtracts; positive adds to Amazon time.</small></label><label>● Detect wave colours automatically</label><label>● Group by staging location</label><label>Site / Station <strong>{site}</strong></label><label>Date <strong>{new Date().toLocaleDateString("en-GB")}</strong></label></div></section>
   <div className="waveplan-actions"><button className="btn primary" disabled={!routeFile||!waveFile} onClick={generate}>↻ Generate Wave Plan</button><button className="btn ghost" onClick={()=>setGenerated(true)}>◉ Preview</button><button className="btn ghost danger" onClick={clear}>Clear</button><button className="btn success" disabled={!generated} onClick={()=>exportPng(false)}>▣ Export Image</button><button className="btn success" disabled={!generated} onClick={()=>exportPng(true)}>↗ Ready to Send</button></div>
   <section className="waveplan-workspace"><aside><article className="panel waveplan-summary"><h2>Summary</h2>{groups.map(([k,v])=>{const wave=k.split("|")[1];return <p key={k}><i style={{background:COLORS[wave]||"#64748b"}}/><span>{wave[0]+wave.slice(1).toLowerCase()} Wave</span><b>{v.length} drivers · {k.split("|")[0]}</b></p>})}<footer>Total <b>{plan.length} drivers</b></footer></article><article className="panel waveplan-history"><h2>Recent Uploads</h2>{history.length?history.map(x=><div key={x.id}><p><b>{x.date}</b><small>✓ Generated</small><span>{x.route} + {x.wave}</span></p><button onClick={()=>setHistory(h=>h.filter(y=>y.id!==x.id))}>Delete</button></div>):<p className="muted">No generated plans in this session.</p>}</article></aside>
   <article className="panel waveplan-preview"><div className="panel-head"><div><h2>Wave Plan Preview</h2><p>DCSL format · ordered chronologically.</p></div></div>{generated?<div className="dcsl-sheet" ref={sheetRef}><header><strong className="dcsl-logo">DCSL</strong><h3>Wave Plan {new Date().toLocaleDateString("en-GB")}</h3></header>{groups.map(([k,rows])=>{const [time,wave,stg]=k.split("|");return <section key={k} style={{"--wave":COLORS[wave]||"#475569"}}><h4>{wave} WAVE&nbsp; - &nbsp;{time} {stg.replace("-"," ")}</h4>{rows.map((r,i)=><div key={r.route+"-"+i}><b>{r.route}</b><strong>{r.driver.toUpperCase()}</strong><span>{r.time}</span><em>{r.staging}</em></div>)}</section>})}<footer><span>DCSL &nbsp;|&nbsp; {site} &nbsp;|&nbsp; {new Date().toLocaleDateString("en-GB")}</span><b>Delivering Together for a Better Tomorrow</b></footer></div>:<div className="waveplan-empty">Upload Route Plan + Wave Plan and select <b>Generate Wave Plan</b>.</div>}</article></section>
  </>}
 </div>
}