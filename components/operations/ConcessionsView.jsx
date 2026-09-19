"use client";

import { useState } from "react";
import { ConcessionsHeader, ConcessionsKpis, ConcessionsMatrix, ConcessionsOverview } from "./ConcessionsSections";
import { buildConcessionsSignals } from "../../lib/operations/concessions";
import {
  ErrorBox,
  Loading,
  RangeTabs,
  contiguousWeeks,
  dname,
  filterRowsBySite,
  n,
  openShape,
  pct,
  trid,
  useOperationalRows,
  weekNo,
} from "../operations/OperationalShared";

export default function ConcessionsView({organizationId,onOpenDriver,siteFilter="all"}){
  const load=useOperationalRows(organizationId,"concessions");
  const [range,setRange]=useState(8);
  const [query,setQuery]=useState("");
  const [view,setView]=useState("matrix");
  const [rankWeek,setRankWeek]=useState("");
  const [sortMode,setSortMode]=useState("desc");
  const [showMode,setShowMode]=useState("all");

  const rows=filterRowsBySite(load.rows,siteFilter);

  if(load.loading)return <Loading text="Loading concessions intelligence…"/>;
  if(load.error)return <ErrorBox error={load.error}/>;

  const siteLabel=(driver)=>{
    const value=String(driver?.site||"").trim();
    return /^[A-Z]{2,5}\d+$/i.test(value)?value.toUpperCase():"Unassigned";
  };

  const concessionRows=rows.filter(r=>n(r.concessions)!=null);
  const weeks=contiguousWeeks(rows,range);
  const weekSet=new Set(weeks);
  const presentSet=new Set(concessionRows.map(r=>r.week_label));

  const weekTotals=weeks.map(w=>
    concessionRows
      .filter(r=>r.week_label===w)
      .reduce((sum,r)=>sum+(n(r.concessions)||0),0)
  );

  const map=new Map();

  for(const row of concessionRows){
    if(!weekSet.has(row.week_label))continue;

    const driver=row.drivers||{};
    const id=row.driver_id||trid(driver);
    const current=map.get(id)||{
      id,
      driver,
      byWeek:{},
      row
    };

    current.byWeek[row.week_label]=n(row.concessions);
    current.row=row;
    map.set(id,current);
  }

  const ranking=[...map.values()].map(x=>{
    const values=weeks.map(w=>
      Object.prototype.hasOwnProperty.call(x.byWeek,w)
        ?x.byWeek[w]
        :null
    );

    const reported=values.filter(v=>v!=null);
    const total=reported.reduce((a,b)=>a+b,0);
    const affected=reported.filter(v=>v>0).length;

    return {
      ...x,
      values,
      total,
      reported:reported.length,
      affected,
      avg:reported.length?total/reported.length:0
    };
  });

  const signals=buildConcessionsSignals({
    ranking,
    weeks,
    presentSet,
    weekTotals,
  });
  const {
    importedWeeks,
    latestWeek,
    previousWeek,
    wow,
    wowPct,
    repeatOffenders,
    missingWeeks,
    managementActions,
  }=signals;

  const effectiveRankWeek=
    rankWeek==="total"
      ?"total"
      :rankWeek&&presentSet.has(rankWeek)&&weeks.includes(rankWeek)
        ?rankWeek
        :(latestWeek||"total");

  const valueFor=(item)=>{
    if(effectiveRankWeek==="total")return item.total;

    return Object.prototype.hasOwnProperty.call(item.byWeek,effectiveRankWeek)
      ?item.byWeek[effectiveRankWeek]
      :null;
  };

  let filtered=ranking.filter(x=>
    `${dname(x.driver)} ${trid(x.driver)}`
      .toLowerCase()
      .includes(query.toLowerCase())
  );

  if(showMode==="affected"){
    filtered=filtered.filter(x=>(valueFor(x)||0)>0);
  }

  if(showMode==="repeat"){
    filtered=filtered.filter(x=>x.affected>=2);
  }

  filtered=[...filtered].sort((a,b)=>{
    if(sortMode==="name"){
      return dname(a.driver).localeCompare(dname(b.driver));
    }

    const av=valueFor(a);
    const bv=valueFor(b);

    const aa=av==null?-1:Number(av);
    const bb=bv==null?-1:Number(bv);

    if(sortMode==="asc"){
      return aa-bb||a.total-b.total;
    }

    return bb-aa||b.total-a.total;
  });

  const selectedWeekIndex=
    effectiveRankWeek==="total"
      ?-1
      :weeks.indexOf(effectiveRankWeek);

  const selectedTotal=
    effectiveRankWeek==="total"
      ?weekTotals.reduce((a,b)=>a+b,0)
      :(selectedWeekIndex>=0?weekTotals[selectedWeekIndex]:0);

  const selectedAffected=
    ranking.filter(x=>(valueFor(x)||0)>0).length;

  const leader=
    [...ranking]
      .filter(x=>(valueFor(x)||0)>0)
      .sort((a,b)=>
        (valueFor(b)||0)-(valueFor(a)||0)||
        b.total-a.total
      )[0]||null;

  const maxWeekly=
    Math.max(1,...weekTotals);

  const chartWidth=760;
  const chartHeight=245;
  const chartLeft=45;
  const chartRight=25;
  const chartTop=32;
  const chartBottom=46;
  const chartPlotWidth=chartWidth-chartLeft-chartRight;
  const chartPlotHeight=chartHeight-chartTop-chartBottom;
  const importedValues=weeks
    .map((week,index)=>presentSet.has(week)?weekTotals[index]:null)
    .filter(v=>v!=null);
  const chartMax=Math.max(1,...importedValues);
  const chartMin=Math.min(...importedValues);
  const chartSpan=Math.max(1,chartMax-chartMin);
  const trendPoints=weeks.map((week,index)=>{
    const imported=presentSet.has(week);
    const value=weekTotals[index];
    const x=weeks.length<=1
      ?chartLeft+chartPlotWidth/2
      :chartLeft+(index/(weeks.length-1))*chartPlotWidth;
    const y=imported
      ?chartTop+((chartMax-value)/chartSpan)*chartPlotHeight
      :null;
    const previousIndex=[...weeks]
      .slice(0,index)
      .map((w,i)=>presentSet.has(w)?i:-1)
      .filter(i=>i>=0)
      .pop();
    const previousValue=previousIndex==null?null:weekTotals[previousIndex];
    const delta=imported&&previousValue!=null?value-previousValue:null;
    return {week,index,imported,value,x,y,delta};
  });
  const importedTrendPoints=trendPoints.filter(p=>p.imported);
  const linePoints=importedTrendPoints.map(p=>`${p.x},${p.y}`).join(" ");
  const areaPoints=importedTrendPoints.length
    ?`${chartLeft},${chartTop+chartPlotHeight} ${linePoints} ${importedTrendPoints[importedTrendPoints.length-1].x},${chartTop+chartPlotHeight}`
    :"";

  const priority=
    [...ranking]
      .sort((a,b)=>
        (valueFor(b)||0)-(valueFor(a)||0)||
        b.total-a.total
      )
      .slice(0,5);

  const chooseWeek=(week)=>{
    if(!presentSet.has(week))return;

    setRankWeek(week);
    setSortMode("desc");
    setShowMode("affected");
    setView("matrix");
  };

  return <>
    <ConcessionsHeader
      view={view}
      setView={setView}
      range={range}
      setRange={setRange}
    />

    <ConcessionsKpis
      effectiveRankWeek={effectiveRankWeek}
      selectedTotal={selectedTotal}
      weeks={weeks}
      selectedAffected={selectedAffected}
      leader={leader}
      valueFor={valueFor}
      wow={wow}
      wowPct={wowPct}
      repeatOffenderCount={repeatOffenders.length}
      latestWeek={latestWeek}
      previousWeek={previousWeek}
    />

    {view==="matrix" && (
      <ConcessionsMatrix
        effectiveRankWeek={effectiveRankWeek}
        selectedTotal={selectedTotal}
        selectedAffected={selectedAffected}
        setRankWeek={setRankWeek}
        importedWeeks={importedWeeks}
        showMode={showMode}
        setShowMode={setShowMode}
        sortMode={sortMode}
        setSortMode={setSortMode}
        query={query}
        setQuery={setQuery}
        weeks={weeks}
        presentSet={presentSet}
        chooseWeek={chooseWeek}
        weekTotals={weekTotals}
        filtered={filtered}
        siteLabel={siteLabel}
        onOpenDriver={onOpenDriver}
      />
    )}

    {view==="overview" && (
      <ConcessionsOverview
        chartWidth={chartWidth}
        chartHeight={chartHeight}
        chartTop={chartTop}
        chartPlotHeight={chartPlotHeight}
        chartLeft={chartLeft}
        chartRight={chartRight}
        areaPoints={areaPoints}
        linePoints={linePoints}
        trendPoints={trendPoints}
        effectiveRankWeek={effectiveRankWeek}
        chooseWeek={chooseWeek}
        priority={priority}
        valueFor={valueFor}
        repeatOffenders={repeatOffenders}
        managementActions={managementActions}
        onOpenDriver={onOpenDriver}
        missingWeeks={missingWeeks}
        weeks={weeks}
        presentSet={presentSet}
        weekTotals={weekTotals}
      />
    )}

    <style jsx global>{`
      .cx2-head{
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:24px;
        margin-bottom:18px;
      }

      .cx2-head h1{
        font-size:32px;
        line-height:1.1;
        margin:5px 0 7px;
        color:#152238;
      }

      .cx2-head p{
        margin:0;
        color:#7b8898;
        font-size:14px;
      }

      .cx2-kicker,
      .cx2-card-head span{
        font-size:10px;
        font-weight:800;
        letter-spacing:.14em;
        color:#4a9384;
      }

      .cx2-head-actions{
        display:flex;
        align-items:center;
        gap:12px;
        flex-wrap:wrap;
        justify-content:flex-end;
      }

      .cx2-view-tabs{
        display:flex;
        padding:4px;
        border:1px solid #dce4ea;
        background:#edf2f5;
        border-radius:12px;
      }

      .cx2-view-tabs button{
        border:0;
        background:transparent;
        padding:9px 15px;
        border-radius:9px;
        font-weight:750;
        color:#687789;
        cursor:pointer;
      }

      .cx2-view-tabs button.active{
        background:#fff;
        color:#14243a;
        box-shadow:0 1px 5px rgba(18,35,55,.1);
      }

      .cx2-kpis{
        display:grid;
        grid-template-columns:repeat(4,minmax(0,1fr));
        gap:12px;
        margin-bottom:16px;
      }

      .cx2-kpis article{
        background:#fff;
        border:1px solid #dfe6ec;
        border-radius:14px;
        padding:17px 18px;
        min-height:104px;
        box-shadow:0 1px 2px rgba(16,35,54,.025);
      }

      .cx2-kpis article.risk{
        border-left:3px solid #d7656f;
      }

      .cx2-kpis article.good{
        border-left:3px solid #4e9788;
      }

      .cx2-kpis span{
        display:block;
        font-size:10px;
        text-transform:uppercase;
        letter-spacing:.1em;
        font-weight:800;
        color:#8290a1;
      }

      .cx2-kpis strong{
        display:block;
        margin-top:9px;
        font-size:29px;
        line-height:1;
        color:#17263b;
      }

      .cx2-kpis small{
        display:block;
        margin-top:7px;
        color:#6d7d8f;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }

      .cx2-card{
        background:#fff;
        border:1px solid #dfe6ec;
        border-radius:16px;
        padding:18px;
        box-shadow:0 2px 8px rgba(19,37,56,.03);
      }

      .cx2-card-head{
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:18px;
        margin-bottom:16px;
      }

      .cx2-card-head h2{
        font-size:19px;
        color:#17263b;
        margin:3px 0 4px;
      }

      .cx2-card-head p{
        margin:0;
        color:#8491a0;
        font-size:13px;
      }

      .cx2-summary-pill{
        display:flex;
        flex-direction:column;
        align-items:flex-end;
        padding:8px 11px;
        background:#f4f8f7;
        border:1px solid #dceae6;
        border-radius:10px;
      }

      .cx2-summary-pill b{
        font-size:12px;
        color:#2d6f62;
      }

      .cx2-summary-pill span{
        font-size:10px;
        color:#708075;
        letter-spacing:0;
        margin-top:2px;
      }

      .cx2-toolbar{
        display:grid;
        grid-template-columns:150px 150px 150px minmax(220px,1fr) auto;
        gap:10px;
        align-items:end;
        padding:13px;
        background:#f6f8fa;
        border:1px solid #e3e8ed;
        border-radius:12px;
        margin-bottom:12px;
      }

      .cx2-toolbar label{
        display:flex;
        flex-direction:column;
        gap:5px;
      }

      .cx2-toolbar label>span{
        font-size:9px;
        font-weight:800;
        letter-spacing:.1em;
        text-transform:uppercase;
        color:#8b97a6;
      }

      .cx2-toolbar select,
      .cx2-toolbar input{
        width:100%;
        height:40px;
        border:1px solid #d8e0e7;
        border-radius:9px;
        background:#fff;
        padding:0 11px;
        color:#24364b;
        font-weight:650;
        outline:none;
      }

      .cx2-toolbar select:focus,
      .cx2-toolbar input:focus{
        border-color:#7fb4a8;
        box-shadow:0 0 0 3px rgba(78,151,136,.1);
      }

      .cx2-reset{
        height:40px;
        border:1px solid #d8e0e7;
        background:#fff;
        color:#66778a;
        border-radius:9px;
        padding:0 14px;
        font-weight:750;
        cursor:pointer;
      }

      .cx2-reset:hover{
        background:#f0f4f6;
      }

      .cx2-week-strip{
        display:flex;
        gap:7px;
        overflow:auto;
        padding:2px 0 12px;
      }

      .cx2-week-strip button{
        min-width:68px;
        border:1px solid #dfe6ec;
        background:#fff;
        border-radius:10px;
        padding:8px 10px;
        cursor:pointer;
        text-align:left;
      }

      .cx2-week-strip button span{
        display:block;
        font-size:9px;
        font-weight:800;
        color:#8996a5;
        text-transform:uppercase;
      }

      .cx2-week-strip button strong{
        display:block;
        font-size:16px;
        color:#21344a;
        margin-top:2px;
      }

      .cx2-week-strip button.selected{
        background:#eaf5f2;
        border-color:#8ebeb3;
      }

      .cx2-week-strip button.selected span,
      .cx2-week-strip button.selected strong{
        color:#2f7467;
      }

      .cx2-week-strip button.missing{
        border-style:dashed;
        background:#fafbfc;
        cursor:not-allowed;
      }

      .cx2-week-strip button:disabled strong{
        color:#b2bac4;
      }

      .cx2-table-wrap{
        overflow:auto;
        border:1px solid #e4e9ee;
        border-radius:12px;
      }

      .cx2-table{
        width:100%;
        border-collapse:separate;
        border-spacing:0;
        min-width:1100px;
        background:#fff;
      }

      .cx2-table th{
        position:sticky;
        top:0;
        z-index:2;
        background:#f8fafb;
        padding:10px 9px;
        border-bottom:1px solid #dfe6ec;
        text-align:center;
        font-size:9px;
        letter-spacing:.08em;
        text-transform:uppercase;
        color:#7b8999;
        white-space:nowrap;
      }

      .cx2-table th:nth-child(2),
      .cx2-table td:nth-child(2){
        text-align:left;
      }

      .cx2-table th button{
        border:0;
        background:transparent;
        font:inherit;
        color:inherit;
        cursor:pointer;
        padding:0;
      }

      .cx2-table th button:disabled{
        cursor:not-allowed;
        color:#b7bec7;
      }

      .cx2-table td{
        padding:10px 9px;
        border-bottom:1px solid #edf1f4;
        text-align:center;
        color:#33465b;
        font-size:12px;
        white-space:nowrap;
      }

      .cx2-table tbody tr:hover td{
        background:#fbfcfd;
      }

      .cx2-table tbody tr.top-row td{
        background:#fdfefe;
      }

      .cx2-table .selected-col{
        background:#eef7f4!important;
      }

      .cx2-driver-cell b{
        display:block;
        color:#1f3045;
        font-size:12px;
      }

      .cx2-driver-cell small{
        display:block;
        color:#98a3af;
        font-size:10px;
        margin-top:2px;
      }

      .cx2-table code{
        font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
        font-size:10px;
        background:#f2f5f7;
        padding:5px 6px;
        border-radius:6px;
        color:#506276;
      }

      .cx2-rank{
        display:inline-flex;
        width:28px;
        height:28px;
        align-items:center;
        justify-content:center;
        border-radius:8px;
        background:#edf2f5;
        color:#607184;
        font-weight:800;
      }

      .cx2-score{
        display:inline-flex;
        min-width:30px;
        height:28px;
        align-items:center;
        justify-content:center;
        padding:0 7px;
        border-radius:8px;
        font-weight:800;
      }

      .cx2-score.good{
        background:#e5f5ec;
        color:#26744f;
        border:1px solid #cce9d9;
      }

      .cx2-score.warn{
        background:#fff4cf;
        color:#8a6818;
        border:1px solid #f2e3ad;
      }

      .cx2-score.med{
        background:#fde6b7;
        color:#925f0a;
        border:1px solid #f2d591;
      }

      .cx2-score.high{
        background:#f7dde0;
        color:#a3424b;
        border:1px solid #edc7cc;
      }

      .cx2-empty{
        color:#b2bbc5;
      }

      .cx2-total{
        display:inline-flex;
        min-width:34px;
        justify-content:center;
        padding:6px 8px;
        border-radius:8px;
        background:#edf2f5;
        color:#25384d;
      }

      .cx2-affected{
        color:#6c7d8f;
        font-weight:700;
      }

      .cx2-footnote{
        display:flex;
        justify-content:space-between;
        gap:12px;
        padding:10px 3px 0;
        color:#8b97a5;
        font-size:10px;
      }

      .cx2-overview-grid{
        display:grid;
        grid-template-columns:minmax(0,1.45fr) minmax(320px,.8fr);
        gap:14px;
        margin-bottom:14px;
      }

      .cx2-trend-shell{
        display:flex;
        flex-direction:column;
        gap:12px;
      }

      .cx2-trend-legend{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:14px;
        color:#66778a;
        font-size:11px;
      }

      .cx2-trend-legend span{
        display:flex;
        align-items:center;
        gap:7px;
      }

      .cx2-trend-legend .dot{
        width:8px;
        height:8px;
        border-radius:50%;
        display:inline-block;
        background:#4e9788;
      }

      .cx2-trend-legend .hint{
        color:#9aa5b1;
      }

      .cx2-trend-chart{
        height:300px;
        border:1px solid #e6ebef;
        background:linear-gradient(180deg,#fcfefe 0%,#ffffff 100%);
        border-radius:13px;
        overflow:hidden;
      }

      .cx2-trend-chart svg{
        width:100%;
        height:100%;
        display:block;
        overflow:visible;
      }

      .cx2-gridline{
        stroke:#e8edf1;
        stroke-width:1;
        stroke-dasharray:3 5;
      }

      .cx2-trend-line{
        fill:none;
        stroke:#4e9788;
        stroke-width:4;
        stroke-linecap:round;
        stroke-linejoin:round;
      }

      .cx2-point-group{
        cursor:pointer;
      }

      .cx2-point{
        fill:#ffffff;
        stroke:#4e9788;
        stroke-width:4;
      }

      .cx2-selected-ring{
        fill:rgba(78,151,136,.13);
        stroke:#8fc1b6;
        stroke-width:1;
      }

      .cx2-missing-dot{
        fill:#ffffff;
        stroke:#c6ced6;
        stroke-width:2;
        stroke-dasharray:2 2;
      }

      .cx2-point-value{
        fill:#1e3147;
        font-size:12px;
        font-weight:800;
      }

      .cx2-axis-label{
        fill:#7d8b9b;
        font-size:10px;
        font-weight:800;
      }

      .cx2-axis-label.selected{
        fill:#2f7668;
      }

      .cx2-axis-label.missing{
        fill:#b4bdc6;
      }

      .cx2-delta-row{
        display:grid;
        grid-template-columns:repeat(8,minmax(82px,1fr));
        gap:7px;
      }

      .cx2-delta-row button{
        min-width:0;
        border:1px solid #e1e7ec;
        background:#fff;
        border-radius:10px;
        padding:8px 9px;
        text-align:left;
        cursor:pointer;
      }

      .cx2-delta-row button.selected{
        border-color:#8ebeb3;
        background:#eff8f5;
      }

      .cx2-delta-row button.missing{
        border-style:dashed;
        background:#fafbfc;
        cursor:not-allowed;
      }

      .cx2-delta-row span{
        display:block;
        font-size:9px;
        font-weight:800;
        color:#8a97a6;
      }

      .cx2-delta-row b{
        display:block;
        margin-top:2px;
        font-size:16px;
        color:#20344a;
      }

      .cx2-delta-row small{
        display:block;
        margin-top:3px;
        font-size:9px;
        font-weight:800;
      }

      .cx2-delta-row small.up{
        color:#b54b57;
      }

      .cx2-delta-row small.down{
        color:#2f7d5f;
      }

      .cx2-delta-row small.flat{
        color:#8895a3;
      }

      .cx2-bars{
        height:220px;
        display:flex;
        gap:10px;
        align-items:stretch;
        padding-top:6px;
      }

      .cx2-bars button{
        flex:1;
        display:grid;
        grid-template-rows:22px 1fr 20px;
        gap:6px;
        border:0;
        background:transparent;
        cursor:pointer;
        text-align:center;
      }

      .cx2-bars button>span{
        font-size:11px;
        font-weight:800;
        color:#32465b;
      }

      .cx2-bars button>div{
        display:flex;
        align-items:flex-end;
        justify-content:center;
        border-radius:7px;
        background:#f3f6f8;
        overflow:hidden;
      }

      .cx2-bars button i{
        display:block;
        width:34px;
        min-height:5px;
        border-radius:6px 6px 2px 2px;
        background:#4e9788;
      }

      .cx2-bars button small{
        font-weight:800;
        color:#8290a0;
      }

      .cx2-bars button.missing{
        cursor:not-allowed;
      }

      .cx2-bars button.missing>div{
        border:1px dashed #d9e0e6;
        background:#fafbfc;
      }

      .cx2-top-list button{
        width:100%;
        display:grid;
        grid-template-columns:34px 1fr 50px;
        align-items:center;
        gap:10px;
        border:0;
        border-top:1px solid #edf1f4;
        background:transparent;
        padding:11px 2px;
        text-align:left;
        cursor:pointer;
      }

      .cx2-top-list button:first-child{
        border-top:0;
      }

      .cx2-top-list button:hover{
        background:#fafcfd;
      }

      .cx2-top-list b{
        display:block;
        color:#22354b;
      }

      .cx2-top-list small{
        display:block;
        color:#96a1ad;
        font-size:10px;
        margin-top:2px;
      }

      .cx2-top-list strong{
        text-align:right;
        font-size:18px;
        color:#1f3348;
      }

      .cx2-health{
        margin-bottom:10px;
      }

      .cx2-health-row{
        display:flex;
        gap:8px;
        flex-wrap:wrap;
      }

      .cx2-health-row button{
        border:1px solid #dfe6ec;
        border-radius:10px;
        background:#fff;
        padding:9px 12px;
        min-width:95px;
        text-align:left;
        cursor:pointer;
      }

      .cx2-health-row button.ok{
        border-left:3px solid #4e9788;
      }

      .cx2-health-row button.missing{
        border-left:3px solid #caa04e;
        cursor:not-allowed;
      }

      .cx2-health-row span{
        display:block;
        font-size:10px;
        font-weight:800;
        color:#8491a0;
      }

      .cx2-health-row b{
        display:block;
        font-size:12px;
        color:#23364b;
        margin-top:2px;
      }

      @media(max-width:1250px){
        .cx2-kpis{
          grid-template-columns:repeat(2,1fr);
        }

        .cx2-toolbar{
          grid-template-columns:repeat(3,1fr);
        }

        .cx2-search-label{
          grid-column:span 2;
        }

        .cx2-overview-grid{
          grid-template-columns:1fr;
        }
      }

      @media(max-width:1100px){
        .cx2-delta-row{
          grid-template-columns:repeat(4,minmax(82px,1fr));
        }
      }

      @media(max-width:850px){
        .cx2-head{
          flex-direction:column;
        }

        .cx2-head-actions{
          justify-content:flex-start;
        }

        .cx2-kpis{
          grid-template-columns:1fr 1fr;
        }

        .cx2-toolbar{
          grid-template-columns:1fr 1fr;
        }

        .cx2-search-label{
          grid-column:1/-1;
        }

        .cx2-reset{
          grid-column:1/-1;
        }

        .cx2-card{
          padding:13px;
        }
      }

      @media(max-width:560px){
        .cx2-kpis{
          grid-template-columns:1fr;
        }

        .cx2-toolbar{
          grid-template-columns:1fr;
        }

        .cx2-search-label,
        .cx2-reset{
          grid-column:auto;
        }

        .cx2-summary-pill{
          display:none;
        }
      }
    `}</style>
  </>;
}

