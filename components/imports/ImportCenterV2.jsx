"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { analyseFiles } from "../../lib/analyzer";
import {
  IMPORT_ACCEPT,
  fileFingerprint,
  prepareImportFiles,
  summarizePreflight,
} from "../../lib/imports/preflight";
import { buildImportIntelligence } from "../../lib/imports/analysisSummary";
import { isoWeekDetails, isoWeekFromDate } from "../../lib/analyzer/core";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { buildIdentityIndexes, resolveIdentity } from "../../lib/identity";
import {
  duplicateMatchesForFile,
  fetchImportChangePreview,
  fetchImportHistoryV2,
  findPotentialDuplicateImports,
  rollbackImportV2,
} from "../../lib/data/importCenterV2";

const MENTOR_FILE_HINT=/mentor|e-?mentor|driver.?report|vrm|edriving/i;

function dateFromFileName(name){
  const match=String(name||"").match(/(?:^|[^0-9])(20\d{2})[-_.](\d{2})[-_.](\d{2})(?!\d)/);
  if(!match)return"";
  const value=match[1]+"-"+match[2]+"-"+match[3];
  const date=new Date(value+"T12:00:00Z");
  return Number.isNaN(date.getTime())?"":value;
}

function weekInputFromDate(value){
  const date=new Date(String(value||"")+"T12:00:00Z");
  if(Number.isNaN(date.getTime()))return"";
  const period=isoWeekFromDate(date);
  return String(period.year)+"-W"+String(period.week).padStart(2,"0");
}

function periodFromWeekInput(value){
  const match=String(value||"").match(/^(20\d{2})-W(\d{2})$/i);
  if(!match)return null;
  const year=Number(match[1]),week=Number(match[2]);
  return week>=1&&week<=53?isoWeekDetails(year,week):null;
}

function prepareMentorAnalysis(result,mode,reportDate,targetWeek){
  const recognised=(result?.fileResults||[]).filter((item)=>item.recognized);
  const hasMentor=recognised.some((item)=>/mentor/i.test(String(item.reportType||"")));
  const nonMentor=recognised.filter((item)=>{const type=String(item.reportType||"");return type&&!/mentor/i.test(type);});
  if(!hasMentor)throw new Error("This import mode is for eMentor / Driver Report files only.");
  if(nonMentor.length)throw new Error("Upload eMentor files separately when using Daily or Weekly eMentor mode.");
  let period,importContext;
  if(mode==="daily"){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(reportDate||"")))throw new Error("Choose the date represented by this eMentor report.");
    period=isoWeekFromDate(new Date(reportDate+"T12:00:00Z"));
    importContext={type:"mentor-daily",reportDate,weekLabel:period.weekLabel};
  }else{
    period=periodFromWeekInput(targetWeek);
    if(!period)throw new Error("Choose the scorecard week for this weekly eMentor report.");
    importContext={type:"mentor-weekly",targetWeek,weekLabel:period.weekLabel};
  }
  return {
    ...result,
    fileResults:(result.fileResults||[]).map((item)=>item.recognized?{...item,period}:item),
    periods:(result.periods||[]).map((item)=>({...item,...period})),
    importContext,
  };
}

async function reconcileMentorPreview(result,organizationId,activitySite){
  if(!organizationId||!activitySite)return result;
  const supabase=getSupabaseBrowserClient();
  const site=String(activitySite).trim().toUpperCase();
  const {data:master,error:masterError}=await supabase.rpc("get_mentor_alias_map",{p_organization_id:organizationId,p_site:site});
  if(masterError)throw masterError;
  const siteDrivers=(master||[]).map((row)=>({id:row.driver_id,trid:row.trid,full_name:row.full_name,site:row.site,status:"active"}));
  const siteAliases=(master||[]).map((row,index)=>({id:"master-"+index,driver_id:row.driver_id,alias_type:"mentor_hash",alias_value:row.alias_value,alias_normalized:row.alias_value,confidence:1,source:"site master"}));
  const indexes=buildIdentityIndexes(siteDrivers,siteAliases);
  const mentorAliasDriverByHash=new Map();
  for(const alias of siteAliases){
    if(alias.alias_type!=="mentor_hash")continue;
    const key=String(alias.alias_normalized||alias.alias_value||"").replace(/^MENTOR:/,"").trim();
    if(!key)continue;
    const driver=siteDrivers.find((item)=>item.id===alias.driver_id);
    if(!driver)continue;
    if(!mentorAliasDriverByHash.has(key))mentorAliasDriverByHash.set(key,driver);
    else if(mentorAliasDriverByHash.get(key)?.id!==driver.id)mentorAliasDriverByHash.set(key,null);
  }
  let unresolved=0;
  const periods=(result.periods||[]).map((period)=>({...period,drivers:(period.drivers||[]).map((driver)=>{
    const rawId=String(driver.id||"");
    const embeddedHash=rawId.startsWith("MENTOR:")?rawId.slice(7):"";
    const mentorHash=String(embeddedHash||driver.mentorHash||driver?.details?.mentor?.identityKey||"").replace(/^MENTOR:/,"").trim();
    const directMentorDriver=mentorHash?mentorAliasDriverByHash.get(mentorHash):null;
    const resolved=directMentorDriver?{driver:directMentorDriver,method:"mentor_hash",confidence:1}:resolveIdentity({trid:driver.id,name:driver.name,mentorHash},indexes);
    if(!resolved.driver){unresolved+=1;return {...driver,site:activitySite};}
    return {...driver,id:resolved.driver.trid||driver.id,name:resolved.driver.full_name||driver.name,site:activitySite,mentorHash};
  })}));
  const latest=new Map();
  periods.forEach((period)=>(period.drivers||[]).forEach((driver)=>latest.set(driver.id,driver)));
  const previewDrivers=[...latest.values()];
  return {...result,periods,drivers:previewDrivers,driverCount:previewDrivers.length,unmatchedDrivers:unresolved};
}

function phaseLabel(phase){
  if(phase==="analysing")return"Analysing";
  if(phase==="review")return"Ready to save";
  if(phase==="saving")return"Saving";
  if(phase==="done")return"Complete";
  if(phase==="error")return"Action required";
  return"Queue";
}

function statusLabel(status){
  if(status==="parsed")return"Recognised";
  if(status==="read")return"Needs review";
  if(status==="error")return"Error";
  if(status==="unsupported")return"Unsupported";
  return status||"Read";
}

function importDate(value){
  if(!value)return"—";
  const date=new Date(value);
  return Number.isFinite(date.getTime())?date.toLocaleString("en-GB",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}):"—";
}

export default function ImportCenterV2({
  organizationId,
  sites = [],
  siteFilter = "all",
  onImported,
  analysis:latestAnalysis,
  canManage=true,
}){
  const input=useRef(null);
  const [tab,setTab]=useState("queue");
  const [files,setFiles]=useState([]);
  const [phase,setPhase]=useState("idle");
  const [message,setMessage]=useState("");
  const [dragActive,setDragActive]=useState(false);
  const [duplicateCount,setDuplicateCount]=useState(0);
  const [preview,setPreview]=useState(null);
  const [duplicates,setDuplicates]=useState(new Map());
  const [actions,setActions]=useState({});
  const [history,setHistory]=useState([]);
  const [historyLoading,setHistoryLoading]=useState(false);
  const [busyImport,setBusyImport]=useState("");
  const [mentorMode,setMentorMode]=useState("daily");
  const [mentorDate,setMentorDate]=useState(()=>new Date().toISOString().slice(0,10));
  const [activitySite,setActivitySite]=useState(()=>siteFilter!=="all"?siteFilter:"");
  const [mentorWeek,setMentorWeek]=useState(()=>weekInputFromDate(new Date().toISOString().slice(0,10)));

  useEffect(()=>{if(siteFilter!=="all")setActivitySite(siteFilter);},[siteFilter]);
  const busy=["analysing","saving"].includes(phase);
  const preflight=useMemo(()=>summarizePreflight(files),[files]);
  const analysis=preview||latestAnalysis;
  const intelligence=useMemo(()=>buildImportIntelligence(analysis),[analysis]);
  const importableFiles=useMemo(()=>preflight.items.filter((item)=>item.assessment.status!=="blocked").map((item)=>item.file),[preflight]);
  const mentorCandidate=useMemo(()=>files.some((file)=>MENTOR_FILE_HINT.test(file.name)),[files]);

  async function loadHistory(){
    if(!organizationId)return;
    setHistoryLoading(true);
    try{setHistory(await fetchImportHistoryV2(getSupabaseBrowserClient(),organizationId,100));}
    catch(e){setMessage(e?.message||"Could not load import history.");}
    finally{setHistoryLoading(false);}
  }
  useEffect(()=>{loadHistory();},[organizationId]);

  function addFiles(incoming){
    const prepared=prepareImportFiles(files,incoming);
    setFiles(prepared.files);setDuplicateCount(prepared.duplicates);setMessage("");setPreview(null);setDuplicates(new Map());setActions({});
    const inferred=prepared.files.map((file)=>dateFromFileName(file.name)).find(Boolean);
    if(inferred){setMentorDate(inferred);setMentorWeek(weekInputFromDate(inferred));}
    setPhase("idle");
  }

  function removeFile(file){
    const fp=fileFingerprint(file);
    setFiles((current)=>current.filter((item)=>fileFingerprint(item)!==fp));
    setPreview(null);setPhase("idle");
  }

  function clear(){
    setFiles([]);setPreview(null);setDuplicates(new Map());setActions({});setMessage("");setPhase("idle");setDuplicateCount(0);
    if(input.current)input.current.value="";
  }

  async function analyseQueue(){
    if(!importableFiles.length||busy)return;
    if(!activitySite){setMessage("Choose the Activity Site before analysing this import.");setPhase("error");return;}
    setPhase("analysing");setMessage("");
    try{
      let result=await analyseFiles(importableFiles);
      if(!result.recognizedFiles)throw new Error("No supported report structure was detected in the selected files.");
      if(mentorCandidate){result=prepareMentorAnalysis(result,mentorMode,mentorDate,mentorWeek);result=await reconcileMentorPreview(result,organizationId,activitySite);}
      const dup=await findPotentialDuplicateImports(getSupabaseBrowserClient(),organizationId,importableFiles);
      const nextActions={};
      for(const file of importableFiles){
        const matches=duplicateMatchesForFile(dup,file);
        nextActions[fileFingerprint(file)]=matches.length?"merge":"merge";
      }
      setDuplicates(dup);setActions(nextActions);setPreview(result);setPhase("review");
      const duplicateFiles=importableFiles.filter((file)=>duplicateMatchesForFile(dup,file).length).length;
      setMessage(duplicateFiles?duplicateFiles+" existing file match"+(duplicateFiles===1?"":"es")+" found. Choose Merge, Replace or Ignore before saving.":"Analysis complete. No stored file duplicates found.");
    }catch(e){setMessage(e?.message||"Import analysis failed.");setPhase("error");}
  }

  async function saveQueue(){
    if(!preview||busy||!canManage)return;
    if(!activitySite){setMessage("Activity Site is required. MetrixIQ will not guess where operational evidence belongs.");setPhase("error");return;}
    const accepted=importableFiles.filter((file)=>actions[fileFingerprint(file)]!=="ignore");
    if(!accepted.length){setMessage("All files are set to Ignore.");return;}
    setPhase("saving");setMessage("");
    try{
      const supabase=getSupabaseBrowserClient();
      const replaced=[];
      for(const file of accepted){
        if(actions[fileFingerprint(file)]!=="replace")continue;
        const matches=duplicateMatchesForFile(duplicates,file).filter((item)=>!item.metadata?.rolled_back);
        for(const match of matches.slice(0,1)){
          const result=await rollbackImportV2(supabase,match.id,"Replaced from Import Center V2");
          replaced.push({file:file.name,result});
        }
      }

      let result=await analyseFiles(accepted);
      if(mentorCandidate&&accepted.some((file)=>MENTOR_FILE_HINT.test(file.name))){
        result=prepareMentorAnalysis(result,mentorMode,mentorDate,mentorWeek);
        result=await reconcileMentorPreview(result,organizationId,activitySite);
      }
      result={...result,importContext:{...(result.importContext||{}),activitySite}};
      const saved=await onImported(result,accepted,activitySite);
      setPreview(result);
      setPhase("done");
      const rec=saved?.reconciliation;
      const reconciliationText=rec
        ?" · "+rec.accountedRows+"/"+rec.sourceRows+" accounted"+(rec.balanced?" ✓":" ⚠")+
          " ("+rec.matchedRows+" matched · "+rec.unmatchedRows+" need review"+
          (rec.skippedWithoutScore?" · "+rec.skippedWithoutScore+" without score":"")+")"
        :"";
      setMessage(
        "Saved "+(saved?.savedMetrics??saved?.savedDaily??0)+" metric / daily records · "+
        (saved?.savedScorecards??0)+" site scorecards · "+
        (saved?.savedFeedback??0)+" feedback events · "+
        (saved?.unmatched??0)+" unmatched"+reconciliationText+
        (replaced.length?" · "+replaced.length+" previous import replaced":"")+"."
      );
      await loadHistory();
    }catch(e){setMessage(e?.message||"Could not save import.");setPhase("error");}
  }

  async function rollback(item){
    if(!canManage)return;
    setBusyImport(item.id);setMessage("");
    try{
      const previewRollback=await fetchImportChangePreview(getSupabaseBrowserClient(),item.id);
      const detail=[
        (previewRollback.driver_rows_safe||0)+" driver rows",
        (previewRollback.direct_artifacts||0)+" linked evidence rows",
        (previewRollback.merged_driver_rows||0)+" merged rows preserved",
      ].join(", ");
      if(!window.confirm("Rollback "+item.file_name+"?\n\n"+detail+"\n\nThis action is audited.")){setBusyImport("");return;}
      const result=await rollbackImportV2(getSupabaseBrowserClient(),item.id,"Manual rollback from Import Center V2");
      setMessage("Rollback completed: "+(result.deleted_rows||0)+" rows removed · "+(result.skipped_merged||0)+" merged rows preserved.");
      await loadHistory();
    }catch(e){setMessage(e?.message||"Rollback failed.");}
    finally{setBusyImport("");}
  }

  return <div className="importv2-root">
    <div className="importv2-heading">
      <div><span className="page-kicker">IMPORT CENTER V2</span><h1>Smart Data Ingestion</h1><p>Analyse first, review duplicates and data quality, then write trusted evidence to the workspace.</p></div>
      <div><button className="btn ghost" onClick={()=>setTab("history")}>Import history</button><button className="btn primary" onClick={()=>input.current?.click()} disabled={busy}>Add files</button></div>
    </div>
    <div className="importv2-tabs"><button className={tab==="queue"?"active":""} onClick={()=>setTab("queue")}>Import Queue</button><button className={tab==="history"?"active":""} onClick={()=>setTab("history")}>History & Rollback</button></div>
    {tab==="queue"&&<section className="panel" style={{marginBottom:16}}><div className="panel-head"><div><span className="page-kicker">SITE ISOLATION</span><h2>Activity Site</h2><p>Every saved import and driver metric is attributed to this station. Home Site does not override operational evidence.</p></div><select aria-label="Activity Site" value={activitySite} onChange={(e)=>{setActivitySite(e.target.value);setPreview(null);setPhase("idle");setMessage("");}} disabled={busy}><option value="">Choose site…</option>{sites.map((site)=><option key={site} value={site}>{site}</option>)}</select></div>{!activitySite&&<div className="importv2-notice">Select a site before analysis. MetrixIQ will not infer a station from the driver's Home Site.</div>}</section>}
    <input ref={input} type="file" multiple hidden accept={IMPORT_ACCEPT} onChange={(event)=>{addFiles(event.target.files||[]);event.target.value="";}}/>

    {tab==="queue"&&<>
      <section className={"importv2-drop "+(dragActive?"active":"")} onDragEnter={(e)=>{e.preventDefault();setDragActive(true);}} onDragOver={(e)=>{e.preventDefault();setDragActive(true);}} onDragLeave={(e)=>{e.preventDefault();if(e.currentTarget===e.target)setDragActive(false);}} onDrop={(e)=>{e.preventDefault();setDragActive(false);addFiles(e.dataTransfer?.files||[]);}} onClick={()=>input.current?.click()}>
        <span>⇧</span><div><b>{dragActive?"Drop files here":"Drop operational reports here"}</b><p>Excel, CSV, HTML, PDF, JSON, XML and text · Multi-file · report detection · duplicate review</p></div><em>Browse</em>
      </section>

      {duplicateCount>0&&<div className="importv2-notice">{duplicateCount} exact local duplicate file{duplicateCount===1?" was":"s were"} ignored from the queue.</div>}

      {files.length>0&&<>
        <section className="importv2-kpis"><article><span>Selected</span><strong>{files.length}</strong><small>{importableFiles.length} importable</small></article><article className={preflight.blocked?"warn":""}><span>Preflight</span><strong>{preflight.blocked?preflight.blocked+" blocked":"Ready"}</strong><small>{preflight.warnings} warnings</small></article><article><span>Total size</span><strong>{(preflight.totalBytes/1024/1024).toFixed(2)} MB</strong><small>Browser analysis</small></article><article className={phase==="error"?"bad":phase==="done"?"good":""}><span>Pipeline</span><strong>{phaseLabel(phase)}</strong><small>Analyse → review → save</small></article>{phase==="done"&&analysis?.reconciliation&&<article className={analysis.reconciliation.balanced?"good":"bad"}><span>Reconciliation</span><strong>{analysis.reconciliation.accountedRows}/{analysis.reconciliation.sourceRows}</strong><small>{analysis.reconciliation.balanced?"All source rows accounted":"Review missing source rows"}</small></article>}</section>

        {mentorCandidate&&<section className="panel importv2-mentor"><div><span className="page-kicker">EMENTOR DETECTED</span><h2>Storage mode</h2><p>Daily history and weekly scorecard FICO remain separate.</p></div><div className="importv2-mentor-controls"><select value={mentorMode} onChange={(e)=>{setMentorMode(e.target.value);setPreview(null);setPhase("idle");}}><option value="daily">Daily history</option><option value="weekly">Weekly scorecard FICO</option></select>{mentorMode==="daily"?<input type="date" value={mentorDate} onChange={(e)=>{setMentorDate(e.target.value);setMentorWeek(weekInputFromDate(e.target.value));setPreview(null);setPhase("idle");}}/>:<input type="week" value={mentorWeek} onChange={(e)=>{setMentorWeek(e.target.value);setPreview(null);setPhase("idle");}}/>}</div></section>}

        <section className="panel importv2-queue">
          <div className="panel-head"><div><h2>File queue</h2><p>Analyse before save. Stored duplicates can be merged, replaced or ignored.</p></div><div className="importv2-head-actions"><button className="btn ghost" onClick={clear} disabled={busy}>Clear</button>{phase==="review"||phase==="done"?<button className="btn primary" onClick={saveQueue} disabled={busy||!canManage}>{phase==="saving"?"Saving…":"Save approved files"}</button>:<button className="btn primary" onClick={analyseQueue} disabled={busy||!importableFiles.length}>{phase==="analysing"?"Analysing…":"Analyse queue"}</button>}</div></div>
          <div className="importv2-file-list">
            {preflight.items.map((item)=>{
              const matches=duplicateMatchesForFile(duplicates,item.file);
              const result=preview?.fileResults?.find((row)=>row.name===item.file.name);
              const fp=fileFingerprint(item.file);
              return <article key={fp} className={"importv2-file "+item.assessment.status}>
                <span>{item.extension.toUpperCase()}</span>
                <div><b>{item.file.name}</b><small>{item.sizeLabel} · {item.assessment.message}</small>{result&&<em>{result.reportType||statusLabel(result.status)} · {result.rows??0} rows</em>}</div>
                <div className="importv2-file-state"><b>{matches.length?matches.length+" stored match"+(matches.length===1?"":"es"):item.assessment.label}</b>{matches.length>0&&<select value={actions[fp]||"merge"} onChange={(e)=>setActions((current)=>({...current,[fp]:e.target.value}))}><option value="merge">Merge</option><option value="replace">Replace previous</option><option value="ignore">Ignore</option></select>}</div>
                <button onClick={(e)=>{e.stopPropagation();removeFile(item.file);}} disabled={busy}>×</button>
              </article>;
            })}
          </div>
          {message&&<div className={"importv2-message "+(phase==="error"?"error":"good")}>{message}</div>}
        </section>

        {preview&&<section className="importv2-preview-grid">
          <article className="panel"><div className="panel-head"><div><h2>Analysis preview</h2><p>No additional write occurs until Save approved files.</p></div><span className={"importv2-readiness "+intelligence.tone}>{intelligence.readiness}/100</span></div><div className="importv2-result-grid"><div><span>Drivers</span><strong>{preview.driverCount||0}</strong></div><div><span>Periods</span><strong>{preview.periods?.length||0}</strong></div><div><span>Recognised</span><strong>{preview.recognizedFiles||0}/{preview.fileResults?.length||0}</strong></div><div className={preview.unmatchedDrivers?"warn":""}><span>Unmatched</span><strong>{preview.unmatchedDrivers||0}</strong></div></div><div className="importv2-tags">{intelligence.reportTypes.map((type)=><span key={type}>{type}</span>)}</div></article>
          <article className="panel"><div className="panel-head"><div><h2>Data-quality gate</h2><p>Recommended checks before persistence.</p></div></div><div className="importv2-actions-list">{intelligence.strengths.map((text)=><div className="good" key={text}><b>✓</b><p>{text}</p></div>)}{intelligence.actions.map((text,index)=><div key={text}><b>{String(index+1).padStart(2,"0")}</b><p>{text}</p></div>)}</div></article>
        </section>}
      </>}
    </>}

    {tab==="history"&&<section className="panel importv2-history">
      <div className="panel-head"><div><h2>Import history</h2><p>Every stored source file with rollback controls. Merged evidence is preserved when removal would be unsafe.</p></div><button className="btn ghost" onClick={loadHistory}>Refresh</button></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Imported</th><th>File</th><th>Detected report</th><th>Period</th><th>Status</th><th>Mode</th><th>Action</th></tr></thead><tbody>
        {history.map((item)=><tr key={item.id}><td>{importDate(item.created_at)}</td><td><b>{item.file_name}</b><small className="history-date">{item.file_size_bytes?Math.round(item.file_size_bytes/1024)+" KB":"—"}</small></td><td>{item.detected_report_type||"—"}</td><td>{item.period_start||"—"} → {item.period_end||"—"}</td><td><span className={"import-status "+(item.metadata?.rolled_back?"read":item.status)}>{item.metadata?.rolled_back?"rolled back":item.status}</span></td><td>{item.metadata?.import_mode||"standard"}</td><td><button className="btn ghost compact" disabled={!canManage||busyImport===item.id||item.metadata?.rolled_back} onClick={()=>rollback(item)}>{busyImport===item.id?"Checking…":"Rollback"}</button></td></tr>)}
        {!historyLoading&&!history.length&&<tr><td colSpan="7"><div className="mgrv2-empty">No imports recorded yet.</div></td></tr>}
      </tbody></table></div>
      {historyLoading&&<div className="mgrv2-empty compact"><div className="auth-spinner"/><span>Loading import history…</span></div>}
      {message&&<div className="importv2-message good">{message}</div>}
    </section>}
  </div>;
}
