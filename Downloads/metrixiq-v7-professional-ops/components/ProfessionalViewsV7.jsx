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
  const [range,setRange]=useState(8);
  const [metric,setMetric]=useState("performance");
  const [rankScope,setRankScope]=useState("latest");

  const allWeeks=useMemo(()=>aggregateWeeks(rows),[rows]);
  const selectedWeeks=range==="all"?allWeeks:allWeeks.slice(-Number(range));
  const selectedLabels=selectedWeeks.map((w)=>w.label);
  const latest=selectedWeeks.at(-1)||allWeeks.at(-1)||null;
  const previous=selectedWeeks.at(-2)||null;

  const rankingWeeks=
    rankScope==="latest"&&latest
      ?[latest.label]
      :selectedLabels;

  const leaderboard=useMemo(
    ()=>buildPerformanceLeaderboard(rows,rankingWeeks),
    [rows,rankingWeeks.join("|")]
  );

  const bottom=[...leaderboard].reverse().slice(0,5);
  const top=leaderboard.slice(0,5);

  const metricDefs=[
    {
      label:"DCR",
      key:"dcr",
      target:TARGETS.dcr,
      targetText:`Target ≥ ${TARGETS.dcr.toFixed(2)}%`,
      format:(v)=>fmtPct(v,2)
    },
    {
      label:"POD",
      key:"pod",
      target:TARGETS.pod,
      targetText:`Target ≥ ${TARGETS.pod.toFixed(2)}%`,
      format:(v)=>fmtPct(v,2)
    },
    {
      label:"IADC",
      key:"iadc",
      target:TARGETS.iadc,
      targetText:`Target ≥ ${TARGETS.iadc}%`,
      format:(v)=>fmtPct(v,1)
    },
    {
      label:"Mentor",
      key:"mentor",
      target:TARGETS.mentor,
      targetText:`Target ≥ ${TARGETS.mentor}`,
      format:(v)=>fmtNum(v,0)
    },
    {
      label:"Contact Compliance",
      key:"cc",
      target:98,
      targetText:"Target ≥ 98.00%",
      format:(v)=>fmtPct(v,2)
    },
    {
      label:"Concessions",
      key:"concessions",
      target:null,
      targetText:"Lower is better",
      format:(v)=>fmtNum(v,2),
      lowerBetter:true
    }
  ];

  const latestValue=(key)=>{
    if(!latest)return key==="mentor"?kpis.mentor:kpis[key];
    return latest[key] ?? (key==="mentor"?kpis.mentor:kpis[key]);
  };

  const previousValue=(key)=>previous?previous[key]:null;

  const toneFor=(def,value)=>{
    const v=n(value);
    if(v==null)return "neutral";
    if(def.lowerBetter)return "neutral";
    if(def.target==null)return "neutral";
    if(v>=def.target)return "good";
    if(v>=def.target*0.97)return "warn";
    return "bad";
  };

  const metricCards=metricDefs.map((def)=>{
    const value=latestValue(def.key);
    const prev=previousValue(def.key);
    const delta=n(value)!=null&&n(prev)!=null?Number(value)-Number(prev):null;
    const gap=def.target!=null&&n(value)!=null?Number(value)-def.target:null;
    const tone=toneFor(def,value);

    let progress=0;
    if(n(value)!=null){
      if(def.key==="mentor"){
        progress=Math.min(100,Math.max(0,Number(value)/TARGETS.mentor*100));
      }else if(def.lowerBetter){
        progress=0;
      }else{
        progress=Math.min(100,Math.max(0,Number(value)));
      }
    }

    return {...def,value,prev,delta,gap,tone,progress};
  });

  const targetMetrics=metricCards.filter((m)=>m.target!=null);
  const onTarget=targetMetrics.filter((m)=>m.tone==="good").length;
  const belowTarget=targetMetrics.filter((m)=>m.tone==="warn"||m.tone==="bad").length;

  const currentLeaderboard=
    latest
      ?buildPerformanceLeaderboard(rows,[latest.label])
      :leaderboard;

  const attention=currentLeaderboard.filter((x)=>n(x.index)!=null&&Number(x.index)<96).length;
  const fleetIndex=latest?.performance ?? average(currentLeaderboard.map((x)=>x.index));

  const chartDef=
    metric==="performance"
      ?{
          label:"Fleet performance index",
          key:"performance",
          target:100,
          format:(v)=>n(v)==null?"—":Number(v).toFixed(1)
        }
      :metricDefs.find((m)=>m.key===metric) || metricDefs[0];

  const chartPoints=selectedWeeks
    .map((week)=>({
      label:week.label,
      value:week[chartDef.key]
    }))
    .filter((point)=>n(point.value)!=null);

  const chartWidth=920;
  const chartHeight=300;
  const chartLeft=58;
  const chartRight=30;
  const chartTop=34;
  const chartBottom=52;
  const plotWidth=chartWidth-chartLeft-chartRight;
  const plotHeight=chartHeight-chartTop-chartBottom;

  const chartValues=chartPoints.map((p)=>Number(p.value));
  if(chartDef.target!=null)chartValues.push(Number(chartDef.target));

  const rawMin=chartValues.length?Math.min(...chartValues):0;
  const rawMax=chartValues.length?Math.max(...chartValues):100;
  const span=Math.max(1,rawMax-rawMin);
  const pad=Math.max(
    chartDef.key==="mentor"?10:chartDef.key==="performance"?2:0.6,
    span*0.22
  );
  const chartMin=Math.max(0,rawMin-pad);
  const chartMax=Math.max(chartMin+1,rawMax+pad);

  const pointX=(index)=>
    chartPoints.length<=1
      ?chartLeft+plotWidth/2
      :chartLeft+(index/(chartPoints.length-1))*plotWidth;

  const pointY=(value)=>
    chartTop+((chartMax-Number(value))/(chartMax-chartMin))*plotHeight;

  const linePoints=chartPoints
    .map((p,i)=>`${pointX(i)},${pointY(p.value)}`)
    .join(" ");

  const areaPoints=chartPoints.length
    ?`${pointX(0)},${chartTop+plotHeight} ${linePoints} ${pointX(chartPoints.length-1)},${chartTop+plotHeight}`
    :"";

  const targetY=
    chartDef.target!=null
      ?pointY(chartDef.target)
      :null;

  const currentChartValue=chartPoints.at(-1)?.value ?? null;
  const previousChartValue=chartPoints.at(-2)?.value ?? null;
  const chartDelta=
    n(currentChartValue)!=null&&n(previousChartValue)!=null
      ?Number(currentChartValue)-Number(previousChartValue)
      :null;

  const rankingScopeLabel=
    rankScope==="latest"&&latest
      ?latest.label
      :range==="all"
        ?"Full history"
        :`Last ${range}W`;

  const openLeaderboardDriver=(item,bad=false)=>{
    onOpenDriver?.({
      id:item.driver?.trid,
      dbId:item.id,
      name:resolvedName(item.driver),
      site:item.driver?.site||"DLS2",
      performance:item.index,
      dcr:item.dcr,
      pod:item.pod,
      iadc:item.iadc,
      mentor_score:item.mentor,
      fico:item.mentor,
      ementor:item.mentor,
      risk:bad?"Medium":"Low",
      issue:bad?"Performance review recommended":"No active concern"
    });
  };

  return <>
    <div className="pf2-head">
      <div>
        <span className="pf2-kicker">OPERATIONS INTELLIGENCE</span>
        <h1>Performance</h1>
        <p>Fleet health, metric targets, weekly movement and driver ranking in one view.</p>
      </div>

      <RangeTabs value={range} onChange={setRange}/>
    </div>

    <section className="pf2-hero-grid">
      <article className="pf2-hero primary">
        <span>Fleet index</span>
        <strong>{n(fleetIndex)==null?"—":Number(fleetIndex).toFixed(1)}</strong>
        <small>{latest?.label||"Latest available period"}</small>
      </article>

      <article className={belowTarget?"pf2-hero warn":"pf2-hero good"}>
        <span>Metrics on target</span>
        <strong>{onTarget}/{targetMetrics.length}</strong>
        <small>{belowTarget?`${belowTarget} below target`:"All core metrics healthy"}</small>
      </article>

      <article className="pf2-hero">
        <span>Drivers measured</span>
        <strong>{latest?.drivers??currentLeaderboard.length}</strong>
        <small>{latest?.label||"Current evidence"}</small>
      </article>

      <article className={attention?"pf2-hero risk":"pf2-hero good"}>
        <span>Needs attention</span>
        <strong>{attention}</strong>
        <small>Current index below 96</small>
      </article>
    </section>

    <section className="pf2-metric-grid">
      {metricCards.map((card)=>
        <button
          type="button"
          key={card.key}
          className={`pf2-metric ${card.tone} ${metric===card.key?"selected":""}`}
          onClick={()=>setMetric(card.key)}
        >
          <div className="pf2-metric-top">
            <span>{card.label}</span>
            <i className={`pf2-status-dot ${card.tone}`}/>
          </div>

          <strong>{card.format(card.value)}</strong>

          <div className="pf2-metric-meta">
            <small>{card.targetText}</small>

            {card.delta!=null&&
              <em className={
                card.lowerBetter
                  ?card.delta<0?"good":card.delta>0?"bad":"neutral"
                  :card.delta>0?"good":card.delta<0?"bad":"neutral"
              }>
                {card.delta>0?"+":""}
                {card.key==="mentor"
                  ?card.delta.toFixed(0)
                  :card.delta.toFixed(2)}
                {" WoW"}
              </em>
            }
          </div>

          {!card.lowerBetter&&
            <div className="pf2-progress">
              <i
                className={card.tone}
                style={{width:`${card.progress}%`}}
              />
              {card.target!=null&&<b style={{
                left:`${Math.min(
                  100,
                  card.key==="mentor"
                    ?100
                    :card.target
                )}%`
              }}/>}
            </div>
          }

          {card.lowerBetter&&
            <div className="pf2-lower-note">
              <span>Weekly driver average</span>
              <b>{card.delta==null?"No WoW comparison":card.delta<0?"Improving":card.delta>0?"Increasing":"No change"}</b>
            </div>
          }
        </button>
      )}
    </section>

    <section className="pf2-main-grid">
      <article className="pf2-card pf2-chart-card">
        <div className="pf2-card-head">
          <div>
            <span>WEEKLY TREND</span>
            <h2>{chartDef.label}</h2>
            <p>
              {range==="all"
                ?"Full stored history"
                :`Last ${selectedWeeks.length} reporting week${selectedWeeks.length===1?"":"s"}`}
            </p>
          </div>

          <div className="pf2-chart-controls">
            <select value={metric} onChange={(e)=>setMetric(e.target.value)}>
              <option value="performance">Performance index</option>
              <option value="dcr">DCR</option>
              <option value="pod">POD</option>
              <option value="iadc">IADC</option>
              <option value="mentor">Mentor</option>
              <option value="cc">Contact Compliance</option>
              <option value="concessions">Concessions</option>
            </select>

            <div className="pf2-current-value">
              <span>Current</span>
              <strong>
                {chartDef.key==="mentor"
                  ?fmtNum(currentChartValue,0)
                  :chartDef.key==="performance"
                    ?(n(currentChartValue)==null?"—":Number(currentChartValue).toFixed(1))
                    :chartDef.key==="concessions"
                      ?fmtNum(currentChartValue,2)
                      :fmtPct(currentChartValue,2)}
              </strong>
              {chartDelta!=null&&
                <small className={
                  chartDef.key==="concessions"
                    ?chartDelta<0?"good":chartDelta>0?"bad":"neutral"
                    :chartDelta>0?"good":chartDelta<0?"bad":"neutral"
                }>
                  {chartDelta>0?"+":""}
                  {chartDef.key==="mentor"
                    ?chartDelta.toFixed(0)
                    :chartDelta.toFixed(2)} vs prev
                </small>
              }
            </div>
          </div>
        </div>

        {chartPoints.length?
          <div className="pf2-chart">
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              preserveAspectRatio="none"
              role="img"
              aria-label={`${chartDef.label} weekly trend`}
            >
              <defs>
                <linearGradient id="pf2Area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4e9788" stopOpacity=".20"/>
                  <stop offset="100%" stopColor="#4e9788" stopOpacity=".015"/>
                </linearGradient>
              </defs>

              {[0,0.25,0.5,0.75,1].map((step)=>{
                const y=chartTop+step*plotHeight;
                return <line
                  key={step}
                  x1={chartLeft}
                  y1={y}
                  x2={chartWidth-chartRight}
                  y2={y}
                  className="pf2-gridline"
                />;
              })}

              {targetY!=null&&
                <line
                  x1={chartLeft}
                  y1={targetY}
                  x2={chartWidth-chartRight}
                  y2={targetY}
                  className="pf2-target-line"
                />
              }

              {areaPoints&&
                <polygon
                  points={areaPoints}
                  fill="url(#pf2Area)"
                />
              }

              {linePoints&&
                <polyline
                  points={linePoints}
                  className="pf2-line"
                />
              }

              {chartPoints.map((point,index)=>{
                const x=pointX(index);
                const y=pointY(point.value);
                const isLatest=index===chartPoints.length-1;

                return <g key={`${point.label}-${index}`}>
                  {isLatest&&
                    <circle
                      cx={x}
                      cy={y}
                      r="12"
                      className="pf2-latest-ring"
                    />
                  }

                  <circle
                    cx={x}
                    cy={y}
                    r="6"
                    className="pf2-point"
                  />

                  <text
                    x={x}
                    y={Math.max(18,y-14)}
                    textAnchor="middle"
                    className="pf2-point-value"
                  >
                    {chartDef.key==="mentor"
                      ?Number(point.value).toFixed(0)
                      :chartDef.key==="performance"
                        ?Number(point.value).toFixed(1)
                        :chartDef.key==="concessions"
                          ?Number(point.value).toFixed(2)
                          :Number(point.value).toFixed(2)}
                  </text>

                  <text
                    x={x}
                    y={chartHeight-17}
                    textAnchor="middle"
                    className={isLatest?"pf2-axis latest":"pf2-axis"}
                  >
                    {point.label}
                  </text>
                </g>;
              })}
            </svg>

            {chartDef.target!=null&&
              <div className="pf2-chart-legend">
                <span><i className="solid"/>Actual</span>
                <span><i className="target"/>Target {chartDef.key==="mentor"?chartDef.target:Number(chartDef.target).toFixed(2)}</span>
              </div>
            }
          </div>
          :
          <div className="pro-chart-empty">
            No stored values for this metric in the selected period.
          </div>
        }
      </article>

      <article className="pf2-card pf2-health-card">
        <div className="pf2-card-head">
          <div>
            <span>METRIC HEALTH</span>
            <h2>Current position</h2>
            <p>{latest?.label||"Latest evidence"}</p>
          </div>
        </div>

        <div className="pf2-health-list">
          {metricCards.filter((m)=>m.key!=="concessions").map((item)=>
            <button
              type="button"
              key={item.key}
              onClick={()=>setMetric(item.key)}
              className={metric===item.key?"selected":""}
            >
              <div>
                <b>{item.label}</b>
                <small>{item.targetText}</small>
              </div>

              <strong>{item.format(item.value)}</strong>

              <span className={`pf2-health-chip ${item.tone}`}>
                {item.tone==="good"
                  ?"On target"
                  :item.tone==="warn"
                    ?"Watch"
                    :item.tone==="bad"
                      ?"Below"
                      :"No data"}
              </span>
            </button>
          )}
        </div>
      </article>
    </section>

    <section className="pf2-ranking-head">
      <div>
        <span className="pf2-kicker">DRIVER PERFORMANCE</span>
        <h2>Driver ranking</h2>
        <p>Combined DCR, POD, IADC and Mentor performance index.</p>
      </div>

      <div className="pf2-scope-tabs">
        <button
          type="button"
          className={rankScope==="latest"?"active":""}
          onClick={()=>setRankScope("latest")}
        >
          Latest week
        </button>
        <button
          type="button"
          className={rankScope==="period"?"active":""}
          onClick={()=>setRankScope("period")}
        >
          Selected period
        </button>
      </div>
    </section>

    <section className="pf2-leader-grid">
      <article className="pf2-card">
        <div className="pf2-card-head">
          <div>
            <span>TOP PERFORMERS</span>
            <h2>{rankingScopeLabel}</h2>
            <p>Highest combined index.</p>
          </div>
        </div>

        <div className="pf2-leader-list">
          {top.map((item,index)=>
            <button
              type="button"
              key={item.id}
              onClick={()=>openLeaderboardDriver(item,false)}
            >
              <span className="pf2-rank">{index+1}</span>

              <div className="pf2-driver">
                <b>{resolvedName(item.driver)}</b>
                <small>{item.driver?.trid||"—"}</small>
              </div>

              <MetricPill metric="dcr" value={item.dcr}/>
              <MetricPill metric="pod" value={item.pod}/>
              <MetricPill metric="iadc" value={item.iadc}/>
              <MetricPill metric="mentor" value={item.mentor}/>

              <strong className="pf2-index good">
                {item.index.toFixed(1)}
              </strong>
            </button>
          ))}

          {!top.length&&
            <div className="pro-chart-empty compact">
              Not enough combined evidence yet.
            </div>
          }
        </div>
      </article>

      <article className="pf2-card">
        <div className="pf2-card-head">
          <div>
            <span>ATTENTION</span>
            <h2>{rankingScopeLabel}</h2>
            <p>Lowest combined index first.</p>
          </div>
        </div>

        <div className="pf2-leader-list attention">
          {bottom.map((item,index)=>
            <button
              type="button"
              key={item.id}
              onClick={()=>openLeaderboardDriver(item,true)}
            >
              <span className="pf2-rank">{index+1}</span>

              <div className="pf2-driver">
                <b>{resolvedName(item.driver)}</b>
                <small>{item.driver?.trid||"—"}</small>
              </div>

              <MetricPill metric="dcr" value={item.dcr}/>
              <MetricPill metric="pod" value={item.pod}/>
              <MetricPill metric="iadc" value={item.iadc}/>
              <MetricPill metric="mentor" value={item.mentor}/>

              <strong className={`pf2-index ${item.index>=96?"good":item.index>=90?"warn":"bad"}`}>
                {item.index.toFixed(1)}
              </strong>
            </button>
          ))}

          {!bottom.length&&
            <div className="pro-chart-empty compact">
              Not enough combined evidence yet.
            </div>
          }
        </div>
      </article>
    </section>

    <section className="pf2-card pf2-evidence">
      <div className="pf2-card-head">
        <div>
          <span>WEEKLY EVIDENCE</span>
          <h2>Fleet history</h2>
          <p>Stored averages for every selected reporting week.</p>
        </div>

        <span className="pf2-count">
          {selectedWeeks.length} week{selectedWeeks.length===1?"":"s"}
        </span>
      </div>

      <div className="table-wrap">
        <table className="data-table pf2-table">
          <thead>
            <tr>
              <th>Week</th>
              <th>Drivers</th>
              <th>Index</th>
              <th>DCR</th>
              <th>POD</th>
              <th>IADC</th>
              <th>CC</th>
              <th>Mentor</th>
              <th>Concessions</th>
            </tr>
          </thead>

          <tbody>
            {[...selectedWeeks].reverse().map((week)=>
              <tr key={week.label}>
                <td>
                  <b>{week.label}</b>
                  <small className="history-date">{week.periodEnd}</small>
                </td>
                <td>{week.drivers}</td>
                <td>
                  <span className={`pf2-index ${n(week.performance)!=null&&week.performance>=96?"good":n(week.performance)!=null&&week.performance>=90?"warn":"bad"}`}>
                    {n(week.performance)==null?"—":Number(week.performance).toFixed(1)}
                  </span>
                </td>
                <td><MetricPill metric="dcr" value={week.dcr}/></td>
                <td><MetricPill metric="pod" value={week.pod}/></td>
                <td><MetricPill metric="iadc" value={week.iadc}/></td>
                <td>{fmtPct(week.cc,2)}</td>
                <td><MetricPill metric="mentor" value={week.mentor}/></td>
                <td>{fmtNum(week.concessions,2)}</td>
              </tr>
            )}

            {!selectedWeeks.length&&
              <EmptyRow columns={9} text="No weekly performance history available."/>
            }
          </tbody>
        </table>
      </div>
    </section>

    <style jsx>{`
      .pf2-head{
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:20px;
        margin-bottom:18px;
      }
      .pf2-head h1{margin:5px 0 6px;font-size:32px;line-height:1.08;color:#16263a}
      .pf2-head p{margin:0;color:#7c8998;font-size:14px}
      .pf2-kicker,.pf2-card-head>div>span{display:block;font-size:10px;font-weight:800;letter-spacing:.13em;color:#4b9485}
      .pf2-hero-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:13px}
      .pf2-hero{min-height:108px;padding:17px 18px;background:#fff;border:1px solid #dfe6ec;border-radius:14px;box-shadow:0 2px 7px rgba(18,37,56,.025)}
      .pf2-hero.primary,.pf2-hero.good{border-left:3px solid #4e9788}
      .pf2-hero.warn{border-left:3px solid #d4a13c}
      .pf2-hero.risk{border-left:3px solid #d86670}
      .pf2-hero>span{display:block;text-transform:uppercase;font-size:10px;letter-spacing:.09em;font-weight:800;color:#8592a1}
      .pf2-hero>strong{display:block;margin-top:8px;font-size:29px;line-height:1;color:#17283d}
      .pf2-hero>small{display:block;margin-top:8px;color:#788697}
      .pf2-metric-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin-bottom:14px}
      .pf2-metric{min-width:0;border:1px solid #e0e7ed;background:#fff;border-radius:13px;padding:14px;text-align:left;cursor:pointer;transition:.16s ease}
      .pf2-metric:hover{transform:translateY(-1px);box-shadow:0 5px 15px rgba(22,39,58,.05)}
      .pf2-metric.selected{border-color:#8dbeb2;box-shadow:0 0 0 3px rgba(78,151,136,.08)}
      .pf2-metric.good{border-top:3px solid #4e9788}.pf2-metric.warn{border-top:3px solid #d7a13a}.pf2-metric.bad{border-top:3px solid #d76570}.pf2-metric.neutral{border-top:3px solid #a8b3bf}
      .pf2-metric-top{display:flex;align-items:center;justify-content:space-between;gap:8px}
      .pf2-metric-top>span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#768697;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.07em}
      .pf2-status-dot{width:7px;height:7px;border-radius:50%;flex:0 0 auto}
      .pf2-status-dot.good{background:#4e9788}.pf2-status-dot.warn{background:#d7a13a}.pf2-status-dot.bad{background:#d76570}.pf2-status-dot.neutral{background:#a8b3bf}
      .pf2-metric>strong{display:block;margin-top:10px;font-size:23px;color:#17283d}
      .pf2-metric-meta{min-height:34px;margin-top:6px}.pf2-metric-meta small{display:block;color:#8b97a5;font-size:9px}.pf2-metric-meta em{display:block;margin-top:3px;font-style:normal;font-size:9px;font-weight:800}
      .pf2-metric-meta em.good{color:#2f7d62}.pf2-metric-meta em.bad{color:#b34d59}.pf2-metric-meta em.neutral{color:#8995a2}
      .pf2-progress{position:relative;height:6px;margin-top:10px;overflow:hidden;border-radius:999px;background:#eef2f5}
      .pf2-progress>i{display:block;height:100%;border-radius:999px}.pf2-progress>i.good{background:#4e9788}.pf2-progress>i.warn{background:#d5a13c}.pf2-progress>i.bad{background:#d76570}.pf2-progress>i.neutral{background:#9eabb8}
      .pf2-progress>b{position:absolute;top:-2px;width:2px;height:10px;transform:translateX(-1px);background:#17283d;opacity:.42}
      .pf2-lower-note{display:flex;justify-content:space-between;gap:6px;margin-top:10px;padding-top:8px;border-top:1px solid #edf1f4;font-size:9px;color:#8a96a4}.pf2-lower-note b{color:#586a7d}
      .pf2-main-grid{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(320px,.65fr);gap:14px;margin-bottom:18px}
      .pf2-card{background:#fff;border:1px solid #dfe6ec;border-radius:16px;padding:18px;box-shadow:0 2px 8px rgba(18,37,56,.025)}
      .pf2-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:15px}.pf2-card-head h2{margin:4px 0;font-size:19px;color:#17283d}.pf2-card-head p{margin:0;color:#8491a0;font-size:12px}
      .pf2-chart-controls{display:flex;align-items:flex-start;gap:10px}.pf2-chart-controls select{height:40px;border:1px solid #d8e1e7;border-radius:9px;background:#fff;padding:0 10px;color:#2b3e53;font-weight:700}
      .pf2-current-value{min-width:100px;padding:7px 10px;border-radius:9px;background:#f5f8f8;text-align:right}.pf2-current-value span{display:block;font-size:8px;font-weight:800;letter-spacing:.08em;color:#8996a4;text-transform:uppercase}.pf2-current-value strong{display:block;margin-top:2px;color:#203349;font-size:17px}.pf2-current-value small{display:block;margin-top:2px;font-size:9px;font-weight:800}.pf2-current-value small.good{color:#2f7d62}.pf2-current-value small.bad{color:#b34d59}.pf2-current-value small.neutral{color:#8995a2}
      .pf2-chart{position:relative;height:330px;border:1px solid #e6ebef;border-radius:13px;overflow:hidden;background:linear-gradient(180deg,#fcfefe,#fff)}.pf2-chart svg{width:100%;height:100%;display:block}
      .pf2-gridline{stroke:#e8edf1;stroke-width:1;stroke-dasharray:3 5}.pf2-target-line{stroke:#9da8b4;stroke-width:2;stroke-dasharray:8 8}.pf2-line{fill:none;stroke:#4e9788;stroke-width:4;stroke-linecap:round;stroke-linejoin:round}.pf2-point{fill:#fff;stroke:#4e9788;stroke-width:4}.pf2-latest-ring{fill:rgba(78,151,136,.12);stroke:#8ebeb3;stroke-width:1}.pf2-point-value{fill:#203349;font-size:11px;font-weight:800}.pf2-axis{fill:#8390a0;font-size:10px;font-weight:800}.pf2-axis.latest{fill:#2e7467}
      .pf2-chart-legend{position:absolute;left:14px;bottom:10px;display:flex;gap:16px;color:#778696;font-size:9px;font-weight:700}.pf2-chart-legend span{display:flex;align-items:center;gap:5px}.pf2-chart-legend i{display:inline-block;width:18px;height:2px}.pf2-chart-legend i.solid{background:#4e9788}.pf2-chart-legend i.target{border-top:2px dashed #9da8b4}
      .pf2-health-list{display:flex;flex-direction:column}.pf2-health-list>button{display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:10px;width:100%;border:0;border-top:1px solid #edf1f4;background:transparent;padding:12px 2px;text-align:left;cursor:pointer}.pf2-health-list>button:first-child{border-top:0}.pf2-health-list>button.selected{background:#f5faf8}.pf2-health-list b{display:block;color:#22354a}.pf2-health-list small{display:block;margin-top:2px;color:#94a0ad;font-size:9px}.pf2-health-list strong{color:#26394e}
      .pf2-health-chip{min-width:66px;text-align:center;padding:5px 7px;border-radius:999px;font-size:9px;font-weight:800}.pf2-health-chip.good{background:#e7f5ee;color:#287453}.pf2-health-chip.warn{background:#fff2d1;color:#8d6717}.pf2-health-chip.bad{background:#f8dfe2;color:#a3454f}.pf2-health-chip.neutral{background:#eef2f5;color:#7e8b99}
      .pf2-ranking-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin:6px 0 10px}.pf2-ranking-head h2{margin:4px 0;font-size:20px;color:#17283d}.pf2-ranking-head p{margin:0;color:#8592a0;font-size:12px}
      .pf2-scope-tabs{display:flex;padding:4px;border:1px solid #dde5eb;background:#f0f4f6;border-radius:10px}.pf2-scope-tabs button{border:0;background:transparent;padding:8px 12px;border-radius:7px;color:#69798b;font-weight:750;cursor:pointer}.pf2-scope-tabs button.active{background:#fff;color:#182b40;box-shadow:0 1px 4px rgba(20,38,58,.08)}
      .pf2-leader-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}.pf2-leader-list>button{width:100%;display:grid;grid-template-columns:34px minmax(165px,1fr) 76px 76px 76px 76px 60px;align-items:center;gap:8px;border:0;border-top:1px solid #edf1f4;background:transparent;padding:10px 1px;text-align:left;cursor:pointer}.pf2-leader-list>button:first-child{border-top:0}.pf2-leader-list>button:hover{background:#fafcfd}
      .pf2-rank{display:inline-flex;width:28px;height:28px;align-items:center;justify-content:center;border-radius:8px;background:#edf2f5;color:#607184;font-size:11px;font-weight:800}.pf2-driver b{display:block;color:#213449;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pf2-driver small{display:block;margin-top:2px;color:#98a3af;font-size:9px}
      .pf2-index{display:inline-flex;min-width:44px;justify-content:center;padding:6px 7px;border-radius:8px;font-weight:900}.pf2-index.good{background:#e7f5ee;color:#287453}.pf2-index.warn{background:#fff1d0;color:#8d6717}.pf2-index.bad{background:#f8dfe2;color:#a3454f}
      .pf2-count{display:inline-flex;padding:6px 9px;border-radius:999px;background:#eef3f6;color:#6e7e8f;font-size:10px;font-weight:800}.pf2-table th,.pf2-table td{white-space:nowrap}
      @media(max-width:1400px){.pf2-metric-grid{grid-template-columns:repeat(3,1fr)}.pf2-main-grid{grid-template-columns:1fr}.pf2-leader-grid{grid-template-columns:1fr}}
      @media(max-width:900px){.pf2-head{flex-direction:column}.pf2-hero-grid{grid-template-columns:repeat(2,1fr)}.pf2-card-head{flex-direction:column}.pf2-chart-controls{width:100%;justify-content:space-between}}
      @media(max-width:620px){.pf2-hero-grid,.pf2-metric-grid{grid-template-columns:1fr}.pf2-ranking-head{flex-direction:column;align-items:flex-start}}
    `}</style>
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
