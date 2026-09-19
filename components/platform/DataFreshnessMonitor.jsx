"use client";

function ageLabel(hours){
  const n=Number(hours);
  if(!Number.isFinite(n))return"Never";
  if(n<1)return"<1h";
  if(n<24)return Math.round(n)+"h";
  const days=n/24;
  return days<10?days.toFixed(1)+"d":Math.round(days)+"d";
}

function dateLabel(value){
  if(!value)return"—";
  const d=new Date(value);
  return Number.isFinite(d.getTime())?d.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}):String(value);
}

export default function DataFreshnessMonitor({
  integrations=[],
  compact=false,
  onOpenSource,
  title="Data Freshness Monitor",
  subtitle="How recent each operational source is compared with its expected reporting cadence.",
}){
  const active=integrations.filter((item)=>item.enabled!==false);
  const fresh=active.filter((item)=>item.freshness_status==="fresh").length;
  const warning=active.filter((item)=>item.freshness_status==="warning").length;
  const stale=active.filter((item)=>item.freshness_status==="stale").length;
  const missing=active.filter((item)=>item.freshness_status==="missing").length;

  return <section className={"panel freshnessv6 "+(compact?"compact":"")}>
    <div className="panel-head">
      <div><h2>{title}</h2><p>{subtitle}</p></div>
      <span className={"freshnessv6-overall "+(stale||missing?"bad":warning?"warn":"good")}>
        {stale||missing?(stale+missing)+" attention":warning?warning+" warning":"All fresh"}
      </span>
    </div>

    {!compact&&<div className="freshnessv6-summary">
      <div className="good"><span>Fresh</span><strong>{fresh}</strong></div>
      <div className="warn"><span>Warning</span><strong>{warning}</strong></div>
      <div className="bad"><span>Stale</span><strong>{stale}</strong></div>
      <div className="neutral"><span>Missing</span><strong>{missing}</strong></div>
    </div>}

    <div className="freshnessv6-list">
      {integrations.map((item)=><button
        key={item.source_key}
        type="button"
        className={"freshnessv6-row "+item.freshness_status}
        onClick={()=>onOpenSource?.(item)}
      >
        <span className={"freshnessv6-dot "+item.freshness_status}/>
        <div className="freshnessv6-name">
          <b>{item.label}</b>
          <small>{item.metadata?.description||item.category||"Operational data source"}</small>
        </div>
        <div><span>Latest period</span><b>{dateLabel(item.last_period_end)}</b></div>
        <div><span>Age</span><b>{ageLabel(item.age_hours)}</b></div>
        <div><span>Expected</span><b>{item.expected_frequency_hours>=168?Math.round(item.expected_frequency_hours/24)+"d":item.expected_frequency_hours+"h"}</b></div>
        <em>{item.freshness_status}</em>
      </button>)}
      {!integrations.length&&<div className="freshnessv6-empty">No integration health evidence is available.</div>}
    </div>
  </section>;
}
