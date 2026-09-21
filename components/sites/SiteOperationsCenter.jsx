"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { fetchSiteOperationsData, driverOperationalSnapshot } from "../../lib/data/operationsV4";
import RootCausePanel from "../intelligence/RootCausePanel";
import WavePlanView from "./WavePlanView";

function dateLabel(value){
  if(!value)return"—";
  const d=new Date(value);
  return Number.isFinite(d.getTime())?d.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}):String(value);
}

function driverShape(row){
  return {
    id:row.drivers?.trid||"—",
    dbId:row.driver_id,
    name:row.drivers?.full_name||"Driver",
    site:row.drivers?.site||"",
    risk:row.risk||"Medium",
    issue:row.issue||"Site Operations review",
  };
}

function tierClass(value){return "tier-"+String(value||"unrated").toLowerCase().replaceAll(" ","-");}

export default function SiteOperationsCenter({
  organizationId,
  sites=[],
  siteFilter="all",
  onSiteFilterChange,
  onOpenDriver,
  onOpenEvidence,
  onOpenCoaching,
  onOpenImports,
  onOpenDataQuality,
  onOpenScorecards,
}){
  const [selectedSite,setSelectedSite]=useState(siteFilter!=="all"?siteFilter:(sites[0]||""));
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [tab,setTab]=useState("overview");

  useEffect(()=>{
    if(siteFilter!=="all"&&siteFilter!==selectedSite)setSelectedSite(siteFilter);
    if(!selectedSite&&sites.length)setSelectedSite(sites[0]);
  },[siteFilter,sites.join("|")]);

  async function load(){
    if(!organizationId||!selectedSite){setData(null);return;}
    setLoading(true);setError("");
    try{setData(await fetchSiteOperationsData(getSupabaseBrowserClient(),organizationId,selectedSite));}
    catch(e){setError(e?.message||"Could not load Site Operations Center.");}
    finally{setLoading(false);}
  }
  useEffect(()=>{load();},[organizationId,selectedSite]);

  const cards=data?.cards||[];
  const latestCard=cards[0]||null;
  const previousCard=cards[1]||null;
  const latestRows=data?.latestRows||[];
  const driverRows=useMemo(()=>latestRows.map((row)=>({...row,ops:driverOperationalSnapshot(row)})),[latestRows]);
  const attention=useMemo(()=>[...driverRows].sort((a,b)=>
    (a.ops.score??-1)-(b.ops.score??-1)||
    b.ops.lostPoints-a.ops.lostPoints
  ),[driverRows]);

  const tierCounts=useMemo(()=>{
    const counts={"Fantastic Plus":0,"Fantastic":0,"Great":0,"Fair":0,"Poor":0,"Unrated":0};
    for(const row of driverRows)counts[row.ops.tier]=(counts[row.ops.tier]||0)+1;
    return counts;
  },[driverRows]);

  const activeIncidents=(data?.incidents||[]).filter((x)=>!["closed","resolved"].includes(x.status));
  const highIncidents=activeIncidents.filter((x)=>["critical","high"].includes(x.severity));
  const activeCoaching=(data?.coaching||[]).filter((x)=>x.status!=="closed");
  const overdueCoaching=activeCoaching.filter((x)=>x.due_at&&new Date(x.due_at)<new Date());
  const activeTasks=(data?.tasks||[]).filter((x)=>!["done","dismissed"].includes(x.status));
  const failedImports=(data?.imports||[]).filter((x)=>x.status==="failed"||x.error_message);
  const fairPoor=driverRows.filter((x)=>["Fair","Poor"].includes(x.ops.tier));
  const ficoFails=driverRows.filter((x)=>{
    const v=Number(x.mentor_score??x.ementor??x.fico);
    return Number.isFinite(v)&&v<815;
  });

  const siteDelta=latestCard?.overall_score!=null&&previousCard?.overall_score!=null
    ? Number(latestCard.overall_score)-Number(previousCard.overall_score)
    : null;

  const aggregateResult=useMemo(()=>({
    score:data?.rootCauses?.averageScore==null?null:Number(data.rootCauses.averageScore.toFixed(1)),
    tier:"Site aggregate",
    maxScore:100,
    pointsLost:data?.rootCauses?.causes?.reduce((sum,x)=>sum+x.pointsLost,0)||0,
    coverage:latestRows.length?Math.round(latestRows.reduce((sum,row)=>{
      const snapshot=driverOperationalSnapshot(row);
      return sum+(snapshot.rootCause.coverage||0);
    },0)/latestRows.length):0,
    components:(data?.rootCauses?.causes||[]).map((item)=>({
      key:item.key,label:item.label,maxPoints:item.maxPoints,
      points:item.maxPoints-(latestRows.length?item.pointsLost/latestRows.length:0),
      lostPoints:latestRows.length?Number((item.pointsLost/latestRows.length).toFixed(1)):0,
      missing:item.missingDrivers>0,
    })),
    opportunities:(data?.rootCauses?.causes||[]).map((item)=>({
      ...item,lostPoints:item.pointsLost,recoverableNext:item.recoverableNext,
      nextTarget:{label:item.affectedDrivers+" affected driver"+(item.affectedDrivers===1?"":"s")},
    })),
  }),[data,latestRows]);

  function changeSite(value){
    setSelectedSite(value);
    onSiteFilterChange?.(value);
  }

  if(!selectedSite)return <section className="panel siteopsv4-empty"><b>No site available</b><span>Import site or driver scorecard evidence first.</span></section>;

  return <div className="siteopsv4-root">
    <div className="siteopsv4-heading">
      <div><span className="page-kicker">SITE OPERATIONS CENTER</span><h1>{selectedSite} Control Room</h1><p>Current scorecard, driver distribution, root causes, incidents, coaching and reporting health in one site view.</p></div>
      <div className="siteopsv4-heading-actions"><select value={selectedSite} onChange={(e)=>changeSite(e.target.value)}>{sites.map((site)=><option key={site}>{site}</option>)}</select><button className="btn ghost" onClick={load}>Refresh</button><button className="btn primary" onClick={onOpenScorecards}>Open Site Scorecards</button></div>
    </div>
    {error&&<div className="mgrv2-notice error">{error}</div>}

    <section className="siteopsv4-hero">
      <div><span>CURRENT SITE</span><h2>{latestCard?.standing||"Operational view"}</h2><p>{latestCard?.week_label||"Latest driver evidence"}{latestCard?.site_rank!=null?" · Site rank "+latestCard.site_rank:""}{siteDelta!=null?" · "+(siteDelta>0?"+":"")+siteDelta.toFixed(2)+" WoW":""}</p></div>
      <div><span>Overall score</span><strong>{latestCard?.overall_score??(data?.rootCauses?.averageScore!=null?Number(data.rootCauses.averageScore).toFixed(1):"—")}</strong><small>{previousCard?.overall_score!=null?"Previous "+previousCard.overall_score:"No prior site score"}</small></div>
    </section>

    <section className="siteopsv4-kpis">
      <article><span>Drivers</span><strong>{driverRows.length}</strong><small>{fairPoor.length} Fair / Poor</small></article>
      <article className={ficoFails.length?"warn":""}><span>FICO &lt; 815</span><strong>{ficoFails.length}</strong><small>Safety coaching signal</small></article>
      <article className={highIncidents.length?"bad":""}><span>Open incidents</span><strong>{activeIncidents.length}</strong><small>{highIncidents.length} high / critical</small></article>
      <article className={overdueCoaching.length?"bad":""}><span>Coaching</span><strong>{activeCoaching.length}</strong><small>{overdueCoaching.length} overdue</small></article>
      <article><span>Manager tasks</span><strong>{activeTasks.length}</strong><small>Open site actions</small></article>
      <article className={(data?.unmatched||[]).length?"warn":""}><span>Data quality</span><strong>{(data?.unmatched||[]).length}</strong><small>Unmatched records</small></article>
      <article className={failedImports.length?"bad":""}><span>Import issues</span><strong>{failedImports.length}</strong><small>Recent failures</small></article>
    </section>

    <div className="siteopsv4-tabs">
      {[
        ["overview","Overview"],["wave-plan","Wave Plan"],["drivers","Drivers"],["root-cause","Root Cause"],
        ["actions","Actions"],["incidents","Incidents"],["reporting","Reporting Health"],
      ].map(([id,label])=><button key={id} className={tab===id?"active":""} onClick={()=>setTab(id)}>{label}</button>)}
    </div>

    {tab==="wave-plan"?<WavePlanView site={selectedSite}/>:loading?<section className="panel siteopsv4-empty"><div className="auth-spinner"/><b>Loading {selectedSite} operations…</b></section>:<>
      {tab==="overview"&&<section className="siteopsv4-overview">
        <article className="panel"><div className="panel-head"><div><h2>Tier distribution</h2><p>Latest driver scorecard tier in the selected site.</p></div><span className="panel-badge">{driverRows.length}</span></div><div className="siteopsv4-tiers">{Object.entries(tierCounts).map(([tier,count])=><div key={tier}><span className={tierClass(tier)}>{tier}</span><strong>{count}</strong><i style={{width:(driverRows.length?count/driverRows.length*100:0)+"%"}}/></div>)}</div></article>
        <article className="panel"><div className="panel-head"><div><h2>Management focus</h2><p>Highest-impact operational items at {selectedSite}.</p></div></div><div className="siteopsv4-focus">
          <button onClick={onOpenCoaching}><span>Fair / Poor drivers</span><strong>{fairPoor.length}</strong><small>Open coaching workflow →</small></button>
          <button onClick={onOpenEvidence}><span>High incidents</span><strong>{highIncidents.length}</strong><small>Open investigations →</small></button>
          <button onClick={onOpenDataQuality}><span>Unmatched evidence</span><strong>{(data?.unmatched||[]).length}</strong><small>Resolve identities →</small></button>
          <button onClick={onOpenImports}><span>Import failures</span><strong>{failedImports.length}</strong><small>Open Import Center →</small></button>
        </div></article>
        <article className="panel siteopsv4-attention"><div className="panel-head"><div><h2>Drivers needing attention</h2><p>Lowest Total Score first.</p></div><button className="profile-link" onClick={()=>setTab("drivers")}>View all →</button></div><div>{attention.slice(0,8).map((row)=><button key={row.driver_id} onClick={()=>onOpenDriver?.(driverShape(row))}><span className={tierClass(row.ops.tier)}>{row.ops.tier}</span><p><b>{row.drivers?.full_name}</b><small>{row.drivers?.trid||"—"} · {row.week_label||"—"} · {row.ops.primaryCause||"No current loss"}</small></p><strong>{row.ops.score??"—"}</strong></button>)}</div></article>
      </section>}

      {tab==="drivers"&&<section className="panel"><div className="panel-head"><div><h2>{selectedSite} driver register</h2><p>Latest Total Score with current root cause.</p></div></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Driver</th><th>Week</th><th>Total Score</th><th>Tier</th><th>FICO</th><th>DCR</th><th>POD</th><th>CC</th><th>Points Lost</th><th>Primary Cause</th><th /></tr></thead><tbody>{attention.map((row)=><tr key={row.driver_id}><td><b>{row.drivers?.full_name}</b><small className="history-date">{row.drivers?.trid||"—"}</small></td><td>{row.week_label||"—"}</td><td><b>{row.ops.score??"—"}</b></td><td><span className={tierClass(row.ops.tier)}>{row.ops.tier}</span></td><td>{row.mentor_score??row.ementor??row.fico??"—"}</td><td>{row.dcr??"—"}</td><td>{row.pod??"—"}</td><td>{row.cc??"—"}</td><td>{row.ops.lostPoints}</td><td>{row.ops.primaryCause||"—"}</td><td><button className="profile-link" onClick={()=>onOpenDriver?.(driverShape(row))}>Driver 360 →</button></td></tr>)}</tbody></table></div></section>}

      {tab==="root-cause"&&<RootCausePanel result={aggregateResult} title={selectedSite+" Root-Cause Engine"} subtitle="Average point-band loss by scorecard component across the latest driver evidence."/>}

      {tab==="actions"&&<section className="siteopsv4-two">
        <article className="panel"><div className="panel-head"><div><h2>Manager tasks</h2><p>Open operational actions linked to this site.</p></div><span className="panel-badge">{activeTasks.length}</span></div><div className="siteopsv4-action-list">{activeTasks.slice(0,20).map((item)=><div key={item.id}><span className={"mgrv2-severity "+item.priority}>{item.priority}</span><p><b>{item.title}</b><small>{item.driver_name||"Site action"} · {item.status}{item.due_at?" · Due "+dateLabel(item.due_at):""}</small></p></div>)}{!activeTasks.length&&<div className="siteopsv4-empty compact">No open manager tasks.</div>}</div></article>
        <article className="panel"><div className="panel-head"><div><h2>Coaching follow-up</h2><p>Open interventions at {selectedSite}.</p></div><button className="profile-link" onClick={onOpenCoaching}>Coaching V3 →</button></div><div className="siteopsv4-action-list">{activeCoaching.slice(0,20).map((item)=><div key={item.id}><span className={"mgrv2-severity "+item.priority}>{item.priority}</span><p><b>{item.drivers?.full_name||"Driver"}</b><small>{item.title} · {item.status}{item.due_at?" · Due "+dateLabel(item.due_at):""}</small></p></div>)}{!activeCoaching.length&&<div className="siteopsv4-empty compact">No open coaching cases.</div>}</div></article>
      </section>}

      {tab==="incidents"&&<section className="panel"><div className="panel-head"><div><h2>Site incident register</h2><p>Operational investigations currently linked to {selectedSite}.</p></div><button className="btn primary" onClick={onOpenEvidence}>Open Evidence Center</button></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Severity</th><th>Incident</th><th>Driver</th><th>Type</th><th>Status</th><th>Week</th><th>Owner</th></tr></thead><tbody>{(data?.incidents||[]).slice(0,100).map((item)=><tr key={item.id}><td><span className={"mgrv2-severity "+item.severity}>{item.severity}</span></td><td><b>{item.title}</b></td><td>{item.driver_name||"—"}</td><td>{item.incident_type}</td><td>{item.status}</td><td>{item.week_label||"—"}</td><td>{item.assigned_name||"Unassigned"}</td></tr>)}{!(data?.incidents||[]).length&&<tr><td colSpan="7"><div className="siteopsv4-empty compact">No incidents for this site.</div></td></tr>}</tbody></table></div></section>}

      {tab==="reporting"&&<section className="siteopsv4-two">
        <article className="panel"><div className="panel-head"><div><h2>Scorecard history</h2><p>Recent site-level scorecard evidence.</p></div><button className="profile-link" onClick={onOpenScorecards}>Scorecards →</button></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Week</th><th>Overall</th><th>Standing</th><th>Rank</th><th>Source</th></tr></thead><tbody>{cards.map((card)=><tr key={card.id}><td><b>{card.week_label}</b></td><td>{card.overall_score??"—"}</td><td>{card.standing||"—"}</td><td>{card.site_rank??"—"}</td><td>{card.source_file||"—"}</td></tr>)}</tbody></table></div></article>
        <article className="panel"><div className="panel-head"><div><h2>Data health</h2><p>Reporting gaps that can weaken site conclusions.</p></div></div><div className="siteopsv4-health">
          <div><span>Latest driver evidence</span><strong>{driverRows.length}</strong><small>{latestCard?.week_label||"Latest available periods"}</small></div>
          <div className={(data?.unmatched||[]).length?"warn":""}><span>Unmatched records</span><strong>{(data?.unmatched||[]).length}</strong><small>Identity resolution required</small></div>
          <div className={failedImports.length?"bad":""}><span>Failed imports</span><strong>{failedImports.length}</strong><small>Recent workspace imports</small></div>
          <div><span>Site scorecards stored</span><strong>{cards.length}</strong><small>Up to 20 recent periods</small></div>
        </div></article>
      </section>}
    </>}
  </div>;
}
