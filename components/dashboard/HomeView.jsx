"use client";

import { avg, fmt } from "./utils";

function value(v, metric){ return v==null||Number.isNaN(Number(v))?"—":fmt(v,metric); }
function greeting(){ const h=new Date().getHours(); return h<12?"Good morning":h<18?"Good afternoon":"Good evening"; }

export default function HomeView({session,drivers=[],kpis={},siteFilter="all",sites=[],commandCenter,onNavigate}){
  const siteLabel=siteFilter==="all"?"All Sites":siteFilter;
  const belowMentor=drivers.filter(d=>Number(d.mentor_score??d.ementor??d.fico)<815).length;
  const iadcFail=drivers.filter(d=>Number(d.iadc)<80).length;
  const priorities=[
    {tone:"red",icon:"↗",title:"Check eMentor drivers below 815",detail:belowMentor+" drivers below target",to:"mentor"},
    {tone:"amber",icon:"△",title:"Review IADC failures",detail:iadcFail+" drivers below 80%",to:"iadc"},
    {tone:"blue",icon:"◷",title:"Review today's dispatch",detail:"Wave plan, routes and ATLAS",to:"daily-dispatch"},
    {tone:"gold",icon:"▤",title:"Check active incidents",detail:"Open evidence and incident queue",to:"evidence"},
  ];
  const cards=[
    ["Active Drivers",drivers.length,"Current scope","people"],
    ["eMentor (Avg)",value(kpis.ementor??kpis.fico,"fico"),"Target 815+","mentor"],
    ["IADC",value(kpis.iadc,"iadc"),"Target 80%+","iadc"],
    ["DCR",value(kpis.dcr,"dcr"),"Target 95%+","dcr"],
    ["POD",value(kpis.pod,"pod"),"Delivery quality","pod"],
  ];
  const quick=[
    ["Daily Dispatch","Upload Wave Plan & Routes","daily-dispatch","blue"],
    ["Import Reports","IADC, POD, DCR, eMentor","imports","green"],
    ["Driver Scorecards","View & manage performance","driver-scorecards","purple"],
    ["Coaching & Alerts","Issues, warnings & improvement","coaching","orange"],
    ["Performance","Trends, comparisons & insights","performance","pink"],
    ["ATLAS","Process tracking IDs & drivers","daily-dispatch","cyan"],
  ];
  const siteRows=(sites.length?sites:[siteFilter!=="all"?siteFilter:"DLS2"]).slice(0,5);
  return <div className="homev1">
    <section className="homev1-hero"><div><span className="page-kicker">HOME · {siteLabel.toUpperCase()}</span><h1>{greeting()}, {session?.name?.split(" ")[0]||"Manager"}</h1><p>Here’s today’s operational overview for {siteLabel}.</p></div><button className="btn primary" onClick={()=>onNavigate("command-center")}>Open Command Center →</button></section>
    <section className="homev1-kpis">{cards.map(([label,val,note,key])=><button key={key} onClick={()=>onNavigate(key==="people"?"drivers":key)}><span>{label}</span><strong>{val}</strong><small>{note}</small></button>)}</section>
    <section className="homev1-main">
      <article className="panel homev1-priorities"><div className="panel-head"><div><h2>Today’s Priorities</h2><p>Items that need management attention.</p></div><button className="link-btn" onClick={()=>onNavigate("command-center")}>View all</button></div>{priorities.map(p=><button className={"homev1-priority "+p.tone} key={p.title} onClick={()=>onNavigate(p.to)}><i>{p.icon}</i><span><b>{p.title}</b><small>{p.detail}</small></span><em>›</em></button>)}</article>
      <article className="panel homev1-sites"><div className="panel-head"><div><h2>Site Performance</h2><p>Current workspace snapshot.</p></div><button className="link-btn" onClick={()=>onNavigate("site-scorecards")}>View details</button></div><div className="homev1-site-head"><span>Site</span><span>Drivers</span><span>eMentor</span><span>IADC</span><span>DCR</span></div>{siteRows.map(site=>{const ds=siteFilter==="all"?drivers.filter(d=>String(d.site||"").toUpperCase()===site):drivers;return <button key={site} className="homev1-site-row" onClick={()=>onNavigate("site-scorecards")}><b>{site}</b><span>{ds.length||"—"}</span><span>{value(avg(ds,"mentor_score")??avg(ds,"ementor")??avg(ds,"fico"),"fico")}</span><span>{value(avg(ds,"iadc"),"iadc")}</span><span>{value(avg(ds,"dcr"),"dcr")}</span></button>})}</article>
    </section>
    <section className="panel homev1-quick"><div className="panel-head"><div><h2>Quick Actions</h2><p>Jump straight into the most-used workflows.</p></div></div><div>{quick.map(([title,sub,to,tone])=><button className={tone} key={title} onClick={()=>onNavigate(to)}><b>{title}</b><small>{sub}</small><span>Open →</span></button>)}</div></section>
    <section className="homev1-bottom"><article className="panel"><div className="panel-head"><div><h2>Operational Status</h2><p>Live workspace signals.</p></div></div><div className="homev1-status"><span><b>{commandCenter?.open_actions??commandCenter?.openActions??"—"}</b><small>Open actions</small></span><span><b>{belowMentor}</b><small>eMentor below target</small></span><span><b>{iadcFail}</b><small>IADC below target</small></span></div></article><article className="panel homev1-focus"><span className="page-kicker">MANAGER FOCUS</span><h2>Start with exceptions, then move to trends.</h2><p>Use Command Center for today’s action queue and Performance for deeper analysis.</p><div><button className="btn primary" onClick={()=>onNavigate("command-center")}>Command Center</button><button className="btn ghost" onClick={()=>onNavigate("performance")}>Performance</button></div></article></section>
  </div>;
}
