"use client";

import { avg, fmt } from "./utils";

const safe=(n)=>Number.isFinite(Number(n))?Number(n):null;
function metric(v,type){return v==null||Number.isNaN(Number(v))?"—":fmt(v,type)}
function greet(){const h=new Date().getHours();return h<12?"Good morning":h<18?"Good afternoon":"Good evening"}
function driverMetric(d,...keys){for(const k of keys){const n=safe(d?.[k]);if(n!=null)return n}return null}
function mean(rows,...keys){const vals=rows.map(d=>driverMetric(d,...keys)).filter(v=>v!=null);return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null}

export default function HomeView({session,drivers=[],kpis={},siteFilter="all",sites=[],commandCenter,dataWarning="",onNavigate}){
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
 const siteRows=(sites.length?sites:[siteFilter!=="all"?siteFilter:"DLS2"]).slice(0,5);
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
   <article className="panel homev2-sites"><div className="homev2-title"><h2>Site Performance <small>(Current)</small></h2><button onClick={()=>onNavigate("site-scorecards")}>View Details</button></div><div className="homev2-sitehead"><span>Site</span><span>eMentor</span><span>IADC</span><span>DCR</span><span>FICO</span></div>{siteRows.map((site,i)=>{const ds=siteFilter==="all"?drivers.filter(d=>String(d.site||"").toUpperCase()===site):drivers;return <button className="homev2-siterow" key={site} onClick={()=>onNavigate("site-scorecards")}><b><i className={"dot d"+i}/>{site}</b><span>{metric(mean(ds,"mentor_score","ementor","fico"),"fico")}</span><span>{metric(mean(ds,"iadc"),"iadc")}</span><span>{metric(mean(ds,"dcr"),"dcr")}</span><span>{metric(mean(ds,"fico","mentor_score","ementor"),"fico")}</span></button>})}</article>
  </section>
  <section className="panel homev2-quick"><h2>Quick Actions</h2><div>{quick.map(([icon,title,sub,to,tone])=><button className={tone} key={title} onClick={()=>onNavigate(to)}><i>{icon}</i><span><b>{title}</b><small>{sub}</small></span></button>)}</div></section>
  <section className="homev2-bottom">
   <article className="panel homev2-activity"><div className="homev2-title"><h2>Recent Activity</h2><button onClick={()=>onNavigate("audit")}>View All</button></div><div><span><i className="blue">⇧</i><b>Daily Dispatch ready</b><small>Wave Plan & ATLAS</small></span><span><i className="green">▤</i><b>Reports workspace</b><small>Import operational metrics</small></span><span><i className="purple">♟</i><b>Driver scorecards</b><small>{drivers.length} drivers in current scope</small></span><span><i className="orange">◇</i><b>Management actions</b><small>{belowMentor+iadcFail} metric exceptions detected</small></span></div></article>
   <article className="panel homev2-trend"><div className="homev2-title"><h2>eMentor Snapshot ({scope})</h2><strong>{metric(mentorAvg,"fico")}</strong></div><div className="homev2-chart"><span style={{height:"52%"}}/><span style={{height:"67%"}}/><span style={{height:"45%"}}/><span style={{height:"73%"}}/><span style={{height:"63%"}}/><span style={{height:"58%"}}/><span style={{height:mentorAvg?Math.max(18,Math.min(88,(mentorAvg-700)/2))+"%":"25%"}}/></div><small>Target 815</small></article>
   <article className="panel homev2-compliance"><div className="homev2-title"><h2>IADC Compliance ({scope})</h2></div><div className="homev2-ring" style={{"--pct":Math.max(0,Math.min(100,iadcAvg||0))+"%"}}><div><strong>{metric(iadcAvg,"iadc")}</strong><small>Compliant</small></div></div><p><span><i className="ok"/>Target 80%+</span><span><i className="bad"/>{iadcFail} below target</span></p></article>
  </section>
 </div>;
}
