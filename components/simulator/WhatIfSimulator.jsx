"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { fetchDriverScorecardData } from "../../lib/data/scorecardData";
import { applyMetricOverrides, fetchMetricOverrides } from "../../lib/data/governanceV2";
import {
  SIMULATOR_FIELDS,
  applyTargetPreset,
  createScenario,
  simulateDriver,
  teamImpact,
} from "../../lib/simulator/whatIf";

function driverName(row){return row?.drivers?.full_name||"Driver";}
function trid(row){return row?.drivers?.trid||"—";}
function site(row){return String(row?.drivers?.site||"").toUpperCase();}
function rowOrder(row){const raw=row?.period_end||row?.period_start||"";const d=raw?new Date(raw+"T12:00:00Z"):null;return d&&Number.isFinite(d.getTime())?d.getTime():Number(String(row?.week_label||"").replace(/\D/g,""))||0;}
function displayValue(field,value){if(value==null||value==="")return"—";const n=Number(value);if(!Number.isFinite(n))return String(value);return field.unit==="%"?n.toFixed(2)+"%":Number.isInteger(n)?String(n):n.toFixed(2);}

export default function WhatIfSimulator({organizationId,siteFilter="all",onOpenDriver}){
  const [rows,setRows]=useState([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [driverId,setDriverId]=useState("");
  const [week,setWeek]=useState("");
  const [scenario,setScenario]=useState({});
  const [preset,setPreset]=useState("");

  useEffect(()=>{
    let alive=true;
    if(!organizationId)return()=>{};
    (async()=>{
      setLoading(true);setError("");
      try{
        const supabase=getSupabaseBrowserClient();
        const [data,overrides]=await Promise.all([
          fetchDriverScorecardData(supabase,organizationId),
          fetchMetricOverrides(supabase,organizationId,"active"),
        ]);
        if(alive)setRows(applyMetricOverrides(data.rows||[],overrides));
      }catch(e){if(alive)setError(e?.message||"Could not load What-if Simulator.");}
      finally{if(alive)setLoading(false);}
    })();
    return()=>{alive=false;};
  },[organizationId]);

  const scoped=useMemo(()=>rows.filter((row)=>siteFilter==="all"||site(row)===siteFilter),[rows,siteFilter]);
  const driverOptions=useMemo(()=>{
    const map=new Map();
    for(const row of scoped){
      const current=map.get(row.driver_id);
      if(!current||rowOrder(row)>rowOrder(current))map.set(row.driver_id,row);
    }
    return [...map.values()].sort((a,b)=>driverName(a).localeCompare(driverName(b)));
  },[scoped]);

  useEffect(()=>{
    if(driverId&&driverOptions.some((row)=>row.driver_id===driverId))return;
    setDriverId(driverOptions[0]?.driver_id||"");
  },[driverOptions,driverId]);

  const driverRows=useMemo(()=>scoped.filter((row)=>row.driver_id===driverId).sort((a,b)=>rowOrder(b)-rowOrder(a)),[scoped,driverId]);

  useEffect(()=>{
    if(week&&driverRows.some((row)=>row.week_label===week))return;
    setWeek(driverRows[0]?.week_label||"");
  },[driverRows,week]);

  const currentRow=driverRows.find((row)=>row.week_label===week)||driverRows[0]||null;

  useEffect(()=>{
    if(currentRow){setScenario(createScenario(currentRow));setPreset("");}
  },[currentRow?.driver_id,currentRow?.week_label]);

  const result=useMemo(()=>currentRow?simulateDriver(currentRow,scenario):null,[currentRow,scenario]);
  const delta=result?.scoreDelta;
  const impact=teamImpact(delta,driverOptions.length);
  const changed=result?.projected?.components?.filter((item)=>item.deltaPoints!==0)||[];

  function update(key,value){setScenario((current)=>({...current,[key]:value}));setPreset("");}
  function applyPreset(value){setPreset(value);if(value==="reset")setScenario(createScenario(currentRow));else setScenario((current)=>applyTargetPreset(current,value));}
  function openDriver(){
    if(!currentRow)return;
    onOpenDriver?.({id:trid(currentRow),dbId:currentRow.driver_id,name:driverName(currentRow),site:site(currentRow),risk:result?.baselineTier?.label==="Poor"||result?.baselineTier?.label==="Fair"?"High":"Low",issue:"What-if scorecard scenario"});
  }

  if(loading)return <section className="panel simv2-empty"><div className="auth-spinner"/><b>Loading What-if Simulator…</b></section>;

  return <div className="simv2-root">
    <div className="simv2-heading">
      <div><span className="page-kicker">WHAT-IF SCORECARD SIMULATOR</span><h1>Performance Scenario Lab</h1><p>Change scorecard inputs and see the projected Total Score, tier and team impact instantly. Nothing here writes to source data.</p></div>
      <div className="simv2-safe">SIMULATION ONLY · NO DATA SAVED</div>
    </div>
    {error&&<div className="mgrv2-notice error">{error}</div>}

    <section className="simv2-selectors">
      <label><span>Driver</span><select value={driverId} onChange={(e)=>{setDriverId(e.target.value);setWeek("");}}>{driverOptions.map((row)=><option key={row.driver_id} value={row.driver_id}>{driverName(row)} · {trid(row)} · {site(row)||"—"}</option>)}</select></label>
      <label><span>Week</span><select value={week} onChange={(e)=>setWeek(e.target.value)}>{driverRows.map((row)=><option key={row.week_label+"-"+(row.period_end||"")} value={row.week_label}>{row.week_label} · {row.period_end||row.period_start||"—"}</option>)}</select></label>
      <label><span>Quick scenario</span><select value={preset} onChange={(e)=>applyPreset(e.target.value)}><option value="">Custom</option><option value="core-targets">Bring core KPIs to target</option><option value="max-safe">Max point-band score</option><option value="reset">Reset to actual</option></select></label>
      <button className="btn ghost" onClick={openDriver} disabled={!currentRow}>Open driver profile →</button>
    </section>

    {!currentRow?<section className="panel simv2-empty"><b>No scorecard evidence</b><span>Select a site or import scorecard data first.</span></section>:<>
      <section className="simv2-hero">
        <div><span>BASELINE</span><strong>{result.baseline.value==null?"—":Math.round(result.baseline.value)}</strong><b className={result.baselineTier.cls}>{result.baselineTier.label}</b><small>{currentRow.week_label} · {driverName(currentRow)}</small></div>
        <div className="simv2-arrow">→</div>
        <div><span>PROJECTED</span><strong>{result.projected.value==null?"—":Math.round(result.projected.value)}</strong><b className={result.projectedTier.cls}>{result.projectedTier.label}</b><small>{delta==null?"No comparison":(delta>0?"+":"")+delta+" points"}</small></div>
        <div className="simv2-impact"><span>TEAM IMPACT</span><strong>{impact==null?"—":(impact>0?"+":"")+impact.toFixed(2)}</strong><small>Approx. average driver-score impact if only this driver changes · {driverOptions.length} drivers in scope</small></div>
      </section>

      <section className="simv2-grid">
        <article className="panel simv2-input-panel">
          <div className="panel-head"><div><h2>Scenario inputs</h2><p>Edit the same nine metrics used by the point-band scorecard formula.</p></div><button className="link-btn" onClick={()=>applyPreset("reset")}>Reset actual</button></div>
          <div className="simv2-inputs">
            {SIMULATOR_FIELDS.map((field)=><label key={field.key} className={(String(scenario[field.key]??"")!==String(createScenario(currentRow)[field.key]??""))?"changed":""}><span>{field.label}</span><div><input type="number" value={scenario[field.key]??""} min={field.min} max={field.max} step={field.step} onChange={(e)=>update(field.key,e.target.value)}/><em>{field.unit}</em></div><small>Actual: {displayValue(field,createScenario(currentRow)[field.key])}</small></label>)}
          </div>
        </article>

        <article className="panel simv2-outcome-panel">
          <div className="panel-head"><div><h2>Projected outcome</h2><p>Point contribution changes caused by the scenario.</p></div><span className="panel-badge">{changed.length} changed components</span></div>
          <div className="simv2-outcome-summary">
            <div><span>Score change</span><strong className={delta>0?"good":delta<0?"bad":""}>{delta==null?"—":(delta>0?"+":"")+delta}</strong></div>
            <div><span>Projected tier</span><strong>{result.projectedTier.label}</strong></div>
            <div><span>Next tier gap</span><strong>{result.pointsToNextTier==null?"Top tier":result.pointsToNextTier.toFixed(1)+" pts"}</strong></div>
            <div><span>Evidence coverage</span><strong>{result.projected.coverage}/9</strong></div>
          </div>
          <div className="simv2-components">
            {result.projected.components.map((item)=><div key={item.key} className={item.deltaPoints>0?"improved":item.deltaPoints<0?"declined":""}><span>{item.label}</span><div><i style={{width:(item.points/item.maxPoints*100)+"%"}}/></div><b>{item.previousPoints} → {item.points}</b><em>{item.deltaPoints===0?"—":(item.deltaPoints>0?"+":"")+item.deltaPoints}</em></div>)}
          </div>
        </article>
      </section>

      <section className="panel simv2-guidance">
        <div className="panel-head"><div><h2>Scenario interpretation</h2><p>Use the simulator to prioritise coaching; do not treat it as a prediction of future behaviour.</p></div></div>
        <div className="simv2-guidance-grid">
          <article><span>Largest gain</span><strong>{[...changed].sort((a,b)=>b.deltaPoints-a.deltaPoints)[0]?.label||"No positive change"}</strong><small>{[...changed].sort((a,b)=>b.deltaPoints-a.deltaPoints)[0]?.deltaPoints>0?"+"+[...changed].sort((a,b)=>b.deltaPoints-a.deltaPoints)[0].deltaPoints+" points":"Adjust a metric to test impact"}</small></article>
          <article><span>Tier movement</span><strong>{result.baselineTier.label===result.projectedTier.label?"No tier change":result.baselineTier.label+" → "+result.projectedTier.label}</strong><small>Based on the exact point-band thresholds</small></article>
          <article><span>Use next</span><strong>{delta>0?"Create focused coaching":"Test a different scenario"}</strong><small>{delta>0?"Target the metrics producing the biggest point gain.":"Change one or two operational metrics at a time."}</small></article>
        </div>
      </section>
    </>}
  </div>;
}
