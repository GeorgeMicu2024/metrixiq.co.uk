"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { fetchReportingV5Data, saveReportSnapshot } from "../../lib/data/reportingV5";
import {
  availableWeeks,
  buildExecutivePack,
  executivePackCsvRows,
  formatExecutivePackWhatsApp,
} from "../../lib/reports/executivePackV2";
import { toCsv } from "../../lib/reports/fleetReports";

const SECTION_OPTIONS = Object.freeze([
  ["executive","Executive Summary"],
  ["site-scorecard","Site Scorecard"],
  ["tiers","Tier Distribution"],
  ["root-causes","Root Causes"],
  ["movement","WoW Movement"],
  ["fico","FICO Exceptions"],
  ["concessions","Concessions"],
  ["incidents","Incidents"],
  ["coaching","Coaching"],
  ["data-quality","Data Quality"],
  ["actions","Next Actions"],
]);

const ALL_SECTIONS = SECTION_OPTIONS.map(([id])=>id);

function downloadText(filename,content,type){
  const blob=new Blob([content],{type});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),500);
}

function safeFile(value){
  return String(value||"report").replace(/[^a-z0-9_.-]+/gi,"-").replace(/-+/g,"-");
}

function fmt(value,digits=1){
  const n=Number(value);
  return Number.isFinite(n)?n.toFixed(digits).replace(/\.0$/,""):"—";
}

function severityClass(value){
  return ["critical","high"].includes(value)?"bad":value==="medium"?"warn":"neutral";
}

function siteOf(row){return String(row?.drivers?.site||row?.site||"").toUpperCase();}

function ReportPackPreview({pack,sections}){
  if(!pack)return null;
  const show=(id)=>sections.includes(id);
  const tiers=Object.entries(pack.fleet.tierDistribution||{});
  return <section className="reportv5-preview reportv5-print-area">
    <header className="reportv5-preview-header">
      <div><span>METRIXIQ EXECUTIVE MANAGEMENT PACK</span><h1>{pack.scope.site==="all"?"Workspace":pack.scope.site} · {pack.scope.weekLabel}</h1><p>Generated {new Date(pack.generatedAt).toLocaleString("en-GB")} · Evidence-grounded operational reporting</p></div>
      <div><b>{pack.fleet.drivers}</b><span>drivers in scope</span></div>
    </header>

    {pack.ai?.executive&&<section className="reportv5-section ai-executive-section">
      <div className="reportv5-section-title"><span>AI</span><div><h2>MetrixIQ AI Executive Brief</h2><p>Predictive, evidence-grounded management priorities.</p></div></div>
      <div className="reportv5-callout"><h3>{pack.ai.executive.headline}</h3><p>Decision confidence: {pack.ai.executive.confidence}%</p><small>{pack.ai.executive.caveat}</small></div>
      <div className="action-list">{pack.ai.executive.priorities.map((item,index)=><div className="action-item" key={item}><span>{String(index+1).padStart(2,"0")}</span><div><b>{item}</b></div></div>)}</div>
      <div className="reportv5-kpis"><article><span>Stale / Missing Reports</span><strong>{pack.ai.freshness.filter(x=>x.status!=="fresh").length}</strong></article><article><span>Deterioration Signals</span><strong>{pack.ai.predictions.filter(x=>x.deteriorating).length}</strong></article><article><span>Coaching Improved</span><strong>{pack.ai.coachingEffectiveness.filter(x=>x.outcomeSignal==="improved").length}</strong></article><article><span>AI Recovered</span><strong>{pack.ai.outcomes?.recovered||0}</strong></article><article><span>AI Escalate</span><strong>{pack.ai.outcomes?.deteriorating||0}</strong></article></div>
    </section>}

    {show("executive")&&<section className="reportv5-section">
      <div className="reportv5-section-title"><span>01</span><div><h2>Executive Summary</h2><p>Current management signal from stored evidence.</p></div></div>
      <div className="reportv5-callout"><h3>{pack.headline}</h3><p>{pack.summary}</p></div>
      <div className="reportv5-kpis">
        <article><span>Average Score</span><strong>{fmt(pack.fleet.averageScore)}</strong><small>/100</small></article>
        <article><span>Fair / Poor</span><strong>{pack.fleet.fairPoor}</strong><small>drivers</small></article>
        <article><span>FICO &lt;815</span><strong>{pack.fleet.ficoFails}</strong><small>drivers</small></article>
        <article><span>Concessions</span><strong>{pack.fleet.concessions}</strong><small>current scope</small></article>
        <article><span>Open Incidents</span><strong>{pack.incidents.open.length}</strong><small>{pack.incidents.high.length} high / critical</small></article>
        <article><span>Overdue Coaching</span><strong>{pack.coaching.overdue.length}</strong><small>{pack.coaching.open.length} open</small></article>
      </div>
    </section>}

    {show("site-scorecard")&&pack.siteScorecard&&<section className="reportv5-section">
      <div className="reportv5-section-title"><span>02</span><div><h2>Site Scorecard</h2><p>Stored DSP / site-level weekly scorecard.</p></div></div>
      <div className="reportv5-site-card">
        <div><span>Standing</span><strong>{pack.siteScorecard.standing||"—"}</strong></div>
        <div><span>Overall Score</span><strong>{fmt(pack.siteScorecard.overallScore,2)}</strong></div>
        <div><span>Site Rank</span><strong>{pack.siteScorecard.rank??"—"}</strong></div>
        <div><span>WoW</span><strong>{pack.siteScorecard.delta==null?"—":(pack.siteScorecard.delta>0?"+":"")+fmt(pack.siteScorecard.delta,2)}</strong><small>{pack.siteScorecard.previousWeek||"No previous"}</small></div>
      </div>
    </section>}

    {show("tiers")&&<section className="reportv5-section">
      <div className="reportv5-section-title"><span>03</span><div><h2>Tier Distribution</h2><p>Latest driver tier in the report scope.</p></div></div>
      <div className="reportv5-tier-grid">{tiers.map(([tier,count])=><article key={tier}><span className={"reportv5-tier "+tier.toLowerCase().replaceAll(" ","-")}>{tier}</span><strong>{count}</strong><i style={{width:(pack.fleet.drivers?count/pack.fleet.drivers*100:0)+"%"}}/></article>)}</div>
    </section>}

    {show("root-causes")&&<section className="reportv5-section">
      <div className="reportv5-section-title"><span>04</span><div><h2>Scorecard Root Causes</h2><p>Aggregated point loss across current driver scorecards.</p></div></div>
      <div className="reportv5-root-table">
        {(pack.rootCauses.causes||[]).map((item,index)=><div key={item.key}><b>{String(index+1).padStart(2,"0")}</b><p><strong>{item.label}</strong><small>{item.affectedDrivers} affected · {item.missingDrivers} missing</small></p><span>{fmt(item.pointsLost)} pts lost</span></div>)}
      </div>
    </section>}

    {show("movement")&&<section className="reportv5-section">
      <div className="reportv5-section-title"><span>05</span><div><h2>Weekly Movement</h2><p>Largest driver improvements and declines against prior stored periods.</p></div></div>
      <div className="reportv5-two">
        <article><h3>Top improvements</h3>{pack.improved.slice(0,8).map((row)=><div key={row.driver_id}><p><b>{row.driver_name}</b><small>{row.trid} · {row.previous_week||"prior"} → {row.week_label}</small></p><strong>+{fmt(row.delta)}</strong></div>)}{!pack.improved.length&&<p className="reportv5-empty">No comparable improvement evidence.</p>}</article>
        <article><h3>Largest declines</h3>{pack.declined.slice(0,8).map((row)=><div key={row.driver_id}><p><b>{row.driver_name}</b><small>{row.trid} · {row.previous_week||"prior"} → {row.week_label}</small></p><strong>{fmt(row.delta)}</strong></div>)}{!pack.declined.length&&<p className="reportv5-empty">No comparable decline evidence.</p>}</article>
      </div>
    </section>}

    {show("fico")&&<section className="reportv5-section">
      <div className="reportv5-section-title"><span>06</span><div><h2>FICO Exceptions</h2><p>Drivers below the 815 management threshold.</p></div></div>
      <div className="reportv5-list">{pack.ficoFails.map((row)=><div key={row.driver_id}><span className="bad">FICO</span><p><b>{row.driver_name}</b><small>{row.trid} · {row.site} · {row.week_label}</small></p><strong>{fmt(row.fico,0)}</strong></div>)}{!pack.ficoFails.length&&<div className="reportv5-ok">No FICO results below 815 in this scope.</div>}</div>
    </section>}

    {show("concessions")&&<section className="reportv5-section">
      <div className="reportv5-section-title"><span>07</span><div><h2>Concessions</h2><p>Current scorecard concession concentration.</p></div></div>
      <div className="reportv5-list">{pack.concessions.map((row)=><div key={row.driver_id}><span className={row.concessions>=3?"bad":"warn"}>CCN</span><p><b>{row.driver_name}</b><small>{row.trid} · {row.site}</small></p><strong>{row.concessions}</strong></div>)}{!pack.concessions.length&&<div className="reportv5-ok">No concessions recorded in the current scorecard scope.</div>}</div>
    </section>}

    {show("incidents")&&<section className="reportv5-section">
      <div className="reportv5-section-title"><span>08</span><div><h2>Operational Incidents</h2><p>Investigations associated with the selected site / week.</p></div></div>
      <div className="reportv5-list">{pack.incidents.open.slice(0,20).map((item)=><div key={item.id}><span className={severityClass(item.severity)}>{item.severity}</span><p><b>{item.title}</b><small>{item.driver_name||"Workspace"} · {item.incident_type} · {item.status}</small></p><strong>{item.week_label||"—"}</strong></div>)}{!pack.incidents.open.length&&<div className="reportv5-ok">No open incidents in this scope.</div>}</div>
    </section>}

    {show("coaching")&&<section className="reportv5-section">
      <div className="reportv5-section-title"><span>09</span><div><h2>Coaching Status</h2><p>Open interventions and follow-up pressure.</p></div></div>
      <div className="reportv5-list">{pack.coaching.open.slice(0,20).map((item)=><div key={item.id}><span className={item.due_at&&new Date(item.due_at)<new Date()?"bad":"neutral"}>{item.priority}</span><p><b>{item.drivers?.full_name||"Driver"}</b><small>{item.title} · {item.status}</small></p><strong>{item.due_at?new Date(item.due_at).toLocaleDateString("en-GB"):"—"}</strong></div>)}{!pack.coaching.open.length&&<div className="reportv5-ok">No open coaching cases in this scope.</div>}</div>
    </section>}

    {show("data-quality")&&<section className="reportv5-section">
      <div className="reportv5-section-title"><span>10</span><div><h2>Data Quality</h2><p>Evidence limitations that affect management confidence.</p></div></div>
      <div className="reportv5-site-card">
        <div><span>Unmatched evidence</span><strong>{pack.evidence.unresolved}</strong></div>
        <div><span>Feedback events</span><strong>{pack.evidence.feedbackCount}</strong></div>
        <div><span>DNR evidence</span><strong>{pack.evidence.dnrCount}</strong></div>
        <div><span>Failed imports</span><strong>{pack.operations.failedImports.length}</strong></div>
      </div>
    </section>}

    {show("actions")&&<section className="reportv5-section">
      <div className="reportv5-section-title"><span>11</span><div><h2>Next Management Actions</h2><p>Evidence-derived priorities for the next operating cycle.</p></div></div>
      <div className="reportv5-actions">{pack.actions.map((item,index)=><div key={item.title}><span>{String(index+1).padStart(2,"0")}</span><p><b>{item.title}</b><small>{item.detail}</small></p><em>{item.severity}</em></div>)}{!pack.actions.length&&<div className="reportv5-ok">No management action is being generated from the current evidence.</div>}</div>
    </section>}

    <footer className="reportv5-footer">MetrixIQ · Evidence-grounded management reporting · Generated from stored workspace data</footer>
  </section>;
}

export default function ReportBuilderV2({
  organizationId,
  sites=[],
  siteFilter="all",
  onSiteFilterChange,
}){
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [tab,setTab]=useState("builder");
  const [site,setSite]=useState(siteFilter||"all");
  const [week,setWeek]=useState("");
  const [group,setGroup]=useState("all");
  const [customDriverIds,setCustomDriverIds]=useState([]);
  const [sections,setSections]=useState(ALL_SECTIONS);
  const [pack,setPack]=useState(null);
  const [saving,setSaving]=useState(false);

  async function load(){
    if(!organizationId)return;
    setLoading(true);setError("");
    try{setData(await fetchReportingV5Data(getSupabaseBrowserClient(),organizationId));}
    catch(e){setError(e?.message||"Could not load Report Builder V2.");}
    finally{setLoading(false);}
  }
  useEffect(()=>{load();},[organizationId]);
  useEffect(()=>{if(siteFilter&&siteFilter!==site)setSite(siteFilter);},[siteFilter]);

  const weeks=useMemo(()=>availableWeeks(data||{},site),[data,site]);
  useEffect(()=>{if(!week||!weeks.includes(week))setWeek(weeks.at(-1)||"");},[weeks.join("|")]);

  const previewAll=useMemo(()=>data&&week?buildExecutivePack(data,{site,weekLabel:week}):null,[data,site,week]);
  const driverOptions=previewAll?.movement||[];

  function resolvedDriverIds(){
    if(!previewAll)return[];
    if(group==="custom")return customDriverIds;
    if(group==="fair-poor")return previewAll.movement.filter((x)=>["Fair","Poor"].includes(x.tier)).map((x)=>x.driver_id);
    if(group==="fico")return previewAll.ficoFails.map((x)=>x.driver_id);
    if(group==="improved")return previewAll.improved.map((x)=>x.driver_id);
    if(group==="declined")return previewAll.declined.map((x)=>x.driver_id);
    return null;
  }

  function generate(mode=tab){
    if(!data)return;
    const selectedSections=mode==="weekly"?ALL_SECTIONS:sections;
    const selectedIds=mode==="weekly"?null:resolvedDriverIds();
    const next=buildExecutivePack(data,{
      site,weekLabel:week||null,driverIds:selectedIds,sections:selectedSections,
    });
    setSections(selectedSections);
    setPack(next);
    setNotice(mode==="weekly"?"Weekly Executive Pack generated.":"Report preview generated.");
  }

  function changeSite(value){
    setSite(value);setWeek("");setPack(null);setCustomDriverIds([]);
    onSiteFilterChange?.(value);
  }

  function toggleSection(id){
    setSections((current)=>current.includes(id)?current.filter((x)=>x!==id):[...current,id]);
    setPack(null);
  }

  function toggleDriver(id){
    setCustomDriverIds((current)=>current.includes(id)?current.filter((x)=>x!==id):[...current,id]);
    setPack(null);
  }

  async function copyWhatsApp(){
    if(!pack)return;
    const text=formatExecutivePackWhatsApp(pack);
    try{await navigator.clipboard.writeText(text);setNotice("WhatsApp management summary copied.");}
    catch{downloadText(safeFile("metrixiq-"+pack.scope.site+"-"+pack.scope.weekLabel+"-whatsapp")+".txt",text,"text/plain;charset=utf-8");}
  }

  function exportCsv(){
    if(!pack)return;
    downloadText(
      safeFile("metrixiq-"+pack.scope.site+"-"+pack.scope.weekLabel+"-management-pack")+".csv",
      toCsv(executivePackCsvRows(pack)),
      "text/csv;charset=utf-8"
    );
    setNotice("Management Pack CSV exported.");
  }

  function printPack(){
    if(!pack)return;
    window.print();
  }

  async function savePack(){
    if(!pack||saving)return;
    setSaving(true);setError("");setNotice("");
    try{
      await saveReportSnapshot(getSupabaseBrowserClient(),{
        organizationId,
        reportType:tab==="weekly"?"weekly_executive_pack":"report_builder_v2",
        title:(pack.scope.site==="all"?"Workspace":pack.scope.site)+" "+pack.scope.weekLabel+" Management Pack",
        site:pack.scope.site==="all"?null:pack.scope.site,
        weekLabel:pack.scope.weekLabel,
        filters:{site:pack.scope.site,weekLabel:pack.scope.weekLabel,driverGroup:group,driverIds:resolvedDriverIds()||[]},
        sections,
        summary:{headline:pack.headline,summary:pack.summary,fleet:pack.fleet,actions:pack.actions},
        payload:pack,
      });
      setNotice("Report snapshot saved to MetrixIQ history.");
      await load();
    }catch(e){setError(e?.message||"Could not save report snapshot.");}
    finally{setSaving(false);}
  }

  function openSnapshot(item){
    if(!item.payload)return;
    setPack(item.payload);setSite(item.site||"all");setWeek(item.week_label||"");
    setSections(Array.isArray(item.sections)&&item.sections.length?item.sections:ALL_SECTIONS);
    setTab(item.report_type==="weekly_executive_pack"?"weekly":"builder");
    setNotice("Saved report snapshot loaded.");
  }

  if(loading)return <section className="panel reportv5-empty"><div className="auth-spinner"/><b>Loading Report Builder V2…</b></section>;

  return <div className="reportv5-root">
    <div className="reportv5-heading reportv5-no-print">
      <div><span className="page-kicker">REPORT BUILDER V2</span><h1>Management Reporting</h1><p>Build evidence-grounded executive reports from Scorecards, Root Cause, Incidents, Coaching and Data Quality.</p></div>
      <div><button className="btn ghost" onClick={load}>Refresh data</button>{pack&&<><button className="btn ghost" onClick={copyWhatsApp}>Copy WhatsApp</button><button className="btn ghost" onClick={exportCsv}>Export CSV</button><button className="btn primary" onClick={printPack}>Print / Save PDF</button></>}</div>
    </div>

    {error&&<div className="mgrv2-notice error reportv5-no-print">{error}</div>}
    {notice&&<div className="mgrv2-notice good reportv5-no-print">{notice}</div>}
    {data?.optionalErrors?.length>0&&<div className="analystv5-warning reportv5-no-print">Some optional evidence sources are unavailable under the current permissions; available sections remain usable.</div>}

    <div className="reportv5-tabs reportv5-no-print">
      <button className={tab==="builder"?"active":""} onClick={()=>{setTab("builder");setPack(null);}}>Report Builder</button>
      <button className={tab==="weekly"?"active":""} onClick={()=>{setTab("weekly");setGroup("all");setSections(ALL_SECTIONS);setPack(null);}}>Weekly Executive Pack</button>
      <button className={tab==="saved"?"active":""} onClick={()=>setTab("saved")}>Saved Reports</button>
    </div>

    {tab!=="saved"&&<section className="panel reportv5-controls reportv5-no-print">
      <div className="panel-head"><div><h2>{tab==="weekly"?"Generate Weekly Management Pack":"Build a custom management report"}</h2><p>{tab==="weekly"?"Complete executive preset with every management section enabled.":"Choose site, period, driver population and report sections."}</p></div></div>
      <div className="reportv5-filter-grid">
        <label><span>Site</span><select value={site} onChange={(e)=>changeSite(e.target.value)}><option value="all">All sites</option>{sites.map((value)=><option key={value}>{value}</option>)}</select></label>
        <label><span>Week</span><select value={week} onChange={(e)=>{setWeek(e.target.value);setPack(null);}}>{weeks.map((value)=><option key={value}>{value}</option>)}</select></label>
        {tab==="builder"&&<label><span>Driver scope</span><select value={group} onChange={(e)=>{setGroup(e.target.value);setPack(null);}}><option value="all">All drivers</option><option value="fair-poor">Fair / Poor only</option><option value="fico">FICO below 815</option><option value="improved">Improved drivers</option><option value="declined">Declined drivers</option><option value="custom">Custom drivers</option></select></label>}
        <button className="btn primary" disabled={!week} onClick={()=>generate(tab)}>{tab==="weekly"?"Generate "+(week||"Weekly")+" Management Pack":"Generate report"}</button>
      </div>

      {tab==="builder"&&<div className="reportv5-section-picker"><span>REPORT SECTIONS</span><div>{SECTION_OPTIONS.map(([id,label])=><label key={id}><input type="checkbox" checked={sections.includes(id)} onChange={()=>toggleSection(id)}/><b>{label}</b></label>)}</div></div>}

      {tab==="builder"&&group==="custom"&&<div className="reportv5-driver-picker"><span>CUSTOM DRIVER SCOPE · {customDriverIds.length} selected</span><div>{driverOptions.map((driver)=><label key={driver.driver_id}><input type="checkbox" checked={customDriverIds.includes(driver.driver_id)} onChange={()=>toggleDriver(driver.driver_id)}/><p><b>{driver.driver_name}</b><small>{driver.trid} · {driver.tier} · {fmt(driver.score)}/100</small></p></label>)}</div></div>}
    </section>}

    {tab==="saved"?<section className="panel reportv5-saved reportv5-no-print">
      <div className="panel-head"><div><h2>Saved report snapshots</h2><p>Immutable management snapshots saved at generation time.</p></div><span className="panel-badge">{data?.snapshots?.length||0}</span></div>
      <div>{(data?.snapshots||[]).map((item)=><button key={item.id} onClick={()=>openSnapshot(item)}><span>{item.report_type==="weekly_executive_pack"?"WEEKLY":"CUSTOM"}</span><p><b>{item.title}</b><small>{item.site||"All sites"} · {item.week_label||"—"} · {new Date(item.created_at).toLocaleString("en-GB")}</small></p><em>Open →</em></button>)}{!(data?.snapshots||[]).length&&<div className="reportv5-empty">No saved report snapshots yet.</div>}</div>
    </section>:<>
      {!pack&&<section className="reportv5-ready reportv5-no-print">
        <article><span>01</span><h3>Select scope</h3><p>Choose site and week from stored operational evidence.</p></article>
        <article><span>02</span><h3>Generate</h3><p>MetrixIQ calculates scorecards, WoW movement, root causes and operational exceptions.</p></article>
        <article><span>03</span><h3>Publish</h3><p>Print / Save PDF, export CSV, copy WhatsApp summary or save a report snapshot.</p></article>
      </section>}
    </>}

    {pack&&<div className="reportv5-output">
      <div className="reportv5-output-actions reportv5-no-print">
        <div><span>GENERATED REPORT</span><b>{pack.scope.site==="all"?"Workspace":pack.scope.site} · {pack.scope.weekLabel}</b></div>
        <button className="btn ghost" onClick={copyWhatsApp}>Copy WhatsApp</button>
        <button className="btn ghost" onClick={exportCsv}>Export CSV</button>
        <button className="btn ghost" disabled={saving} onClick={savePack}>{saving?"Saving…":"Save snapshot"}</button>
        <button className="btn primary" onClick={printPack}>Print / Save PDF</button>
      </div>
      <ReportPackPreview pack={pack} sections={sections}/>
    </div>}
  </div>;
}
