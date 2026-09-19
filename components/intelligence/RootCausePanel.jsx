"use client";

function tone(item){
  if(item.missing)return"missing";
  if(item.lostPoints===0)return"max";
  if(item.points===0)return"critical";
  return"opportunity";
}

export default function RootCausePanel({ result, title="Root-Cause Analysis", subtitle="Where scorecard points are being lost.", compact=false }) {
  const causes=result?.components||[];
  const opportunities=result?.opportunities||[];
  return <section className={"panel rootv4-panel"+(compact?" compact":"")}>
    <div className="panel-head">
      <div><h2>{title}</h2><p>{subtitle}</p></div>
      <span className="panel-badge">{result?.pointsLost??0} pts lost</span>
    </div>
    <div className="rootv4-summary">
      <div><span>Possible</span><strong>{result?.maxScore??100}</strong></div>
      <div><span>Actual</span><strong>{result?.score??"—"}</strong></div>
      <div><span>Lost</span><strong>{result?.pointsLost??"—"}</strong></div>
      <div><span>Coverage</span><strong>{result?.coverage??0}/9</strong></div>
    </div>
    <div className="rootv4-components">
      {causes.map((item)=><article key={item.key} className={tone(item)}>
        <div className="rootv4-label"><b>{item.label}</b><small>{item.points}/{item.maxPoints} pts</small></div>
        <div className="rootv4-bar"><i style={{width:(item.maxPoints?item.points/item.maxPoints*100:0)+"%"}} /></div>
        <div className="rootv4-loss">{item.lostPoints?("-"+item.lostPoints):"MAX"}</div>
      </article>)}
    </div>
    {!compact&&<div className="rootv4-recovery">
      <span>RECOVERY PRIORITY</span>
      {opportunities.slice(0,4).map((item,index)=><div key={item.key}>
        <b>{String(index+1).padStart(2,"0")}</b>
        <p><strong>{item.label}</strong><small>{item.nextTarget?.label||"Restore valid metric evidence"}</small></p>
        <em>+{Math.max(0,item.recoverableNext)} next-band pts</em>
      </div>)}
      {!opportunities.length&&<div className="rootv4-perfect">Maximum point-band score achieved on all available components.</div>}
    </div>}
  </section>;
}
