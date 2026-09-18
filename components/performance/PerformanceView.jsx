"use client";

import { useMemo, useState } from "react";
import { TARGETS } from "../../lib/config/performance";
import {
  average,
  driverIndex,
  fmtNum,
  fmtPct,
  mentorScore,
  metricStatus,
  n,
  periodKey,
  resolvedName,
  targetFor,
  weekNumber,
} from "../../lib/performance/metrics";
import { EmptyRow, ProTrendChart, RangeTabs } from "./PerformancePrimitives";

export default function PerformanceView({ rows = [], kpis = {}, onOpenDriver }) {
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
            <select aria-label="Filter performance by site" value={site} onChange={(event)=>setSite(event.target.value)}>
              <option value="all">All sites</option>
              {sites.map((item)=><option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        }

        <label>
          <span>Focus week</span>
          <select aria-label="Select performance week" value={focusWeek} onChange={(event)=>setFocusWeek(event.target.value)}>
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
            <select aria-label="Select performance metric" value={metric} onChange={(event)=>setMetric(event.target.value)}>
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

          <select aria-label="Filter performance status" value={statusFilter} onChange={(event)=>setStatusFilter(event.target.value)}>
            <option value="all">All drivers</option>
            <option value="healthy">Strong / stable</option>
            <option value="attention">Needs attention</option>
            <option value="priority">Priority only</option>
            <option value="partial">Partial data</option>
          </select>

          <select aria-label="Sort performance table" value={sortBy} onChange={(event)=>setSortBy(event.target.value)}>
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
                <td><span className={`pfp-data-pill ${n(driver.cc)!=null&&driver.cc>=TARGETS.cc?"good":n(driver.cc)==null?"neutral":"bad"}`}>{formatMetric("cc",driver.cc)}</span></td>
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

    
  </div>;
}
