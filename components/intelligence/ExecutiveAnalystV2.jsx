"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { fetchAnalystV3Data } from "../../lib/data/analystV3";
import { availableWeeks } from "../../lib/reports/executivePackV2";
import { buildAnalystOverview, answerExecutiveQuestion, ANALYST_SUGGESTIONS } from "../../lib/intelligence/executiveAnalystV2";
import { analystAiContext, metricText, prepareAnalystEvidence } from "../../lib/intelligence/officialScorecardSignals";

const scoreText = (value) => value == null ? "—" : Number(value).toFixed(2);
const siteName = (site) => site === "all" ? "All sites" : site;
const AI_ANALYSIS_FOCUS = Object.freeze({
  why_drop: "Explain the confirmed site-score movement, which official KPIs changed and what to verify next.",
  period_comparison: "Compare the stored official weekly scorecards and suggest the three most useful checks.",
  metric_focus: "Explain the currently selected official KPI signal and practical verification steps.",
  site_risks: "Prioritise the official site KPIs that need investigation, with realistic next checks.",
  driver_priorities: "Summarise the aggregate driver scorecard distribution and explain safe coaching priorities, without naming individuals.",
  action_plan: "Produce a short, evidence-driven action plan for this station and week.",
});

function driverShape(item) {
  return {
    id: item.trid || "—",
    dbId: item.driverId || item.driver_id,
    name: String(item.label || "Driver").split(" · ")[0] || "Driver",
    site: item.site || "",
    risk: "Medium",
    issue: "Weekly scorecard evidence",
  };
}

function aiDelta(block) {
  const line = block.split("\n").filter((part) => part.startsWith("data:")).map((part) => part.slice(5).trim()).join("");
  if (!line || line === "[DONE]") return "";
  try {
    const content = JSON.parse(line)?.choices?.[0]?.delta?.content;
    return typeof content === "string" ? content : Array.isArray(content)
      ? content.map((part) => typeof part === "string" ? part : part?.text || "").join("") : "";
  } catch { return ""; }
}

export default function ExecutiveAnalystV2({ organizationId, siteFilter = "all", onOpenDriver, onNavigate, allowExternalAi = false }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [question, setQuestion] = useState("");
  const [week, setWeek] = useState("");
  const [answer, setAnswer] = useState(null);
  const [analysing, setAnalysing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [history, setHistory] = useState([]);
  const [copyNotice, setCopyNotice] = useState("");
  const [aiConsent, setAiConsent] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState("");
  const aiAbort = useRef(null);
  const analysisRun = useRef(0);
  const answerRef = useRef(null);
  const site = siteFilter || "all";

  useEffect(() => {
    let live = true;
    if (!organizationId) { setData(null); setLoading(false); setError("Select an organisation to analyse its reports."); return; }
    setLoading(true);
    setError("");
    fetchAnalystV3Data(getSupabaseBrowserClient(), organizationId, site)
      .then((result) => { if (live) { setData(prepareAnalystEvidence(result)); setAnswer(null); setAnalysisError(""); } })
      .catch((failure) => { if (live) { setData(null); setError(failure?.message || "Could not load analyst evidence."); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [organizationId, site, refreshKey]);

  const weeks = useMemo(() => availableWeeks(data || {}, site), [data, site]);
  useEffect(() => { analysisRun.current += 1; setAnalysing(false); setAnalysisError("");
    setWeek(weeks.at(-1) || ""); setAnswer(null); setCopyNotice(""); setAiText("");
    aiAbort.current?.abort(); }, [site, weeks.join("|")]);
  useEffect(() => () => aiAbort.current?.abort(), []);

  const scope = useMemo(() => ({ site, weekLabel: week || null }), [site, week]);
  const overview = useMemo(() => data ? buildAnalystOverview(data, scope) : null, [data, scope]);
  // Show the verified KPI snapshot immediately, but reserve the full answer
  // panel for an explicit question. Previously the default answer was identical
  // to the first Analyse result, making a successful click look broken.
  const result = answer;
  const official = overview?.official || null;
  const fleet = overview?.pack?.fleet || null;
  const attention = official?.attention || [];
  const visibleHistory = history.filter((item) => item.site === site && item.week === week);

  function runQuestion(text = question) {
    const q = String(text || "").trim();
    if (!q || !data) return;
    const run = ++analysisRun.current;
    setQuestion(q);
    setAnswer(null);
    setAnalysing(true);
    setAnalysisError("");
    setCopyNotice("");
    setAiText(""); setAiError(""); aiAbort.current?.abort();
    // Let the working indicator paint before running the synchronous evidence
    // calculations. Only the latest question may update the displayed answer.
    window.setTimeout(() => {
      if (run !== analysisRun.current) return;
      try {
        const next = { ...answerExecutiveQuestion(data, q, scope), askedQuestion: q,
          analysedAt: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) };
        if (run !== analysisRun.current) return;
        setAnswer(next);
        setHistory((current) => [{ id: Date.now() + "-" + Math.random(), site, week, question: q, result: next },
          ...current].slice(0, 12));
      } catch {
        setAnalysisError("This question could not be processed from the selected reports. Refresh the evidence and try again.");
      } finally {
        if (run === analysisRun.current) {
          setAnalysing(false);
          window.requestAnimationFrame(() => answerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
        }
      }
    }, 25);
  }

  async function copyAnalysis() {
    if (!result) return;
    const content = [result.title, result.answer, ...(result.facts || []).map((fact) => "• " + fact),
      ...(result.limitations || []).map((text) => "Note: " + text)].join("\n\n");
    try { await navigator.clipboard.writeText(content); setCopyNotice("Analysis copied"); }
    catch { setCopyNotice("Clipboard unavailable; select the text to copy it."); }
  }

  async function explainWithAi() {
    if (!allowExternalAi || !aiConsent || !overview || aiBusy) return;
    const controller = new AbortController();
    aiAbort.current = controller;
    setAiBusy(true); setAiText(""); setAiError("");
    try {
      const { data: { session } } = await getSupabaseBrowserClient().auth.getSession();
      if (!session?.access_token) throw new Error("Sign in again to use the optional AI explanation.");
      // Only a fixed, allowlisted analytic intent travels with anonymised KPIs;
      // never forward a manager's free-text question, which may contain names,
      // parcel numbers or other identifiers.
      const prompt = AI_ANALYSIS_FOCUS[result?.intent] ||
        "Explain the verified site-level weekly performance evidence and three practical checks.";
      const response = await fetch("/api/ai-lab/chat", {
        method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + session.access_token },
        body: JSON.stringify({
          messages: [{ role: "user", content: "Answer this question using ONLY the report provided: " + prompt +
            ". Clearly separate confirmed figures, possible explanations and next checks. Do not invent score weights, driver details or exceptions." }],
          includeReport: true, reportContext: analystAiContext(overview), includeMemory: false,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "The optional AI model is unavailable. Your verified analysis remains above.");
      }
      if (!response.body) throw new Error("No AI response was returned.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "", full = "";
      const consume = (part) => { const delta = aiDelta(part); if (delta) { full = (full + delta).slice(0, 8500); setAiText(full); } };
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
          let boundary = buffer.indexOf("\n\n");
          while (boundary >= 0) { consume(buffer.slice(0, boundary)); buffer = buffer.slice(boundary + 2); boundary = buffer.indexOf("\n\n"); }
        }
        if (buffer.trim()) consume(buffer);
      } finally { reader.releaseLock(); }
      if (!full.trim()) throw new Error("The AI model returned no text. The grounded analysis above is still available.");
    } catch (failure) {
      if (!controller.signal.aborted) setAiError(failure?.message || "AI explanation failed; the verified analysis is unaffected.");
    } finally {
      if (aiAbort.current === controller) aiAbort.current = null;
      setAiBusy(false);
    }
  }

  function openEvidence(item) {
    if (item.kind === "driver" && item.driverId) return onOpenDriver?.(driverShape(item));
    if (item.kind === "site_scorecard") return onNavigate?.("site-scorecards");
    if (item.kind === "incident") return onNavigate?.("evidence");
    if (item.kind === "coaching") return onNavigate?.("coaching");
  }

  if (loading) return <section className="panel analystx-loading"><div className="auth-spinner"/><b>Connecting the latest MetrixIQ scorecards…</b><span>Reading only your authorised reports.</span></section>;

  return <div className="analystv5-root analystx-root">
    <header className="analystx-hero">
      <div className="analystx-hero-copy">
        <span className="analystx-eyebrow">METRIXIQ · CONNECTED INTELLIGENCE</span>
        <h1>Ask MetrixIQ <span>✦</span></h1>
        <p>Understand what changed, find the real scorecard evidence and decide what to check next.</p>
      </div>
      <div className="analystx-live"><span className="analystx-live-dot"/> Evidence-based · Read-only</div>
    </header>

    {error && <div className="mgrv2-notice error" role="alert">{error}</div>}
    {data?.optionalErrors?.length > 0 && <div className="analystx-warning">Some optional evidence sources could not be loaded. Official scorecards are still available; results may have limited supporting detail.</div>}

    <section className="analystx-scope" aria-label="Analysis scope">
      <div className="analystx-scope-identity"><span>ANALYSING</span><strong>{siteName(site)}</strong><small>Activity Site evidence</small></div>
      <label><span>Reporting week</span><select value={week} onChange={(event) => {
        analysisRun.current += 1; setAnalysing(false); setAnalysisError("");
        setWeek(event.target.value); setAnswer(null); setCopyNotice("");
      }} disabled={!weeks.length}>
        {!weeks.length && <option value="">No imported weeks</option>}
        {weeks.map((value) => <option key={value} value={value}>{value}</option>)}
      </select></label>
      <span className="analystx-scope-note">Official DSP Scorecards are shown separately from calculated driver averages.</span>
      <button type="button" onClick={() => {
        analysisRun.current += 1; setAnalysing(false); setAnswer(null); setAnalysisError("");
        setRefreshKey((current) => current + 1);
      }} className="analystx-refresh">↻ Refresh data</button>
    </section>

    <section className="analystx-kpis" aria-label="Verified scorecard snapshot">
      <article><span>OFFICIAL SITE SCORE</span><strong>{scoreText(official?.score)}<small>/100</small></strong><em>{official?.current?.standing || "Select a station"}</em></article>
      <article><span>WEEK-ON-WEEK MOVEMENT</span><strong className={official?.delta != null && official.delta < 0 ? "down" : ""}>{official?.delta == null ? "—" : (official.delta > 0 ? "+" : "") + scoreText(official.delta)}</strong><em>{official?.previous?.week_label ? "vs " + official.previous.week_label : "No comparable official week"}</em></article>
      <article><span>SITE RANK</span><strong>{official?.rank == null ? "—" : "#" + official.rank}</strong><em>{official?.previousRank != null ? "Previously #" + official.previousRank : "Official station ranking"}</em></article>
      <article><span>DRIVER SCORECARDS</span><strong>{fleet?.drivers ?? "—"}</strong><em>{fleet ? fleet.fairPoor + " Fair / Poor to review" : "No driver evidence loaded"}</em></article>
    </section>

    <div className="analystx-workspace">
      <main className="analystx-main">
        <section className="analystx-compose" aria-label="Ask Analyst">
          <div className="analystx-section-title"><span className="analystx-spark">✦</span><div><h2>Ask a question</h2><p>Ask naturally. Every numeric claim is tied to the selected reporting scope.</p></div></div>
          <form onSubmit={(event) => { event.preventDefault(); runQuestion(); }}>
            <textarea value={question} onChange={(event) => setQuestion(event.target.value)} rows={2} maxLength={900}
              aria-label="Question for MetrixIQ Analyst" placeholder="Why did DZM1 drop from W43 to W44? What should I check first?"
              onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); runQuestion(); } }}/>
            <button type="submit" disabled={!question.trim() || !data || analysing}>{analysing ? "Analysing…" : "Analyse"} <span>↗</span></button>
          </form>
          <div className="analystx-prompt-list" aria-label="Suggested questions">
            {ANALYST_SUGGESTIONS.map((suggestion) => <button type="button" key={suggestion} onClick={() => runQuestion(suggestion)}>{suggestion}</button>)}
          </div>
        </section>

        <section className="analystx-answer" aria-live="polite" ref={answerRef}>
          <div className="analystx-answer-heading">
            <div><span>{analysing ? "ANALYSING YOUR QUESTION" : result ? "QUESTION ANALYSED ✓" : "READY FOR YOUR QUESTION"}</span>
              <h2>{analysing ? "Checking your imported reports…" : result?.title || "Your weekly intelligence is ready"}</h2>
              <small>{siteName(site)} · {week || "Latest available"}{result?.analysedAt ? " · Answered at " + result.analysedAt : ""}</small></div>
            <button type="button" onClick={copyAnalysis} disabled={!result}>⧉ Copy</button>
          </div>
          {result?.askedQuestion && <div className="analystx-asked"><span>YOU ASKED</span><p>{result.askedQuestion}</p></div>}
          {analysisError && <div className="analystx-analysis-error" role="alert">{analysisError}</div>}
          {analysing ? <div className="analystx-working" role="status"><div className="auth-spinner"/><p>Comparing the available scorecards and checking supporting records…</p></div> : result ? <>
            <p className="analystx-conclusion">{result.answer}</p>
            {result.facts?.length > 0 && <div className="analystx-facts">
              <h3>What the records show</h3>
              {result.facts.slice(0,10).map((fact,index) => <div key={index}><span>{String(index+1).padStart(2,"0")}</span><p>{fact}</p></div>)}
            </div>}
            {result.actions?.length > 0 && <div className="analystx-answer-actions"><h3>Recommended checks</h3>
              {result.actions.slice(0,4).map((action,index) => <button type="button" key={index} onClick={() => onNavigate?.(action.destination)}>
                <strong>{action.title}</strong><span>{action.detail}</span><em>Open →</em>
              </button>)}
            </div>}
            {result.evidence?.length > 0 && <div className="analystx-evidence"><h3>Open the supporting records</h3><div>
              {result.evidence.slice(0,6).map((item,index) => <button key={index} type="button" onClick={() => openEvidence(item)}>
                <span>{item.kind === "site_scorecard" ? "DSP Scorecard" : item.kind}</span><b>{item.label}</b><em>↗</em>
              </button>)}
            </div></div>}
            {result.limitations?.length > 0 && <div className="analystx-limits"><b>What this does not prove</b>{result.limitations.map((limit,index) => <p key={index}>{limit}</p>)}</div>}
            {allowExternalAi && <section className="analystx-ai-option" aria-label="Optional AI explanation">
              <div><span>✦ OPTIONAL AI EXPLANATION</span><h3>Discuss this with IQ</h3>
                <p>Use the existing free AI model for a more conversational explanation. The verified findings above always remain the source of truth.</p></div>
              <label><input type="checkbox" checked={aiConsent} onChange={(event) => setAiConsent(event.target.checked)} disabled={aiBusy}/>
                Share only anonymised site KPIs and driver counts with the AI provider (no names, TRIDs, parcels or typed questions)
              </label>
              <div className="analystx-ai-controls"><button type="button" disabled={!aiConsent || aiBusy || !data} onClick={explainWithAi}>
                {aiBusy ? "IQ is thinking…" : "Explain with IQ ✦"}
              </button>{aiBusy && <button type="button" onClick={() => aiAbort.current?.abort()}>Stop</button>}</div>
              {aiText && <div className="analystx-ai-response"><b>IQ explanation · Check against the evidence above</b><p>{aiText}</p></div>}
              {aiError && <p className="analystx-ai-error" role="alert">{aiError}</p>}
              <small>The model provider may retain prompts. No source files or individual driver details are sent. AI availability is not guaranteed.</small>
            </section>}
          </> : <div className="analystx-ready">
            <p>Type your question above and press <strong>Analyse</strong>. Your answer will appear here, using the reporting week and station you selected.</p>
            {official?.score != null && <div className="analystx-ready-snapshot">
              <span>READY TO INVESTIGATE</span>
              <strong>{official.site} {official.current.week_label} · {scoreText(official.score)}/100</strong>
              <small>{official.attention.length ? official.attention.slice(0,3).map((item) => item.short).join(" · ") + " need reviewing" : "No prominent worsening KPI detected"}</small>
            </div>}
            <p className="analystx-ready-tip">Try: <button type="button" onClick={() => runQuestion("Why did our score drop this week?")}>Why did our score drop this week? →</button></p>
          </div>}
          {copyNotice && <p className="analystx-copy-notice" role="status">{copyNotice}</p>}
        </section>
      </main>

      <aside className="analystx-side">
        <section className="analystx-side-panel"><div className="analystx-side-heading"><div><span>OFFICIAL SCORECARD</span><h2>What changed</h2></div><strong>{attention.length} signals</strong></div>
          {official?.previous ? <div className="analystx-metric-list">
            {attention.slice(0,5).map((metric) => <button key={metric.key} type="button" onClick={() => runQuestion("Explain " + metric.short + " this week")}>
              <div><b>{metric.short}</b><span className={"analystx-tier " + String(metric.standing || "").toLowerCase().replaceAll(" ","-")}>{metric.standing || "Unrated"}</span></div>
              <p>{metricText(metric.before,metric.unit)} <span>→</span> {metricText(metric.current,metric.unit)}</p>
              <small>{metric.trend === "new" ? "Previous value unavailable" : "Worsened in the stored scorecard"}</small>
            </button>)}
            {!attention.length && <p className="analystx-muted">No prominent worsening KPI signals in the stored comparison.</p>}
          </div> : <p className="analystx-muted">Choose a station with two imported DSP scorecards to compare individual metrics.</p>}
          {official?.improving?.length > 0 && <p className="analystx-improved">↗ Improved: {official.improving.slice(0,2).map((metric) => metric.short).join(", ")}</p>}
        </section>
        <section className="analystx-side-panel"><div className="analystx-side-heading"><div><span>DECISION SUPPORT</span><h2>Priority checks</h2></div></div>
          <div className="analystx-side-actions">
            {(overview?.actions || []).slice(0,4).map((action,index) => <button key={index} type="button" onClick={() => onNavigate?.(action.destination)}><span>{index+1}</span><div><strong>{action.title}</strong><small>{action.detail}</small></div><em>↗</em></button>)}
            {!overview?.actions?.length && <p className="analystx-muted">No priority actions identified from the available records.</p>}
          </div>
        </section>
        <section className="analystx-source-note"><strong>How this Analyst works</strong><p>It reads your authorised MetrixIQ reports. Site scores and KPI movements come from imported official DSP Scorecards; driver comparisons are calculated separately. No report or driver data is changed.</p></section>
      </aside>
    </div>

    {visibleHistory.length > 0 && <section className="analystx-history"><h2>Recent questions</h2><div>{visibleHistory.slice(0,6).map((item) => <button type="button" key={item.id} onClick={() => {setQuestion(item.question);setAnswer(item.result);}}><strong>{item.question}</strong><small>{item.result.title}</small></button>)}</div></section>}
  </div>;
}
