import { availableWeeks, buildExecutivePack } from "../reports/executivePackV2.js";
import {
  OFFICIAL_METRICS,
  metricText,
  officialMetricFact,
  officialSiteComparison,
  prepareAnalystEvidence,
} from "./officialScorecardSignals.js";

function lower(value){return String(value||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");}
function weekTokens(text){return [...String(text||"").matchAll(/\bW\s*(\d{1,2})\b/gi)].map((m)=>"W"+Number(m[1]));}
function top(items,limit=5){return (items||[]).slice(0,limit);}
function scoreGap(score,target){const n=Number(score);return Number.isFinite(n)?Math.max(0,target-n):null;}

function evidence(kind,item,label){
  return {
    kind,
    id:item?.driver_id||item?.id||null,
    driverId:item?.driver_id||null,
    trid:item?.trid||item?.drivers?.trid||null,
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
  let [a,b]=weeks.filter((item)=>all.includes(item));
  if(a&&b&&all.indexOf(a)>all.indexOf(b))[a,b]=[b,a];
  if(a&&!b){
    const index=all.indexOf(a);
    if(index>0){b=a;a=all[index-1];}
    else return null;
  }else if(!a&&!b){
    const selected=scope.weekLabel&&all.includes(scope.weekLabel)?all.indexOf(scope.weekLabel):all.length-1;
    a=all[selected-1];
    b=all[selected];
  }
  if(!a||!b||a===b)return null;
  const first=packFor(data,scope,a);
  const second=packFor(data,scope,b);
  return {first,second};
}

function fmt(value,digits=1){
  const n=Number(value);
  return Number.isFinite(n)?n.toFixed(digits).replace(/\.0$/,""):"—";
}

function generalAnswer(pack,official){
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
  const headline=official?.score!=null
    ?"Official "+official.site+" score: "+fmt(official.score,2)+"/100 ("+(official.current.standing||"standing unavailable")+")"+
      (official.delta==null?"":"; "+(official.delta>0?"+":"")+fmt(official.delta,2)+" versus "+official.previous?.week_label)+". "
    :"";
  return {
    intent:"executive_summary",
    title:"Executive summary",
    answer:headline+pack.summary,
    facts,
    evidence:[
      ...top(pack.declined,3).map((item)=>evidence("driver",item,item.driver_name+" · "+fmt(item.score)+"/100")),
      ...top(pack.incidents.high,2).map((item)=>evidence("incident",item,item.title)),
    ],
    limitations:["Driver averages are calculated from available weekly rows and are not the official DSP site score."],
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
  const official=officialSiteComparison(data,scope.site,second.scope.weekLabel,first.scope.weekLabel);
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
  if(official?.score!=null&&official.previousScore!=null){
    parts.push("The official "+official.site+" DSP Scorecard moved from "+fmt(official.previousScore,2)+" ("+
      (official.previous?.standing||"unrated")+") in "+official.previous.week_label+" to "+
      fmt(official.score,2)+" ("+(official.current.standing||"unrated")+") in "+
      official.current.week_label+": "+(official.delta>0?"+":"")+fmt(official.delta,2)+" points.");
    if(official.rank!=null&&official.previousRank!=null){
      parts.push("Site rank moved from #"+official.previousRank+" to #"+official.rank+".");
    }
    if(official.attention.length){
      parts.push("The main recorded KPI warning signs are "+top(official.attention,3)
        .map((item)=>item.short+" ("+metricText(item.before,item.unit)+" → "+metricText(item.current,item.unit)+")").join(", ")+".");
    }
  } else if(siteDelta!=null){
    parts.push("The stored site scorecard moved "+(siteDelta>0?"+":"")+fmt(siteDelta,2)+" points.");
  }
  if(scoreDelta!=null)parts.push("Separately, the average of available driver scores moved "+(scoreDelta>0?"+":"")+fmt(scoreDelta)+" points.");
  if(primary)parts.push("In driver scorecards, "+primary.label+" shows the largest increase in aggregated point loss ("+fmt(primary.deltaLost)+" points).");
  if(declines.length)parts.push(declines[0].driver_name+" had the largest recorded driver decline ("+fmt(declines[0].delta)+" points).");

  return {
    intent:"why_drop",
    title:"Why performance changed",
    scope:second.scope,
    answer:parts.join(" ")||"The available evidence does not show a measurable drop in the selected comparison.",
    facts:[
      ...(official?.attention||[]).slice(0,7).map(officialMetricFact),
      ...(official?.improving||[]).slice(0,2).map((item)=>"Improved: "+officialMetricFact(item)),
      ...worsening.slice(0,2).map((x)=>"Driver metric totals — "+x.label+": "+fmt(x.deltaLost)+" additional lost points"),
      ...declines.slice(0,3).map((x)=>x.driver_name+": "+fmt(x.delta)+" WoW"),
    ],
    evidence:[
      ...(official?[{kind:"site_scorecard",id:official.current.id,site:official.site,weekLabel:official.current.week_label,
        label:official.site+" "+official.current.week_label+" · official DSP Scorecard"}]:[]),
      ...declines.map((item)=>evidence("driver",item,item.driver_name+" · "+item.week_label+" · "+fmt(item.score)+"/100")),
    ],
    signals:official?.attention||[],
    actions:(official?.attention||[]).slice(0,4).map((item)=>({title:"Investigate "+item.short,detail:item.action,destination:item.destination})),
    limitations:[
      "The KPI changes are observed warning signs, not a verified weighted decomposition of the official site-score change.",
      ...(official?.attention?.some((item)=>item.trend==="new")?["A KPI that was N/A in the prior week cannot be given a numeric week-on-week change."]:[]),
      "Check approved exemptions, missing records and disputed metrics before treating a reported issue as driver fault.",
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
      ? primary.label+" has the largest aggregated loss of driver scorecard points: "+fmt(primary.pointsLost)+" points across "+primary.affectedDrivers+" drivers. This is not an official DSP site-score weighting."
      : "No scorecard point-loss component is available in this scope.",
    facts:causes.map((x)=>x.label+": "+fmt(x.pointsLost)+" pts lost · "+x.affectedDrivers+" drivers"),
    evidence:top(pack.movement.filter((x)=>x.primary_cause===primary?.label).sort((a,b)=>b.points_lost-a.points_lost),5)
      .map((item)=>evidence("driver",item,item.driver_name+" · "+item.primary_cause+" · "+item.points_lost+" pts lost")),
    limitations:["Aggregated driver formula points do not directly explain the official DSP site-score weighting."],
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
      ...item,site:item.drivers?.site,trid:item.drivers?.trid,driver_id:item.driver_id,
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

function siteRisks(official){
  if(!official)return {
    intent:"site_risks",title:"Official KPI review unavailable",
    answer:"Select one station with a stored official DSP site scorecard to review its KPI movements.",
    facts:[],evidence:[],actions:[],limitations:["All-sites driver averages are not official station KPI comparisons."],
  };
  const risks=top(official.attention,6);
  return {
    intent:"site_risks",title:"KPIs to investigate",
    answer:risks.length
      ?"The official "+official.site+" "+official.current.week_label+" scorecard has "+risks.length+
        " prominent adverse or newly reported KPI signals. Review these first; the metrics alone do not establish driver fault."
      :"No newly worsening KPI with a Great, Fair or Poor standing is visible in the selected official scorecard comparison.",
    facts:risks.map(officialMetricFact),signals:risks,
    actions:risks.slice(0,4).map((metric)=>({title:"Review "+metric.short,detail:metric.action,destination:metric.destination})),
    evidence:[{kind:"site_scorecard",site:official.site,weekLabel:official.current.week_label,label:"Official "+official.site+" site scorecard"}],
    limitations:["These are scorecard movements, not a verified breakdown of the site's weighted score."],
  };
}

function metricFocus(official,key){
  const guide=OFFICIAL_METRICS[key];
  const metric=official?.changes.find((item)=>item.key===key);
  if(!metric)return {
    intent:"metric_focus",title:(guide?.short||key.toUpperCase())+" analysis",
    answer:"The selected official site scorecard does not contain a comparable numeric "+(guide?.short||key.toUpperCase())+" result.",
    facts:[],evidence:[],actions:[],limitations:["Missing and N/A metrics are never treated as zero."],
  };
  const comparison=metric.trend==="new"
    ?"It was unavailable in the previous stored scorecard, so the size of the change cannot be calculated."
    :metric.trend==="worse"?"The recorded KPI worsened."
    :metric.trend==="better"?"The recorded KPI improved."
    :"No measurable movement is visible.";
  return {
    intent:"metric_focus",title:metric.label+" · "+official.site,
    answer:officialMetricFact(metric)+". "+comparison+" "+metric.action,
    facts:["Source: imported official "+official.site+" "+official.current.week_label+" DSP Scorecard",
      "Current standing: "+(metric.standing||"not provided"),
      "Metric direction: "+(metric.better==="lower"?"lower is better":"higher is better")],
    signals:[metric],actions:[{title:"Review "+metric.short,detail:metric.action,destination:metric.destination}],
    evidence:[{kind:"site_scorecard",site:official.site,weekLabel:official.current.week_label,label:"Official "+metric.short+" result"}],
    limitations:["The aggregate KPI does not identify the exact parcels, stops or drivers responsible. Use underlying reports before making conclusions."],
  };
}

function driverPriorities(pack){
  const drivers=pack.movement.filter((row)=>row.score!=null)
    .sort((a,b)=>a.score-b.score||(a.fico??999)-(b.fico??999))
    .slice(0,8);
  return {
    intent:"driver_priorities",title:"Drivers needing a weekly review",
    answer:drivers.length
      ?"Start with the lowest recorded driver scores in "+pack.scope.site+" "+pack.scope.weekLabel+". Check metric-level evidence before coaching or attributing fault."
      :"There are no comparable driver scorecard rows available for this station and week.",
    facts:drivers.map((row)=>row.driver_name+": "+fmt(row.score,2)+"/100 ("+row.tier+")"+
      (row.fico!=null?" · FICO "+fmt(row.fico,0):"")+
      (row.primary_cause?" · largest point gap: "+row.primary_cause:"")),
    evidence:drivers.map((row)=>evidence("driver",row,row.driver_name+" · "+fmt(row.score,2)+"/100")),
    actions:[{title:"Open Driver Scorecards",detail:"Review the scorecard metrics and driver history before preparing feedback.",destination:"driver-scorecards"},
      {title:"Prepare Driver Feedback",detail:"Generate a tailored weekly message after checking any disputed metrics.",destination:"performance"}],
    limitations:["Low scores identify review priority, not proof of driver misconduct."],
  };
}

function nextActions(pack,official){
  const actions=[
    ...(official?.attention||[]).slice(0,3).map((item)=>({title:"Investigate "+item.short,detail:item.action,destination:item.destination})),
    ...pack.actions.map((item)=>({title:item.title,detail:item.detail,destination:item.destination})),
  ].filter((item,index,list)=>list.findIndex((other)=>other.title===item.title)===index).slice(0,5);
  return {
    intent:"action_plan",title:"What I would check next",
    answer:actions.length
      ?"These are the highest-priority checks from the selected stored scorecards and operations evidence. Start with evidence validation, then act on confirmed gaps."
      :"No urgent action is supported by the available evidence for this selected period.",
    facts:actions.map((item)=>item.title+" — "+item.detail),actions,
    evidence:official?[{kind:"site_scorecard",site:official.site,weekLabel:official.current.week_label,label:"Latest official station scorecard"}]:[],
    limitations:["This is a review plan, not a prediction or an automatically approved exception."],
  };
}

const METRIC_QUESTIONS = [
  ["lor",/\blor\b|lost on road/], ["psb",/\bpsb\b|pickup success/],
  ["cdf_dpmo",/\bcdf\b|customer delivery feedback/], ["mentor_score",/\bfico\b|ementor|mentor score/],
  ["dcr",/\bdcr\b|delivery completion/], ["pod",/\bpod\b|photo on delivery/],
  ["cc",/\bcc\b|contact compliance/], ["dsc_dpmo",/\bdsc\b/],
  ["dnr_dpmo",/\bdnr\b|delivered not received/],
];

export function buildAnalystOverview(data={},scope={}){
  const safe=prepareAnalystEvidence(data);
  const pack=packFor(safe,scope,scope.weekLabel);
  const official=officialSiteComparison(safe,scope.site,scope.weekLabel);
  return {pack,official,actions:nextActions(pack,official).actions};
}

export function answerExecutiveQuestion(data = {}, question = "", scope = {}) {
  const q=lower(question);
  const scopedData=prepareAnalystEvidence(data);
  const pack=packFor(scopedData,scope,scope.weekLabel);
  const official=officialSiteComparison(scopedData,scope.site,scope.weekLabel);
  const result=(value)=>({...value,scope:value.scope||pack.scope,generatedAt:new Date().toISOString()});
  const metricKey=METRIC_QUESTIONS.find(([,pattern])=>pattern.test(q))?.[0];

  if(metricKey && /why|how|explain|what|review|check|de ce|cum|explica|verifica|ce e|ce este|problema/.test(q) &&
    !/performance|site score|overall score|scorul|performanta|compare|versus/.test(q)){
    return result(metricFocus(official,metricKey));
  }

  if(/why|drop|dropped|declin|what happened|what changed|de ce|scazut|scadere|cazut|schimbat/.test(q) &&
    /week|w\d|score|performance|site|saptaman|scor|performanta|rank|loc/.test(q)) {
    return result(whyDrop(scopedData,scope,question));
  }
  if(/cost.*point|point.*loss|lost.*point|root.?cause|biggest.*kpi|which.*metric/.test(q)) {
    return result(pointLoss(pack));
  }
  if(/which kpi|kpi.*attention|kpi.*wors|site.*risk|metric.*wors|ce metric|care kpi|metrici|indicatori/.test(q)){
    return result(siteRisks(official));
  }
  if(/repeat.*concession|concession.*repeat|recurring.*concession/.test(q)) {
    return result(repeatedConcessions(scopedData,scope));
  }
  if(/improv.*most|most.*improv|top.*improv/.test(q)) {
    return result(movementAnswer(scopedData,scope,"up"));
  }
  if(/declin.*most|drop.*most|biggest.*drop|wors/.test(q)) {
    return result(movementAnswer(scopedData,scope,"down"));
  }
  if(/closest.*fantastic|near.*fantastic|next.*tier/.test(q)) {
    return result(closestTier(scopedData,scope,question));
  }
  if(/coach.*improv|improv.*coach|coaching.*outcome/.test(q)) {
    return result(coachingOutcome(scopedData,scope));
  }
  if(/data quality|unmatched|missing data|failed import/.test(q)) {
    return result(dataQuality(pack));
  }
  if(/compare|versus| vs |w\d+.*w\d+/.test(q)) {
    return result({...whyDrop(scopedData,scope,question),intent:"period_comparison",title:"Period comparison"});
  }
  if(/which driver|who needs|drivers.*(attention|review|priorit|poor|fair)|sofer|cine.*(verifica|priorit)|who.*at risk/.test(q)){
    return result(driverPriorities(pack));
  }
  if(/what.*(do|next|fix)|action plan|next step|priorit|ce facem|ce trebuie|plan de actiune/.test(q)){
    return result(nextActions(pack,official));
  }

  if(!q.trim()||/summary|overview|executive brief|how are we|status|rezumat|cum stam/.test(q)){
    return result(generalAnswer(pack,official));
  }
  return result({
    intent:"unverified_question",title:"I need a more specific report for that",
    answer:"I cannot verify that exact question from the currently connected "+(scope.site||"all")+
      " "+(scope.weekLabel||"reporting period")+" evidence. I won't substitute a generic answer or invent a root cause.",
    facts:official?.score!=null?["Official score in scope: "+fmt(official.score,2)+"/100 · "+
      (official.current.standing||"standing unavailable")]:[],
    evidence:official?[{kind:"site_scorecard",site:official.site,weekLabel:official.current.week_label,
      label:official.site+" "+official.current.week_label+" official scorecard"}]:[],
    limitations:["Try a KPI, driver-coaching, concessions, score movement or period-comparison question. Parcel-level exceptions require the underlying operational records."],
  });
}

export const ANALYST_SUGGESTIONS = Object.freeze([
  "Why did our score drop this week?",
  "Which KPI needs attention?",
  "Which drivers need a review?",
  "What should we check next?",
  "Explain PSB this week",
  "Which KPI cost the most driver scorecard points?",
]);
