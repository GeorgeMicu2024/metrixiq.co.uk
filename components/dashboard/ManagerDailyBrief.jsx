"use client";

import { buildFleetIntelligence } from "../../lib/intelligence/fleet";

function destinationFor(item){
  if(item.reasons?.some((reason)=>reason==="Identity unresolved"||reason==="Low data confidence")) return "data-quality";
  if(item.reasons?.some((reason)=>reason==="Repeated concessions")) return "evidence";
  return "coaching";
}

export default function ManagerDailyBrief({drivers=[],kpis={},history=[],onOpenDriver,onNavigate}){
  const intelligence=buildFleetIntelligence(drivers,kpis,history);
  const priorities=intelligence.priorityDrivers.slice(0,5);
  const evidenceIssues=intelligence.unresolved+intelligence.lowConfidence;
  return <section className="manager-brief">
    <div className="manager-brief-head"><div><span className="page-kicker">TODAY</span><h2>Manager Daily Brief</h2><p>{intelligence.headline} {intelligence.summary}</p></div><div className="manager-brief-confidence"><strong>{intelligence.confidence}%</strong><span>decision confidence</span></div></div>
    <div className="manager-brief-stats"><div><b>{intelligence.priorityDrivers.length}</b><span>need attention</span></div><div><b>{intelligence.highRisk}</b><span>high risk</span></div><div><b>{intelligence.mediumRisk}</b><span>medium risk</span></div><div><b>{evidenceIssues}</b><span>data issues</span></div></div>
    <div className="risk-radar">
      <div className="risk-radar-head"><div><h3>Driver Risk Radar</h3><p>Explainable priority queue from KPI gaps, concessions and data confidence.</p></div><button className="link-btn" onClick={()=>onNavigate?.("performance")}>Full performance →</button></div>
      {priorities.length===0?<div className="table-empty-state"><b>No priority intervention</b><span>No driver currently triggers the risk radar.</span></div>:priorities.map((item,index)=>{
        const d=item.driver; const destination=destinationFor(item);
        return <article key={d.dbId||d.id||index} className="risk-radar-row"><span className="risk-rank">#{index+1}</span><div className="risk-radar-driver"><b>{d.name||"Unresolved identity"}</b><small>{d.site||"No site"} · {item.reasons.slice(0,3).join(" · ")}</small></div><span className={"risk-pill "+String(d.risk||"low").toLowerCase()}>{d.risk||"Low"}</span><div className="risk-radar-actions"><button onClick={()=>onOpenDriver?.(d)}>Driver 360</button><button onClick={()=>onNavigate?.(destination)}>{destination==="data-quality"?"Data Quality":destination==="evidence"?"Evidence":"Coaching"}</button></div></article>;
      })}
    </div>
  </section>;
}
