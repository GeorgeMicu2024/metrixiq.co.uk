import { availableWeeks, buildExecutivePack } from "../reports/executivePackV2.js";

function lower(value){return String(value||"").toLowerCase();}
function weekTokens(text){return [...String(text||"").matchAll(/\bW\s*(\d{1,2})\b/gi)].map((m)=>"W"+Number(m[1]));}
function top(items,limit=5){return (items||[]).slice(0,limit);}
function scoreGap(score,target){const n=Number(score);return Number.isFinite(n)?Math.max(0,target-n):null;}

function evidence(kind,item,label){
  return {
    kind,
    id:item?.driver_id||item?.id||null,
    driverId:item?.driver_id||null,
    site:item?.site||item?.drivers?.site||null,
    weekLabel:item?.week_label||item?.weekLabel||null,
    label,
    detail:item?.detail||null,
  };
}

function packFor(data,scope,weekLabel){
  return buildExecutivePack(data,{site:scope.site||"all",weekLabel:weekLabel||scope.weekLabel||null});
}

function compareWeeks(data,scope,weeks){
  const all=availableWeeks(data,scope.site||"all");
  let [a,b]=weeks;
  if(!a||!b){
    const sorted=all.slice(-2);
    a=a||sorted[0];
    b=b||sorted[1];
  }
  if(!a||!b)return null;
  const first=packFor(data,scope,a);
  const second=packFor(data,scope,b);
  return {first,second};
}

function fmt(value,digits=1){
  const n=Number(value);
  return Number.isFinite(n)?n.toFixed(digits).replace(/\.0$/,""):"—";
}

function generalAnswer(pack){
  const facts=[
    "Drivers in scope: "+pack.fleet.drivers,
    "Average Total Score: "+fmt(pack.fleet.averageScore)+"/100",
    "Fair/Poor drivers: "+pack.fleet.fairPoor,
    "FICO below 815: "+pack.fleet.ficoFails,
    "Open incidents: "+pack.incidents.open.length,
    "Overdue coaching: "+pack.coaching.overdue.length,
  ];
  if(pack.rootCauses.primary)facts.push(
    "Largest aggregated point loss: "+pack.rootCauses.primary.label+
    " ("+fmt(pack.rootCauses.primary.pointsLost)+" pts across "+
    pack.rootCauses.primary.affectedDrivers+" drivers)"
  );
  return {
    intent:"executive_summary",
    title:"Executive summary",
    answer:pack.summary,
    facts,
    evidence:[
      ...top(pack.declined,3).map((item)=>evidence("driver",item,item.driver_name+" · "+fmt(item.score)+"/100")),
      ...top(pack.incidents.high,2).map((item)=>evidence("incident",item,item.title)),
    ],
    limitations:[],
  };
}

function whyDrop(data,scope,question){
  const weeks=weekTokens(question);
  const compared=compareWeeks(data,scope,weeks);
  if(!compared)return {
    intent:"why_drop",title:"Insufficient comparison data",
    answer:"I need two comparable stored periods to explain a drop reliably.",
    facts:[],evidence:[],limitations:["Fewer than two comparable weeks are available in this scope."],
  };
  const {first,second}=compared;
  const scoreDelta=
    second.fleet.averageScore!=null&&first.fleet.averageScore!=null
      ? second.fleet.averageScore-first.fleet.averageScore:null;
  const siteDelta=
    second.siteScorecard?.overallScore!=null&&first.siteScorecard?.overallScore!=null
      ? second.siteScorecard.overallScore-first.siteScorecard.overallScore:null;

  const causeMap=new Map((first.rootCauses.causes||[]).map((x)=>[x.key,x.pointsLost]));
  const causeChanges=(second.rootCauses.causes||[]).map((x)=>({
    ...x,deltaLost:x.pointsLost-(causeMap.get(x.key)||0),
  })).sort((a,b)=>b.deltaLost-a.deltaLost);

  const worsening=top(causeChanges.filter((x)=>x.deltaLost>0),4);
  const declines=top(second.declined,5);
  const primary=worsening[0];

  const parts=[];
  if(scoreDelta!=null)parts.push("Average driver Total Score moved "+(scoreDelta>0?"+":"")+fmt(scoreDelta)+" points from "+first.scope.weekLabel+" to "+second.scope.weekLabel+".");
  if(siteDelta!=null)parts.push("The stored site scorecard moved "+(siteDelta>0?"+":"")+fmt(siteDelta,2)+" points.");
  if(primary)parts.push(primary.label+" added the largest extra point loss ("+fmt(primary.deltaLost)+" more lost points across the scoped drivers).");
  if(declines.length)parts.push(declines[0].driver_name+" had the largest driver-level decline at "+fmt(declines[0].delta)+" points.");

  return {
    intent:"why_drop",
    title:"Why performance changed",
    answer:parts.join(" ")||"The available evidence does not show a measurable drop in the selected comparison.",
    facts:[
      ...worsening.map((x)=>x.label+": "+fmt(x.deltaLost)+" additional lost points"),
      ...declines.slice(0,3).map((x)=>x.driver_name+": "+fmt(x.delta)+" WoW"),
    ],
    evidence:[
      ...declines.map((item)=>evidence("driver",item,item.driver_name+" · "+item.week_label+" · "+fmt(item.score)+"/100")),
    ],
    limitations:[
      "This explains recorded scorecard movement; it does not infer motives or causes that are not present in MetrixIQ evidence.",
    ],
  };
}

function pointLoss(pack){
  const causes=top(pack.rootCauses.causes,6);
  const primary=causes[0];
  return {
    intent:"point_loss",
    title:"Scorecard point-loss analysis",
    answer:primary
      ? primary.label+" is currently costing the most scorecard points: "+fmt(primary.pointsLost)+" points across "+primary.affectedDrivers+" affected drivers."
      : "No scorecard point-loss component is available in this scope.",
    facts:causes.map((x)=>x.label+": "+fmt(x.pointsLost)+" pts lost · "+x.affectedDrivers+" drivers"),
    evidence:top(pack.movement.filter((x)=>x.primary_cause===primary?.label).sort((a,b)=>b.points_lost-a.points_lost),5)
      .map((item)=>evidence("driver",item,item.driver_name+" · "+item.primary_cause+" · "+item.points_lost+" pts lost")),
    limitations:[],
  };
}

function repeatedConcessions(data,scope){
  const pack=packFor(data,scope,scope.weekLabel);
  const scoped=(data.metricRows||[]).filter((row)=>{
    if(scope.site&&scope.site!=="all"&&String(row.drivers?.site||"").toUpperCase()!==String(scope.site).toUpperCase())return false;
    return Number(row.concessions||0)>0;
  });
  const map=new Map();
  for(const row of scoped){
    const current=map.get(row.driver_id)||{
      driver_id:row.driver_id,driver_name:row.drivers?.full_name||"Driver",trid:row.drivers?.trid||"",
      site:row.drivers?.site||"",weeks:new Set(),total:0,
    };
    current.weeks.add(row.week_label||row.period_end||"period");
    current.total+=Number(row.concessions||0);
    map.set(row.driver_id,current);
  }
  const repeated=[...map.values()].map((x)=>({...x,weeks:[...x.weeks]}))
    .filter((x)=>x.weeks.length>=2||x.total>=3)
    .sort((a,b)=>b.weeks.length-a.weeks.length||b.total-a.total);

  return {
    intent:"repeat_concessions",
    title:"Repeated concessions",
    answer:repeated.length
      ? repeated.length+" driver"+(repeated.length===1?" has":"s have")+" repeated or concentrated concessions in the stored evidence."
      : "No repeated concession pattern is visible in the stored periods for this scope.",
    facts:top(repeated,8).map((x)=>x.driver_name+": "+x.total+" concessions across "+x.weeks.length+" period"+(x.weeks.length===1?"":"s")),
    evidence:top(repeated,8).map((item)=>evidence("driver",item,item.driver_name+" · "+item.total+" concessions")),
    limitations:pack.scope.weekLabel?["Repeated-pattern analysis uses all stored periods in the selected site, not only "+pack.scope.weekLabel+"."]:[],
  };
}

function movementAnswer(data,scope,direction){
  const pack=packFor(data,scope,scope.weekLabel);
  const rows=direction==="up"?pack.improved:pack.declined;
  const label=direction==="up"?"improved":"declined";
  const best=rows[0];
  return {
    intent:direction==="up"?"improved_most":"declined_most",
    title:direction==="up"?"Largest improvements":"Largest declines",
    answer:best
      ? best.driver_name+" "+label+" the most versus the prior stored period ("+(best.delta>0?"+":"")+fmt(best.delta)+" points)."
      : "There are no comparable driver periods showing a "+label+" movement.",
    facts:top(rows,8).map((x)=>x.driver_name+": "+(x.delta>0?"+":"")+fmt(x.delta)+" · "+(x.previous_week||"prior")+" → "+x.week_label),
    evidence:top(rows,8).map((item)=>evidence("driver",item,item.driver_name+" · "+(item.delta>0?"+":"")+fmt(item.delta))),
    limitations:[],
  };
}

function closestTier(data,scope,question){
  const pack=packFor(data,scope,scope.weekLabel);
  const plus=/fantastic\s*plus|f\+/i.test(question);
  const target=plus?93:85;
  const targetName=plus?"Fantastic Plus":"Fantastic";
  const rows=pack.movement
    .map((row)=>({...row,gap:scoreGap(row.score,target)}))
    .filter((row)=>row.score!=null&&row.score<target)
    .sort((a,b)=>a.gap-b.gap);
  const first=rows[0];
  return {
    intent:"closest_tier",
    title:"Closest to "+targetName,
    answer:first
      ? first.driver_name+" is closest to "+targetName+" at "+fmt(first.score)+"/100, "+fmt(first.gap)+" points away."
      : "No driver below "+targetName+" is available in this scope.",
    facts:top(rows,8).map((x)=>x.driver_name+": "+fmt(x.score)+"/100 · "+fmt(x.gap)+" pts to "+targetName),
    evidence:top(rows,8).map((item)=>evidence("driver",item,item.driver_name+" · "+fmt(item.score)+"/100")),
    limitations:["This is a score-gap calculation, not a prediction that the driver will reach the next tier."],
  };
}

function coachingOutcome(data,scope){
  const pack=packFor(data,scope,scope.weekLabel);
  const cases=(pack.coaching.all||[]).filter((item)=>["improved","not_improved","closed"].includes(item.status)||item.outcome);
  const improved=cases.filter((item)=>item.status==="improved"||/improv/i.test(String(item.outcome||"")));
  return {
    intent:"coaching_outcomes",
    title:"Coaching outcomes",
    answer:cases.length
      ? improved.length+" of "+cases.length+" coaching cases with a recorded outcome are marked or described as improved."
      : "No completed coaching outcome evidence is recorded in this scope yet.",
    facts:[
      "Outcome-recorded cases: "+cases.length,
      "Improved: "+improved.length,
      "Open coaching: "+pack.coaching.open.length,
      "Overdue coaching: "+pack.coaching.overdue.length,
    ],
    evidence:top(improved,6).map((item)=>evidence("coaching",{
      ...item,site:item.drivers?.site,driver_id:item.driver_id,
    },(item.drivers?.full_name||"Driver")+" · "+item.title)),
    limitations:["A coaching case marked improved reflects recorded management outcome data; it is not an independent causal proof that coaching caused the improvement."],
  };
}

function dataQuality(pack){
  return {
    intent:"data_quality",
    title:"Data quality status",
    answer:pack.evidence.unresolved
      ? pack.evidence.unresolved+" unmatched imported record"+(pack.evidence.unresolved===1?" remains":"s remain")+" in this scope."
      : "No unmatched driver evidence is open in this scope.",
    facts:[
      "Unmatched evidence: "+pack.evidence.unresolved,
      "Failed imports: "+pack.operations.failedImports.length,
      "Feedback evidence: "+pack.evidence.feedbackCount,
      "DNR evidence: "+pack.evidence.dnrCount,
    ],
    evidence:[],
    limitations:[],
  };
}

export function answerExecutiveQuestion(data = {}, question = "", scope = {}) {
  const q=lower(question);
  const pack=packFor(data,scope,scope.weekLabel);

  if(/why|drop|dropped|declin|what happened|what changed/.test(q) && (/week|w\d|score|performance|site/.test(q))) {
    return {...whyDrop(data,scope,question),scope:pack.scope,generatedAt:new Date().toISOString()};
  }
  if(/cost.*point|point.*loss|lost.*point|root.?cause|biggest.*kpi|which.*metric/.test(q)) {
    return {...pointLoss(pack),scope:pack.scope,generatedAt:new Date().toISOString()};
  }
  if(/repeat.*concession|concession.*repeat|recurring.*concession/.test(q)) {
    return {...repeatedConcessions(data,scope),scope:pack.scope,generatedAt:new Date().toISOString()};
  }
  if(/improv.*most|most.*improv|top.*improv/.test(q)) {
    return {...movementAnswer(data,scope,"up"),scope:pack.scope,generatedAt:new Date().toISOString()};
  }
  if(/declin.*most|drop.*most|biggest.*drop|wors/.test(q)) {
    return {...movementAnswer(data,scope,"down"),scope:pack.scope,generatedAt:new Date().toISOString()};
  }
  if(/closest.*fantastic|near.*fantastic|next.*tier/.test(q)) {
    return {...closestTier(data,scope,question),scope:pack.scope,generatedAt:new Date().toISOString()};
  }
  if(/coach.*improv|improv.*coach|coaching.*outcome/.test(q)) {
    return {...coachingOutcome(data,scope),scope:pack.scope,generatedAt:new Date().toISOString()};
  }
  if(/data quality|unmatched|missing data|failed import/.test(q)) {
    return {...dataQuality(pack),scope:pack.scope,generatedAt:new Date().toISOString()};
  }
  if(/compare|versus| vs |w\d+.*w\d+/.test(q)) {
    return {...whyDrop(data,scope,question),intent:"period_comparison",title:"Period comparison",scope:pack.scope,generatedAt:new Date().toISOString()};
  }

  return {...generalAnswer(pack),scope:pack.scope,generatedAt:new Date().toISOString()};
}

export const ANALYST_SUGGESTIONS = Object.freeze([
  "Why did performance change this week?",
  "Which KPI cost us the most scorecard points?",
  "Who has repeated concessions?",
  "Who improved the most?",
  "Who had the biggest drop?",
  "Who is closest to Fantastic?",
  "Did drivers improve after coaching?",
  "What data-quality issues are still open?",
]);
