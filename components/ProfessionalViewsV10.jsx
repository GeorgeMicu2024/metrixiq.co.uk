"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "../lib/supabase/client";

const TARGETS = { iadc: 80, mentor: 815 };
const RANGE_OPTIONS = [1,2,4,8,12,26,52,"all"];

const n = (v) => v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v);
const pct = (v,d=2) => n(v)==null ? "—" : `${Number(v).toFixed(d)}%`;
const weekNo = (label) => Number(String(label||"").replace(/\D/g,"")) || 0;
const dname = (d) => d?.full_name || d?.name || "Unresolved driver";
const trid = (d) => d?.trid || d?.id || "—";

function useDbRows(organizationId, kind){
  const [state,setState]=useState({loading:true,error:"",rows:[]});

  useEffect(()=>{
    let alive=true;

    if(!organizationId){
      setState({loading:false,error:"",rows:[]});
      return ()=>{};
    }

    (async()=>{
      try{
        setState((s)=>({...s,loading:true,error:""}));

        const supabase=getSupabaseBrowserClient();
        const PAGE_SIZE=1000;
        const allRows=[];

        for(let from=0;;from+=PAGE_SIZE){
          let query=supabase
            .from("driver_metrics")
            .select("driver_id,week_label,period_start,period_end,iadc,mentor_score,ementor,fico,concessions,raw_data,risk,issue,drivers(id,trid,full_name,site,status)")
            .eq("organization_id",organizationId)
            .order("period_end",{ascending:true})
            .order("driver_id",{ascending:true})
            .range(from,from+PAGE_SIZE-1);

          if(kind==="iadc"){
            query=query.not("iadc","is",null);
          }

          const {data,error}=await query;

          if(error) throw error;

          const page=data||[];
          allRows.push(...page);

          if(page.length<PAGE_SIZE) break;
        }

        const rows=allRows.filter((row)=>{
          if(kind==="mentor"){
            return n(row.mentor_score ?? row.ementor ?? row.fico)!=null || row.raw_data?.mentor;
          }
          return true;
        });

        if(alive){
          setState({loading:false,error:"",rows});
        }

      }catch(error){
        if(alive){
          setState({
            loading:false,
            error:error?.message||"Could not load data.",
            rows:[]
          });
        }
      }
    })();

    return ()=>{alive=false;};

  },[organizationId,kind]);

  return state;
}
function Loading({text}){return <section className="panel ops-empty"><div className="auth-spinner"/><b>{text}</b></section>;}
function ErrorBox({error}){return <section className="panel ops-empty error"><b>Unable to load this view</b><span>{error}</span></section>;}
function RangeTabs({value,onChange}){return <div className="v10-range-tabs">{RANGE_OPTIONS.map((x)=><button type="button" key={String(x)} className={value===x?"active":""} onClick={()=>onChange(x)}>{x==="all"?"All":`${x}W`}</button>)}</div>;}
function toneIadc(v){const x=n(v);return x==null?"neutral":x>=90?"excellent":x>=80?"good":x>=70?"warn":"bad";}
function toneMentor(v){const x=n(v);return x==null?"neutral":x>=830?"excellent":x>=815?"good":x>=790?"warn":"bad";}
function riskTone(v){const s=String(v||"").toLowerCase();return s.includes("high")?"high":s.includes("medium")?"med":s.includes("low")?"low":"neutral";}
function openShape(row,extra={}){
  const d=row?.drivers||{};
  return {id:trid(d),dbId:row?.driver_id,name:dname(d),site:d.site||"DLS2",...extra};
}

export function DirectIadcView({organizationId,onOpenDriver,onImport}){
  const load=useDbRows(organizationId,"iadc");
  const rows=load.rows;
  const weeks=useMemo(()=>[...new Set(rows.map(r=>r.week_label).filter(Boolean))].sort((a,b)=>weekNo(b)-weekNo(a)),[rows]);
  const [week,setWeek]=useState("");
  const [query,setQuery]=useState("");
  const selectedWeek=week||weeks[0]||"";
  const selected=useMemo(()=>rows.filter(r=>r.week_label===selectedWeek).sort((a,b)=>Number(b.iadc)-Number(a.iadc)),[rows,selectedWeek]);
  const filtered=selected.filter(r=>`${dname(r.drivers)} ${trid(r.drivers)} ${r.drivers?.site||""}`.toLowerCase().includes(query.toLowerCase()));
  const avg=selected.length?selected.reduce((s,r)=>s+Number(r.iadc),0)/selected.length:null;
  const below=selected.filter(r=>Number(r.iadc)<80).length;
  const onTarget=selected.filter(r=>Number(r.iadc)>=80).length;
  const excellent=selected.filter(r=>Number(r.iadc)>=90).length;
  const top=selected.slice(0,5);
  const bottom=[...selected].sort((a,b)=>Number(a.iadc)-Number(b.iadc)).slice(0,5);

  if(load.loading)return <Loading text="Loading IADC directly from saved driver metrics…"/>;
  if(load.error)return <ErrorBox error={load.error}/>;

  return <>
    <div className="page-heading v10-heading">
      <div><span className="page-kicker">WORKFLOW COMPLIANCE</span><h1>IADC intelligence</h1><p>Direct database view: driver name, Transporter ID and exact weekly IADC percentage.</p></div>
      <div className="scorecard-filter-row"><select value={selectedWeek} onChange={e=>setWeek(e.target.value)}>{weeks.map(w=><option key={w}>{w}</option>)}</select><button className="btn primary" onClick={onImport}>Import IADC</button></div>
    </div>

    <section className="v10-kpi-grid six">
      <article><span>Fleet IADC</span><strong>{pct(avg,1)}</strong><small>Target ≥ 80%</small></article>
      <article><span>Measured drivers</span><strong>{selected.length}</strong><small>{selectedWeek||"No period"}</small></article>
      <article className={below?"warn":""}><span>Below target</span><strong>{below}</strong><small>Coaching priority</small></article>
      <article><span>On target</span><strong>{onTarget}</strong><small>80%+</small></article>
      <article><span>Excellent</span><strong>{excellent}</strong><small>90%+</small></article>
      <article><span>Best result</span><strong>{top[0]?pct(top[0].iadc,1):"—"}</strong><small>{top[0]?dname(top[0].drivers):"No evidence"}</small></article>
    </section>

    <section className="dashboard-grid lower">
      <article className="panel v10-rank-card"><div className="panel-head"><div><h2>Top 5 IADC</h2><p>Best in-app delivery workflow compliance.</p></div></div>{top.map((r,i)=><button key={`${r.driver_id}-${i}`} onClick={()=>onOpenDriver?.(openShape(r,{iadc:n(r.iadc)}))}><span className="rank-badge">{i+1}</span><div><b>{dname(r.drivers)}</b><small>{trid(r.drivers)}</small></div><strong>{pct(r.iadc)}</strong></button>)}</article>
      <article className="panel v10-rank-card attention"><div className="panel-head"><div><h2>Bottom 5 — coaching</h2><p>Lowest IADC results first.</p></div></div>{bottom.map((r,i)=><button key={`${r.driver_id}-${i}`} onClick={()=>onOpenDriver?.(openShape(r,{iadc:n(r.iadc),risk:"Medium",issue:"IADC below target"}))}><span className="rank-badge">{i+1}</span><div><b>{dname(r.drivers)}</b><small>{trid(r.drivers)}</small></div><strong>{pct(r.iadc)}</strong></button>)}</article>
    </section>

    <section className="panel v10-table-panel">
      <div className="panel-head"><div><h2>Driver IADC register</h2><p>Modelled after your George DLS2 spreadsheet: Name + Transporter ID + IADC %.</p></div><input className="v10-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search driver or Transporter ID…"/></div>
      <div className="table-wrap"><table className="data-table v10-iadc-table"><thead><tr><th>#</th><th>Driver</th><th>Transporter ID</th><th>IADC %</th><th>Visual score</th><th>Gap to 80%</th><th>DWC</th><th>Band</th><th /></tr></thead><tbody>
      {filtered.map((r,i)=>{const value=Number(r.iadc),gap=value-80,t=toneIadc(value);return <tr key={`${r.driver_id}-${selectedWeek}-${i}`}><td><span className="rank-badge">{i+1}</span></td><td><b>{dname(r.drivers)}</b><small className="history-date">{r.drivers?.site||"DLS2"}</small></td><td><code className="v10-trid">{trid(r.drivers)}</code></td><td><b className={`v10-score ${t}`}>{pct(value)}</b></td><td><div className="v10-progress"><i className={t} style={{width:`${Math.max(0,Math.min(100,value))}%`}}/></div></td><td><span className={gap>=0?"v10-positive":"v10-negative"}>{gap>=0?"+":""}{gap.toFixed(2)} pp</span></td><td>{pct(r.raw_data?.dwc)}</td><td><span className={`v10-band ${t}`}>{value>=90?"Excellent":value>=80?"On target":value>=70?"Watch":"Priority"}</span></td><td><button className="profile-link" onClick={()=>onOpenDriver?.(openShape(r,{iadc:value,risk:value<80?"Medium":"Low",issue:value<80?"IADC below 80% target":"No active concern"}))}>Open →</button></td></tr>})}
      {!filtered.length&&<tr><td colSpan="9"><div className="v10-empty">No IADC rows returned for this week.</div></td></tr>}
      </tbody></table></div>
    </section>
  </>;
}

export function DirectMentorView({organizationId,onOpenDriver}){
  const load=useDbRows(organizationId,"mentor");
  const [range,setRange]=useState(4);
  const [query,setQuery]=useState("");
  const presentWeeks=useMemo(()=>[...new Set(load.rows.map(r=>r.week_label).filter(Boolean))].sort((a,b)=>weekNo(a)-weekNo(b)),[load.rows]);
  const weeks=range==="all"?presentWeeks:presentWeeks.slice(-Number(range));
  const set=new Set(weeks);
  const map=useMemo(()=>{
    const m=new Map();
    for(const row of load.rows){
      if(!set.has(row.week_label))continue;
      const d=row.drivers||{};
      const id=row.driver_id||trid(d);
      const cur=m.get(id)||{id,driver:d,scores:[],details:null,row};
      const score=n(row.mentor_score ?? row.ementor ?? row.fico);
      if(score!=null)cur.scores.push(score);
      if(row.raw_data?.mentor)cur.details=row.raw_data.mentor;
      cur.row=row;
      m.set(id,cur);
    }
    return [...m.values()].map(x=>({...x,score:x.scores.length?x.scores.reduce((a,b)=>a+b,0)/x.scores.length:null})).filter(x=>x.score!=null||x.details).sort((a,b)=>(b.score??-1)-(a.score??-1));
  },[load.rows,weeks.join("|")]);

  if(load.loading)return <Loading text="Loading Mentor directly from saved driver metrics…"/>;
  if(load.error)return <ErrorBox error={load.error}/>;

  const filtered=map.filter(x=>`${dname(x.driver)} ${trid(x.driver)}`.toLowerCase().includes(query.toLowerCase()));
  const scored=map.filter(x=>x.score!=null);
  const avg=scored.length?scored.reduce((s,x)=>s+x.score,0)/scored.length:null;
  const below=scored.filter(x=>x.score<815).length;
  const highRisk=map.filter(x=>Object.values(x.details||{}).some(v=>String(v).toLowerCase().includes("high risk"))).length;
  const training=map.filter(x=>n(x.details?.training)!=null&&n(x.details?.completed)!=null&&Number(x.details.completed)<Number(x.details.training)).length;
  const top=scored.slice(0,5);
  const bottom=[...scored].sort((a,b)=>a.score-b.score).slice(0,5);

  return <>
    <div className="page-heading v10-heading"><div><span className="page-kicker">SAFETY</span><h1>Mentor intelligence</h1><p>Direct database view using the saved Mentor score and behaviour evidence.</p></div><RangeTabs value={range} onChange={setRange}/></div>
    <section className="v10-kpi-grid"><article><span>Average score</span><strong>{avg==null?"—":Math.round(avg)}</strong><small>Target ≥ 815</small></article><article className={below?"warn":""}><span>Below target</span><strong>{below}</strong><small>Needs attention</small></article><article className={highRisk?"bad":""}><span>High-risk behaviour</span><strong>{highRisk}</strong><small>Any high-risk category</small></article><article><span>Training outstanding</span><strong>{training}</strong><small>Completed below assigned</small></article></section>
    <section className="dashboard-grid lower"><article className="panel v10-rank-card"><div className="panel-head"><div><h2>Top 5 Mentor</h2><p>Highest driving scores.</p></div></div>{top.map((x,i)=><button key={x.id} onClick={()=>onOpenDriver?.(openShape(x.row,{mentor_score:x.score,fico:x.score,ementor:x.score}))}><span className="rank-badge">{i+1}</span><div><b>{dname(x.driver)}</b><small>{trid(x.driver)}</small></div><strong>{Math.round(x.score)}</strong></button>)}</article><article className="panel v10-rank-card attention"><div className="panel-head"><div><h2>Bottom 5 — attention</h2><p>Lowest Mentor scores first.</p></div></div>{bottom.map((x,i)=><button key={x.id} onClick={()=>onOpenDriver?.(openShape(x.row,{mentor_score:x.score,fico:x.score,ementor:x.score,risk:"Medium",issue:"Mentor score below target"}))}><span className="rank-badge">{i+1}</span><div><b>{dname(x.driver)}</b><small>{trid(x.driver)}</small></div><strong>{Math.round(x.score)}</strong></button>)}</article></section>
    <section className="panel v10-table-panel"><div className="panel-head"><div><h2>Mentor driver register</h2><p>Score, risk categories and training evidence.</p></div><input className="v10-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search driver or TRID…"/></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Driver</th><th>TRID</th><th>Score</th><th>Acceleration</th><th>Braking</th><th>Cornering</th><th>Distraction</th><th>Speeding</th><th>Events</th><th>Training</th><th>Completed</th><th /></tr></thead><tbody>
    {filtered.map(x=>{const d=x.details||{},t=toneMentor(x.score);return <tr key={x.id}><td><b>{dname(x.driver)}</b><small className="history-date">{x.driver?.site||"DLS2"}</small></td><td><code className="v10-trid">{trid(x.driver)}</code></td><td><span className={`v10-score ${t}`}>{x.score==null?"—":Math.round(x.score)}</span></td>{["acceleration","braking","cornering","distraction","speedingRisk"].map(k=><td key={k}><span className={`v10-risk ${riskTone(d[k])}`}>{d[k]||"—"}</span></td>)}<td>{d.speedingEvents??"—"}</td><td>{d.training??"—"}</td><td>{d.completed??"—"}</td><td><button className="profile-link" onClick={()=>onOpenDriver?.(openShape(x.row,{mentor_score:x.score,fico:x.score,ementor:x.score}))}>Open →</button></td></tr>})}
    {!filtered.length&&<tr><td colSpan="12"><div className="v10-empty">No Mentor evidence returned for this period.</div></td></tr>}
    </tbody></table></div></section>
  </>;
}

function contiguousWeeks(rows,range){
  const present=[...new Set(rows.map(r=>r.week_label).filter(Boolean))].sort((a,b)=>weekNo(a)-weekNo(b));
  if(!present.length)return [];
  const min=weekNo(present[0]),max=weekNo(present[present.length-1]);
  const start=range==="all"?min:Math.max(min,max-Number(range)+1);
  return Array.from({length:max-start+1},(_,i)=>`W${String(start+i).padStart(2,"0")}`);
}
export function DirectConcessionsView({organizationId,onOpenDriver}){
  const load=useDbRows(organizationId,"concessions");
  const [range,setRange]=useState(8);
  const [query,setQuery]=useState("");
  const [view,setView]=useState("matrix");
  const [rankWeek,setRankWeek]=useState("");
  const [sortMode,setSortMode]=useState("desc");
  const [showMode,setShowMode]=useState("all");

  if(load.loading)return <Loading text="Loading concessions intelligence…"/>;
  if(load.error)return <ErrorBox error={load.error}/>;

  const siteLabel=(driver)=>{
    const value=String(driver?.site||"").trim();
    return /^[A-Z]{2,5}\d+$/i.test(value)?value.toUpperCase():"DLS2";
  };

  const concessionRows=load.rows.filter(r=>n(r.concessions)!=null);
  const weeks=contiguousWeeks(load.rows,range);
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

  const importedWeeks=weeks.filter(w=>presentSet.has(w));
  const latestWeek=importedWeeks[importedWeeks.length-1]||"";
  const previousWeek=importedWeeks[importedWeeks.length-2]||"";

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

  const latestIndex=weeks.indexOf(latestWeek);
  const previousIndex=weeks.indexOf(previousWeek);

  const latestTotal=
    latestIndex>=0
      ?weekTotals[latestIndex]
      :null;

  const previousTotal=
    previousIndex>=0
      ?weekTotals[previousIndex]
      :null;

  const wow=
    latestTotal!=null&&previousTotal!=null
      ?latestTotal-previousTotal
      :null;

  const missingWeeks=
    weeks.filter(w=>!presentSet.has(w));

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
    <div className="cx2-head">
      <div>
        <span className="cx2-kicker">QUALITY INTELLIGENCE</span>
        <h1>Concessions</h1>
        <p>Weekly DNR performance, driver ranking and repeat-risk analysis.</p>
      </div>

      <div className="cx2-head-actions">
        <div className="cx2-view-tabs">
          <button
            type="button"
            className={view==="overview"?"active":""}
            onClick={()=>setView("overview")}
          >
            Overview
          </button>

          <button
            type="button"
            className={view==="matrix"?"active":""}
            onClick={()=>setView("matrix")}
          >
            Driver matrix
          </button>
        </div>

        <RangeTabs value={range} onChange={setRange}/>
      </div>
    </div>

    <section className="cx2-kpis">
      <article>
        <span>
          {effectiveRankWeek==="total"
            ?"Selected period"
            :`${effectiveRankWeek} concessions`}
        </span>

        <strong>{selectedTotal}</strong>

        <small>
          {effectiveRankWeek==="total"
            ?`${weeks.length} weeks selected`
            :"Total DNR"}
        </small>
      </article>

      <article>
        <span>Affected drivers</span>
        <strong>{selectedAffected}</strong>
        <small>
          {effectiveRankWeek==="total"
            ?"Across selected period"
            :effectiveRankWeek}
        </small>
      </article>

      <article>
        <span>Highest driver</span>
        <strong>{leader?valueFor(leader):"—"}</strong>
        <small>
          {leader
            ?dname(leader.driver)
            :"No affected drivers"}
        </small>
      </article>

      <article className={wow>0?"risk":wow<0?"good":""}>
        <span>Latest movement</span>
        <strong>
          {wow==null
            ?"—"
            :wow===0
              ?"0"
              :`${wow>0?"↑":"↓"} ${Math.abs(wow)}`}
        </strong>
        <small>
          {latestWeek&&previousWeek
            ?`${latestWeek} vs ${previousWeek}`
            :"Previous week unavailable"}
        </small>
      </article>
    </section>

    {view==="matrix"&&
      <section className="cx2-card cx2-matrix-card">
        <div className="cx2-card-head">
          <div>
            <span>DRIVER DETAIL</span>
            <h2>Weekly concession ranking</h2>
            <p>Select a week to instantly rank drivers by that week.</p>
          </div>

          <div className="cx2-summary-pill">
            <b>
              {effectiveRankWeek==="total"
                ?"Period total"
                :effectiveRankWeek}
            </b>
            <span>
              {selectedTotal} concessions · {selectedAffected} affected
            </span>
          </div>
        </div>

        <div className="cx2-toolbar">
          <label>
            <span>Rank by</span>
            <select
              value={effectiveRankWeek}
              onChange={e=>setRankWeek(e.target.value)}
            >
              <option value="total">Total period</option>

              {importedWeeks.map(w=>
                <option key={w} value={w}>{w}</option>
              )}
            </select>
          </label>

          <label>
            <span>Show</span>
            <select
              value={showMode}
              onChange={e=>setShowMode(e.target.value)}
            >
              <option value="all">All drivers</option>
              <option value="affected">Affected only</option>
              <option value="repeat">Repeat drivers</option>
            </select>
          </label>

          <label>
            <span>Sort</span>
            <select
              value={sortMode}
              onChange={e=>setSortMode(e.target.value)}
            >
              <option value="desc">Highest first</option>
              <option value="asc">Lowest first</option>
              <option value="name">Name A–Z</option>
            </select>
          </label>

          <label className="cx2-search-label">
            <span>Search</span>
            <input
              value={query}
              onChange={e=>setQuery(e.target.value)}
              placeholder="Driver name or TRID…"
            />
          </label>

          <button
            type="button"
            className="cx2-reset"
            onClick={()=>{
              setRankWeek("");
              setSortMode("desc");
              setShowMode("all");
              setQuery("");
            }}
          >
            Reset
          </button>
        </div>

        <div className="cx2-week-strip">
          {weeks.map((w,i)=>{
            const imported=presentSet.has(w);
            const selected=effectiveRankWeek===w;

            return <button
              key={w}
              type="button"
              disabled={!imported}
              className={`${selected?"selected":""} ${!imported?"missing":""}`}
              onClick={()=>chooseWeek(w)}
            >
              <span>{w}</span>
              <strong>{imported?weekTotals[i]:"—"}</strong>
            </button>;
          })}

          <button
            type="button"
            className={effectiveRankWeek==="total"?"selected":""}
            onClick={()=>{
              setRankWeek("total");
              setSortMode("desc");
            }}
          >
            <span>Total</span>
            <strong>{weekTotals.reduce((a,b)=>a+b,0)}</strong>
          </button>
        </div>

        <div className="cx2-table-wrap">
          <table className="cx2-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Driver</th>
                <th>TRID</th>

                {weeks.map(w=>
                  <th
                    key={w}
                    className={effectiveRankWeek===w?"selected-col":""}
                  >
                    <button
                      type="button"
                      disabled={!presentSet.has(w)}
                      onClick={()=>chooseWeek(w)}
                    >
                      {w}
                    </button>
                  </th>
                )}

                <th className={effectiveRankWeek==="total"?"selected-col":""}>
                  Total
                </th>

                <th>Affected</th>
                <th></th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((item,index)=>
                <tr
                  key={item.id}
                  className={index<3&&sortMode==="desc"?"top-row":""}
                >
                  <td>
                    <span className="cx2-rank">{index+1}</span>
                  </td>

                  <td className="cx2-driver-cell">
                    <b>{dname(item.driver)}</b>
                    <small>{siteLabel(item.driver)}</small>
                  </td>

                  <td>
                    <code>{trid(item.driver)}</code>
                  </td>

                  {item.values.map((value,j)=>{
                    const week=weeks[j];
                    const imported=presentSet.has(week);
                    const selected=effectiveRankWeek===week;

                    if(!imported){
                      return <td
                        key={week}
                        className={`cx2-empty ${selected?"selected-col":""}`}
                      >
                        —
                      </td>;
                    }

                    if(value==null){
                      return <td
                        key={week}
                        className={selected?"selected-col":""}
                      >
                        <span className="cx2-score zero">—</span>
                      </td>;
                    }

                    const tone=
                      value===0
                        ?"good"
                        :value===1
                          ?"warn"
                          :value===2
                            ?"med"
                            :"high";

                    return <td
                      key={week}
                      className={selected?"selected-col":""}
                    >
                      <span className={`cx2-score ${tone}`}>
                        {value}
                      </span>
                    </td>;
                  })}

                  <td className={effectiveRankWeek==="total"?"selected-col":""}>
                    <b className="cx2-total">{item.total}</b>
                  </td>

                  <td>
                    <span className="cx2-affected">
                      {item.affected}/{item.reported}
                    </span>
                  </td>

                  <td>
                    <button
                      className="profile-link"
                      onClick={()=>onOpenDriver?.(
                        openShape(item.row,{concessions:item.total})
                      )}
                    >
                      Open →
                    </button>
                  </td>
                </tr>
              )}

              {!filtered.length&&
                <tr>
                  <td colSpan={6+weeks.length}>
                    <div className="v10-empty">
                      No drivers match the selected filters.
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <div className="cx2-footnote">
          <span>{filtered.length} drivers shown</span>
          <span>Click any week header to rank by that week.</span>
        </div>
      </section>
    }

    {view==="overview"&&<>
      <section className="cx2-overview-grid">
        <article className="cx2-card">
          <div className="cx2-card-head">
            <div>
              <span>WEEKLY TREND</span>
              <h2>Concessions movement</h2>
              <p>Lower is better.</p>
            </div>
          </div>

          <div className="cx2-trend-shell">
            <div className="cx2-trend-legend">
              <span><i className="dot current"/>Weekly DNR</span>
              <span className="hint">Click a week to open its driver ranking</span>
            </div>

            <div className="cx2-trend-chart">
              <svg
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                role="img"
                aria-label="Weekly concessions trend"
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient id="cx2TrendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4e9788" stopOpacity="0.22"/>
                    <stop offset="100%" stopColor="#4e9788" stopOpacity="0.02"/>
                  </linearGradient>
                </defs>

                {[0,0.25,0.5,0.75,1].map((step)=>{
                  const y=chartTop+step*chartPlotHeight;
                  return <line
                    key={step}
                    x1={chartLeft}
                    y1={y}
                    x2={chartWidth-chartRight}
                    y2={y}
                    className="cx2-gridline"
                  />;
                })}

                {areaPoints&&<polygon
                  points={areaPoints}
                  fill="url(#cx2TrendFill)"
                />}

                {linePoints&&<polyline
                  points={linePoints}
                  className="cx2-trend-line"
                />}

                {trendPoints.map((point)=>{
                  if(!point.imported){
                    return <g key={point.week}>
                      <circle
                        cx={point.x}
                        cy={chartTop+chartPlotHeight}
                        r="5"
                        className="cx2-missing-dot"
                      />
                      <text
                        x={point.x}
                        y={chartHeight-11}
                        textAnchor="middle"
                        className="cx2-axis-label missing"
                      >
                        {point.week}
                      </text>
                    </g>;
                  }

                  const selected=effectiveRankWeek===point.week;

                  return <g
                    key={point.week}
                    className="cx2-point-group"
                    onClick={()=>chooseWeek(point.week)}
                  >
                    {selected&&<circle
                      cx={point.x}
                      cy={point.y}
                      r="12"
                      className="cx2-selected-ring"
                    />}

                    <circle
                      cx={point.x}
                      cy={point.y}
                      r="6"
                      className="cx2-point"
                    />

                    <text
                      x={point.x}
                      y={Math.max(18,point.y-15)}
                      textAnchor="middle"
                      className="cx2-point-value"
                    >
                      {point.value}
                    </text>

                    <text
                      x={point.x}
                      y={chartHeight-11}
                      textAnchor="middle"
                      className={`cx2-axis-label ${selected?"selected":""}`}
                    >
                      {point.week}
                    </text>
                  </g>;
                })}
              </svg>
            </div>

            <div className="cx2-delta-row">
              {trendPoints.map((point)=>
                <button
                  key={point.week}
                  type="button"
                  disabled={!point.imported}
                  onClick={()=>chooseWeek(point.week)}
                  className={`${effectiveRankWeek===point.week?"selected":""} ${!point.imported?"missing":""}`}
                >
                  <span>{point.week}</span>
                  <b>{point.imported?point.value:"—"}</b>
                  <small className={point.delta>0?"up":point.delta<0?"down":"flat"}>
                    {point.delta==null
                      ?"No comparison"
                      :point.delta>0
                        ?`+${point.delta} vs prev`
                        :point.delta<0
                          ?`${point.delta} vs prev`
                          :"No change"}
                  </small>
                </button>
              )}
            </div>
          </div>
        </article>

        <article className="cx2-card">
          <div className="cx2-card-head">
            <div>
              <span>TOP DRIVERS</span>
              <h2>
                {effectiveRankWeek==="total"
                  ?"Selected period"
                  :effectiveRankWeek}
              </h2>
              <p>Highest DNR counts.</p>
            </div>
          </div>

          <div className="cx2-top-list">
            {priority.map((item,index)=>
              <button
                key={item.id}
                type="button"
                onClick={()=>onOpenDriver?.(
                  openShape(item.row,{concessions:item.total})
                )}
              >
                <span className="cx2-rank">{index+1}</span>

                <div>
                  <b>{dname(item.driver)}</b>
                  <small>{trid(item.driver)}</small>
                </div>

                <strong>{valueFor(item)??"—"}</strong>
              </button>
            )}
          </div>
        </article>
      </section>

      <section className="cx2-card cx2-health">
        <div className="cx2-card-head">
          <div>
            <span>REPORTING HEALTH</span>
            <h2>Imported weeks</h2>
            <p>
              {missingWeeks.length
                ?`${missingWeeks.length} missing report${missingWeeks.length>1?"s":""}`
                :"All selected weeks are available."}
            </p>
          </div>
        </div>

        <div className="cx2-health-row">
          {weeks.map((w,i)=>
            <button
              key={w}
              type="button"
              disabled={!presentSet.has(w)}
              onClick={()=>chooseWeek(w)}
              className={presentSet.has(w)?"ok":"missing"}
            >
              <span>{w}</span>
              <b>
                {presentSet.has(w)
                  ?weekTotals[i]
                  :"Not imported"}
              </b>
            </button>
          )}
        </div>
      </section>
    </>}

    <style jsx>{`
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
