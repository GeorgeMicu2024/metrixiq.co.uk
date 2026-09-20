const DAY=86400000;
const ts=v=>{const d=new Date(v||0);return Number.isFinite(d.getTime())?d.getTime():0};

export function buildReportFreshness(imports=[],now=new Date()){
  const latest=new Map();
  for(const row of imports){
    const type=row.detected_report_type||row.report_type||"unknown";
    const at=ts(row.created_at||row.imported_at);
    if(!latest.has(type)||at>latest.get(type).at) latest.set(type,{type,at,row});
  }
  const expected=["mentor_daily","iadc","driver_scorecard","concessions"];
  return expected.map(type=>{
    const item=latest.get(type); const age=item?Math.floor((now.getTime()-item.at)/DAY):null;
    const maxAge=type==="mentor_daily"?2:8;
    return {type,lastSeen:item?new Date(item.at).toISOString():null,ageDays:age,status:item?(age>maxAge?"stale":"fresh"):"missing",maxAgeDays:maxAge};
  });
}

export function predictDeterioration(history=[]){
  const byDriver=new Map();
  for(const row of history){
    const id=row.driver_id||row.driverId||row.trid; if(!id)continue;
    const score=Number(row.performance??row.score??row.overall_score);
    if(!Number.isFinite(score))continue;
    if(!byDriver.has(id))byDriver.set(id,[]);
    byDriver.get(id).push({...row,_score:score,_time:ts(row.period_end||row.created_at||row.week_label)});
  }
  return [...byDriver.entries()].map(([id,rows])=>{
    rows.sort((a,b)=>a._time-b._time); const recent=rows.slice(-4);
    if(recent.length<2)return null;
    const deltas=recent.slice(1).map((r,i)=>r._score-recent[i]._score);
    const velocity=deltas.reduce((a,b)=>a+b,0)/deltas.length;
    const projected=Number((recent.at(-1)._score+velocity).toFixed(1));
    const confidence=Math.min(90,45+recent.length*10);
    return {driverId:id,driverName:recent.at(-1).driver_name||recent.at(-1).name||id,velocity:Number(velocity.toFixed(1)),projectedNext:projected,confidence,deteriorating:velocity<=-2,evidencePoints:recent.length};
  }).filter(Boolean).sort((a,b)=>a.velocity-b.velocity);
}

export function coachingEffectiveness(cases=[],history=[]){
  return cases.map(c=>{
    const id=c.driver_id||c.driverId; const when=ts(c.closed_at||c.acknowledged_at||c.created_at);
    const rows=history.filter(r=>(r.driver_id||r.driverId)===id&&Number.isFinite(Number(r.performance??r.score??r.overall_score))).sort((a,b)=>ts(a.period_end||a.created_at)-ts(b.period_end||b.created_at));
    const before=[...rows].reverse().find(r=>ts(r.period_end||r.created_at)<=when);
    const after=rows.find(r=>ts(r.period_end||r.created_at)>when);
    const b=Number(before?.performance??before?.score??before?.overall_score),a=Number(after?.performance??after?.score??after?.overall_score);
    const delta=Number.isFinite(a)&&Number.isFinite(b)?Number((a-b).toFixed(1)):null;
    return {...c,effectivenessDelta:delta,outcomeSignal:delta==null?"pending":delta>=3?"improved":delta<=-3?"deteriorated":"stable"};
  });
}

export function buildWeeklyExecutiveAi({intelligence={},freshness=[],predictions=[]}={}){
  const stale=freshness.filter(x=>x.status!=="fresh");
  const falling=predictions.filter(x=>x.deteriorating).slice(0,5);
  return {
    headline:intelligence.highRisk? `${intelligence.highRisk} high-risk drivers require intervention` : falling.length?`${falling.length} deterioration signals require review`:"No critical deterioration signal detected",
    priorities:[
      ...falling.map(x=>`Review ${x.driverName}: recent performance velocity ${x.velocity} points/period`),
      ...stale.map(x=>`${x.type} evidence is ${x.status}; refresh before high-confidence decisions`)
    ].slice(0,6),
    confidence:intelligence.confidence??0,
    caveat:"Forecasts extrapolate recent stored evidence and are not guarantees of future performance."
  };
}

export function evaluateInterventionOutcome(task,history=[]){
  const id=task?.driver_id||task?.driverId;
  const created=ts(task?.created_at||task?.createdAt);
  const signal=task?.metadata?.signal_key||task?.source_id||task?.signalKey||"performance";
  const field=signal==="mentor"?"mentor_score":signal;
  const read=row=>{
    const raw=field==="performance"?(row.performance??row.score??row.overall_score):(row[field]??(signal==="mentor"?(row.ementor??row.fico):null));
    const v=Number(raw); return Number.isFinite(v)?v:null;
  };
  const rows=history.filter(r=>(r.driver_id||r.driverId)===id&&read(r)!=null).sort((a,b)=>ts(a.period_end||a.created_at)-ts(b.period_end||b.created_at));
  const before=[...rows].reverse().find(r=>ts(r.period_end||r.created_at)<=created);
  const after=rows.filter(r=>ts(r.period_end||r.created_at)>created);
  if(!before||!after.length)return {...task,outcome:"pending",recommendation:"continue_monitoring",delta:null,evidencePoints:after.length,confidence:Math.min(60,25+after.length*10),reason:"Waiting for comparable post-intervention evidence."};
  const baseline=read(before),current=read(after.at(-1));
  const lowerIsBetter=["concessions"].includes(signal);
  const rawDelta=Number((current-baseline).toFixed(2));
  const improvement=lowerIsBetter?-rawDelta:rawDelta;
  const outcome=improvement>=5?"recovered":improvement>=2?"improving":improvement<=-2?"deteriorating":"no_response";
  const recommendation=outcome==="recovered"?"close":outcome==="deteriorating"?"escalate":"continue_monitoring";
  return {...task,outcome,recommendation,baseline,current,delta:rawDelta,evidencePoints:after.length,confidence:Math.min(95,55+after.length*10),reason:`${signal} moved from ${baseline} to ${current} after intervention (${rawDelta>=0?"+":""}${rawDelta}).`};
}

export function buildOutcomeMonitor(tasks=[],history=[]){
  const aiTasks=tasks.filter(t=>t.source_type==="ai_intervention"||t.metadata?.ai_generated);
  const outcomes=aiTasks.map(t=>evaluateInterventionOutcome(t,history));
  return {
    outcomes,
    recovered:outcomes.filter(x=>x.outcome==="recovered").length,
    improving:outcomes.filter(x=>x.outcome==="improving").length,
    noResponse:outcomes.filter(x=>x.outcome==="no_response").length,
    deteriorating:outcomes.filter(x=>x.outcome==="deteriorating").length,
    pending:outcomes.filter(x=>x.outcome==="pending").length,
    escalations:outcomes.filter(x=>x.recommendation==="escalate"),
    closeCandidates:outcomes.filter(x=>x.recommendation==="close")
  };
}

export function learnInterventionPatterns(tasks=[]){
  const groups=new Map();
  for(const t of tasks){
    const m=t.metadata||{}; const signal=m.signal_key||t.source_id||"performance";
    const intervention=m.recommended_action||m.intervention_type||"manager_review";
    const outcome=m.outcome; if(!["recovered","improving","no_response","deteriorating"].includes(outcome))continue;
    const key=`${signal}::${intervention}`;
    if(!groups.has(key))groups.set(key,{signal,intervention,total:0,recovered:0,improved:0,deteriorated:0,deltas:[]});
    const g=groups.get(key); g.total++;
    if(outcome==="recovered")g.recovered++;
    if(outcome==="recovered"||outcome==="improving")g.improved++;
    if(outcome==="deteriorating")g.deteriorated++;
    const delta=Number(m.delta); if(Number.isFinite(delta))g.deltas.push(delta);
  }
  return [...groups.values()].map(g=>{
    const recoveryRate=g.total?g.recovered/g.total:0, positiveRate=g.total?g.improved/g.total:0;
    const confidence=Math.min(95,Math.round(30+Math.min(g.total,20)*3.25));
    const avgDelta=g.deltas.length?Number((g.deltas.reduce((a,b)=>a+b,0)/g.deltas.length).toFixed(2)):null;
    return {...g,recoveryRate:Number((recoveryRate*100).toFixed(1)),positiveRate:Number((positiveRate*100).toFixed(1)),confidence,avgDelta};
  }).sort((a,b)=>b.positiveRate-a.positiveRate||b.total-a.total);
}

export function recommendLearnedIntervention(signal,tasks=[]){
  const candidates=learnInterventionPatterns(tasks).filter(x=>x.signal===signal);
  const best=candidates[0];
  if(!best||best.total<3)return {status:"insufficient_evidence",signal,recommendation:null,confidence:best?.confidence||0,evidenceCases:best?.total||0,explanation:"Not enough comparable historical outcomes yet; use the evidence-based default intervention."};
  return {status:"learned",signal,recommendation:best.intervention,confidence:best.confidence,evidenceCases:best.total,recoveryRate:best.recoveryRate,positiveRate:best.positiveRate,avgDelta:best.avgDelta,explanation:`${best.intervention} has produced positive movement in ${best.positiveRate}% of ${best.total} comparable historical cases; recovery rate ${best.recoveryRate}%.`};
}
