"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { fetchReportingV5Data } from "../../lib/data/reportingV5";
import { availableWeeks } from "../../lib/reports/executivePackV2";
import {
  ANALYST_SUGGESTIONS,
  answerExecutiveQuestion,
} from "../../lib/intelligence/executiveAnalystV2";

function driverShape(item){
  return {
    id:item.trid||"—",
    dbId:item.driverId||item.driver_id,
    name:String(item.label||"Driver").split(" · ")[0]||"Driver",
    site:item.site||"",
    risk:"Medium",
    issue:"Executive Analyst evidence",
  };
}

function scopeLabel(site,week){
  return (site==="all"?"All sites":site)+" · "+(week||"Latest available");
}

export default function ExecutiveAnalystV2({
  organizationId,
  sites=[],
  siteFilter="all",
  onSiteFilterChange,
  onOpenDriver,
  onNavigate,
}){
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [question,setQuestion]=useState("");
  const [site,setSite]=useState(siteFilter||"all");
  const [week,setWeek]=useState("");
  const [answer,setAnswer]=useState(null);
  const [history,setHistory]=useState([]);

  async function load(){
    if(!organizationId)return;
    setLoading(true);setError("");
    try{
      const next=await fetchReportingV5Data(getSupabaseBrowserClient(),organizationId);
      setData(next);
    }catch(e){setError(e?.message||"Could not load Executive AI Analyst data.");}
    finally{setLoading(false);}
  }
  useEffect(()=>{load();},[organizationId]);
  useEffect(()=>{if(siteFilter&&siteFilter!==site)setSite(siteFilter);},[siteFilter]);

  const weeks=useMemo(()=>availableWeeks(data||{},site),[data,site]);
  useEffect(()=>{
    if(week&&weeks.includes(week))return;
    setWeek(weeks.at(-1)||"");
  },[weeks.join("|")]);

  function runQuestion(text=question){
    const q=String(text||"").trim();
    if(!q||!data)return;
    const result=answerExecutiveQuestion(data,q,{site,weekLabel:week||null});
    setQuestion(q);
    setAnswer(result);
    setHistory((current)=>[
      {id:Date.now()+"-"+Math.random(),question:q,result},
      ...current,
    ].slice(0,12));
  }

  function changeSite(value){
    setSite(value);
    setWeek("");
    onSiteFilterChange?.(value);
    setAnswer(null);
  }

  function openEvidence(item){
    if(item.kind==="driver"&&item.driverId)return onOpenDriver?.(driverShape(item));
    if(item.kind==="incident")return onNavigate?.("evidence");
    if(item.kind==="coaching")return onNavigate?.("coaching");
  }

  if(loading)return <section className="panel analystv5-empty"><div className="auth-spinner"/><b>Loading evidence-grounded analyst…</b></section>;

  return <div className="analystv5-root">
    <div className="analystv5-heading">
      <div>
        <span className="page-kicker">EXECUTIVE AI ANALYST V2</span>
        <h1>Ask MetrixIQ</h1>
        <p>Natural-language management analysis grounded only in stored MetrixIQ evidence. Every conclusion shows the scope and supporting records.</p>
      </div>
      <div className="analystv5-grounded">GROUNDED ANALYSIS · NO SOURCE DATA CHANGED</div>
    </div>

    {error&&<div className="mgrv2-notice error">{error}</div>}
    {data?.optionalErrors?.length>0&&<div className="analystv5-warning">Some optional evidence sources are unavailable for your current permissions. Scorecard analysis is still available.</div>}

    <section className="analystv5-scope">
      <label><span>Site</span><select value={site} onChange={(e)=>changeSite(e.target.value)}><option value="all">All sites</option>{sites.map((value)=><option key={value}>{value}</option>)}</select></label>
      <label><span>Week</span><select value={week} onChange={(e)=>{setWeek(e.target.value);setAnswer(null);}}><option value="">Latest available</option>{weeks.map((value)=><option key={value}>{value}</option>)}</select></label>
      <div><span>CURRENT SCOPE</span><b>{scopeLabel(site,week)}</b></div>
      <button className="btn ghost" onClick={load}>Refresh evidence</button>
    </section>

    <section className="analystv5-ask panel">
      <div className="analystv5-input">
        <span>✦</span>
        <textarea
          value={question}
          onChange={(e)=>setQuestion(e.target.value)}
          onKeyDown={(e)=>{if((e.ctrlKey||e.metaKey)&&e.key==="Enter")runQuestion();}}
          placeholder="Ask: Why did DLS2 drop in W37? Which KPI cost the most points? Who improved the most?"
        />
        <button className="btn primary" disabled={!question.trim()} onClick={()=>runQuestion()}>Analyse</button>
      </div>
      <div className="analystv5-suggestions">
        {ANALYST_SUGGESTIONS.map((item)=><button key={item} onClick={()=>{setQuestion(item);runQuestion(item);}}>{item}</button>)}
      </div>
    </section>

    {!answer?<section className="analystv5-start-grid">
      <article className="panel"><span>01</span><h3>Ask a management question</h3><p>Use normal language. The analyst maps the question to scorecard, movement, coaching, incidents or data-quality evidence.</p></article>
      <article className="panel"><span>02</span><h3>Inspect the evidence</h3><p>Driver, week and incident evidence remains visible next to the result so the conclusion is auditable.</p></article>
      <article className="panel"><span>03</span><h3>Take action</h3><p>Open Driver 360, Coaching, Evidence Center or the relevant management workflow directly from the analysis.</p></article>
    </section>:<section className="analystv5-answer">
      <article className="panel analystv5-main-answer">
        <div className="analystv5-answer-head">
          <div><span>{String(answer.intent||"analysis").replaceAll("_"," ").toUpperCase()}</span><h2>{answer.title}</h2><small>{scopeLabel(answer.scope?.site||site,answer.scope?.weekLabel||week)}</small></div>
          <b>Evidence grounded</b>
        </div>
        <p className="analystv5-answer-text">{answer.answer}</p>

        {answer.facts?.length>0&&<div className="analystv5-facts">
          {answer.facts.map((fact,index)=><div key={fact}><span>{String(index+1).padStart(2,"0")}</span><p>{fact}</p></div>)}
        </div>}

        {answer.limitations?.length>0&&<div className="analystv5-limitations"><b>Interpretation limits</b>{answer.limitations.map((item)=><p key={item}>{item}</p>)}</div>}
      </article>

      <aside className="panel analystv5-evidence">
        <div className="panel-head"><div><h2>Supporting evidence</h2><p>Open the underlying operational record.</p></div><span className="panel-badge">{answer.evidence?.length||0}</span></div>
        <div>
          {(answer.evidence||[]).map((item,index)=><button key={(item.id||index)+"-"+index} onClick={()=>openEvidence(item)}>
            <span>{item.kind}</span>
            <div><b>{item.label}</b><small>{[item.site,item.weekLabel].filter(Boolean).join(" · ")||"Workspace evidence"}</small></div>
            <em>Open →</em>
          </button>)}
          {!answer.evidence?.length&&<div className="analystv5-empty compact">This answer is based on aggregate stored evidence rather than a single record.</div>}
        </div>
      </aside>
    </section>}

    {history.length>0&&<section className="panel analystv5-history">
      <div className="panel-head"><div><h2>Recent questions</h2><p>Current browser session only.</p></div></div>
      <div>{history.map((item)=><button key={item.id} onClick={()=>{setQuestion(item.question);setAnswer(item.result);}}><b>{item.question}</b><small>{item.result.title} · {scopeLabel(item.result.scope?.site||"all",item.result.scope?.weekLabel||"")}</small></button>)}</div>
    </section>}
  </div>;
}
