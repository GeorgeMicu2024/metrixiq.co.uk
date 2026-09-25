"use client";

import { useEffect, useMemo, useState } from "react";
import { avg, fmt } from "./utils";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { fetchSiteScorecardData } from "../../lib/data/scorecardData";

const safe=(n)=>Number.isFinite(Number(n))?Number(n):null;
function metric(v,type){return v==null||Number.isNaN(Number(v))?"—":fmt(v,type)}
function greet(){const h=new Date().getHours();return h<12?"Good morning":h<18?"Good afternoon":"Good evening"}
function driverMetric(d,...keys){for(const k of keys){const n=safe(d?.[k]);if(n!=null)return n}return null}
function mean(rows,...keys){const vals=rows.map(d=>driverMetric(d,...keys)).filter(v=>v!=null);return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null}
function historyMetric(rows,site,key){
 const scoped=rows.filter(r=>String(r?.site||r?.drivers?.site||r?.raw_data?.activity_site||r?.raw_data?.mentor?.station||"").trim().toUpperCase()===String(site||"").trim().toUpperCase());
 const vals=scoped.map(r=>safe(r?.[key]??(key==="mentor_score"?(r?.ementor??r?.fico):null))).filter(v=>v!=null);
 return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;
}

export default function HomeView({organizationId,session,drivers=[],kpis={},history=[],metricRows=[],siteFilter="all",sites=[],commandCenter,dataWarning="",onNavigate}){
 const scope=siteFilter==="all"?"All Sites":siteFilter;
 const first=session?.name?.trim()?.split(/\s+/)?.[0]||"Manager";
 const mentorAvg=safe(kpis.ementor??kpis.fico);
 const iadcAvg=safe(kpis.iadc),dcrAvg=safe(kpis.dcr),ficoAvg=safe(kpis.fico??kpis.ementor);
 const belowMentor=drivers.filter(d=>{const v=driverMetric(d,"mentor_score","ementor","fico");return v!=null&&v<815}).length;
 const iadcFail=drivers.filter(d=>{const v=driverMetric(d,"iadc");return v!=null&&v<80}).length;
 const kpiCards=[
  {icon:"♟",label:"Active Drivers",value:drivers.length,delta:"Current scope",target:"vs current site",tone:"blue",to:"drivers"},
  {icon:"▥",label:"eMentor (Avg)",value:metric(mentorAvg,"fico"),delta:mentorAvg!=null&&mentorAvg>=815?"On target":"Below target",target:"Target 815+",tone:mentorAvg!=null&&mentorAvg>=815?"green":"red",to:"mentor"},
  {icon:"◇",label:"IADC",value:metric(iadcAvg,"iadc"),delta:iadcAvg!=null&&iadcAvg>=80?"On target":"Needs attention",target:"Target 80%+",tone:"green",to:"iadc"},
  {icon:"◆",label:"DCR",value:metric(dcrAvg,"dcr"),delta:dcrAvg!=null&&dcrAvg>=95?"On target":"Needs attention",target:"Target 95%+",tone:"gold",to:"dcr"},
  {icon:"◉",label:"FICO (Avg)",value:metric(ficoAvg,"fico"),delta:"Live score",target:"Current scope",tone:"cyan",to:"mentor"},
 ];
 const priorities=[
  ["red","↗","Check eMentor drivers below 815",belowMentor+" drivers below target","mentor"],
  ["amber","△","Review IADC failures",iadcFail+" drivers < 80% this week","iadc"],
  ["blue","◷","Monitor wave timings","Open Daily Dispatch and review today's waves","daily-dispatch"],
  ["gold","▤","Check recent incidents","Review new evidence and incident activity","evidence"],
 ];
 const siteRows=(siteFilter==="all"?sites:[siteFilter]).filter(Boolean);
 const [siteScorecards,setSiteScorecards]=useState([]);
 useEffect(()=>{
  let active=true;
  if(!organizationId){setSiteScorecards([]);return ()=>{active=false};}
  fetchSiteScorecardData(getSupabaseBrowserClient(),organizationId)
   .then(({cards})=>{if(active)setSiteScorecards(cards||[]);})
   .catch(()=>{if(active)setSiteScorecards([]);});
  return ()=>{active=false};
 },[organizationId]);
 const latestSitePerformance=useMemo(()=>{
  const scoped=siteFilter==="all"?siteScorecards:siteScorecards.filter(card=>String(card?.site||"").trim().toUpperCase()===String(siteFilter).trim().toUpperCase());
  const dated=scoped.filter(card=>Number.isFinite(Number(card?.year))&&Number.isFinite(Number(card?.week)));
  if(!dated.length)return {label:"Last week with data",rows:[]};
  const latest=dated.reduce((best,card)=>{
   const key=Number(card.year)*100+Number(card.week);
   return !best||key>best.key?{key,year:Number(card.year),week:Number(card.week)}:best;
  },null);
  const rows=dated.filter(card=>Number(card.year)===latest.year&&Number(card.week)===latest.week)
   .sort((a,b)=>String(a.site||"").localeCompare(String(b.site||"")));
  return {label:`Last week with data – Week ${latest.week}, ${latest.year}`,rows};
 },[siteScorecards,siteFilter]);
 const siteTier=(standing)=>{
  const value=String(standing||"").trim().toLowerCase();
  if(value.includes("fantastic"))return {label:"Fantastic",cls:"fantastic"};
  if(value.includes("great"))return {label:"Great",cls:"great"};
  if(value.includes("fair"))return {label:"Fair",cls:"fair"};
  if(value.includes("poor"))return {label:"Poor",cls:"poor"};
  return {label:standing||"—",cls:"neutral"};
 };
 const normalizeSite=(value)=>String(value||"").trim().toUpperCase();
 const weekLabelForCard=(card)=>`W${Number(card?.week)||String(card?.week_label||"").replace(/\D/g,"")}`;
 const scorecardRowsFor=(card)=>metricRows.filter(row=>{
  const rowSite=normalizeSite(row?.site||row?.drivers?.site||row?.raw_data?.activity_site);
  const rowWeek=String(row?.week_label||"").trim().toUpperCase();
  const cardWeek=weekLabelForCard(card).toUpperCase();
  if(rowSite!==normalizeSite(card?.site))return false;
  if(rowWeek===cardWeek)return true;
  const endYear=String(row?.period_end||"").slice(0,4);
  return Number(endYear)===Number(card?.year)&&Number(String(rowWeek).replace(/\D/g,""))===Number(card?.week);
 });
 const metricAliases={
  dcr:["dcr"],
  dsc_dpmo:["dsc_dpmo","dsc"],
  lor:["lor","lor_dpmo"],
  cc:["cc","contact_compliance"],
 };
 const sourceMetric=(card,key)=>{
  const direct=card?.metrics?.[key]&&typeof card.metrics[key]==="object"?card.metrics[key].value:card?.metrics?.[key];
  if(safe(direct)!=null)return safe(direct);
  const rows=scorecardRowsFor(card);
  const aliases=metricAliases[key]||[key];
  const values=[];
  for(const row of rows){
   for(const alias of aliases){
    const value=safe(row?.[alias]??row?.raw_data?.[alias]??row?.raw_data?.scorecard?.[alias]);
    if(value!=null){values.push(value);break;}
   }
  }
  if(!values.length)return null;
  // Site scorecard driver rows repeat site-level values in some imports. Median
  // avoids multiplying/re-averaging DPMO fields while remaining stable on legacy rows.
  const sorted=values.slice().sort((a,b)=>a-b);
  const mid=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;
 };
 const siteMetric=(card,key,format="plain")=>{
  const value=safe(sourceMetric(card,key));
  if(value==null)return "—";
  if(format==="pct")return `${value.toFixed(2)}%`;
  if(format==="dpmo")return Math.round(value).toLocaleString();
  return String(value);
 };
 const sitePalette=["blue","green","orange","purple","pink","cyan"];
 const siteColor=(site)=>sitePalette[Math.abs(String(site||"").split("").reduce((n,ch)=>n+ch.charCodeAt(0),0))%sitePalette.length];
 const scorecardTrend=useMemo(()=>{
  const scoped=siteFilter==="all"?siteScorecards:siteScorecards.filter(card=>normalizeSite(card?.site)===normalizeSite(siteFilter));
  const grouped={};
  for(const card of scoped){
   const score=safe(card?.overall_score);
   if(score==null||!card?.site||!Number.isFinite(Number(card?.year))||!Number.isFinite(Number(card?.week)))continue;
   const site=String(card.site).trim().toUpperCase();
   (grouped[site] ||= []).push({score,week:Number(card.week),year:Number(card.year),standing:card.standing});
  }
  return Object.entries(grouped).map(([site,points])=>{
   const sorted=points.sort((a,b)=>(a.year*100+a.week)-(b.year*100+b.week)).slice(-6);
   const current=sorted.at(-1),previous=sorted.at(-2);
   return {site,points:sorted,current,delta:current&&previous?current.score-previous.score:null,tier:siteTier(current?.standing),color:siteColor(site)};
  }).sort((a,b)=>a.site.localeCompare(b.site));
 },[siteScorecards,siteFilter]);
 const mentorTrend=history.slice(-7).map((period)=>({label:period.weekLabel||period.key||"",value:safe(period.mentor)})).filter(x=>x.value!=null);
 const mentorTrendMin=mentorTrend.length?Math.min(...mentorTrend.map(x=>x.value)):null;
 const mentorTrendMax=mentorTrend.length?Math.max(...mentorTrend.map(x=>x.value)):null;
 const quick=[
  ["⇧","Daily Dispatch","Upload Wave Plan & Routes","daily-dispatch","blue"],
  ["▤","Import Reports","IADC, POD, DCR, eMentor","imports","green"],
  ["♟","Driver Scorecards","View & manage driver performance","driver-scorecards","purple"],
  ["◇","Coaching & Alerts","Issues, warnings & improvement","coaching","orange"],
  ["▥","Performance","Trends, comparisons & insights","performance","pink"],
  ["◆","Atlas","Process tracking IDs & send to drivers","daily-dispatch","cyan"],
 ];
 return <div className="homev2">{dataWarning&&<div className="mgrv2-notice error">{dataWarning}</div>}
  <section className="homev2-hero"><div className="homev2-hero-shade"/><div className="homev2-greeting"><h1>{greet()}, {first}</h1><p>Here’s today’s overview for <b>{scope}</b></p></div><div className="homev2-scope"><span>LIVE WORKSPACE</span><b>{scope}</b></div></section>
  <section className="homev2-kpis">{kpiCards.map(x=><button key={x.label} className={x.tone} onClick={()=>onNavigate(x.to)}><i>{x.icon}</i><span><small>{x.label}</small><strong>{x.value}</strong><em>{x.delta}</em><u>{x.target}</u></span></button>)}</section>
  <section className="homev2-grid">
   <article className="panel homev2-priorities"><div className="homev2-title"><h2>Today’s Priorities <b>{priorities.length}</b></h2><button onClick={()=>onNavigate("command-center")}>View All</button></div>{priorities.map(([tone,icon,title,detail,to])=><button className={"homev2-priority "+tone} key={title} onClick={()=>onNavigate(to)}><i>{icon}</i><span><b>{title}</b><small>{detail}</small></span><em>›</em></button>)}</article>
   <article className="panel homev2-sites siteperf-card"><div className="homev2-title siteperf-title"><h2>Site Performance <small>({latestSitePerformance.label})</small></h2><button onClick={()=>onNavigate("site-scorecards")}>View Details</button></div><div className="siteperf-scroll" role="region" aria-label="Site performance table" tabIndex="0"><div className="siteperf-table"><div className="siteperf-head"><span>Site</span><span>Overall Score</span><span>DCR <small>(≥ 98.6%)</small></span><span>DSC DPMO <small>(≤ 1,363.69)</small></span><span>LoR DPMO <small>(≤ 130)</small></span><span>Contact Compliance <small>(≥ 95%)</small></span></div>{latestSitePerformance.rows.length===0?<div className="homev2-sites-empty"><b>No weekly site scorecard data</b><small>Import a DSP Scorecard PDF to populate site performance.</small></div>:latestSitePerformance.rows.map((card,i)=>{const tier=siteTier(card.standing);return <button className="siteperf-row" key={card.id||`${card.site}-${card.year}-${card.week}`} onClick={()=>onNavigate("site-scorecards")}><b className={`siteperf-site ${siteColor(card.site)}`}><i className="dot"/>{card.site||"—"}</b><span className={`siteperf-score ${tier.cls}`}><strong>{safe(card.overall_score)==null?"—":Number(card.overall_score).toFixed(2)}</strong>{tier.label!=="—"&&<em>{tier.label}</em>}</span><span className={`siteperf-metric ${safe(sourceMetric(card,"dcr"))!=null&&safe(sourceMetric(card,"dcr"))>=98.6?"good":"bad"}`}>{siteMetric(card,"dcr","pct")}</span><span className={`siteperf-metric ${safe(sourceMetric(card,"dsc_dpmo"))!=null&&safe(sourceMetric(card,"dsc_dpmo"))<=1363.69?"good":"bad"}`}>{siteMetric(card,"dsc_dpmo","dpmo")}</span><span className={`siteperf-metric ${safe(sourceMetric(card,"lor"))!=null&&safe(sourceMetric(card,"lor"))<=130?"good":"bad"}`}>{siteMetric(card,"lor","dpmo")}</span><span className={`siteperf-metric ${safe(sourceMetric(card,"cc"))!=null&&safe(sourceMetric(card,"cc"))>=95?"good":"bad"}`}>{siteMetric(card,"cc","pct")}</span></button>})}</div></div></article>
  </section>
  <section className="panel homev2-quick"><h2>Quick Actions</h2><div>{quick.map(([icon,title,sub,to,tone])=><button className={tone} key={title} onClick={()=>onNavigate(to)}><i>{icon}</i><span><b>{title}</b><small>{sub}</small></span></button>)}</div></section>
  <section className="homev2-bottom">
   <article className="panel homev2-activity"><div className="homev2-title"><h2>Recent Activity</h2><button onClick={()=>onNavigate("audit")}>View All</button></div><div><span><i className="blue">⇧</i><b>Daily Dispatch ready</b><small>Wave Plan & ATLAS</small></span><span><i className="green">▤</i><b>Reports workspace</b><small>Import operational metrics</small></span><span><i className="purple">♟</i><b>Driver scorecards</b><small>{drivers.length} drivers in current scope</small></span><span><i className="orange">◇</i><b>Management actions</b><small>{belowMentor+iadcFail} metric exceptions detected</small></span></div></article>
   <article className="panel scoretrend-panel"><div className="homev2-title scoretrend-title"><div><h2>Trending Scorecards</h2><small>Weekly trend — Overall Score (Last 6 weeks)</small></div><button onClick={()=>onNavigate("site-scorecards")}>View Details</button></div>{scorecardTrend.length?<div className="scoretrend-scroll"><div className="scoretrend-grid">{scorecardTrend.map(item=>{const values=item.points.map(p=>p.score),min=Math.min(...values),max=Math.max(...values),range=Math.max(1,max-min);return <div className={`scoretrend-card ${item.color}`} key={item.site}><div className="scoretrend-card-head"><b><i className="dot"/>{item.site}</b><span><strong>{item.current.score.toFixed(2)}</strong><em className={item.tier.cls}>{item.tier.label}</em></span><small className={item.delta==null?"flat":item.delta>=0?"up":"down"}>{item.delta==null?"—":`${item.delta>=0?"▲ +":"▼ "}${item.delta.toFixed(1)}`} <u>vs. previous week</u></small></div><div className="scoretrend-chart">{item.points.map((p,index)=>{const height=24+((p.score-min)/range)*58;return <div className="scoretrend-point" key={`${p.year}-${p.week}`}><span style={{height:`${height}%`}}><i/><b>{p.score.toFixed(1)}</b></span><small>W{p.week}</small></div>})}</div></div>})}</div></div>:<div className="homev2-trend-empty">Import historical DSP scorecards to build weekly site trends.</div>}</article>
   <article className="panel homev2-compliance"><div className="homev2-title"><h2>IADC Compliance ({scope})</h2></div><div className="homev2-ring" style={{"--pct":Math.max(0,Math.min(100,iadcAvg||0))+"%"}}><div><strong>{metric(iadcAvg,"iadc")}</strong><small>Compliant</small></div></div><p><span><i className="ok"/>Target 80%+</span><span><i className="bad"/>{iadcFail} below target</span></p></article>
  </section>
 </div>;
}
