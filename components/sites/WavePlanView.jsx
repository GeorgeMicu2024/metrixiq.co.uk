"use client";

// Wave Plan deployment checkpoint

import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";

const WAVE_COLORS={PURPLE:"#6f2da8",BLUE:"#087fc1",GREEN:"#00a651",RED:"#d62828",YELLOW:"#d7ad00",ORANGE:"#e67e22"};
const clean=v=>String(v??"").trim();
const norm=v=>clean(v).toUpperCase().replace(/\s+/g," ");
const minus20=value=>{
  const s=clean(value); if(!s)return"";
  let h,m,ampm="";
  const match=s.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i); if(!match)return s;
  h=Number(match[1]);m=Number(match[2]);ampm=(match[3]||"").toUpperCase();
  if(ampm){if(ampm==="PM"&&h<12)h+=12;if(ampm==="AM"&&h===12)h=0;}
  let total=(h*60+m-20+1440)%1440;h=Math.floor(total/60);m=total%60;
  const outAmp=h>=12?"PM":"AM",hh=h%12||12;return `${hh}:${String(m).padStart(2,"0")} ${outAmp}`;
};
function rowsFromWorkbook(file){
  return file.arrayBuffer().then(buf=>{const wb=XLSX.read(buf,{type:"array",cellStyles:true});const rows=[];for(const name of wb.SheetNames){const ws=wb.Sheets[name];const data=XLSX.utils.sheet_to_json(ws,{header:1,defval:"",raw:false});data.forEach((r,i)=>rows.push({sheet:name,row:i+1,cells:r}));}return rows;});
}
function findRoute(cells){return cells.map(clean).find(x=>/^CA[_ -]?A?\d+/i.test(x))||""}
function findTime(cells){return cells.map(clean).find(x=>/^\d{1,2}:\d{2}\s*(AM|PM)?$/i.test(x))||""}
function findStaging(cells){return cells.map(clean).find(x=>/STG[- ]?[A-Z].*(PURPLE|BLUE|GREEN|RED|YELLOW|ORANGE)/i.test(x))||cells.map(clean).find(x=>/(PURPLE|BLUE|GREEN|RED|YELLOW|ORANGE)\.\d+/i.test(x))||""}
function waveFrom(staging,cells){const hay=norm(staging+" "+cells.join(" "));return Object.keys(WAVE_COLORS).find(x=>hay.includes(x))||"OTHER"}
function driverCandidate(cells,route,time,staging){return cells.map(clean).find(x=>x&&x!==route&&x!==time&&x!==staging&&/[A-Za-z]/.test(x)&&!/STG|WAVE|ROUTE|DRIVER|TIME|LOCATION/i.test(x)&&!/^\d+$/.test(x))||""}

export default function WavePlanView({site="DLS2"}){
 const [routeFile,setRouteFile]=useState(null),[waveFile,setWaveFile]=useState(null),[routeRows,setRouteRows]=useState([]),[waveRows,setWaveRows]=useState([]),[generated,setGenerated]=useState(false),[history,setHistory]=useState([]);
 const routeInput=useRef(null),waveInput=useRef(null);
 const load=async(file,setFile,setRows)=>{if(!file)return;setFile(file);setRows(await rowsFromWorkbook(file));setGenerated(false)};
 const plan=useMemo(()=>{const drivers=new Map();for(const x of routeRows){const route=findRoute(x.cells);if(!route)continue;const d=driverCandidate(x.cells,route,findTime(x.cells),findStaging(x.cells));if(d)drivers.set(norm(route),d)}
   return waveRows.map(x=>{const route=findRoute(x.cells),time=findTime(x.cells),staging=findStaging(x.cells);if(!route||!time||!staging)return null;return{route,driver:drivers.get(norm(route))||driverCandidate(x.cells,route,time,staging)||"Unassigned",amazonTime:time,time:minus20(time),staging,wave:waveFrom(staging,x.cells)}}).filter(Boolean);
 },[routeRows,waveRows]);
 const groups=useMemo(()=>{const m={};for(const r of plan){const key=r.wave+"|"+r.time+"|"+(r.staging.match(/STG[- ]?[A-Z]/i)?.[0]?.replace(" ","-").toUpperCase()||"STG-A");(m[key]??=[]).push(r)}return Object.entries(m).sort((a,b)=>a[0].localeCompare(b[0]));},[plan]);
 const clear=()=>{if(!confirm("Clear the current Wave Plan? Saved history will not be deleted."))return;setRouteFile(null);setWaveFile(null);setRouteRows([]);setWaveRows([]);setGenerated(false);if(routeInput.current)routeInput.current.value="";if(waveInput.current)waveInput.current.value=""};
 const generate=()=>{setGenerated(true);setHistory(h=>[{id:Date.now(),date:new Date().toLocaleDateString("en-GB"),route:routeFile?.name,wave:waveFile?.name},...h].slice(0,8))};
 const removeHistory=id=>{if(confirm("Delete this Wave Plan from Recent Uploads?"))setHistory(h=>h.filter(x=>x.id!==id))};
 const exportImage=()=>window.print();
 return <div className="waveplan-root">
   <div className="waveplan-heading"><div><span className="page-kicker">SITE OPERATIONS › WAVE PLAN</span><h1>Wave Plan</h1><p>Upload Amazon reports, we'll generate your wave plan automatically.</p></div><span className={"waveplan-ready "+(generated?"ok":"")}>{generated?"✓ Ready":"Waiting for files"}</span></div>
   <section className="waveplan-files">
    <article><input ref={routeInput} hidden type="file" accept=".xlsx,.xls,.csv" onChange={e=>load(e.target.files?.[0],setRouteFile,setRouteRows)}/><div className="waveplan-file-icon">X</div><div><b>Route Plan</b><span>{routeFile?.name||"Upload Amazon Route Plan"}</span><small>{routeRows.length?routeRows.length+" rows detected":""}</small></div><button onClick={()=>routeInput.current?.click()}>{routeFile?"Replace file":"Choose file"}</button></article>
    <article><input ref={waveInput} hidden type="file" accept=".xlsx,.xls,.csv" onChange={e=>load(e.target.files?.[0],setWaveFile,setWaveRows)}/><div className="waveplan-file-icon">X</div><div><b>Wave Plan</b><span>{waveFile?.name||"Upload Amazon Wave Plan"}</span><small>{waveRows.length?waveRows.length+" rows detected":""}</small></div><button onClick={()=>waveInput.current?.click()}>{waveFile?"Replace file":"Choose file"}</button></article>
   </section>
   <section className="panel waveplan-settings"><h2>Settings</h2><div><label>Adjust loading time <strong>− 20</strong> minutes <small>(from Amazon time)</small></label><label>● Detect wave colours automatically</label><label>● Group by staging location</label><label>Site / Station <strong>{site}</strong></label><label>Date <strong>{new Date().toLocaleDateString("en-GB")}</strong></label></div></section>
   <div className="waveplan-actions"><button className="btn primary" disabled={!routeFile||!waveFile} onClick={generate}>↻ Generate Wave Plan</button><span/><button className="btn ghost" onClick={()=>setGenerated(true)}>◉ Preview</button><button className="btn ghost danger" onClick={clear}>Clear</button><button className="btn success" disabled={!generated} onClick={exportImage}>▣ Export Image</button></div>
   <section className="waveplan-workspace">
    <aside><article className="panel waveplan-summary"><h2>Summary</h2>{groups.map(([k,v])=>{const wave=k.split("|")[0];return <p key={k}><i style={{background:WAVE_COLORS[wave]||"#64748b"}}/><span>{wave[0]+wave.slice(1).toLowerCase()} Wave</span><b>{v.length} drivers</b></p>})}<footer>Total <b>{plan.length} drivers</b></footer></article>
    <article className="panel waveplan-history"><h2>Recent Uploads</h2>{history.length?history.map(x=><div key={x.id}><p><b>{x.date}</b><small>✓ Generated</small><span>{x.route} + {x.wave}</span></p><button onClick={()=>removeHistory(x.id)}>Delete</button></div>):<p className="muted">No generated plans in this session.</p>}</article></aside>
    <article className="panel waveplan-preview"><div className="panel-head"><div><h2>Wave Plan Preview</h2><p>Amazon loading time automatically adjusted by −20 minutes.</p></div>{generated&&<span className="waveplan-ready ok">Ready to send</span>}</div>
    {generated?<div className="dcsl-sheet"><header><strong>DCSL</strong><h3>Wave Plan {new Date().toLocaleDateString("en-GB")}</h3></header>{groups.map(([k,rows])=>{const [wave,time,stg]=k.split("|");return <section key={k} style={{"--wave":WAVE_COLORS[wave]||"#475569"}}><h4>{wave} WAVE&nbsp; - &nbsp;{time} {stg.replace("-"," ")}</h4>{rows.map((r,i)=><div key={r.route+"-"+i}><b>{r.route}</b><strong>{r.driver.toUpperCase()}</strong><span>{r.time}</span><em>{r.staging}</em></div>)}</section>})}<footer><span>DCSL &nbsp;|&nbsp; {site} &nbsp;|&nbsp; {new Date().toLocaleDateString("en-GB")}</span><b>Delivering Together for a Better Tomorrow</b></footer></div>:<div className="waveplan-empty">Upload Route Plan + Wave Plan and select <b>Generate Wave Plan</b>.</div>}
    </article>
   </section>
 </div>
}