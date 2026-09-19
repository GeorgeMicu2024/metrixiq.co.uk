"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { isUsablePersonName } from "../../lib/identity";
import {
  fetchDataQualityState,
  resolveDriverIdentity,
  resolveUnmatchedDriverRecord,
  syncDriverDirectory,
} from "../../lib/data/dataQuality";
import { ErrorBox as ErrorPanel, Loading as LoadingPanel } from "../operations/OperationalShared";

function useLoad(loader, deps = []) {
  const [state, setState] = useState({ loading: true, error: "", data: null });

  useEffect(() => {
    let alive = true;
    setState((current) => ({ ...current, loading: true, error: "" }));

    loader()
      .then((data) => alive && setState({ loading: false, error: "", data }))
      .catch((error) => alive && setState({
        loading: false,
        error: error?.message || "Could not load data.",
        data: null,
      }));

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}


export default function DataQualityView({ organizationId, onImport }) {
  const [refreshKey,setRefreshKey]=useState(0);
  const [renameId,setRenameId]=useState("");
  const [renameValue,setRenameValue]=useState("");
  const [choice,setChoice]=useState({});
  const [busy,setBusy]=useState("");
  const [notice,setNotice]=useState("");

  async function autoSync(){
    setBusy("autosync"); setNotice("");
    try{
      const row=await syncDriverDirectory(getSupabaseBrowserClient(),organizationId);
      setNotice(`Identity sync complete${row?`: ${row.updated_names||0} names and ${row.updated_sites||0} sites updated`:""}.`);
      setRefreshKey((v)=>v+1);
    }catch(error){setNotice(`Could not sync identities: ${error?.message||"Unknown error"}`);}finally{setBusy("");}
  }

  const load = useLoad(
    () => fetchDataQualityState(getSupabaseBrowserClient(), organizationId),
    [organizationId,refreshKey]
  );

  const drivers=load.data?.drivers||[];
  const unresolved=drivers.filter((d)=>!isUsablePersonName(d.full_name));
  const unmatched=load.data?.unmatched||[];

  async function saveName(driver){
    const name=renameValue.trim();
    if(!isUsablePersonName(name)){
      setNotice("Please enter the full driver name (at least first name and surname).");
      return;
    }
    setBusy(driver.id);
    setNotice("");
    try{
      await resolveDriverIdentity(getSupabaseBrowserClient(),{
        organizationId,
        driverId:driver.id,
        fullName:name,
      });
      setRenameId("");
      setRenameValue("");
      setNotice(`${name} saved and linked to ${driver.trid}.`);
      setRefreshKey((v)=>v+1);
    }catch(error){
      setNotice(`Could not save driver name: ${error?.message || "Unknown error"}`);
    }finally{setBusy("");}
  }

  async function resolveRecord(record){
    const driverId=choice[record.id];
    if(!driverId)return;
    setBusy(record.id);
    setNotice("");
    try{
      const aliasName=record.raw_name&&isUsablePersonName(record.raw_name)?record.raw_name:"";
      await resolveUnmatchedDriverRecord(getSupabaseBrowserClient(),{
        organizationId,
        recordId:record.id,
        driverId,
        aliasName,
      });
      setNotice("Imported record resolved successfully.");
      setChoice((current)=>{const next={...current};delete next[record.id];return next;});
      setRefreshKey((v)=>v+1);
    }catch(error){
      setNotice(`Could not resolve imported record: ${error?.message || "Unknown error"}`);
    }finally{setBusy("");}
  }

  if(load.loading)return <LoadingPanel text="Checking identity quality…"/>;
  if(load.error)return <ErrorPanel error={load.error}/>;

  const resolved=drivers.length-unresolved.length;
  return <>
    <div className="page-heading"><div><span className="page-kicker">DATA QUALITY</span><h1>Identity resolution</h1><p>Keep TRIDs, driver names and name-only Mentor records mapped to one trusted profile.</p></div><div className="page-actions"><button className="btn ghost" disabled={busy==="autosync"} onClick={autoSync}>{busy==="autosync"?"Syncing…":"Auto-match aliases"}</button><button className="btn primary" onClick={onImport}>Import master roster</button></div></div>
    {notice && <div className={`import-message ${notice.startsWith("Could not") || notice.startsWith("Please") ? "error" : ""}`}>{notice}</div>}
    <section className="ops-kpi-strip"><div><span>Known drivers</span><strong>{drivers.length}</strong><small>Workspace identities</small></div><div><span>Resolved names</span><strong>{resolved}</strong><small>{drivers.length?`${Math.round(resolved/drivers.length*100)}% coverage`:"0% coverage"}</small></div><div><span>Unresolved TRIDs</span><strong>{unresolved.length}</strong><small>Need trusted name mapping</small></div><div><span>Unmatched records</span><strong>{unmatched.length}</strong><small>Name-only or ambiguous evidence</small></div></section>

    <section className="panel"><div className="panel-head"><div><h2>Unresolved driver identities</h2><p>Import MASTER TRID to auto-resolve, or set a trusted name manually.</p></div><span className="panel-badge">{unresolved.length}</span></div><div className="table-wrap"><table className="data-table"><thead><tr><th>TRID</th><th>Current label</th><th>Site</th><th>Resolution</th></tr></thead><tbody>
      {unresolved.map((driver)=><tr key={driver.id}><td><b>{driver.trid}</b></td><td>Unresolved identity</td><td>{driver.site||"—"}</td><td>{renameId===driver.id?<div className="inline-resolve"><input aria-label="Full driver name" autoFocus placeholder="Full driver name" value={renameValue} onChange={(e)=>setRenameValue(e.target.value)}/><button className="btn primary" disabled={busy===driver.id} onClick={()=>saveName(driver)}>Save</button><button className="btn ghost" onClick={()=>setRenameId("")}>Cancel</button></div>:<button className="profile-link" onClick={()=>{setRenameId(driver.id);setRenameValue("");}}>Resolve name →</button>}</td></tr>)}
      {!unresolved.length&&<tr><td colSpan="4"><div className="ops-mini-empty success">All current TRIDs have trusted names.</div></td></tr>}
    </tbody></table></div></section>

    <section className="panel data-quality-unmatched"><div className="panel-head"><div><h2>Unmatched imported records</h2><p>Map ambiguous or name-only source records once; the alias is remembered for future imports.</p></div><span className="panel-badge">{unmatched.length}</span></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Source name</th><th>TRID</th><th>Week</th><th>Type</th><th>Map to driver</th><th /></tr></thead><tbody>
      {unmatched.map((record)=><tr key={record.id}><td>{record.raw_name||"—"}</td><td>{record.raw_trid||"—"}</td><td>{record.week_label||"—"}</td><td>{record.report_type||"—"}</td><td><select aria-label={`Match ${record.raw_name || record.raw_trid || "unmatched record"} to driver`} value={choice[record.id]||""} onChange={(e)=>setChoice((c)=>({...c,[record.id]:e.target.value}))}><option value="">Choose trusted driver…</option>{drivers.filter((d)=>isUsablePersonName(d.full_name)).map((driver)=><option key={driver.id} value={driver.id}>{driver.full_name} · {driver.trid}</option>)}</select></td><td><button className="btn primary compact" disabled={!choice[record.id]||busy===record.id} onClick={()=>resolveRecord(record)}>Resolve</button></td></tr>)}
      {!unmatched.length&&<tr><td colSpan="6"><div className="ops-mini-empty success">No unmatched imported records.</div></td></tr>}
    </tbody></table></div></section>
  </>;
}


