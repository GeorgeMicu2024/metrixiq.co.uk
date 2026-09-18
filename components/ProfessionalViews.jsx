"use client";

import { useEffect, useMemo, useState } from "react";
import { displayDriverName, isUsablePersonName } from "../lib/identity";
import { TARGETS } from "../lib/config/performance";

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

) {
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
      <article><span>Total drivers</span><strong>{drivers.length}</strong><small>Current workspace</small></article>
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
              <td><span className="site-chip">{driver.site||"Unassigned"}</span></td>
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
  const [site,setSite]=useState("all");
  const [focusWeek,setFocusWeek]=useState("latest");
  const [rankScope,setRankScope]=useState("week");
  const [query,setQuery]=useState("");
  const [statusFilter,setStatusFilter]=useState("all");
  const [sortBy,setSortBy]=useState("index");
  const [sortDir,setSortDir]=useState("desc");

  const sites=useMemo(()=>
    [...new Set(rows.map((row)=>row.drivers?.site).filter(Boolean))]
      .sort((a,b)=>String(a).localeCompare(String(b)))
  ,[rows]);

  const scopedRows=useMemo(()=>
    site==="all"
      ?rows
      :rows.filter((row)=>String(row.drivers?.site||"").toLowerCase()===String(site).toLowerCase())
  ,[rows,site]);

  const aggregateDrivers=(sourceRows,labels)=>{
    const weekSet=new Set(labels);
    const map=new Map();

    for(const row of sourceRows){
      if(!weekSet.has(row.week_label))continue;

      const driver=row.drivers||{};
      const id=row.driver_id||driver.trid;
      if(!id)continue;

      const current=map.get(id)||{
        id,
        driver,
        dcr:[],
        pod:[],
        iadc:[],
        mentor:[],
        cc:[],
        psb:[],
        reattempts:[],
        concessions:[],
        index:[],
        rows:0
      };

      if(n(row.dcr)!=null)current.dcr.push(Number(row.dcr));
      if(n(row.pod)!=null)current.pod.push(Number(row.pod));
      if(n(row.iadc)!=null)current.iadc.push(Number(row.iadc));
      if(mentorScore(row)!=null)current.mentor.push(Number(mentorScore(row)));
      if(n(row.cc)!=null)current.cc.push(Number(row.cc));
      if(n(row.psb)!=null)current.psb.push(Number(row.psb));
      if(n(row.reattempts)!=null)current.reattempts.push(Number(row.reattempts));
      if(n(row.concessions)!=null)current.concessions.push(Number(row.concessions));
      if(driverIndex(row)!=null)current.index.push(Number(driverIndex(row)));

      current.rows+=1;
      current.driver=driver;
      map.set(id,current);
    }

    return [...map.values()].map((item)=>{
      const concessionAvg=average(item.concessions);
      const concessionTotal=item.concessions.reduce((sum,value)=>sum+value,0);
      const coverage=[
        average(item.dcr),
        average(item.pod),
        average(item.iadc),
        average(item.mentor),
        average(item.cc)
      ].filter((value)=>value!=null).length;

      return {
        ...item,
        dcr:average(item.dcr),
        pod:average(item.pod),
        iadc:average(item.iadc),
        mentor:average(item.mentor),
        cc:average(item.cc),
        psb:average(item.psb),
        reattempts:average(item.reattempts),
        concessions:concessionAvg,
        concessionsTotal:concessionTotal,
        index:average(item.index),
        coverage
      };
    });
  };

  const allWeeks=useMemo(()=>{
    const labels=[...new Set(scopedRows.map((row)=>row.week_label).filter(Boolean))]
      .sort((a,b)=>weekNumber(a)-weekNumber(b));

    return labels.map((label)=>{
      const drivers=aggregateDrivers(scopedRows,[label]);
      const periodEnd=scopedRows.find((row)=>row.week_label===label&&row.period_end)?.period_end||"";

      return {
        label,
        periodEnd,
        drivers:drivers.length,
        rows:scopedRows.filter((row)=>row.week_label===label).length,
        performance:average(drivers.map((driver)=>driver.index)),
        dcr:average(drivers.map((driver)=>driver.dcr)),
        pod:average(drivers.map((driver)=>driver.pod)),
        iadc:average(drivers.map((driver)=>driver.iadc)),
        mentor:average(drivers.map((driver)=>driver.mentor)),
        cc:average(drivers.map((driver)=>driver.cc)),
        psb:average(drivers.map((driver)=>driver.psb)),
        reattempts:average(drivers.map((driver)=>driver.reattempts)),
        concessions:average(drivers.map((driver)=>driver.concessions)),
        concessionsTotal:drivers.reduce((sum,driver)=>sum+(n(driver.concessionsTotal)||0),0)
      };
    });
  },[scopedRows]);

  const selectedWeeks=
    range==="all"
      ?allWeeks
      :allWeeks.slice(-Number(range));

  const defaultFocused=selectedWeeks.at(-1)||allWeeks.at(-1)||null;
  const focused=
    focusWeek==="latest"
      ?defaultFocused
      :selectedWeeks.find((week)=>week.label===focusWeek)||defaultFocused;

  const focusedIndex=focused
    ?allWeeks.findIndex((week)=>week.label===focused.label)
    :-1;

  const previousWeek=
    focusedIndex>0
      ?allWeeks[focusedIndex-1]
      :null;

  const selectedLabels=selectedWeeks.map((week)=>week.label);
  const focusedLabels=focused?[focused.label]:[];

  const weekDrivers=useMemo(
    ()=>aggregateDrivers(scopedRows,focusedLabels),
    [scopedRows,focused?.label]
  );

  const periodDrivers=useMemo(
    ()=>aggregateDrivers(scopedRows,selectedLabels),
    [scopedRows,selectedLabels.join("|")]
  );

  const rankingSource=
    rankScope==="week"
      ?weekDrivers
      :periodDrivers;

  const metricDefs=[
    {label:"DCR",key:"dcr",target:TARGETS.dcr,digits:2,suffix:"%",description:"Delivery completion"},
    {label:"POD",key:"pod",target:TARGETS.pod,digits:2,suffix:"%",description:"Photo on delivery"},
    {label:"IADC",key:"iadc",target:TARGETS.iadc,digits:1,suffix:"%",description:"Workflow compliance"},
    {label:"Mentor",key:"mentor",target:TARGETS.mentor,digits:0,suffix:"",description:"Driving behaviour"},
    {label:"Contact Compliance",key:"cc",target:TARGETS.cc,digits:2,suffix:"%",description:"Customer contact"},
    {label:"PSB",key:"psb",target:TARGETS.psb,digits:2,suffix:"%",description:"Pickup success behaviour"},
    {label:"Reattempts",key:"reattempts",target:TARGETS.reattempts,digits:2,suffix:"%",description:"Reattempt compliance"},
    {label:"Avg concessions",key:"concessions",target:null,digits:2,suffix:"",description:"Average per measured driver",lowerBetter:true}
  ];

  const formatMetric=(key,value)=>{
    if(n(value)==null)return "—";
    if(key==="mentor")return Number(value).toFixed(0);
    if(key==="performance")return Number(value).toFixed(1);
    if(key==="concessions")return Number(value).toFixed(2);
    return `${Number(value).toFixed(key==="iadc"?1:2)}%`;
  };

  const metricTone=(definition,value)=>{
    if(n(value)==null)return "neutral";
    if(definition.lowerBetter)return "neutral";
    if(definition.target==null)return "neutral";
    if(Number(value)>=definition.target)return "good";
    if(Number(value)>=definition.target*0.97)return "warn";
    return "bad";
  };

  const metricCards=metricDefs.map((definition)=>{
    const value=focused?.[definition.key] ?? (definition.key==="mentor"?kpis.mentor:kpis[definition.key]);
    const previous=previousWeek?.[definition.key] ?? null;
    const delta=n(value)!=null&&n(previous)!=null?Number(value)-Number(previous):null;
    const tone=metricTone(definition,value);
    const gap=definition.target!=null&&n(value)!=null?Number(value)-definition.target:null;

    return {
      ...definition,
      value,
      previous,
      delta,
      gap,
      tone
    };
  });

  const targetCards=metricCards.filter((card)=>card.target!=null);
  const metricsOnTarget=targetCards.filter((card)=>card.tone==="good").length;
  const metricsBelow=targetCards.filter((card)=>card.tone==="warn"||card.tone==="bad").length;

  const statusForDriver=(driver)=>{
    if(n(driver.index)==null)return "neutral";
    if(Number(driver.index)>=100)return "strong";
    if(Number(driver.index)>=96)return "stable";
    if(Number(driver.index)>=90)return "watch";
    return "priority";
  };

  const distribution={
    strong:weekDrivers.filter((driver)=>statusForDriver(driver)==="strong").length,
    stable:weekDrivers.filter((driver)=>statusForDriver(driver)==="stable").length,
    watch:weekDrivers.filter((driver)=>statusForDriver(driver)==="watch").length,
    priority:weekDrivers.filter((driver)=>statusForDriver(driver)==="priority").length
  };

  const needsAttention=distribution.watch+distribution.priority;
  const measuredDrivers=weekDrivers.length;
  const fleetIndex=focused?.performance ?? average(weekDrivers.map((driver)=>driver.index));

  const metricDefForChart=
    metric==="performance"
      ?{label:"Fleet performance index",key:"performance",target:100,digits:1,suffix:""}
      :metricDefs.find((definition)=>definition.key===metric)||metricDefs[0];

  const chartPoints=selectedWeeks
    .map((week)=>({label:week.label,value:week[metricDefForChart.key]}))
    .filter((point)=>n(point.value)!=null);

  const previousAvailablePoint=(()=>{
    if(!focused)return null;
    const idx=allWeeks.findIndex((week)=>week.label===focused.label);
    if(idx<=0)return null;
    const previous=allWeeks[idx-1];
    const value=previous?.[metricDefForChart.key];
    return n(value)==null?null:{label:previous.label,value};
  })();

  const currentChartPoint=
    focused&&n(focused[metricDefForChart.key])!=null
      ?{label:focused.label,value:focused[metricDefForChart.key]}
      :chartPoints.at(-1)||null;

  const chartDelta=
    currentChartPoint&&previousAvailablePoint
      ?Number(currentChartPoint.value)-Number(previousAvailablePoint.value)
      :null;

  const chartWidth=980;
  const chartHeight=315;
  const chartLeft=66;
  const chartRight=30;
  const chartTop=34;
  const chartBottom=55;
  const plotWidth=chartWidth-chartLeft-chartRight;
  const plotHeight=chartHeight-chartTop-chartBottom;

  const chartValues=chartPoints.map((point)=>Number(point.value));
  if(metricDefForChart.target!=null)chartValues.push(Number(metricDefForChart.target));

  const rawMin=chartValues.length?Math.min(...chartValues):0;
  const rawMax=chartValues.length?Math.max(...chartValues):100;
  const rawSpan=Math.max(1,rawMax-rawMin);
  const chartPadding=Math.max(
    metricDefForChart.key==="mentor"?10:metricDefForChart.key==="performance"?2:0.5,
    rawSpan*0.22
  );
  const chartMin=Math.max(0,rawMin-chartPadding);
  const chartMax=Math.max(chartMin+1,rawMax+chartPadding);

  const pointX=(index)=>
    chartPoints.length<=1
      ?chartLeft+plotWidth/2
      :chartLeft+(index/(chartPoints.length-1))*plotWidth;

  const pointY=(value)=>
    chartTop+((chartMax-Number(value))/(chartMax-chartMin))*plotHeight;

  const linePoints=chartPoints
    .map((point,index)=>`${pointX(index)},${pointY(point.value)}`)
    .join(" ");

  const areaPoints=chartPoints.length
    ?`${pointX(0)},${chartTop+plotHeight} ${linePoints} ${pointX(chartPoints.length-1)},${chartTop+plotHeight}`
    :"";

  const targetY=
    metricDefForChart.target!=null
      ?pointY(metricDefForChart.target)
      :null;

  const strongestMetric=
    [...targetCards]
      .filter((card)=>n(card.value)!=null&&card.target)
      .sort((a,b)=>(Number(b.value)/b.target)-(Number(a.value)/a.target))[0]||null;

  const weakestMetric=
    [...targetCards]
      .filter((card)=>n(card.value)!=null&&card.target)
      .sort((a,b)=>(Number(a.value)/a.target)-(Number(b.value)/b.target))[0]||null;

  const positiveMovement=
    [...targetCards]
      .filter((card)=>card.delta!=null)
      .sort((a,b)=>Number(b.delta)-Number(a.delta))[0]||null;

  const negativeMovement=
    [...targetCards]
      .filter((card)=>card.delta!=null)
      .sort((a,b)=>Number(a.delta)-Number(b.delta))[0]||null;

  let filteredRanking=[...rankingSource];

  if(query.trim()){
    const q=query.toLowerCase();
    filteredRanking=filteredRanking.filter((driver)=>
      `${resolvedName(driver.driver)} ${driver.driver?.trid||""} ${driver.driver?.site||""}`
        .toLowerCase()
        .includes(q)
    );
  }

  if(statusFilter!=="all"){
    filteredRanking=filteredRanking.filter((driver)=>{
      const status=statusForDriver(driver);
      if(statusFilter==="attention")return status==="watch"||status==="priority";
      if(statusFilter==="healthy")return status==="strong"||status==="stable";
      if(statusFilter==="priority")return status==="priority";
      if(statusFilter==="partial")return driver.coverage<4;
      return true;
    });
  }

  const sortValue=(driver)=>{
    if(sortBy==="name")return resolvedName(driver.driver).toLowerCase();
    if(sortBy==="concessions")return n(driver.concessionsTotal)??-1;
    return n(driver[sortBy])??-1;
  };

  filteredRanking.sort((a,b)=>{
    const av=sortValue(a);
    const bv=sortValue(b);

    if(sortBy==="name"){
      return sortDir==="asc"
        ?String(av).localeCompare(String(bv))
        :String(bv).localeCompare(String(av));
    }

    return sortDir==="asc"
      ?Number(av)-Number(bv)
      :Number(bv)-Number(av);
  });

  const topDrivers=[...rankingSource]
    .filter((driver)=>n(driver.index)!=null)
    .sort((a,b)=>Number(b.index)-Number(a.index))
    .slice(0,5);

  const bottomDrivers=[...rankingSource]
    .filter((driver)=>n(driver.index)!=null)
    .sort((a,b)=>Number(a.index)-Number(b.index))
    .slice(0,5);

  const openDriver=(driver)=>{
    const status=statusForDriver(driver);
    onOpenDriver?.({
      id:driver.driver?.trid,
      dbId:driver.id,
      name:resolvedName(driver.driver),
      site:driver.driver?.site||"",
      performance:driver.index,
      dcr:driver.dcr,
      pod:driver.pod,
      iadc:driver.iadc,
      cc:driver.cc,
      psb:driver.psb,
      reattempts:driver.reattempts,
      concessions:driver.concessionsTotal,
      mentor_score:driver.mentor,
      fico:driver.mentor,
      ementor:driver.mentor,
      risk:status==="priority"?"High":status==="watch"?"Medium":"Low",
      issue:status==="priority"
        ?"Priority performance review"
        :status==="watch"
          ?"Performance review recommended"
          :"No active concern"
    });
  };

  const rangeLabel=
    range==="all"
      ?"Full history"
      :`${selectedWeeks.length} week${selectedWeeks.length===1?"":"s"}`;

  const scopeLabel=
    rankScope==="week"
      ?focused?.label||"Latest week"
      :rangeLabel;

  const distributionTotal=Math.max(1,measuredDrivers);
  const pctWidth=(value)=>`${Math.max(0,Math.min(100,(value/distributionTotal)*100))}%`;

  return <div className="pfp-root">
    <div className="pfp-heading">
      <div>
        <span className="pfp-kicker">PERFORMANCE INTELLIGENCE</span>
        <h1>Fleet performance</h1>
        <p>Operational health, weekly movement, target compliance and driver-level performance evidence.</p>
      </div>

      <div className="pfp-heading-controls">
        {sites.length>1&&
          <label>
            <span>Site</span>
            <select value={site} onChange={(event)=>setSite(event.target.value)}>
              <option value="all">All sites</option>
              {sites.map((item)=><option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        }

        <label>
          <span>Focus week</span>
          <select value={focusWeek} onChange={(event)=>setFocusWeek(event.target.value)}>
            <option value="latest">Latest · {defaultFocused?.label||"—"}</option>
            {[...selectedWeeks].reverse().map((week)=>
              <option key={week.label} value={week.label}>{week.label}</option>
            )}
          </select>
        </label>

        <div className="pfp-range-wrap">
          <span>History</span>
          <RangeTabs value={range} onChange={(value)=>{
            setRange(value);
            setFocusWeek("latest");
          }}/>
        </div>
      </div>
    </div>

    <section className="pfp-command-grid">
      <article className="pfp-command-card primary">
        <div className="pfp-command-icon">↗</div>
        <div>
          <span>Fleet index</span>
          <strong>{n(fleetIndex)==null?"—":Number(fleetIndex).toFixed(1)}</strong>
          <small>{focused?.label||"No reporting week"} · target 100</small>
        </div>
        <em className={n(fleetIndex)!=null&&Number(fleetIndex)>=100?"good":n(fleetIndex)!=null&&Number(fleetIndex)>=96?"warn":"bad"}>
          {n(fleetIndex)==null?"No data":Number(fleetIndex)>=100?"Strong":Number(fleetIndex)>=96?"Stable":"Attention"}
        </em>
      </article>

      <article className="pfp-command-card">
        <div className="pfp-command-icon">✓</div>
        <div>
          <span>Metrics on target</span>
          <strong>{metricsOnTarget}/{targetCards.length}</strong>
          <small>{metricsBelow?`${metricsBelow} metrics need attention`:"All measured targets achieved"}</small>
        </div>
      </article>

      <article className="pfp-command-card">
        <div className="pfp-command-icon">◎</div>
        <div>
          <span>Drivers measured</span>
          <strong>{measuredDrivers}</strong>
          <small>{focused?.label||"Current period"} · {scopedRows.length.toLocaleString()} loaded records</small>
        </div>
      </article>

      <article className={`pfp-command-card ${needsAttention?"attention":""}`}>
        <div className="pfp-command-icon">!</div>
        <div>
          <span>Needs attention</span>
          <strong>{needsAttention}</strong>
          <small>{distribution.priority} priority · {distribution.watch} watch</small>
        </div>
      </article>
    </section>

    <section className="pfp-metric-grid">
      {metricCards.map((card)=>
        <button
          type="button"
          key={card.key}
          className={`pfp-metric-card ${card.tone} ${metric===card.key?"selected":""}`}
          onClick={()=>setMetric(card.key)}
        >
          <div className="pfp-metric-title">
            <div>
              <span>{card.label}</span>
              <small>{card.description}</small>
            </div>
            <i className={card.tone}/>
          </div>

          <div className="pfp-metric-value-row">
            <strong>{formatMetric(card.key,card.value)}</strong>

            {card.delta!=null&&
              <em className={
                card.lowerBetter
                  ?card.delta<0?"good":card.delta>0?"bad":"neutral"
                  :card.delta>0?"good":card.delta<0?"bad":"neutral"
              }>
                {card.delta>0?"↑":card.delta<0?"↓":"•"} {Math.abs(card.delta).toFixed(card.key==="mentor"?0:2)}
              </em>
            }
          </div>

          <div className="pfp-metric-footer">
            <span>
              {card.target!=null
                ?`Target ≥ ${card.key==="mentor"?card.target:Number(card.target).toFixed(card.key==="iadc"?0:2)}${card.suffix}`
                :"Lower is better"}
            </span>
            <b className={card.tone}>
              {card.target==null
                ?"Quality signal"
                :card.tone==="good"
                  ?"On target"
                  :card.tone==="warn"
                    ?"Watch"
                    :card.tone==="bad"
                      ?"Below"
                      :"No data"}
            </b>
          </div>

          {card.target!=null&&n(card.value)!=null&&
            <div className="pfp-mini-progress">
              <i
                className={card.tone}
                style={{
                  width:`${Math.min(100,Math.max(2,
                    card.key==="mentor"
                      ?Number(card.value)/card.target*100
                      :Number(card.value)
                  ))}%`
                }}
              />
            </div>
          }
        </button>
      )}
    </section>

    <section className="pfp-analysis-grid">
      <article className="pfp-panel pfp-trend-panel">
        <div className="pfp-panel-head">
          <div>
            <span>WEEKLY MOVEMENT</span>
            <h2>{metricDefForChart.label}</h2>
            <p>{rangeLabel} · click a metric above to change the analysis.</p>
          </div>

          <div className="pfp-trend-tools">
            <select value={metric} onChange={(event)=>setMetric(event.target.value)}>
              <option value="performance">Performance index</option>
              {metricDefs.map((definition)=>
                <option key={definition.key} value={definition.key}>{definition.label}</option>
              )}
            </select>

            <div className="pfp-current">
              <span>{currentChartPoint?.label||focused?.label||"Current"}</span>
              <strong>{formatMetric(metricDefForChart.key,currentChartPoint?.value)}</strong>
              {chartDelta!=null&&
                <small className={
                  metricDefForChart.lowerBetter
                    ?chartDelta<0?"good":chartDelta>0?"bad":"neutral"
                    :chartDelta>0?"good":chartDelta<0?"bad":"neutral"
                }>
                  {chartDelta>0?"+":""}{chartDelta.toFixed(metricDefForChart.key==="mentor"?0:2)} vs {previousAvailablePoint?.label}
                </small>
              }
            </div>
          </div>
        </div>

        {chartPoints.length>=2?
          <div className="pfp-chart-shell">
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              preserveAspectRatio="none"
              role="img"
              aria-label={`${metricDefForChart.label} trend`}
            >
              <defs>
                <linearGradient id="pfpAreaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4f9d8d" stopOpacity=".22"/>
                  <stop offset="100%" stopColor="#4f9d8d" stopOpacity=".015"/>
                </linearGradient>
              </defs>

              {[0,0.25,0.5,0.75,1].map((step)=>{
                const y=chartTop+step*plotHeight;
                const value=chartMax-step*(chartMax-chartMin);

                return <g key={step}>
                  <line
                    x1={chartLeft}
                    y1={y}
                    x2={chartWidth-chartRight}
                    y2={y}
                    className="pfp-gridline"
                  />
                  <text
                    x={chartLeft-10}
                    y={y+4}
                    textAnchor="end"
                    className="pfp-y-label"
                  >
                    {metricDefForChart.key==="mentor"
                      ?value.toFixed(0)
                      :value.toFixed(metricDefForChart.key==="performance"?1:2)}
                  </text>
                </g>;
              })}

              {targetY!=null&&
                <g>
                  <line
                    x1={chartLeft}
                    y1={targetY}
                    x2={chartWidth-chartRight}
                    y2={targetY}
                    className="pfp-target-line"
                  />
                  <text
                    x={chartWidth-chartRight}
                    y={targetY-8}
                    textAnchor="end"
                    className="pfp-target-label"
                  >
                    Target {metricDefForChart.key==="mentor"
                      ?metricDefForChart.target
                      :Number(metricDefForChart.target).toFixed(metricDefForChart.key==="iadc"?0:2)}
                  </text>
                </g>
              }

              {areaPoints&&<polygon points={areaPoints} fill="url(#pfpAreaFill)"/>}
              {linePoints&&<polyline points={linePoints} className="pfp-line"/>}

              {chartPoints.map((point,index)=>{
                const x=pointX(index);
                const y=pointY(point.value);
                const isFocused=point.label===focused?.label;

                return <g key={point.label}>
                  {isFocused&&<circle cx={x} cy={y} r="12" className="pfp-focus-ring"/>}
                  <circle cx={x} cy={y} r="6" className="pfp-point"/>
                  <text
                    x={x}
                    y={Math.max(18,y-14)}
                    textAnchor="middle"
                    className="pfp-point-value"
                  >
                    {metricDefForChart.key==="mentor"
                      ?Number(point.value).toFixed(0)
                      :Number(point.value).toFixed(metricDefForChart.key==="performance"?1:2)}
                  </text>
                  <text
                    x={x}
                    y={chartHeight-18}
                    textAnchor="middle"
                    className={isFocused?"pfp-x-label active":"pfp-x-label"}
                  >
                    {point.label}
                  </text>
                </g>;
              })}
            </svg>

            <div className="pfp-chart-legend">
              <span><i className="actual"/>Actual</span>
              {metricDefForChart.target!=null&&<span><i className="target"/>Target</span>}
            </div>
          </div>
          :
          <div className="pfp-single-week">
            <div className="pfp-single-main">
              <span>Current snapshot</span>
              <strong>{formatMetric(metricDefForChart.key,currentChartPoint?.value)}</strong>
              <small>{currentChartPoint?.label||focused?.label||"No reporting week"}</small>
            </div>

            <div className="pfp-compare-card">
              <span>Previous available</span>
              <strong>{formatMetric(metricDefForChart.key,previousAvailablePoint?.value)}</strong>
              <small>{previousAvailablePoint?.label||"No previous evidence"}</small>
            </div>

            <div className="pfp-compare-card">
              <span>Movement</span>
              <strong className={
                chartDelta==null
                  ?"neutral"
                  :metricDefForChart.lowerBetter
                    ?chartDelta<0?"good":chartDelta>0?"bad":"neutral"
                    :chartDelta>0?"good":chartDelta<0?"bad":"neutral"
              }>
                {chartDelta==null?"—":`${chartDelta>0?"+":""}${chartDelta.toFixed(metricDefForChart.key==="mentor"?0:2)}`}
              </strong>
              <small>{chartDelta==null?"No comparison":"vs previous week"}</small>
            </div>

            <div className="pfp-compare-card">
              <span>Target</span>
              <strong>
                {metricDefForChart.target==null
                  ?"Lower"
                  :formatMetric(metricDefForChart.key,metricDefForChart.target)}
              </strong>
              <small>
                {metricDefForChart.target==null
                  ?"Lower is better"
                  :n(currentChartPoint?.value)==null
                    ?"No current evidence"
                    :Number(currentChartPoint.value)>=metricDefForChart.target
                      ?"On target"
                      :"Below target"}
              </small>
            </div>
          </div>
        }
      </article>

      <article className="pfp-panel pfp-signals-panel">
        <div className="pfp-panel-head">
          <div>
            <span>PERFORMANCE SIGNALS</span>
            <h2>{focused?.label||"Current week"}</h2>
            <p>Automatic summary from stored operational evidence.</p>
          </div>
        </div>

        <div className="pfp-signal-list">
          <div>
            <span className="good-dot"/>
            <div>
              <small>Strongest metric</small>
              <b>{strongestMetric?.label||"No evidence"}</b>
              <em>{strongestMetric?formatMetric(strongestMetric.key,strongestMetric.value):"—"}</em>
            </div>
          </div>

          <div>
            <span className="bad-dot"/>
            <div>
              <small>Largest target gap</small>
              <b>{weakestMetric?.label||"No evidence"}</b>
              <em>{weakestMetric?formatMetric(weakestMetric.key,weakestMetric.value):"—"}</em>
            </div>
          </div>

          <div>
            <span className="up-dot"/>
            <div>
              <small>Best WoW movement</small>
              <b>{positiveMovement?.label||"No comparison"}</b>
              <em>{positiveMovement?.delta!=null?`${positiveMovement.delta>0?"+":""}${positiveMovement.delta.toFixed(positiveMovement.key==="mentor"?0:2)}`:"—"}</em>
            </div>
          </div>

          <div>
            <span className="warn-dot"/>
            <div>
              <small>Weakest WoW movement</small>
              <b>{negativeMovement?.label||"No comparison"}</b>
              <em>{negativeMovement?.delta!=null?`${negativeMovement.delta>0?"+":""}${negativeMovement.delta.toFixed(negativeMovement.key==="mentor"?0:2)}`:"—"}</em>
            </div>
          </div>
        </div>

        <div className="pfp-distribution">
          <div className="pfp-distribution-head">
            <div>
              <b>Driver distribution</b>
              <small>{measuredDrivers} measured</small>
            </div>
            <span>{needsAttention} attention</span>
          </div>

          <div className="pfp-distribution-bar">
            <i className="strong" style={{width:pctWidth(distribution.strong)}}/>
            <i className="stable" style={{width:pctWidth(distribution.stable)}}/>
            <i className="watch" style={{width:pctWidth(distribution.watch)}}/>
            <i className="priority" style={{width:pctWidth(distribution.priority)}}/>
          </div>

          <div className="pfp-distribution-grid">
            <div><i className="strong"/><span>Strong</span><b>{distribution.strong}</b></div>
            <div><i className="stable"/><span>Stable</span><b>{distribution.stable}</b></div>
            <div><i className="watch"/><span>Watch</span><b>{distribution.watch}</b></div>
            <div><i className="priority"/><span>Priority</span><b>{distribution.priority}</b></div>
          </div>
        </div>
      </article>
    </section>

    <section className="pfp-ranking-header">
      <div>
        <span className="pfp-kicker">DRIVER PERFORMANCE</span>
        <h2>Performance ranking</h2>
        <p>Combined DCR, POD, IADC and Mentor evidence with direct driver drill-down.</p>
      </div>

      <div className="pfp-scope-tabs">
        <button
          type="button"
          className={rankScope==="week"?"active":""}
          onClick={()=>setRankScope("week")}
        >
          {focused?.label||"Latest week"}
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

    <section className="pfp-leader-grid">
      <article className="pfp-panel pfp-leader-panel">
        <div className="pfp-panel-head">
          <div>
            <span>TOP PERFORMERS</span>
            <h2>{scopeLabel}</h2>
            <p>Highest combined performance index.</p>
          </div>
        </div>

        <div className="pfp-leader-list">
          {topDrivers.map((driver,index)=>
            <button type="button" key={driver.id} onClick={()=>openDriver(driver)}>
              <span className="pfp-rank">{index+1}</span>
              <div className="pfp-driver-name">
                <b>{resolvedName(driver.driver)}</b>
                <small>{driver.driver?.trid||"—"}</small>
              </div>
              <span className="pfp-mini-pill good">{formatMetric("dcr",driver.dcr)}</span>
              <span className="pfp-mini-pill">{formatMetric("iadc",driver.iadc)}</span>
              <span className="pfp-mini-pill">{formatMetric("mentor",driver.mentor)}</span>
              <strong className="pfp-index good">{n(driver.index)==null?"—":Number(driver.index).toFixed(1)}</strong>
            </button>
          )}

          {!topDrivers.length&&<div className="pfp-empty">No driver performance evidence available.</div>}
        </div>
      </article>

      <article className="pfp-panel pfp-leader-panel attention">
        <div className="pfp-panel-head">
          <div>
            <span>NEEDS ATTENTION</span>
            <h2>{scopeLabel}</h2>
            <p>Lowest combined performance index first.</p>
          </div>
        </div>

        <div className="pfp-leader-list">
          {bottomDrivers.map((driver,index)=>{
            const status=statusForDriver(driver);

            return <button type="button" key={driver.id} onClick={()=>openDriver(driver)}>
              <span className="pfp-rank">{index+1}</span>
              <div className="pfp-driver-name">
                <b>{resolvedName(driver.driver)}</b>
                <small>{driver.driver?.trid||"—"}</small>
              </div>
              <span className={`pfp-mini-pill ${n(driver.dcr)!=null&&driver.dcr>=TARGETS.dcr?"good":"bad"}`}>{formatMetric("dcr",driver.dcr)}</span>
              <span className={`pfp-mini-pill ${n(driver.iadc)!=null&&driver.iadc>=TARGETS.iadc?"good":"bad"}`}>{formatMetric("iadc",driver.iadc)}</span>
              <span className={`pfp-mini-pill ${n(driver.mentor)!=null&&driver.mentor>=TARGETS.mentor?"good":"bad"}`}>{formatMetric("mentor",driver.mentor)}</span>
              <strong className={`pfp-index ${status}`}>{n(driver.index)==null?"—":Number(driver.index).toFixed(1)}</strong>
            </button>;
          })}

          {!bottomDrivers.length&&<div className="pfp-empty">No driver performance evidence available.</div>}
        </div>
      </article>
    </section>

    <section className="pfp-panel pfp-full-ranking">
      <div className="pfp-panel-head pfp-ranking-panel-head">
        <div>
          <span>FULL DRIVER REGISTER</span>
          <h2>{scopeLabel} ranking</h2>
          <p>{filteredRanking.length} drivers match the current filters.</p>
        </div>

        <div className="pfp-filterbar">
          <input
            value={query}
            onChange={(event)=>setQuery(event.target.value)}
            placeholder="Search driver or TRID…"
          />

          <select value={statusFilter} onChange={(event)=>setStatusFilter(event.target.value)}>
            <option value="all">All drivers</option>
            <option value="healthy">Strong / stable</option>
            <option value="attention">Needs attention</option>
            <option value="priority">Priority only</option>
            <option value="partial">Partial data</option>
          </select>

          <select value={sortBy} onChange={(event)=>setSortBy(event.target.value)}>
            <option value="index">Sort: Performance index</option>
            <option value="dcr">Sort: DCR</option>
            <option value="pod">Sort: POD</option>
            <option value="iadc">Sort: IADC</option>
            <option value="mentor">Sort: Mentor</option>
            <option value="cc">Sort: Contact compliance</option>
            <option value="concessions">Sort: Concessions</option>
            <option value="name">Sort: Driver name</option>
          </select>

          <button
            type="button"
            className="pfp-sort-dir"
            onClick={()=>setSortDir((value)=>value==="desc"?"asc":"desc")}
          >
            {sortDir==="desc"?"↓ High first":"↑ Low first"}
          </button>
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table pfp-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Driver</th>
              <th>Site</th>
              <th>Index</th>
              <th>DCR</th>
              <th>POD</th>
              <th>IADC</th>
              <th>Mentor</th>
              <th>CC</th>
              <th>Concessions</th>
              <th>Coverage</th>
              <th>Status</th>
              <th/>
            </tr>
          </thead>

          <tbody>
            {filteredRanking.map((driver,index)=>{
              const status=statusForDriver(driver);

              return <tr key={driver.id}>
                <td><span className="pfp-table-rank">{index+1}</span></td>
                <td>
                  <div className="pfp-table-driver">
                    <span>{String(resolvedName(driver.driver)).split(/\s+/).slice(0,2).map((part)=>part[0]).join("").toUpperCase()}</span>
                    <div>
                      <b>{resolvedName(driver.driver)}</b>
                      <small>{driver.driver?.trid||"—"}</small>
                    </div>
                  </div>
                </td>
                <td><span className="site-chip">{driver.driver?.site||"Unassigned"}</span></td>
                <td><span className={`pfp-index ${status}`}>{n(driver.index)==null?"—":Number(driver.index).toFixed(1)}</span></td>
                <td><span className={`pfp-data-pill ${n(driver.dcr)!=null&&driver.dcr>=TARGETS.dcr?"good":n(driver.dcr)==null?"neutral":"bad"}`}>{formatMetric("dcr",driver.dcr)}</span></td>
                <td><span className={`pfp-data-pill ${n(driver.pod)!=null&&driver.pod>=TARGETS.pod?"good":n(driver.pod)==null?"neutral":"bad"}`}>{formatMetric("pod",driver.pod)}</span></td>
                <td><span className={`pfp-data-pill ${n(driver.iadc)!=null&&driver.iadc>=TARGETS.iadc?"good":n(driver.iadc)==null?"neutral":"bad"}`}>{formatMetric("iadc",driver.iadc)}</span></td>
                <td><span className={`pfp-data-pill ${n(driver.mentor)!=null&&driver.mentor>=TARGETS.mentor?"good":n(driver.mentor)==null?"neutral":"bad"}`}>{formatMetric("mentor",driver.mentor)}</span></td>
                <td><span className={`pfp-data-pill ${n(driver.cc)!=null&&driver.cc>=98?"good":n(driver.cc)==null?"neutral":"bad"}`}>{formatMetric("cc",driver.cc)}</span></td>
                <td><span className={`pfp-concession ${driver.concessionsTotal>=3?"bad":driver.concessionsTotal>0?"warn":"good"}`}>{Number(driver.concessionsTotal||0).toFixed(0)}</span></td>
                <td><span className={`pfp-coverage ${driver.coverage>=4?"good":driver.coverage>=2?"warn":"bad"}`}>{driver.coverage}/5</span></td>
                <td><span className={`pfp-status ${status}`}>{status==="strong"?"Strong":status==="stable"?"Stable":status==="watch"?"Watch":status==="priority"?"Priority":"No data"}</span></td>
                <td><button type="button" className="profile-link" onClick={()=>openDriver(driver)}>Open →</button></td>
              </tr>;
            })}

            {!filteredRanking.length&&
              <EmptyRow columns={13} text="No drivers match the current performance filters."/>
            }
          </tbody>
        </table>
      </div>
    </section>

    <section className="pfp-panel pfp-week-history">
      <div className="pfp-panel-head">
        <div>
          <span>WEEKLY EVIDENCE</span>
          <h2>Fleet history</h2>
          <p>Stored averages and evidence coverage across the selected reporting window.</p>
        </div>

        <span className="pfp-history-count">{selectedWeeks.length} week{selectedWeeks.length===1?"":"s"}</span>
      </div>

      <div className="table-wrap">
        <table className="data-table pfp-history-table">
          <thead>
            <tr>
              <th>Week</th>
              <th>Drivers</th>
              <th>Index</th>
              <th>DCR</th>
              <th>POD</th>
              <th>IADC</th>
              <th>Mentor</th>
              <th>CC</th>
              <th>PSB</th>
              <th>Reattempts</th>
              <th>Avg concessions</th>
            </tr>
          </thead>

          <tbody>
            {[...selectedWeeks].reverse().map((week)=>{
              const indexTone=n(week.performance)==null?"neutral":week.performance>=100?"strong":week.performance>=96?"stable":week.performance>=90?"watch":"priority";

              return <tr key={week.label} className={week.label===focused?.label?"focused":""}>
                <td>
                  <button
                    type="button"
                    className="pfp-week-button"
                    onClick={()=>setFocusWeek(week.label)}
                  >
                    <b>{week.label}</b>
                    <small>{week.periodEnd||"Stored week"}</small>
                  </button>
                </td>
                <td>{week.drivers}</td>
                <td><span className={`pfp-index ${indexTone}`}>{formatMetric("performance",week.performance)}</span></td>
                <td>{formatMetric("dcr",week.dcr)}</td>
                <td>{formatMetric("pod",week.pod)}</td>
                <td>{formatMetric("iadc",week.iadc)}</td>
                <td>{formatMetric("mentor",week.mentor)}</td>
                <td>{formatMetric("cc",week.cc)}</td>
                <td>{formatMetric("psb",week.psb)}</td>
                <td>{formatMetric("reattempts",week.reattempts)}</td>
                <td>{formatMetric("concessions",week.concessions)}</td>
              </tr>;
            })}

            {!selectedWeeks.length&&<EmptyRow columns={11} text="No weekly performance evidence available."/>}
          </tbody>
        </table>
      </div>
    </section>

    <style jsx global>{`
      .pfp-root{width:100%;padding-bottom:28px;color:#1b2d42}
      .pfp-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;margin-bottom:18px}
      .pfp-kicker,.pfp-panel-head>div>span{display:block;font-size:10px;line-height:1.2;font-weight:900;letter-spacing:.13em;color:#4b9485}
      .pfp-heading h1{margin:5px 0 5px;font-size:32px;line-height:1.06;letter-spacing:-.025em;color:#14263a}
      .pfp-heading p{margin:0;max-width:690px;color:#748293;font-size:13px;line-height:1.55}
      .pfp-heading-controls{display:flex;align-items:flex-end;justify-content:flex-end;gap:10px;flex-wrap:wrap}
      .pfp-heading-controls label,.pfp-range-wrap{display:flex;flex-direction:column;gap:5px}
      .pfp-heading-controls label>span,.pfp-range-wrap>span{font-size:9px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#8b97a4}
      .pfp-heading-controls select{height:38px;min-width:120px;border:1px solid #dce4ea;border-radius:9px;background:#fff;padding:0 10px;color:#26394d;font-size:11px;font-weight:750;outline:none}
      .pfp-command-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:12px}
      .pfp-command-card{position:relative;display:grid;grid-template-columns:36px 1fr auto;align-items:center;gap:12px;min-height:92px;padding:15px 16px;background:#fff;border:1px solid #dfe6ec;border-radius:14px;box-shadow:0 3px 14px rgba(23,42,62,.035);overflow:hidden}
      .pfp-command-card:before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:#aab5c0}
      .pfp-command-card.primary:before,.pfp-command-card.good:before{background:#4f9d8d}.pfp-command-card.attention:before{background:#d8656f}
      .pfp-command-icon{display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:10px;background:#eef5f3;color:#3c8072;font-weight:900}
      .pfp-command-card>div:nth-child(2)>span{display:block;font-size:9px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#8794a3}
      .pfp-command-card strong{display:block;margin-top:4px;font-size:27px;line-height:1;color:#172a3f}
      .pfp-command-card small{display:block;margin-top:6px;color:#83909f;font-size:9px}
      .pfp-command-card>em{align-self:start;padding:5px 7px;border-radius:999px;background:#eef2f5;color:#748190;font-size:8px;font-style:normal;font-weight:900}
      .pfp-command-card>em.good{background:#e6f5ee;color:#2d775b}.pfp-command-card>em.warn{background:#fff1ce;color:#8e6713}.pfp-command-card>em.bad{background:#f8dfe2;color:#a2434e}
      .pfp-metric-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:14px}
      .pfp-metric-card{position:relative;min-width:0;padding:14px;border:1px solid #e0e7ec;border-radius:13px;background:#fff;text-align:left;cursor:pointer;transition:.16s ease;box-shadow:0 2px 9px rgba(20,40,59,.025)}
      .pfp-metric-card:hover{transform:translateY(-1px);box-shadow:0 7px 18px rgba(20,40,59,.055)}
      .pfp-metric-card.selected{border-color:#87b7ad;box-shadow:0 0 0 3px rgba(79,157,141,.09)}
      .pfp-metric-card.good{border-top:3px solid #4f9d8d}.pfp-metric-card.warn{border-top:3px solid #d4a13d}.pfp-metric-card.bad{border-top:3px solid #d8656f}.pfp-metric-card.neutral{border-top:3px solid #a8b3bf}
      .pfp-metric-title{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
      .pfp-metric-title span{display:block;color:#304359;font-size:10px;font-weight:900}.pfp-metric-title small{display:block;margin-top:2px;color:#98a2ad;font-size:8px}
      .pfp-metric-title>i{width:7px;height:7px;margin-top:3px;border-radius:50%;background:#a8b3bf}.pfp-metric-title>i.good{background:#4f9d8d}.pfp-metric-title>i.warn{background:#d4a13d}.pfp-metric-title>i.bad{background:#d8656f}
      .pfp-metric-value-row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:10px}
      .pfp-metric-value-row strong{font-size:23px;color:#15283d;letter-spacing:-.02em}.pfp-metric-value-row em{padding:4px 6px;border-radius:7px;background:#eef2f5;color:#7f8d9b;font-size:8px;font-style:normal;font-weight:900}
      .pfp-metric-value-row em.good{background:#e6f5ee;color:#2d775b}.pfp-metric-value-row em.bad{background:#f8dfe2;color:#a2434e}
      .pfp-metric-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px}.pfp-metric-footer span{color:#8a96a3;font-size:8px}.pfp-metric-footer b{font-size:8px}.pfp-metric-footer b.good{color:#2e795d}.pfp-metric-footer b.warn{color:#936b16}.pfp-metric-footer b.bad{color:#a44750}.pfp-metric-footer b.neutral{color:#7f8b98}
      .pfp-mini-progress{height:4px;margin-top:10px;border-radius:999px;background:#edf1f4;overflow:hidden}.pfp-mini-progress i{display:block;height:100%;border-radius:999px}.pfp-mini-progress i.good{background:#4f9d8d}.pfp-mini-progress i.warn{background:#d4a13d}.pfp-mini-progress i.bad{background:#d8656f}
      .pfp-analysis-grid{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(300px,.72fr);gap:12px;margin-bottom:17px}
      .pfp-panel{background:#fff;border:1px solid #dfe6ec;border-radius:15px;padding:17px;box-shadow:0 3px 14px rgba(20,40,59,.028)}
      .pfp-panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:13px}.pfp-panel-head h2{margin:4px 0 3px;font-size:18px;color:#192d43}.pfp-panel-head p{margin:0;color:#8592a1;font-size:10px;line-height:1.45}
      .pfp-trend-tools{display:flex;align-items:flex-start;gap:8px}.pfp-trend-tools select{height:36px;border:1px solid #dbe3e9;border-radius:8px;background:#fff;padding:0 9px;color:#304359;font-size:10px;font-weight:800}
      .pfp-current{min-width:105px;padding:7px 9px;border-radius:9px;background:#f4f7f8;text-align:right}.pfp-current span{display:block;color:#8d99a6;font-size:8px;font-weight:900;text-transform:uppercase}.pfp-current strong{display:block;margin-top:2px;color:#20354a;font-size:16px}.pfp-current small{display:block;margin-top:2px;font-size:8px;font-weight:900}.pfp-current small.good{color:#2d775b}.pfp-current small.bad{color:#a2434e}.pfp-current small.neutral{color:#7e8b98}
      .pfp-chart-shell{position:relative;height:332px;border:1px solid #e7ecef;border-radius:12px;background:linear-gradient(180deg,#fcfefe 0%,#fff 100%);overflow:hidden}.pfp-chart-shell svg{display:block;width:100%;height:100%}
      .pfp-gridline{stroke:#e9eef1;stroke-width:1;stroke-dasharray:3 5}.pfp-y-label{fill:#98a3ae;font-size:9px;font-weight:700}.pfp-target-line{stroke:#96a3b0;stroke-width:2;stroke-dasharray:8 7}.pfp-target-label{fill:#7b8997;font-size:9px;font-weight:800}.pfp-line{fill:none;stroke:#4f9d8d;stroke-width:4;stroke-linecap:round;stroke-linejoin:round}.pfp-point{fill:#fff;stroke:#4f9d8d;stroke-width:4}.pfp-focus-ring{fill:rgba(79,157,141,.14);stroke:#86b7ad;stroke-width:1}.pfp-point-value{fill:#21364b;font-size:10px;font-weight:900}.pfp-x-label{fill:#84919f;font-size:9px;font-weight:800}.pfp-x-label.active{fill:#2d7567}
      .pfp-chart-legend{position:absolute;left:15px;bottom:9px;display:flex;gap:15px;color:#7b8997;font-size:8px;font-weight:800}.pfp-chart-legend span{display:flex;align-items:center;gap:5px}.pfp-chart-legend i{width:17px;height:2px;display:inline-block}.pfp-chart-legend i.actual{background:#4f9d8d}.pfp-chart-legend i.target{border-top:2px dashed #96a3b0}
      .pfp-single-week{display:grid;grid-template-columns:1.2fr repeat(3,1fr);gap:9px;min-height:205px;align-items:stretch}.pfp-single-main,.pfp-compare-card{display:flex;flex-direction:column;justify-content:center;padding:18px;border:1px solid #e4eaee;border-radius:12px;background:#fafcfc}.pfp-single-main{background:linear-gradient(145deg,#173047 0%,#1f4e54 100%);border:0;color:#fff}.pfp-single-main span,.pfp-compare-card span{font-size:9px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;opacity:.7}.pfp-single-main strong{margin-top:8px;font-size:33px}.pfp-single-main small{margin-top:7px;opacity:.72}.pfp-compare-card strong{margin-top:9px;font-size:23px;color:#203449}.pfp-compare-card small{margin-top:6px;color:#8996a4;font-size:9px}.pfp-compare-card strong.good{color:#2e795d}.pfp-compare-card strong.bad{color:#aa4650}.pfp-compare-card strong.neutral{color:#73808d}
      .pfp-signal-list{display:grid;grid-template-columns:1fr 1fr;gap:8px}.pfp-signal-list>div{display:grid;grid-template-columns:8px 1fr;gap:8px;padding:10px;border:1px solid #e8edf0;border-radius:10px;background:#fafcfc}.pfp-signal-list>div>span{width:7px;height:7px;margin-top:4px;border-radius:50%}.good-dot{background:#4f9d8d}.bad-dot{background:#d8656f}.up-dot{background:#5f8fc7}.warn-dot{background:#d5a13d}.pfp-signal-list small{display:block;color:#929da9;font-size:7px;font-weight:900;text-transform:uppercase}.pfp-signal-list b{display:block;margin-top:3px;color:#263a4e;font-size:10px}.pfp-signal-list em{display:block;margin-top:2px;color:#697a8b;font-size:9px;font-style:normal;font-weight:800}
      .pfp-distribution{margin-top:13px;padding-top:12px;border-top:1px solid #edf1f4}.pfp-distribution-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.pfp-distribution-head b{display:block;color:#263a4e;font-size:10px}.pfp-distribution-head small{display:block;margin-top:2px;color:#94a0ab;font-size:8px}.pfp-distribution-head>span{padding:5px 7px;border-radius:999px;background:#fff1d0;color:#8b6517;font-size:8px;font-weight:900}
      .pfp-distribution-bar{display:flex;height:8px;margin:10px 0;border-radius:999px;background:#edf1f4;overflow:hidden}.pfp-distribution-bar i{display:block;height:100%}.pfp-distribution-bar i.strong{background:#3f8f78}.pfp-distribution-bar i.stable{background:#76aa9c}.pfp-distribution-bar i.watch{background:#d6a13d}.pfp-distribution-bar i.priority{background:#d8656f}
      .pfp-distribution-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}.pfp-distribution-grid>div{display:grid;grid-template-columns:7px 1fr auto;align-items:center;gap:5px;color:#7b8998;font-size:8px}.pfp-distribution-grid i{width:6px;height:6px;border-radius:50%}.pfp-distribution-grid i.strong{background:#3f8f78}.pfp-distribution-grid i.stable{background:#76aa9c}.pfp-distribution-grid i.watch{background:#d6a13d}.pfp-distribution-grid i.priority{background:#d8656f}.pfp-distribution-grid b{color:#2c4054}
      .pfp-ranking-header{display:flex;align-items:flex-end;justify-content:space-between;gap:15px;margin:4px 0 10px}.pfp-ranking-header h2{margin:4px 0 2px;color:#172a3f;font-size:20px}.pfp-ranking-header p{margin:0;color:#8794a2;font-size:10px}.pfp-scope-tabs{display:flex;padding:3px;border:1px solid #dce4ea;background:#eef3f5;border-radius:9px}.pfp-scope-tabs button{border:0;background:transparent;padding:7px 10px;border-radius:7px;color:#6f7e8e;font-size:9px;font-weight:850;cursor:pointer}.pfp-scope-tabs button.active{background:#fff;color:#1c3045;box-shadow:0 1px 4px rgba(22,40,60,.08)}
      .pfp-leader-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}.pfp-leader-panel{padding-bottom:10px}.pfp-leader-list>button{display:grid;grid-template-columns:30px minmax(155px,1fr) 65px 65px 58px 55px;align-items:center;gap:7px;width:100%;padding:9px 1px;border:0;border-top:1px solid #edf1f4;background:transparent;text-align:left;cursor:pointer}.pfp-leader-list>button:first-child{border-top:0}.pfp-leader-list>button:hover{background:#fafcfd}.pfp-rank,.pfp-table-rank{display:inline-flex;align-items:center;justify-content:center;width:25px;height:25px;border-radius:7px;background:#eef2f5;color:#657587;font-size:9px;font-weight:900}.pfp-driver-name b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#23374b;font-size:10px}.pfp-driver-name small{display:block;margin-top:2px;color:#99a4ae;font-size:7px}.pfp-mini-pill{display:inline-flex;justify-content:center;padding:5px 6px;border-radius:7px;background:#eef2f5;color:#6f7d8c;font-size:8px;font-weight:900}.pfp-mini-pill.good{background:#e5f5ed;color:#2b7658}.pfp-mini-pill.bad{background:#f8dfe2;color:#a2444e}
      .pfp-index{display:inline-flex;align-items:center;justify-content:center;min-width:43px;padding:5px 6px;border-radius:7px;font-size:9px;font-weight:900}.pfp-index.good,.pfp-index.strong{background:#e5f5ed;color:#2b7658}.pfp-index.stable{background:#e8f1f4;color:#3c6876}.pfp-index.watch{background:#fff1d0;color:#8b6517}.pfp-index.priority,.pfp-index.bad{background:#f8dfe2;color:#a2444e}.pfp-index.neutral{background:#eef2f5;color:#7e8a97}.pfp-empty{padding:25px;text-align:center;color:#929eaa;font-size:10px}
      .pfp-full-ranking{margin-bottom:12px}.pfp-ranking-panel-head{align-items:flex-end}.pfp-filterbar{display:flex;align-items:center;justify-content:flex-end;gap:7px;flex-wrap:wrap}.pfp-filterbar input,.pfp-filterbar select{height:34px;border:1px solid #dce4ea;border-radius:8px;background:#fff;padding:0 9px;color:#32465a;font-size:9px;outline:none}.pfp-filterbar input{min-width:170px}.pfp-sort-dir{height:34px;border:1px solid #dce4ea;border-radius:8px;background:#f7f9fa;padding:0 9px;color:#607184;font-size:9px;font-weight:800;cursor:pointer}
      .pfp-table th{position:sticky;top:0;background:#f8fafb;z-index:1;color:#738293;font-size:8px;white-space:nowrap}.pfp-table td{white-space:nowrap;font-size:9px}.pfp-table-driver{display:flex;align-items:center;gap:8px;min-width:150px}.pfp-table-driver>span{display:flex;align-items:center;justify-content:center;width:27px;height:27px;border-radius:8px;background:#e9f1f2;color:#3f776e;font-size:8px;font-weight:900}.pfp-table-driver b{display:block;color:#25394d;font-size:9px}.pfp-table-driver small{display:block;margin-top:1px;color:#99a4ae;font-size:7px}
      .pfp-data-pill,.pfp-concession,.pfp-coverage,.pfp-status{display:inline-flex;align-items:center;justify-content:center;min-width:50px;padding:5px 6px;border-radius:7px;font-size:8px;font-weight:900}.pfp-data-pill.good,.pfp-concession.good,.pfp-coverage.good{background:#e5f5ed;color:#2b7658}.pfp-data-pill.bad,.pfp-concession.bad,.pfp-coverage.bad{background:#f8dfe2;color:#a2444e}.pfp-data-pill.neutral{background:#eef2f5;color:#8995a1}.pfp-concession.warn,.pfp-coverage.warn{background:#fff1d0;color:#8b6517}.pfp-status.strong{background:#e5f5ed;color:#2b7658}.pfp-status.stable{background:#e8f1f4;color:#3d6876}.pfp-status.watch{background:#fff1d0;color:#8b6517}.pfp-status.priority{background:#f8dfe2;color:#a2444e}.pfp-status.neutral{background:#eef2f5;color:#8995a1}
      .pfp-history-count{padding:5px 8px;border-radius:999px;background:#eef3f5;color:#6d7d8d;font-size:8px;font-weight:900}.pfp-history-table th,.pfp-history-table td{white-space:nowrap;font-size:9px}.pfp-history-table tr.focused td{background:#f5faf8}.pfp-week-button{border:0;background:transparent;padding:0;text-align:left;cursor:pointer}.pfp-week-button b{display:block;color:#273b50;font-size:9px}.pfp-week-button small{display:block;margin-top:2px;color:#9aa5af;font-size:7px}
      @media(max-width:1450px){.pfp-metric-grid{grid-template-columns:repeat(4,1fr)}.pfp-analysis-grid{grid-template-columns:1fr}.pfp-leader-grid{grid-template-columns:1fr}}
      @media(max-width:1050px){.pfp-heading{flex-direction:column}.pfp-heading-controls{justify-content:flex-start}.pfp-command-grid{grid-template-columns:repeat(2,1fr)}.pfp-metric-grid{grid-template-columns:repeat(2,1fr)}.pfp-single-week{grid-template-columns:1fr 1fr}}
      @media(max-width:650px){.pfp-command-grid,.pfp-metric-grid,.pfp-single-week{grid-template-columns:1fr}.pfp-heading-controls{width:100%}.pfp-heading-controls label,.pfp-range-wrap{width:100%}.pfp-heading-controls select{width:100%}.pfp-panel-head,.pfp-ranking-header{flex-direction:column;align-items:flex-start}.pfp-trend-tools,.pfp-filterbar{width:100%}.pfp-filterbar>*{flex:1}.pfp-signal-list{grid-template-columns:1fr}}
    `}</style>
  </div>;
}
