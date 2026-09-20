import { TARGETS } from "../config/performance.js";

const SIGNALS = [
  ["dcr","DCR",TARGETS.dcr,2],["pod","POD",TARGETS.pod,2],["iadc","IADC",TARGETS.iadc,2],
  ["mentor","eMentor/FICO",TARGETS.mentor,2],["cc","Contact Compliance",TARGETS.cc,1]
];

const n=(v)=>Number.isFinite(Number(v))?Number(v):null;
const value=(d,k)=>k==="mentor"?n(d?.mentor_score??d?.ementor??d?.fico):n(d?.[k]);

export function explainDriverRisk(driver={}){
  const factors=SIGNALS.map(([key,label,target,weight])=>{
    const actual=value(driver,key); if(actual==null||actual>=target) return null;
    const gap=Number((target-actual).toFixed(1));
    return {key,label,actual,target,gap,impact:Number((gap*weight).toFixed(1)),reason:`${label} is ${gap} below target`};
  }).filter(Boolean).sort((a,b)=>b.impact-a.impact);
  const concessions=n(driver.concessions)||0;
  if(concessions>=3) factors.push({key:"concessions",label:"Concessions",actual:concessions,target:"<3",gap:concessions-2,impact:(concessions-2)*3,reason:`${concessions} concessions indicate repeated quality risk`});
  factors.sort((a,b)=>b.impact-a.impact);
  const primary=factors[0]||null;
  const nextAction=primary?.key==="concessions"?"Review evidence and root cause":primary?.key==="mentor"?"Review eMentor events and coach the primary behaviour":primary?"Open targeted coaching against the primary KPI":"Monitor next reporting cycle";
  return {primary,factors:factors.slice(0,4),nextAction,explanation:primary?`${primary.reason}. ${nextAction}.`:"No material KPI exception is visible in current evidence."};
}

export function buildInterventionQueue(drivers=[]){
  return drivers.map(driver=>({driver,...explainDriverRisk(driver)}))
    .filter(x=>x.primary)
    .sort((a,b)=>(b.primary?.impact||0)-(a.primary?.impact||0));
}

export function buildAiOperationsBrief(drivers=[],intelligence={}){
  const queue=buildInterventionQueue(drivers);
  const top=queue.slice(0,3);
  const uniqueDataIssues=drivers.filter(d=>{
    const confidence=n(d?.dataConfidence);
    const name=String(d?.name||"").trim();
    return !name || confidence!=null&&confidence<70;
  }).length;
  return {
    title: queue.length?`${queue.length} evidence-based intervention${queue.length===1?"":"s"} detected`:"No material intervention signal detected",
    narrative: top.length?`Priority: ${top.map(x=>`${x.driver?.name||"Unresolved driver"} — ${x.primary.label}`).join("; ")}.`:"Available KPI evidence is currently within intervention thresholds.",
    recommendedActions:top.map(x=>({driver:x.driver,action:x.nextAction,why:x.explanation})),
    uniqueDataIssues,
    confidence:intelligence.confidence??0,
    guardrail:"Recommendations are evidence-based decision support; manager review is required before action."
  };
}
