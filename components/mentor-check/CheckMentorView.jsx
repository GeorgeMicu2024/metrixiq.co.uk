"use client";
import {useEffect,useMemo,useState} from "react";
import * as XLSX from "xlsx";
import {normalize,parseRoutes,parseShift,reconcileMentor,scoreNames} from "../../lib/mentor-check/matching.mjs";
import "./CheckMentorView.css";

async function readSheet(file,kind){
 const wb=XLSX.read(await file.arrayBuffer(),{type:"array",cellDates:false});
 const accepted=kind==="routes"?["ROUTECODE","DRIVERNAME"]:["FIRSTNAME","LASTNAME"];
 for(const sheet of wb.SheetNames){
  const matrix=XLSX.utils.sheet_to_json(wb.Sheets[sheet],{header:1,defval:"",raw:false});
  const at=matrix.findIndex(row=>{const keys=row.map(v=>String(v||"").toUpperCase().replace(/[^A-Z0-9]/g,""));return accepted.every(k=>keys.includes(k))});
  if(at<0)continue;
  const keys=matrix[at].map(String),raw=matrix.slice(at+1).filter(r=>r.some(v=>String(v??"").trim())).map(row=>Object.fromEntries(keys.map((key,i)=>[key,row[i]??""])));
  return kind==="routes"?parseRoutes(raw):parseShift(raw);
 }
 throw new Error(kind==="routes"?"Amazon Routes: Route code / Driver name columns not found.":"eMentor Shift Report: First Name / Last Name columns not found.");
}
export default function CheckMentorView({siteFilter="all"}){
 const [routes,setRoutes]=useState([]),[shift,setShift]=useState([]);
 const [routesFile,setRoutesFile]=useState(""),[shiftFile,setShiftFile]=useState("");
 const [busy,setBusy]=useState(""),[error,setError]=useState(""),[approved,setApproved]=useState({});
 const [filter,setFilter]=useState("missing"),[search,setSearch]=useState(""),[showExtras,setShowExtras]=useState(false);
 useEffect(()=>{
  setRoutes([]);setShift([]);setRoutesFile("");setShiftFile("");setFilter("missing");setError("");
  try{const saved=JSON.parse(localStorage.getItem("metrixiq:check-mentor:"+siteFilter)||"{}");setApproved(saved&&typeof saved==="object"?saved:{})}catch{setApproved({})}
 },[siteFilter]);
 const saveApproval=(driver,value)=>{
  const key=normalize(driver),next={...approved};if(value)next[key]=normalize(value);else delete next[key];setApproved(next);
  try{localStorage.setItem("metrixiq:check-mentor:"+siteFilter,JSON.stringify(next))}catch{}
 };
 const upload=async(event,kind)=>{
  const file=event.target.files?.[0];if(!file)return;
  setError("");setBusy(kind);
  try{const parsed=await readSheet(file,kind);if(!parsed.length)throw new Error("No valid "+kind+" rows found.");
   if(kind==="routes"){setRoutes(parsed);setRoutesFile(file.name)}else{setShift(parsed);setShiftFile(file.name)}
  }catch(err){setError(err.message||"File could not be read.")}
  finally{setBusy("");event.target.value=""}
 };
 const result=useMemo(()=>reconcileMentor(routes,shift,approved),[routes,shift,approved]);
 const all=useMemo(()=>[...result.missing,...result.review,...result.matched].sort((a,b)=>a.route.localeCompare(b.route,undefined,{numeric:true})),[result]);
 const visible=useMemo(()=>all.filter(r=>(filter==="all"||r.status===filter)&&(!search||normalize([r.driver,r.route,r.mentor?.name,...(r.suggestions||[]).map(x=>x.mentor.name)].join(" ")).includes(normalize(search)))),[all,filter,search]);
 const ready=routes.length>0&&shift.length>0;
 const copyFollowup=()=>{
  const lines=["CHECK eMentor – "+siteFilter.toUpperCase(),"Please log in to eMentor and start your trip if you are scheduled today.","",...result.missing.map(r=>r.route+" – "+r.driver)];
  if(result.review.length)lines.push("","Names requiring verification:",...result.review.map(r=>r.route+" – "+r.driver+" (possible: "+(r.suggestions?.[0]?.mentor.name||"none")+")"));
  if(result.zeroTrips.length)lines.push("","Logged in but no trip recorded:",...result.zeroTrips.map(r=>r.route+" – "+r.driver));
  navigator.clipboard.writeText(lines.join("\n"));
 };
 const clear=()=>{setRoutes([]);setShift([]);setRoutesFile("");setShiftFile("");setError("");setFilter("missing");setSearch("")};
 return <div className="cm-page">
  <header className="cm-header"><div><span className="cm-kicker">SITE OPERATIONS · DAILY COMPLIANCE</span><h1>CHECK eMentor</h1><p>Compare Amazon Routes with eMentor Shift Report. Identify missing logins, name variations and trips not recorded.</p></div><span className="cm-site">{siteFilter==="all"?"All Sites":siteFilter}</span></header>
  <div className="cm-imports">
   <label className={"cm-upload "+(routesFile?"loaded":"")}><span className="cm-upload-icon">1</span><span><strong>Amazon Routes</strong><small>{routesFile||"Upload Routes_Station_Date.xlsx"}</small><em>{routes.length?routes.length+" routes recognized":"XLSX / XLS"}</em></span><input aria-label="Upload Amazon Routes" type="file" accept=".xlsx,.xls" disabled={!!busy} onChange={e=>upload(e,"routes")}/><b>{busy==="routes"?"Reading…":routesFile?"Replace":"Choose file"}</b></label>
   <label className={"cm-upload "+(shiftFile?"loaded":"")}><span className="cm-upload-icon">2</span><span><strong>eMentor Shift Report</strong><small>{shiftFile||"Upload Shift Report.xlsx"}</small><em>{shift.length?shift.length+" eMentor entries":"XLSX / XLS"}</em></span><input aria-label="Upload eMentor Shift Report" type="file" accept=".xlsx,.xls" disabled={!!busy} onChange={e=>upload(e,"shift")}/><b>{busy==="shift"?"Reading…":shiftFile?"Replace":"Choose file"}</b></label>
  </div>
  {error&&<p className="cm-error">{error}</p>}
  <div className="cm-stats">{[["Amazon routes",routes.length,"neutral"],["Logged / matched",ready?result.matched.length:0,"success"],["Missing",ready?result.missing.length:0,"danger"],["Review names",ready?result.review.length:0,"warning"],["Matched with Trip = 0",ready?result.zeroTrips.length:0,"neutral"]].map(([label,count,color])=><div key={label} className={"cm-stat "+color}><small>{label}</small><strong>{count}</strong></div>)}</div>
  {!ready?<section className="cm-empty"><strong>Upload both reports to run the check.</strong><p>Middle names and reversed names are matched automatically. Uncertain spelling differences require your confirmation.</p></section>:<>
   <div className="cm-toolbar"><div className="cm-tabs">{[["missing","Missing ("+result.missing.length+")"],["review","Review ("+result.review.length+")"],["matched","Matched ("+result.matched.length+")"],["all","All ("+all.length+")"]].map(([value,label])=><button type="button" key={value} className={filter===value?"selected":""} onClick={()=>setFilter(value)}>{label}</button>)}</div><div className="cm-tools"><input aria-label="Search drivers" placeholder="Search driver / route" value={search} onChange={e=>setSearch(e.target.value)}/><button type="button" onClick={copyFollowup}>Copy follow-up message</button><button type="button" className="cm-clear" onClick={clear}>Clear files</button></div></div>
   <div className="cm-tablewrap"><table className="cm-table"><thead><tr><th>Route</th><th>Amazon driver</th><th>eMentor account</th><th>Status</th><th>Action / match</th></tr></thead><tbody>{visible.map(r=><tr key={r.route}><td><b>{r.route}</b></td><td><strong>{r.driver}</strong></td><td>{r.mentor?.name||r.suggestions?.[0]?.mentor.name||"Not found"}{r.mentor?.begin&&<small>Logged {r.mentor.begin}</small>}</td><td><span className={"cm-badge "+r.status}>{r.status==="matched"?(r.mentor.trip===0?"Logged · No Trip":"Matched"):r.status==="review"?"Review name":"Missing"}</span>{r.status!=="missing"&&<small>{r.reason}</small>}</td><td>{r.status==="matched"?<span className="cm-confidence">{r.confidence===1?"Exact":r.reason}</span>:<select aria-label={"Select eMentor account for "+r.driver} value="" onChange={e=>saveApproval(r.driver,e.target.value)}><option value="">Select / confirm eMentor account</option>{shift.filter(s=>!s.generic).sort((a,b)=>scoreNames(r.driver,b.name).score-scoreNames(r.driver,a.name).score).map(s=><option key={s.name} value={s.name}>{s.name}</option>)}</select>}{approved[normalize(r.driver)]&&<button className="cm-unlink" onClick={()=>saveApproval(r.driver,"")} type="button">Unlink</button>}</td></tr>)}{!visible.length&&<tr><td colSpan={5} className="cm-empty-row">No drivers in this category.</td></tr>}</tbody></table></div>
   <div className="cm-bottom"><button type="button" className="cm-extras-toggle" onClick={()=>setShowExtras(v=>!v)}>{showExtras?"Hide":"Show"} other eMentor entries ({result.extra.length})</button>{showExtras&&<div className="cm-extras">{result.extra.map(x=><span key={x.name}>{x.name}{x.generic?" · generic account":""}</span>)}</div>}<p><b>Matching:</b> Exact names, reordered names and clear middle-name variations are accepted. Similar spellings are suggestions that require confirmation. Generic Mentor accounts never count as driver logins. A start time with Trip = 0 means a login appears in Shift Report but no trip is recorded.</p><p>Approved name links are saved in this browser for the selected station.</p></div>
  </>}
 </div>
}
