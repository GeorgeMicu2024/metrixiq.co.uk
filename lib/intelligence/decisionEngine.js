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
