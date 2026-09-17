"use client";

import { useEffect, useMemo, useState } from "react";
import { displayDriverName, isUsablePersonName } from "../lib/identity";
import { TARGETS } from "./HistoricalAnalytics";

const RANGE_OPTIONS = [1, 2, 4, 8, 12, 26, 52, "all"];

const n = (value) => value == null || value === "" || Number.isNaN(Number(value)) ? null : Number(value);
const fmtPct = (value, digits = 2) => n(value) == null ? "—" : `${Number(value).toFixed(digits)}%`;
const fmtNum = (value, digits = 0) => n(value) == null ? "—" : Number(value).toFixed(digits);
const weekNumber = (label) => Number(String(label || "").replace(/\D/g, "")) || 0;
const periodKey = (row) => row.week_label || row.period_end || row.period_start || "Unknown";

function resolvedName(driver) {
  const name = displayDriverName(driver);
  return name === "Unresolved identity" ? "Unresolved driver" : name;
}
function mentorScore(row) {
  return n(row?.mentor_score) ?? n(row?.ementor) ?? n(row?.fico);
}
function riskClass(risk) {
  return String(risk || "Low").toLowerCase() === "high" ? "bad" : String(risk || "Low").toLowerCase() === "medium" ? "warn" : "good";
}
function targetFor(metric) {
  return metric === "dcr" ? TARGETS.dcr :
    metric === "pod" ? TARGETS.pod :
    metric === "iadc" ? TARGETS.iadc :
    metric === "mentor" ? TARGETS.mentor : null;
}
function average(values) {
  const clean = values.map(n).filter((v) => v != null);
  return clean.length ? clean.reduce((a,b)=>a+b,0)/clean.length : null;
}
function driverIndex(row) {
  const values = [];
  if (n(row.dcr) != null) values.push(Math.min(105, Number(row.dcr) / TARGETS.dcr * 100));
  if (n(row.pod) != null) values.push(Math.min(105, Number(row.pod) / TARGETS.pod * 100));
  if (n(row.iadc) != null) values.push(Math.min(105, Number(row.iadc) / TARGETS.iadc * 100));
  const mentor = mentorScore(row);
  if (mentor != null) values.push(Math.min(105, mentor / TARGETS.mentor * 100));
  return values.length >= 2 ? values.reduce((a,b)=>a+b,0)/values.length : n(row.performance);
}
function metricStatus(metric, value) {
  const valueN = n(value);
  if (valueN == null) return "neutral";
  const target = targetFor(metric);
  if (target == null) return "neutral";
  return valueN >= target ? "good" : valueN >= target * 0.97 ? "warn" : "bad";
}
function selectWeeks(rows, range) {
  const weeks = [...new Set(rows.map((r)=>r.week_label).filter(Boolean))]
    .sort((a,b)=>weekNumber(a)-weekNumber(b));
  if (range === "all") return weeks;
  return weeks.slice(-Number(range));
}
function RangeTabs({ value, onChange }) {
  return <div className="pro-range-tabs">
    {RANGE_OPTIONS.map((option)=><button type="button" key={String(option)} className={value===option?"active":""} onClick={()=>onChange(option)}>
      {option==="all"?"All":`${option}W`}
    </button>)}
  </div>;
}
function MetricPill({ metric, value }) {
  const tone = metricStatus(metric, value);
  const shown = metric === "mentor" ? fmtNum(value) : fmtPct(value);
  return <span className={`pro-metric-pill ${tone}`}>{shown}</span>;
}
function EmptyRow({ columns, text }) {
  return <tr><td colSpan={columns}><div className="pro-empty-row">{text}</div></td></tr>;
}

export function ProDriversView({ drivers = [], onOpen, query = "" }) {
  const [localQuery,setLocalQuery] = useState(query);
  const [risk,setRisk] = useState("all");
  const [coverage,setCoverage] = useState("all");
  useEffect(()=>setLocalQuery(query),[query]);

  const filtered = useMemo(()=>{
    return drivers
      .filter((driver)=>{
        const text = `${driver.name||""} ${driver.id||""} ${driver.site||""}`.toLowerCase();
        if (!text.includes(localQuery.toLowerCase())) return false;
        if (risk !== "all" && String(driver.risk||"Low").toLowerCase() !== risk) return false;
        const dataPoints = [driver.dcr,driver.pod,driver.iadc,driver.mentor_score ?? driver.ementor ?? driver.fico].filter((v)=>n(v)!=null).length;
        if (coverage === "complete" && dataPoints < 3) return false;
        if (coverage === "partial" && dataPoints >= 3) return false;
        return true;
      })
      .sort((a,b)=>(n(b.performance)??-1)-(n(a.performance)??-1));
  },[drivers,localQuery,risk,coverage]);

  const unresolved = drivers.filter((d)=>!isUsablePersonName(d.name)).length;
  const coaching = drivers.filter((d)=>String(d.risk||"").toLowerCase()!=="low").length;
  const measured = drivers.filter((d)=>[d.dcr,d.pod,d.iadc,d.mentor_score ?? d.ementor ?? d.fico].some((v)=>n(v)!=null)).length;

  return <>
    <div className="page-heading pro-heading">
      <div><span className="page-kicker">OPERATIONS</span><h1>Driver directory</h1><p>One trusted profile per TRID with the latest available operational evidence.</p></div>
    </div>

    <section className="pro-kpi-grid">
      <article><span>Total drivers</span><strong>{drivers.length}</strong><small>DLS2 workspace</small></article>
      <article><span>Measured</span><strong>{measured}</strong><small>At least one current metric</small></article>
      <article className={coaching?"warn":""}><span>Needs attention</span><strong>{coaching}</strong><small>Medium or high risk</small></article>
      <article className={unresolved?"bad":""}><span>Unresolved identity</span><strong>{unresolved}</strong><small>Requires trusted mapping</small></article>
    </section>

    <section className="panel pro-table-panel">
      <div className="pro-filterbar">
        <input value={localQuery} onChange={(e)=>setLocalQuery(e.target.value)} placeholder="Search driver name, TRID or site…" />
        <select value={risk} onChange={(e)=>setRisk(e.target.value)}>
          <option value="all">All risk levels</option><option value="low">Low risk</option><option value="medium">Medium risk</option><option value="high">High risk</option>
        </select>
        <select value={coverage} onChange={(e)=>setCoverage(e.target.value)}>
          <option value="all">All data coverage</option><option value="complete">3+ core metrics</option><option value="partial">Partial evidence</option>
        </select>
        <span className="pro-filter-count">{filtered.length} shown</span>
      </div>
      <div className="table-wrap"><table className="data-table pro-directory-table">
        <thead><tr><th>Driver</th><th>Site</th><th>Index</th><th>DCR</th><th>POD</th><th>IADC</th><th>Mentor</th><th>Concessions</th><th>Risk</th><th /></tr></thead>
        <tbody>
          {filtered.map((driver)=>{
            const mentor = n(driver.mentor_score ?? driver.ementor ?? driver.fico);
            const unresolvedName = !isUsablePersonName(driver.name);
            return <tr key={`${driver.dbId||""}-${driver.id}`} className={unresolvedName?"pro-unresolved-row":""}>
              <td><div className="pro-driver-cell"><span>{unresolvedName?"?":String(driver.name||"D").split(/\s+/).slice(0,2).map((x)=>x[0]).join("").toUpperCase()}</span><div><b>{unresolvedName?"Unresolved driver":driver.name}</b><small>{driver.id}</small></div></div></td>
              <td><span className="site-chip">{driver.site||"DLS2"}</span></td>
              <td><div className="pro-index-cell"><b>{n(driver.performance)==null?"—":Math.round(driver.performance)}</b>{n(driver.performance)!=null&&<i style={{width:`${Math.min(100,Math.max(0,Number(driver.performance)))}%`}} />}</div></td>
              <td><MetricPill metric="dcr" value={driver.dcr}/></td>
              <td><MetricPill metric="pod" value={driver.pod}/></td>
              <td><MetricPill metric="iadc" value={driver.iadc}/></td>
              <td><MetricPill metric="mentor" value={mentor}/></td>
              <td><span className={`concession-badge ${(n(driver.concessions)||0)>=3?"bad":(n(driver.concessions)||0)>0?"warn":"good"}`}>{n(driver.concessions)==null?"—":Number(driver.concessions).toFixed(0)}</span></td>
              <td><span className={`pro-risk-chip ${riskClass(driver.risk)}`}>{driver.risk||"Low"}</span></td>
              <td><button type="button" className="profile-link" onClick={()=>onOpen?.(driver)}>Open profile →</button></td>
            </tr>;
          })}
          {!filtered.length&&<EmptyRow columns={10} text="No drivers match the current filters."/>}
        </tbody>
      </table></div>
    </section>
  </>;
}

function ProTrendChart({ points, metric }) {
  const clean = points.filter((p)=>n(p.value)!=null);
  if (!clean.length) return <div className="pro-chart-empty">No stored values for this metric in the selected period.</div>;
  const width=900,height=280,left=54,right=28,top=26,bottom=52;
  const target = targetFor(metric);
  const vals = clean.map((p)=>Number(p.value));
  if (target != null) vals.push(target);
  const rawMin=Math.min(...vals),rawMax=Math.max(...vals);
  const pad=Math.max(metric==="mentor"?8:0.5,(rawMax-rawMin)*0.2);
  const min=Math.max(0,rawMin-pad),max=Math.max(min+1,rawMax+pad);
  const x=(i)=>clean.length===1?width/2:left+i*((width-left-right)/(clean.length-1));
  const y=(v)=>top+(max-v)/(max-min)*(height-top-bottom);
  const path=clean.map((p,i)=>`${i?"L":"M"} ${x(i)} ${y(Number(p.value))}`).join(" ");
  const targetY=target!=null?y(target):null;
  const lineTone = target!=null && Number(clean.at(-1)?.value)<target ? "#d99128" : "#168b78";
  return <div className="pro-chart-wrap"><svg className="pro-trend-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
    {[0,1,2,3].map((i)=>{const yy=top+i*((height-top-bottom)/3);return <line key={i} x1={left} y1={yy} x2={width-right} y2={yy} stroke="#e7edf2" strokeWidth="1"/>})}
    {targetY!=null&&<><line x1={left} y1={targetY} x2={width-right} y2={targetY} stroke="#8e9baa" strokeWidth="2" strokeDasharray="8 8"/><text x={width-right} y={targetY-8} textAnchor="end" fontSize="11" fill="#6c7b8c">Target {metric==="mentor"?target:target.toFixed(2)}</text></>}
    <path d={path} fill="none" stroke={lineTone} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
    {clean.map((p,i)=><g key={p.label}><circle cx={x(i)} cy={y(Number(p.value))} r="6" fill="#fff" stroke={lineTone} strokeWidth="4"/><text x={x(i)} y={height-18} textAnchor="middle" fontSize="13" fill="#718093">{p.label}</text></g>)}
  </svg></div>;
}

function aggregateWeeks(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key=periodKey(row);
    const current=groups.get(key)||{label:key,rows:[],periodEnd:row.period_end||""};
    current.rows.push(row); if(row.period_end) current.periodEnd=row.period_end;
    groups.set(key,current);
  }
  return [...groups.values()].sort((a,b)=>weekNumber(a.label)-weekNumber(b.label)).map((g)=>({
    label:g.label,periodEnd:g.periodEnd,drivers:g.rows.length,
    dcr:average(g.rows.map((r)=>r.dcr)),pod:average(g.rows.map((r)=>r.pod)),iadc:average(g.rows.map((r)=>r.iadc)),
    cc:average(g.rows.map((r)=>r.cc)),mentor:average(g.rows.map(mentorScore)),
    concessions:average(g.rows.map((r)=>r.concessions)),performance:average(g.rows.map((r)=>driverIndex(r))),
  }));
}
function buildPerformanceLeaderboard(rows,weeks) {
  const weekSet=new Set(weeks);
  const map=new Map();
  for(const row of rows) {
    if(!weekSet.has(row.week_label)) continue;
    const driver=row.drivers||{};
    const id=row.driver_id||driver.trid;
    if(!id) continue;
    const current=map.get(id)||{id,driver,dcr:[],pod:[],iadc:[],mentor:[],scores:[]};
    if(n(row.dcr)!=null)current.dcr.push(Number(row.dcr));
    if(n(row.pod)!=null)current.pod.push(Number(row.pod));
    if(n(row.iadc)!=null)current.iadc.push(Number(row.iadc));
    if(mentorScore(row)!=null)current.mentor.push(mentorScore(row));
    if(driverIndex(row)!=null)current.scores.push(driverIndex(row));
    map.set(id,current);
  }
  return [...map.values()].map((x)=>({...x,dcr:average(x.dcr),pod:average(x.pod),iadc:average(x.iadc),mentor:average(x.mentor),index:average(x.scores)}))
    .filter((x)=>x.index!=null).sort((a,b)=>b.index-a.index);
}

export function ProPerformanceView({ rows = [], kpis = {}, onOpenDriver }) {
  const [range,setRange]=useState(4);
  const [metric,setMetric]=useState("performance");
  const allWeeks=useMemo(()=>aggregateWeeks(rows),[rows]);
  const selectedWeeks=range==="all"?allWeeks:allWeeks.slice(-Number(range));
  const selectedLabels=selectedWeeks.map((w)=>w.label);
  const leaderboard=useMemo(()=>buildPerformanceLeaderboard(rows,selectedLabels),[rows,selectedLabels.join("|")]);

  const cards=[
    ["DCR",selectedWeeks.at(-1)?.dcr ?? kpis.dcr,"dcr",`Target ≥ ${TARGETS.dcr.toFixed(2)}%`],
    ["POD",selectedWeeks.at(-1)?.pod ?? kpis.pod,"pod",`Target ≥ ${TARGETS.pod.toFixed(2)}%`],
    ["IADC",selectedWeeks.at(-1)?.iadc ?? kpis.iadc,"iadc",`Target ≥ ${TARGETS.iadc}%`],
    ["Mentor",selectedWeeks.at(-1)?.mentor ?? kpis.mentor,"mentor",`Target ≥ ${TARGETS.mentor}`],
    ["Contact Compliance",selectedWeeks.at(-1)?.cc ?? kpis.cc,"cc","Operational quality"],
    ["Concessions",selectedWeeks.at(-1)?.concessions ?? kpis.concessions,"concessions","Lower is better"],
  ];

  const points=selectedWeeks.map((w)=>({label:w.label,value:w[metric]}));
  const bottom=[...leaderboard].reverse().slice(0,5);

  const leaderTable=(title,list,bad=false)=><article className="panel pro-leader-panel"><div className="panel-head"><div><h2>{title}</h2><p>{bad?"Lowest multi-metric index in selected period.":"Highest multi-metric index in selected period."}</p></div></div><div className="pro-leader-list">
    {list.map((item,index)=><button type="button" key={item.id} onClick={()=>onOpenDriver?.({
      id:item.driver?.trid,dbId:item.id,name:resolvedName(item.driver),site:item.driver?.site||"DLS2",
      performance:item.index,dcr:item.dcr,pod:item.pod,iadc:item.iadc,mentor_score:item.mentor,
      fico:item.mentor,ementor:item.mentor,risk:bad?"Medium":"Low",issue:bad?"Performance review recommended":"No active concern"
    })}><span className="rank-badge">{index+1}</span><span className="pro-leader-name"><b>{resolvedName(item.driver)}</b><small>{item.driver?.trid}</small></span><MetricPill metric="dcr" value={item.dcr}/><MetricPill metric="pod" value={item.pod}/><MetricPill metric="iadc" value={item.iadc}/><MetricPill metric="mentor" value={item.mentor}/><strong>{item.index.toFixed(1)}</strong></button>)}
    {!list.length&&<div className="pro-chart-empty compact">Not enough combined evidence yet.</div>}
  </div></article>;

  return <>
    <div className="page-heading pro-heading"><div><span className="page-kicker">PERFORMANCE</span><h1>Fleet performance intelligence</h1><p>Weekly operational trends with targets, rankings and evidence coverage.</p></div><RangeTabs value={range} onChange={setRange}/></div>

    <section className="pro-metric-grid">
      {cards.map(([label,value,key,target])=><article key={label} className={metricStatus(key,value)}><span>{label}</span><strong>{key==="mentor"?fmtNum(value):key==="concessions"?fmtNum(value,2):fmtPct(value)}</strong><small>{target}</small><div className="pro-progress"><i style={{width:`${Math.min(100,key==="mentor"?(n(value)||0)/TARGETS.mentor*100:(n(value)||0))}%`}}/></div></article>)}
    </section>

    <section className="panel pro-chart-panel">
      <div className="panel-head"><div><h2>{range==="all"?"Full history":`Last ${range} week${range===1?"":"s"}`}</h2><p>Target line and weekly movement for the selected metric.</p></div><select value={metric} onChange={(e)=>setMetric(e.target.value)}>
        <option value="performance">Performance index</option><option value="dcr">DCR</option><option value="pod">POD</option><option value="iadc">IADC</option><option value="mentor">Mentor</option><option value="cc">Contact Compliance</option><option value="concessions">Concessions</option>
      </select></div>
      <ProTrendChart points={points} metric={metric}/>
    </section>

    <section className="leaderboard-grid pro-leader-grid">{leaderTable("Top 5 performers",leaderboard.slice(0,5))}{leaderTable("Bottom 5 — attention",bottom,true)}</section>

    <section className="panel pro-weekly-evidence">
      <div className="panel-head"><div><h2>Weekly evidence</h2><p>Fleet averages by stored reporting week.</p></div><span className="panel-badge">{selectedWeeks.length} weeks</span></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Week</th><th>Drivers</th><th>DCR</th><th>POD</th><th>IADC</th><th>CC</th><th>Mentor</th><th>Concessions</th></tr></thead><tbody>
        {[...selectedWeeks].reverse().map((week)=><tr key={week.label}><td><b>{week.label}</b><small className="history-date">{week.periodEnd}</small></td><td>{week.drivers}</td><td><MetricPill metric="dcr" value={week.dcr}/></td><td><MetricPill metric="pod" value={week.pod}/></td><td><MetricPill metric="iadc" value={week.iadc}/></td><td>{fmtPct(week.cc)}</td><td><MetricPill metric="mentor" value={week.mentor}/></td><td>{fmtNum(week.concessions,2)}</td></tr>)}
        {!selectedWeeks.length&&<EmptyRow columns={8} text="No weekly history available."/>}
      </tbody></table></div>
    </section>
  </>;
}

export function ProConcessionsView({ rows = [], onOpenDriver }) {
  const [range,setRange]=useState(8);
  const [query,setQuery]=useState("");
  const concessionRows=useMemo(()=>rows.filter((r)=>n(r.concessions)!=null),[rows]);
  const weeks=useMemo(()=>selectWeeks(concessionRows,range),[concessionRows,range]);
  const weekSet=new Set(weeks);

  const ranking=useMemo(()=>{
    const map=new Map();
    for(const row of concessionRows){
      if(!weekSet.has(row.week_label))continue;
      const driver=row.drivers||{};
      const id=row.driver_id||driver.trid;
      if(!id)continue;
      const current=map.get(id)||{id,driver,byWeek:{}};
      current.byWeek[row.week_label]=n(row.concessions);
      map.set(id,current);
    }
    return [...map.values()].map((item)=>{
      const values=weeks.map((w)=>Object.prototype.hasOwnProperty.call(item.byWeek,w)?item.byWeek[w]:null);
      const reported=values.filter((v)=>v!=null);
      const total=reported.reduce((a,b)=>a+b,0);
      const affected=reported.filter((v)=>v>0).length;
      return {...item,values,total,affected,reported:reported.length,average:reported.length?total/reported.length:0};
    }).filter((x)=>x.reported>0).sort((a,b)=>b.total-a.total||b.affected-a.affected);
  },[concessionRows,weeks.join("|")]);

  const filtered=ranking.filter((item)=>`${resolvedName(item.driver)} ${item.driver?.trid||""}`.toLowerCase().includes(query.toLowerCase()));
  const weeklyTotals=weeks.map((week)=>ranking.reduce((sum,item)=>sum+(n(item.byWeek[week])||0),0));
  const total=weeklyTotals.reduce((a,b)=>a+b,0);
  const affected=ranking.filter((x)=>x.total>0).length;
  const repeats=ranking.filter((x)=>x.affected>=2).length;
  const top=ranking[0]?.total||0;

  return <>
    <div className="page-heading pro-heading"><div><span className="page-kicker">QUALITY</span><h1>Concessions intelligence</h1><p>Exact weekly counts, cumulative totals and repeat-driver patterns.</p></div><RangeTabs value={range} onChange={setRange}/></div>
    <section className="pro-kpi-grid">
      <article><span>Total concessions</span><strong>{total}</strong><small>{weeks.length} reporting weeks</small></article>
      <article><span>Drivers affected</span><strong>{affected}</strong><small>At least one concession</small></article>
      <article className={repeats?"warn":""}><span>Repeat drivers</span><strong>{repeats}</strong><small>Concessions in 2+ weeks</small></article>
      <article className={top>=5?"bad":"warn"}><span>Highest driver total</span><strong>{top}</strong><small>Selected period</small></article>
    </section>

    <section className="panel pro-concession-table">
      <div className="panel-head"><div><h2>Driver concession matrix</h2><p>Weekly values remain separate; Total is the selected-period sum.</p></div><input className="pro-inline-search" placeholder="Search driver or TRID…" value={query} onChange={(e)=>setQuery(e.target.value)}/></div>
      <div className="table-wrap"><table className="data-table concessions-table pro-concessions-matrix"><thead><tr><th>#</th><th>Driver</th><th>TRID</th>{weeks.map((week)=><th key={week}>{week}</th>)}<th className="sticky-total">Total</th><th>Weeks affected</th><th>Avg/week</th><th /></tr></thead><tbody>
        {filtered.map((item,index)=><tr key={item.id}><td><span className="rank-badge">{index+1}</span></td><td><b>{resolvedName(item.driver)}</b><small className="history-date">{item.driver?.site||"DLS2"}</small></td><td>{item.driver?.trid||"—"}</td>
          {item.values.map((value,i)=><td key={weeks[i]}>{value==null?<span className="missing-cell">—</span>:<span className={`concession-cell ${value>=3?"high":value>=2?"med":value>=1?"low":""}`}>{value}</span>}</td>)}
          <td className="sticky-total"><b className={item.total>=5?"pro-total-bad":item.total>=2?"pro-total-warn":"pro-total-good"}>{item.total}</b></td><td>{item.affected}/{item.reported}</td><td>{item.average.toFixed(2)}</td><td><button type="button" className="profile-link" onClick={()=>onOpenDriver?.({id:item.driver?.trid,dbId:item.id,name:resolvedName(item.driver),site:item.driver?.site||"DLS2",concessions:item.total,risk:item.total>=5?"High":item.total>=2?"Medium":"Low",issue:item.total>=2?"Repeat concessions":"No active concern"})}>Open →</button></td>
        </tr>)}
        {!filtered.length&&<EmptyRow columns={7+weeks.length} text="No concession evidence matches this selection."/>}
      </tbody><tfoot><tr><td colSpan="3"><b>Weekly totals</b></td>{weeklyTotals.map((value,i)=><td key={weeks[i]}><b>{value}</b></td>)}<td className="sticky-total"><b>{total}</b></td><td colSpan="3">Selected period</td></tr></tfoot></table></div>
    </section>
  </>;
}

export function ProMentorView({ rows = [], onOpenDriver }) {
  const [range,setRange]=useState(4);
  const [query,setQuery]=useState("");
  const mentorRows=useMemo(()=>rows.filter((r)=>mentorScore(r)!=null || r.raw_data?.mentor),[rows]);
  const weeks=useMemo(()=>selectWeeks(mentorRows,range),[mentorRows,range]);
  const weekSet=new Set(weeks);

  const drivers=useMemo(()=>{
    const map=new Map();
    for(const row of mentorRows){
      if(!weekSet.has(row.week_label))continue;
      const driver=row.drivers||{};
      const id=row.driver_id||driver.trid;
      if(!id)continue;
      const current=map.get(id)||{id,driver,scores:[],details:null};
      if(mentorScore(row)!=null)current.scores.push(mentorScore(row));
      if(row.raw_data?.mentor)current.details=row.raw_data.mentor;
      map.set(id,current);
    }
    return [...map.values()].map((x)=>({...x,score:average(x.scores)})).filter((x)=>x.score!=null||x.details).sort((a,b)=>(b.score??-1)-(a.score??-1));
  },[mentorRows,weeks.join("|")]);

  const filtered=drivers.filter((x)=>`${resolvedName(x.driver)} ${x.driver?.trid||""}`.toLowerCase().includes(query.toLowerCase()));
  const avgScore=average(drivers.map((x)=>x.score));
  const below=drivers.filter((x)=>n(x.score)!=null&&x.score<TARGETS.mentor).length;
  const highRisk=drivers.filter((x)=>Object.values(x.details||{}).some((v)=>String(v).toLowerCase().includes("high risk"))).length;
  const unresolved=drivers.filter((x)=>resolvedName(x.driver)==="Unresolved driver").length;

  return <>
    <div className="page-heading pro-heading"><div><span className="page-kicker">SAFETY</span><h1>Mentor intelligence</h1><p>Driving score, behaviour risk and training evidence mapped to trusted driver profiles.</p></div><RangeTabs value={range} onChange={setRange}/></div>
    <section className="pro-kpi-grid">
      <article><span>Average score</span><strong>{avgScore==null?"—":Math.round(avgScore)}</strong><small>Target ≥ {TARGETS.mentor}</small></article>
      <article className={below?"warn":""}><span>Below target</span><strong>{below}</strong><small>Needs attention</small></article>
      <article className={highRisk?"bad":""}><span>High-risk behaviour</span><strong>{highRisk}</strong><small>Any high-risk category</small></article>
      <article className={unresolved?"warn":""}><span>Unresolved identity</span><strong>{unresolved}</strong><small>Name mapping coverage</small></article>
    </section>
    <section className="panel">
      <div className="panel-head"><div><h2>Mentor driver evidence</h2><p>Latest behavioural categories in the selected period.</p></div><input className="pro-inline-search" value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search driver or TRID…"/></div>
      <div className="table-wrap"><table className="data-table mentor-table"><thead><tr><th>Driver</th><th>TRID</th><th>Score</th><th>Acceleration</th><th>Braking</th><th>Cornering</th><th>Distraction</th><th>Speeding</th><th>Events</th><th>Training</th><th>Completed</th><th /></tr></thead><tbody>
        {filtered.map((item)=>{
          const d=item.details||{};
          return <tr key={item.id}><td><b>{resolvedName(item.driver)}</b><small className="history-date">{item.driver?.site||"DLS2"}</small></td><td>{item.driver?.trid||"—"}</td><td><MetricPill metric="mentor" value={item.score}/></td>
            {["acceleration","braking","cornering","distraction","speedingRisk"].map((key)=><td key={key}><span className={`mentor-risk ${String(d[key]||"").toLowerCase().includes("high")?"high":String(d[key]||"").toLowerCase().includes("medium")?"med":"low"}`}>{d[key]||"—"}</span></td>)}
            <td>{d.speedingEvents??"—"}</td><td>{d.training??"—"}</td><td>{d.completed??"—"}</td><td><button type="button" className="profile-link" onClick={()=>onOpenDriver?.({id:item.driver?.trid,dbId:item.id,name:resolvedName(item.driver),site:item.driver?.site||"DLS2",mentor_score:item.score,fico:item.score,ementor:item.score,risk:item.score!=null&&item.score<TARGETS.mentor?"Medium":"Low",issue:item.score!=null&&item.score<TARGETS.mentor?"Mentor score below 815":"No active concern"})}>Open →</button></td></tr>;
        })}
        {!filtered.length&&<EmptyRow columns={12} text="No Mentor evidence matches this selection."/>}
      </tbody></table></div>
    </section>
  </>;
}
