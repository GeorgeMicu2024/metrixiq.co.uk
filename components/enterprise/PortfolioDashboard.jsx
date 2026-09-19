"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import {
  addPortfolioOrganization,
  createEnterprisePortfolio,
  fetchMyPortfolios,
  fetchPortfolioBenchmark,
  fetchPortfolioOrganizations,
  fetchPortfolioWeeks,
  removePortfolioOrganization,
} from "../../lib/data/enterpriseV7";

function fmt(value,digits=1){
  const n=Number(value);
  return Number.isFinite(n)?n.toFixed(digits).replace(/\.0$/,""):"—";
}

function tierClass(value){
  return "tier-"+String(value||"unrated").toLowerCase().replaceAll(" ","-");
}

export default function PortfolioDashboard({
  organizationId,
  workspaceOptions=[],
  canManage=false,
  onSwitchWorkspace,
  onOpenEnterpriseSettings,
}){
  const [portfolios,setPortfolios]=useState([]);
  const [portfolioId,setPortfolioId]=useState("");
  const [organizations,setOrganizations]=useState([]);
  const [weeks,setWeeks]=useState([]);
  const [week,setWeek]=useState("");
  const [benchmark,setBenchmark]=useState([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [createOpen,setCreateOpen]=useState(false);
  const [portfolioName,setPortfolioName]=useState("");
  const [addOrgId,setAddOrgId]=useState("");
  const [addRegion,setAddRegion]=useState("");
  const [busy,setBusy]=useState("");

  async function loadPortfolios(preferred=null){
    const supabase=getSupabaseBrowserClient();
    const list=await fetchMyPortfolios(supabase);
    setPortfolios(list);
    const next=preferred&&list.some((x)=>x.id===preferred)?preferred:(portfolioId&&list.some((x)=>x.id===portfolioId)?portfolioId:list[0]?.id||"");
    setPortfolioId(next);
    return next;
  }

  async function loadPortfolio(id=portfolioId,selectedWeek=week){
    if(!id){
      setOrganizations([]);setWeeks([]);setBenchmark([]);return;
    }
    const supabase=getSupabaseBrowserClient();
    const [orgRows,weekRows]=await Promise.all([
      fetchPortfolioOrganizations(supabase,id),
      fetchPortfolioWeeks(supabase,id),
    ]);
    setOrganizations(orgRows);setWeeks(weekRows);
    const targetWeek=selectedWeek&&weekRows.some((x)=>x.week_label===selectedWeek)
      ?selectedWeek
      :(weekRows.at(-1)?.week_label||"");
    setWeek(targetWeek);
    setBenchmark(await fetchPortfolioBenchmark(supabase,id,targetWeek||null));
  }

  async function load(){
    setLoading(true);setError("");
    try{
      const id=await loadPortfolios();
      await loadPortfolio(id);
    }catch(e){setError(e?.message||"Could not load Enterprise Portfolio.");}
    finally{setLoading(false);}
  }
  useEffect(()=>{load();},[]);

  useEffect(()=>{
    if(!portfolioId)return;
    let alive=true;
    (async()=>{
      try{
        setLoading(true);
        await loadPortfolio(portfolioId,week);
      }catch(e){if(alive)setError(e?.message||"Could not load portfolio.");}
      finally{if(alive)setLoading(false);}
    })();
    return()=>{alive=false;};
  },[portfolioId]);

  async function changeWeek(value){
    setWeek(value);setBusy("week");setError("");
    try{setBenchmark(await fetchPortfolioBenchmark(getSupabaseBrowserClient(),portfolioId,value||null));}
    catch(e){setError(e?.message||"Could not load benchmark period.");}
    finally{setBusy("");}
  }

  async function createPortfolio(){
    if(!portfolioName.trim()||!organizationId||!canManage)return;
    setBusy("create");setError("");setNotice("");
    try{
      const id=await createEnterprisePortfolio(getSupabaseBrowserClient(),portfolioName.trim(),organizationId);
      setPortfolioName("");setCreateOpen(false);
      await loadPortfolios(id);
      await loadPortfolio(id);
      setNotice("Enterprise portfolio created with the current workspace attached.");
    }catch(e){setError(e?.message||"Could not create portfolio.");}
    finally{setBusy("");}
  }

  async function addOrganization(){
    if(!portfolioId||!addOrgId||!canManage)return;
    setBusy("add-org");setError("");setNotice("");
    try{
      await addPortfolioOrganization(getSupabaseBrowserClient(),{
        portfolioId,organizationId:addOrgId,region:addRegion||null,
      });
      setAddOrgId("");setAddRegion("");
      await loadPortfolio(portfolioId,week);
      setNotice("Organisation added to portfolio.");
    }catch(e){setError(e?.message||"Could not add organisation.");}
    finally{setBusy("");}
  }

  async function removeOrganization(item){
    if(!canManage||!window.confirm("Remove "+item.organization_name+" from this portfolio?"))return;
    setBusy("remove-"+item.organization_id);setError("");
    try{
      await removePortfolioOrganization(getSupabaseBrowserClient(),portfolioId,item.organization_id);
      await loadPortfolio(portfolioId,week);
      setNotice("Organisation removed from portfolio.");
    }catch(e){setError(e?.message||"Could not remove organisation.");}
    finally{setBusy("");}
  }

  const selectedPortfolio=portfolios.find((x)=>x.id===portfolioId)||null;
  const availableWorkspaces=workspaceOptions.filter((w)=>!organizations.some((o)=>o.organization_id===w.organization_id));
  const summary=useMemo(()=>{
    const sites=benchmark.length;
    const drivers=benchmark.reduce((s,x)=>s+Number(x.driver_count||0),0);
    const avgScore=benchmark.length?benchmark.reduce((s,x)=>s+Number(x.average_driver_score||0),0)/benchmark.length:null;
    const concessions=benchmark.reduce((s,x)=>s+Number(x.concessions||0),0);
    const fairPoor=benchmark.reduce((s,x)=>s+Number(x.fair_poor||0),0);
    return{sites,drivers,avgScore,concessions,fairPoor};
  },[benchmark]);

  if(loading&&!portfolios.length)return <section className="panel portfoliov7-empty"><div className="auth-spinner"/><b>Loading Enterprise Portfolio…</b></section>;

  if(!portfolios.length)return <div className="portfoliov7-root">
    <section className="portfoliov7-zero panel">
      <span className="page-kicker">ENTERPRISE PORTFOLIO V7</span>
      <h1>Build your multi-DSP portfolio</h1>
      <p>Group authorised MetrixIQ workspaces into one executive portfolio for cross-company and cross-site benchmarking.</p>
      {canManage?<div><input value={portfolioName} onChange={(e)=>setPortfolioName(e.target.value)} placeholder="Portfolio name, e.g. DCSL Group"/><button className="btn primary" disabled={!portfolioName.trim()||busy==="create"} onClick={createPortfolio}>Create portfolio</button></div>:<div className="mgrv2-notice">Portfolio creation requires Owner/Admin enterprise permission.</div>}
      {error&&<div className="mgrv2-notice error">{error}</div>}
    </section>
  </div>;

  return <div className="portfoliov7-root">
    <div className="portfoliov7-heading">
      <div><span className="page-kicker">ENTERPRISE PORTFOLIO V7</span><h1>Portfolio Intelligence</h1><p>Multi-organisation benchmarking, site performance and executive hierarchy from isolated tenant data.</p></div>
      <div>
        <select value={portfolioId} onChange={(e)=>{setPortfolioId(e.target.value);setWeek("");}}>
          {portfolios.map((p)=><option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={week} onChange={(e)=>changeWeek(e.target.value)} disabled={busy==="week"}>
          <option value="">Latest available</option>
          {weeks.map((w)=><option key={w.week_label} value={w.week_label}>{w.week_label}</option>)}
        </select>
        {canManage&&<button className="btn ghost" onClick={()=>setCreateOpen(true)}>+ Portfolio</button>}
        <button className="btn primary" onClick={onOpenEnterpriseSettings}>Enterprise Settings</button>
      </div>
    </div>

    {error&&<div className="mgrv2-notice error">{error}</div>}
    {notice&&<div className="mgrv2-notice good">{notice}</div>}

    <section className="portfoliov7-hero">
      <div><span>PORTFOLIO</span><h2>{selectedPortfolio?.name||"Enterprise"}</h2><p>{organizations.length} organisations · {summary.sites} reporting sites · {week||"latest"}</p></div>
      <div><span>Avg driver score</span><strong>{fmt(summary.avgScore)}</strong><small>Cross-site mean /100</small></div>
    </section>

    <section className="portfoliov7-kpis">
      <article><span>Organisations</span><strong>{organizations.length}</strong><small>Authorised tenants</small></article>
      <article><span>Sites</span><strong>{summary.sites}</strong><small>Benchmark rows</small></article>
      <article><span>Drivers</span><strong>{summary.drivers}</strong><small>Current benchmark scope</small></article>
      <article className={summary.fairPoor?"warn":""}><span>Fair / Poor</span><strong>{summary.fairPoor}</strong><small>Drivers below 70</small></article>
      <article className={summary.concessions?"warn":""}><span>Concessions</span><strong>{fmt(summary.concessions,0)}</strong><small>Current scope</small></article>
    </section>

    <section className="panel portfoliov7-benchmark">
      <div className="panel-head"><div><h2>Cross-site benchmark</h2><p>Ranking uses average exact driver Total Score across the selected portfolio period.</p></div><span className="panel-badge">{benchmark.length} sites</span></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>#</th><th>Organisation / Site</th><th>Region</th><th>Drivers</th><th>Avg Score</th><th>Site Score</th><th>Standing</th><th>FICO</th><th>DCR</th><th>POD</th><th>CC</th><th>Concessions</th><th>Fair/Poor</th><th /></tr></thead><tbody>
        {benchmark.map((row)=><tr key={row.organization_id+"-"+row.site}>
          <td><b>{row.benchmark_rank}</b></td>
          <td><b>{row.organization_name}</b><small className="history-date">{row.site} · {row.week_label||week||"latest"}</small></td>
          <td>{row.region||"—"}</td>
          <td>{row.driver_count}</td>
          <td><b>{fmt(row.average_driver_score)}</b></td>
          <td>{fmt(row.site_score,2)}</td>
          <td><span className={tierClass(row.standing)}>{row.standing||"—"}</span></td>
          <td>{fmt(row.average_fico,0)}</td>
          <td>{fmt(row.average_dcr,2)}%</td>
          <td>{fmt(row.average_pod,2)}%</td>
          <td>{fmt(row.average_cc,2)}%</td>
          <td>{fmt(row.concessions,0)}</td>
          <td>{row.fair_poor}</td>
          <td><button className="profile-link" onClick={()=>onSwitchWorkspace?.(row.organization_id)}>Open workspace →</button></td>
        </tr>)}
        {!benchmark.length&&<tr><td colSpan="14"><div className="portfoliov7-empty compact">No benchmark evidence for this portfolio period.</div></td></tr>}
      </tbody></table></div>
    </section>

    <section className="portfoliov7-orgs">
      <article className="panel">
        <div className="panel-head"><div><h2>Organisation hierarchy</h2><p>DSP workspaces attached to this portfolio.</p></div><span className="panel-badge">{organizations.length}</span></div>
        <div>{organizations.map((item)=><div key={item.organization_id}>
          <span>{String(item.display_name||item.organization_name).slice(0,2).toUpperCase()}</span>
          <p><b>{item.display_name||item.organization_name}</b><small>{item.region||"No region"} · {item.site_count} sites · {item.member_count} users · {String(item.plan||"free").toUpperCase()}</small></p>
          <button onClick={()=>onSwitchWorkspace?.(item.organization_id)}>Open</button>
          {canManage&&organizations.length>1&&<button className="danger" disabled={busy==="remove-"+item.organization_id} onClick={()=>removeOrganization(item)}>Remove</button>}
        </div>)}</div>
      </article>

      <article className="panel portfoliov7-add">
        <div className="panel-head"><div><h2>Add authorised workspace</h2><p>Only organisations you already manage can be linked. No tenant data is copied or merged.</p></div></div>
        {canManage?<><label><span>Workspace</span><select value={addOrgId} onChange={(e)=>setAddOrgId(e.target.value)}><option value="">Choose workspace…</option>{availableWorkspaces.map((w)=><option key={w.organization_id} value={w.organization_id}>{w.organization_name} · {w.role}</option>)}</select></label><label><span>Region (optional)</span><input value={addRegion} onChange={(e)=>setAddRegion(e.target.value)} placeholder="North, Midlands, London…"/></label><button className="btn primary" disabled={!addOrgId||busy==="add-org"} onClick={addOrganization}>Add to portfolio</button>{!availableWorkspaces.length&&<p>All workspaces you currently manage are already attached.</p>}</>:<p>Portfolio membership changes require Owner/Admin permission.</p>}
      </article>
    </section>

    {createOpen&&<div className="gov-modal" onClick={()=>setCreateOpen(false)}><div className="portfoliov7-modal" onClick={(e)=>e.stopPropagation()}><header><div><span>NEW PORTFOLIO</span><h2>Create enterprise portfolio</h2></div><button onClick={()=>setCreateOpen(false)}>×</button></header><section><label><span>Name</span><input value={portfolioName} onChange={(e)=>setPortfolioName(e.target.value)} placeholder="Portfolio name"/></label><p>The current workspace will be linked automatically. Other authorised workspaces can be added afterwards.</p><div><button className="btn ghost" onClick={()=>setCreateOpen(false)}>Cancel</button><button className="btn primary" disabled={!portfolioName.trim()||busy==="create"} onClick={createPortfolio}>Create portfolio</button></div></section></div></div>}
  </div>;
}
