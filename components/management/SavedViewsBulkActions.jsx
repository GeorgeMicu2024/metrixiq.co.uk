"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { fetchDriverScorecardData } from "../../lib/data/scorecardData";
import { applyMetricOverrides, bulkMarkReviewed, bulkOpenCoachingCases, deleteView, fetchMetricOverrides, fetchSavedViews, saveView, setDefaultView } from "../../lib/data/governanceV2";
import { calculateDriverScorecard } from "../../lib/scorecards/driverScoreFormula";

function tier(score){
  if(score==null)return "Unrated"; if(score<50)return "Poor"; if(score<70)return "Fair"; if(score<85)return "Great"; if(score<93)return "Fantastic"; return "Fantastic Plus";
}
function num(v){const n=Number(v);return Number.isFinite(n)?n:null;}
function pct(v){const n=num(v);return n!=null&&n>0&&n<=1?n*100:n;}

export default function SavedViewsBulkActions({ organizationId, siteFilter="all", canBulk=false }) {
  const [rows,setRows]=useState([]);
  const [views,setViews]=useState([]);
  const [selected,setSelected]=useState(new Set());
  const [filters,setFilters]=useState({tier:"all",ficoFail:false,concessions:false,missing:false,search:""});
  const [viewName,setViewName]=useState("");
  const [shared,setShared]=useState(false);
  const [busy,setBusy]=useState("");
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");

  async function load(){
    if(!organizationId)return;
    setError("");
    try{
      const supabase=getSupabaseBrowserClient();
      const [scorecards,overrides,saved]=await Promise.all([
        fetchDriverScorecardData(supabase,organizationId),
        fetchMetricOverrides(supabase,organizationId,"active"),
        fetchSavedViews(supabase,organizationId,"driver-scorecards"),
      ]);
      const applied=applyMetricOverrides(scorecards.rows,overrides);
      const latest=applied.reduce((map,row)=>{
        const key=row.driver_id; const order=String(row.period_end||row.period_start||"");
        const prev=map.get(key); if(!prev||order>String(prev.period_end||prev.period_start||""))map.set(key,row); return map;
      },new Map());
      setRows([...latest.values()].map((row)=>{const result=calculateDriverScorecard(row);return {...row,totalScore:result.value,tier:tier(result.value),coverage:result.coverage,driverName:row.drivers?.full_name||"Driver",trid:row.drivers?.trid||"",site:row.drivers?.site||""};}));
      setViews(saved);
      const def=saved.find((v)=>v.is_default); if(def)setFilters((current)=>({...current,...(def.filters||{})}));
    }catch(e){setError(e?.message||"Could not load saved views.");}
  }
  useEffect(()=>{load();},[organizationId]);

  const visible=useMemo(()=>{
    const q=filters.search.trim().toLowerCase();
    return rows.filter((row)=>{
      if(siteFilter!=="all"&&row.site!==siteFilter)return false;
      if(filters.tier!=="all"&&row.tier!==filters.tier)return false;
      const fico=num(row.mentor_score??row.ementor??row.fico);
      if(filters.ficoFail&&!(fico!=null&&fico<815))return false;
      if(filters.concessions&&!(num(row.concessions)>0))return false;
      if(filters.missing&&row.coverage>=9)return false;
      if(q&&!`${row.driverName} ${row.trid}`.toLowerCase().includes(q))return false;
      return true;
    }).sort((a,b)=>(b.totalScore??-1)-(a.totalScore??-1));
  },[rows,filters,siteFilter]);

  function toggle(id){setSelected((current)=>{const next=new Set(current);next.has(id)?next.delete(id):next.add(id);return next;});}
  function selectVisible(){setSelected(new Set(visible.map((r)=>r.driver_id)));}
  function clear(){setSelected(new Set());}

  async function saveCurrent(){
    if(!viewName.trim())return;
    setBusy("save"); setError("");
    try{
      await saveView(getSupabaseBrowserClient(),{organizationId,name:viewName.trim(),viewType:"driver-scorecards",filters,shared});
      setViewName("");setNotice("Saved view created.");await load();
    }catch(e){setError(e?.message||"Could not save view.");}finally{setBusy("");}
  }
  async function removeView(id){setBusy(id);try{await deleteView(getSupabaseBrowserClient(),id);await load();}catch(e){setError(e?.message||"Could not delete view.");}finally{setBusy("");}}
  async function makeDefault(id){setBusy(id);try{await setDefaultView(getSupabaseBrowserClient(),organizationId,id);await load();}catch(e){setError(e?.message||"Could not set default view.");}finally{setBusy("");}}

  async function bulkCoach(){
    if(!canBulk||!selected.size)return;
    const reason=window.prompt("Reason / coaching objective:","Weekly performance review");
    if(reason===null)return;
    setBusy("coach");
    try{
      const count=await bulkOpenCoachingCases(getSupabaseBrowserClient(),{organizationId,driverIds:[...selected],title:"Bulk coaching review",reason,priority:"medium",weekLabel:visible[0]?.week_label||null});
      setNotice(`${count} coaching case${count===1?"":"s"} created.`);clear();
    }catch(e){setError(e?.message||"Bulk coaching failed.");}finally{setBusy("");}
  }
  async function markReviewed(){
    if(!canBulk||!selected.size)return;
    const note=window.prompt("Review note:","Weekly scorecard reviewed");
    if(note===null)return;
    setBusy("review");
    try{
      const count=await bulkMarkReviewed(getSupabaseBrowserClient(),{organizationId,driverIds:[...selected],weekLabel:visible[0]?.week_label||null,note});
      setNotice(`${count} driver${count===1?"":"s"} marked reviewed.`);clear();
    }catch(e){setError(e?.message||"Bulk review failed.");}finally{setBusy("");}
  }
  function exportCsv(){
    const exportRows=selected.size?visible.filter((r)=>selected.has(r.driver_id)):visible;
    const lines=[["Driver","TRID","Site","Week","Total Score","Tier","FICO","DCR","POD","CC","Concessions","Coverage"],...exportRows.map((r)=>[r.driverName,r.trid,r.site,r.week_label,r.totalScore,r.tier,r.mentor_score??r.ementor??r.fico,pct(r.dcr),pct(r.pod),pct(r.cc),r.concessions,`${r.coverage}/9`])];
    const quote=(v)=>`"${String(v??"").replaceAll('"','""')}"`; const blob=new Blob([lines.map((x)=>x.map(quote).join(",")).join("\r\n")],{type:"text/csv"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="metrixiq-saved-view.csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),500);
  }

  return <div className="viewsv2-root">
    <div className="gov-heading"><div><span className="page-kicker">SAVED VIEWS & BULK ACTIONS</span><h1>Management Views</h1><p>Reusable driver filters with controlled multi-driver actions.</p></div></div>
    {error&&<div className="gov-notice error">{error}</div>}{notice&&<div className="gov-notice">{notice}</div>}
    <section className="viewsv2-layout">
      <aside className="panel viewsv2-saved"><div className="panel-head"><div><h2>Saved views</h2><p>Personal and shared filters.</p></div><span className="panel-badge">{views.length}</span></div>
        <div>{views.map((view)=><article key={view.id} className={view.is_default?"default":""}><button onClick={()=>setFilters((c)=>({...c,...(view.filters||{})}))}><b>{view.name}</b><small>{view.shared?"Shared":"Personal"}{view.is_default?" · Default":""}</small></button><div><button disabled={busy===view.id} onClick={()=>makeDefault(view.id)}>★</button><button disabled={busy===view.id} onClick={()=>removeView(view.id)}>×</button></div></article>)}</div>
        <div className="viewsv2-save"><input value={viewName} onChange={(e)=>setViewName(e.target.value)} placeholder="New view name"/><label><input type="checkbox" checked={shared} onChange={(e)=>setShared(e.target.checked)}/> Share with workspace</label><button className="btn primary" disabled={!viewName.trim()||busy==="save"} onClick={saveCurrent}>Save current view</button></div>
      </aside>
      <main>
        <section className="panel viewsv2-filter"><div className="viewsv2-filter-grid"><input value={filters.search} onChange={(e)=>setFilters((f)=>({...f,search:e.target.value}))} placeholder="Search name or TRID…"/><select value={filters.tier} onChange={(e)=>setFilters((f)=>({...f,tier:e.target.value}))}><option value="all">All tiers</option>{["Fantastic Plus","Fantastic","Great","Fair","Poor"].map((t)=><option key={t}>{t}</option>)}</select><label><input type="checkbox" checked={filters.ficoFail} onChange={(e)=>setFilters((f)=>({...f,ficoFail:e.target.checked}))}/> FICO &lt; 815</label><label><input type="checkbox" checked={filters.concessions} onChange={(e)=>setFilters((f)=>({...f,concessions:e.target.checked}))}/> Concessions</label><label><input type="checkbox" checked={filters.missing} onChange={(e)=>setFilters((f)=>({...f,missing:e.target.checked}))}/> Missing data</label></div></section>
        <section className="viewsv2-actions"><div><b>{selected.size}</b><span> selected</span></div><button onClick={selectVisible}>Select visible</button><button onClick={clear}>Clear</button><button onClick={exportCsv}>Export CSV</button><button disabled={!canBulk||!selected.size||busy==="review"} onClick={markReviewed}>Mark reviewed</button><button className="primary" disabled={!canBulk||!selected.size||busy==="coach"} onClick={bulkCoach}>Create coaching</button></section>
        <section className="panel viewsv2-table"><div className="panel-head"><div><h2>Driver register</h2><p>{visible.length} drivers match the active view.</p></div></div><div className="table-wrap"><table className="data-table"><thead><tr><th><input type="checkbox" checked={visible.length>0&&visible.every((r)=>selected.has(r.driver_id))} onChange={(e)=>e.target.checked?selectVisible():clear()}/></th><th>Driver</th><th>Site</th><th>Week</th><th>Total Score</th><th>Tier</th><th>FICO</th><th>DCR</th><th>POD</th><th>CC</th><th>Concessions</th><th>Coverage</th></tr></thead><tbody>
          {visible.map((row)=><tr key={row.driver_id}><td><input type="checkbox" checked={selected.has(row.driver_id)} onChange={()=>toggle(row.driver_id)}/></td><td><b>{row.driverName}</b><small>{row.trid}</small></td><td>{row.site}</td><td>{row.week_label}</td><td><b>{row.totalScore==null?"—":Math.round(row.totalScore)}</b></td><td><span className={`viewsv2-tier ${String(row.tier).toLowerCase().replaceAll(" ","-")}`}>{row.tier}</span></td><td>{row.mentor_score??row.ementor??row.fico??"—"}</td><td>{pct(row.dcr)?.toFixed(2)??"—"}%</td><td>{pct(row.pod)?.toFixed(2)??"—"}%</td><td>{pct(row.cc)?.toFixed(2)??"—"}%</td><td>{row.concessions??"—"}</td><td>{row.coverage}/9</td></tr>)}
          {!visible.length&&<tr><td colSpan="12"><div className="gov-empty compact">No drivers match this view.</div></td></tr>}
        </tbody></table></div></section>
      </main>
    </section>
  </div>;
}
