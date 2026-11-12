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
 const [tab,setTab]=useState("today"),[search,setSearch]=useState("");
 useEffect(()=>{
  setRoutes([]);setShift([]);setRoutesFile("");setShiftFile("");setTab("today");setError("");
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
 const outstanding=useMemo(()=>[...result.missing,...result.review].sort((a,b)=>a.route.localeCompare(b.route,undefined,{numeric:true})),[result]);
 const filtered=(items)=>items.filter(r=>!search||normalize([r.driver,r.route,r.mentor?.name,...(r.suggestions||[]).map(x=>x.mentor.name)].join(" ")).includes(normalize(search)));
 const ready=routes.length>0&&shift.length>0;
 const copyFollowup=()=>{
  const lines=["CHECK eMentor – "+siteFilter.toUpperCase(),"Please log in to eMentor and start your trip if you are scheduled today.","",...result.missing.map(r=>r.route+" – "+r.driver)];
  if(result.review.length)lines.push("","Names requiring verification:",...result.review.map(r=>r.route+" – "+r.driver+" (possible: "+(r.suggestions?.[0]?.mentor.name||"none")+")"));
  if(result.zeroTrips.length)lines.push("","Logged in but no trip recorded:",...result.zeroTrips.map(r=>r.route+" – "+r.driver));
  navigator.clipboard.writeText(lines.join("\n"));
 };
 const clear=()=>{setRoutes([]);setShift([]);setRoutesFile("");setShiftFile("");setError("");setTab("today");setSearch("")};
 return <div className="cm-page">
  <header className="cm-header"><div><span className="cm-kicker">SITE OPERATIONS · DAILY CHECK</span><h1>CHECK eMentor</h1><p>Upload both reports to see only the scheduled drivers missing from eMentor.</p></div><span className="cm-site">{siteFilter==="all"?"All Sites":siteFilter}</span></header>
  <div className="cm-imports">
   <label className={"cm-upload "+(routesFile?"loaded":"")}><span className="cm-upload-icon">1</span><span><strong>Amazon Routes</strong><small>{routesFile||"Upload today's Amazon Routes"}</small><em>{routes.length?routes.length+" routes recognized":"XLSX / XLS"}</em></span><input aria-label="Upload Amazon Routes" type="file" accept=".xlsx,.xls" disabled={!!busy} onChange={e=>upload(e,"routes")}/><b>{busy==="routes"?"Reading…":routesFile?"Replace":"Choose file"}</b></label>
   <label className={"cm-upload "+(shiftFile?"loaded":"")}><span className="cm-upload-icon">2</span><span><strong>eMentor Shift Report</strong><small>{shiftFile||"Upload today's eMentor Shift Report"}</small><em>{shift.length?shift.length+" accounts in Shift Report":"XLSX / XLS"}</em></span><input aria-label="Upload eMentor Shift Report" type="file" accept=".xlsx,.xls" disabled={!!busy} onChange={e=>upload(e,"shift")}/><b>{busy==="shift"?"Reading…":shiftFile?"Replace":"Choose file"}</b></label>
  </div>
  {error&&<p className="cm-error">{error}</p>}
  <div className="cm-dashboard">
   <div className="cm-primary-count"><small>CONNECTED / SCHEDULED TODAY</small><div className="cm-fraction"><strong>{ready?result.matched.length:"—"}</strong><span>/ {routes.length||"—"}</span></div><div className="cm-meter"><span style={{width:ready&&routes.length?Math.min(100,result.matched.length/routes.length*100)+"%":"0%"}}/></div><p>{!ready?"Upload both files to check today's logins.":result.matched.length===routes.length?"All scheduled drivers are listed in eMentor.":"Only the unconfirmed drivers appear below."}</p></div>
   <div className="cm-secondary-count"><small>NOT CONFIRMED</small><strong>{ready?result.missing.length+result.review.length:"—"}</strong><p>{ready?result.missing.length+" missing · "+result.review.length+" name(s) to review":"Awaiting reports"}</p></div>
   <div className="cm-secondary-count"><small>OTHER ACCOUNTS</small><strong>{ready?result.extra.length:"—"}</strong><p>Separate from today's {routes.length} routes</p></div>
  </div>
  {ready&&result.matched.length===0&&shift.some(x=>!x.generic)&&<div className="cm-error">No matching names were found between the two reports. Verify that the eMentor Shift Report is for this station and date before treating all scheduled drivers as missing.</div>}
  {!ready?<section className="cm-empty"><strong>Upload both reports to see who is connected.</strong><p>Exact and clear middle-name matches are automatic. Uncertain names require your confirmation.</p></section>:<>
   <div className="cm-toolbar"><div className="cm-tabs"><button type="button" className={tab==="today"?"selected":""} onClick={()=>setTab("today")}>Missing ({outstanding.length})</button><button type="button" className={tab==="extras"?"selected":""} onClick={()=>setTab("extras")}>Extra accounts ({result.extra.length})</button></div><div className="cm-tools"><input aria-label="Search drivers" placeholder="Search driver / route" value={search} onChange={e=>setSearch(e.target.value)}/><button type="button" onClick={copyFollowup}>Copy missing drivers</button><button type="button" className="cm-clear" onClick={clear}>Clear</button></div></div>
   {tab==="today"&&result.matched.length===0&&shift.some(x=>!x.generic)?<section className="cm-empty"><strong>No matching drivers detected.</strong><p>The uploaded Shift Report may belong to another site or day. Check both files and upload the correct report; the app will not label all {routes.length} drivers missing until the reports overlap.</p></section>:tab==="today"?<>
    <div className="cm-list-head"><div><h2>Drivers missing from eMentor</h2><p>Only missing or uncertain matches. Confirm a suggested name if it is the same driver.</p></div><span className="cm-notconfirmed">{outstanding.length} / {routes.length}</span></div>
    <div className="cm-tablewrap"><table className="cm-table"><thead><tr><th>Route</th><th>Amazon driver</th><th>Possible eMentor name</th><th>Status</th><th>Confirm match</th></tr></thead><tbody>
     {filtered(outstanding).map(r=><tr key={r.route}><td><b>{r.route}</b></td><td><strong>{r.driver}</strong></td><td>{r.suggestions?.[0]?.mentor.name||"No reliable match"}</td><td><span className={"cm-badge "+r.status}>{r.status==="review"?"Check name":"Not found"}</span></td><td><select aria-label={"Match "+r.driver} value="" onChange={e=>saveApproval(r.driver,e.target.value)}><option value="">Select eMentor account</option>{shift.filter(x=>!x.generic).sort((a,b)=>scoreNames(r.driver,b.name).score-scoreNames(r.driver,a.name).score).map(x=><option key={x.name} value={x.name}>{x.name}</option>)}</select></td></tr>)}
     {!filtered(outstanding).length&&<tr><td colSpan={5} className="cm-empty-row">✓ No missing drivers in the current search.</td></tr>}
    </tbody></table></div>
   </>:<><div className="cm-list-head"><div><h2>Other eMentor accounts</h2><p>Accounts in Shift Report that are not matched to today's scheduled routes. Generic Mentor accounts are shown separately here.</p></div><span className="cm-notconfirmed">{result.extra.length}</span></div><div className="cm-tablewrap"><table className="cm-table"><thead><tr><th>eMentor account</th><th>Type</th></tr></thead><tbody>{result.extra.filter(x=>!search||normalize(x.name).includes(normalize(search))).map(x=><tr key={x.name}><td><strong>{x.name}</strong></td><td><span className={"cm-badge "+(x.generic?"review":"matched")}>{x.generic?"Generic account":"Not on Amazon routes"}</span></td></tr>)}</tbody></table></div></>}
   <p className="cm-note">Connected means the name is found in the uploaded eMentor Shift Report; this is not a live session verification. Confirmed name mappings are stored locally in this browser for the selected station.</p>
  </>}
 </div>
}