"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { connected360ChatContext } from "../../lib/ai-lab/connected-360.mjs";
import { appendApprovedLearningContext, orderIssuesWithLearning } from "../../lib/ai-lab/learning-loop.mjs";
import AiLearningLoop from "./AiLearningLoop";
import styles from "./Ai360Panel.module.css";

async function getToken() {
  const { data: { session } } = await getSupabaseBrowserClient().auth.getSession();
  if (!session?.access_token) throw new Error("Your Super Admin session expired. Sign in again.");
  return session.access_token;
}
async function getReport(path, token, signal) {
  const response = await fetch(path, { cache: "no-store", signal, headers: { Authorization: "Bearer " + token } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Could not load private intelligence.");
  return data;
}

export default function Ai360Panel({ onContextChange = () => {}, onAskAI = () => {} }) {
  const [sites, setSites] = useState([]);
  const [selection, setSelection] = useState("");
  const [periods, setPeriods] = useState([]);
  const [period, setPeriod] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(true);
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [checkedAt, setCheckedAt] = useState("");
  const [details, setDetails] = useState(false);
  const [learning, setLearning] = useState(null);
  const [daily, setDaily] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    (async () => {
      setConnecting(true);
      try {
        const data = await getReport("/api/ai-lab/live-report?list=sites", await getToken(), controller.signal);
        if (!active) return;
        const allowed = Array.isArray(data.sites) ? data.sites : [];
        const preferred = allowed.find(row => row.site === "DZM1") || allowed[0];
        setSites(allowed);
        setSelection(preferred ? preferred.organizationId + "|" + preferred.site : "");
        if (!allowed.length) setError("No authorised active stations are available.");
      } catch (cause) { if (active && cause.name !== "AbortError") setError(cause.message || "Could not connect."); }
      finally { if (active) setConnecting(false); }
    })();
    return () => { active = false; controller.abort(); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setResult(null); setPeriods([]); setPeriod(""); setCheckedAt(""); setDaily(null); onContextChange("");
    if (!selection) return () => controller.abort();
    const [organization, site] = selection.split("|");
    (async () => {
      setLoading(true); setError("");
      try {
        const token = await getToken();
        const prefix = "/api/ai-lab/connected-360?";
        const data = await getReport(prefix + new URLSearchParams({ list: "weeks", organization, site }), token, controller.signal);
        const today = await getReport(prefix + new URLSearchParams({ list: "daily", organization, site }), token, controller.signal).catch(() => ({}));
        if (!active) return;
        setDaily(today.daily || null);
        const available = Array.isArray(data.periods) ? data.periods : [];
        setPeriods(available);
        setPeriod(available[0] ? available[0].year + "-W" + available[0].week : "");
        if (!available.length) setError("No official weekly DSP Scorecard is available yet for this station.");
      } catch (cause) { if (active && cause.name !== "AbortError") setError(cause.message || "Could not discover weeks."); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; controller.abort(); };
  }, [selection, refresh, onContextChange]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setResult(null); setCheckedAt(""); onContextChange("");
    const found = periods.find(row => row.year + "-W" + row.week === period);
    if (!selection || !found) return () => controller.abort();
    const [organization, site] = selection.split("|");
    (async () => {
      setLoading(true); setError("");
      try {
        const data = await getReport("/api/ai-lab/connected-360?" +
          new URLSearchParams({ organization, site, year: String(found.year), week: String(found.week) }),
        await getToken(), controller.signal);
        if (!active) return;
        setResult(data);
        setCheckedAt(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
      } catch (cause) { if (active && cause.name !== "AbortError") setError(cause.message || "Could not load Connected 360°."); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; controller.abort(); };
  }, [selection, period, periods, onContextChange]);

  useEffect(() => {
    if (!result) return;
    const base = connected360ChatContext(result.snapshot, result.doctor, result.briefing);
    onContextChange(learning?.site === result.snapshot.site ? appendApprovedLearningContext(base, learning) : base);
  }, [result, learning, onContextChange]);

  function askIQ(topic = "the most important findings") {
    if (!result) return;
    onAskAI(`IQ, investigate ${topic} for ${result.snapshot.site} W${result.snapshot.week} ${result.snapshot.year}. Use the selected official DSP Scorecard, weekly driver aggregates and Data Doctor notes. Distinguish evidence, possible explanations and missing proof. Give me three manual next steps; never invent an exemption, score or driver fault.`);
  }

  const snapshot = result?.snapshot, doctor = result?.doctor, morning = result?.briefing;
  const orderedIssues = doctor ? orderIssuesWithLearning(doctor.issues, learning?.site === snapshot?.site ? learning : null) : [];
  return <section className={styles.panel} aria-label="IQ Connected 360 degrees">
    <header className={styles.header}>
      <div><span className={styles.kicker}>IQ CONNECTED 360°</span>
        <h2>Daily Briefing <span aria-hidden="true">✦</span></h2>
        <p>Your most important station checks, backed by read-only reports.</p></div>
      <span className={styles.badge}>Verified sources</span>
    </header>
    <div className={styles.controls}>
      <label>Station<select value={selection} disabled={connecting || !sites.length} onChange={e => setSelection(e.target.value)}>
        {!sites.length && <option value="">{connecting ? "Connecting…" : "No stations"}</option>}
        {sites.map(row => <option key={row.organizationId + "|" + row.site} value={row.organizationId + "|" + row.site}>{row.site} · {row.label}</option>)}
      </select></label>
      <label>Official reporting week<select value={period} disabled={loading || !periods.length} onChange={e => setPeriod(e.target.value)}>
        {!periods.length && <option value="">No Scorecard available</option>}
        {periods.map(row => <option key={row.year + "-W" + row.week} value={row.year + "-W" + row.week}>W{row.week} · {row.year}</option>)}
      </select></label>
      <button type="button" className={styles.refresh} disabled={!selection || connecting || loading} onClick={() => setRefresh(value => value + 1)}>↻ Refresh</button>
    </div>
    {(connecting || loading) && <p className={styles.status} role="status">Checking authorised operational sources…</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {snapshot && <div className={styles.content}>
      {daily?.scorecard_year === snapshot.year && daily?.scorecard_week === snapshot.week &&
        <div className={styles.automated}>✦ Scheduled UK morning snapshot available · {daily.briefing_date} · {daily.priorities?.length || 0} priority checks cached. Live changes still need manual verification.</div>}
      <div className={styles.intro}><div><span className={styles.kicker}>MORNING OPERATIONS BRIEFING</span>
        <h3>{snapshot.site} · W{snapshot.week} {snapshot.year}</h3><p>{morning.sourceLabel} · Checked at {checkedAt}</p></div>
        <div className={styles.overall}><small>Official DSP Score</small><strong>{snapshot.official?.score ?? "Unavailable"}</strong>
          <span>{snapshot.official?.standing || "No tier"}</span></div></div>
      <div className={styles.metrics}>{[
        ["dcr", "DCR"], ["pod", "POD"], ["psb", "PSB"], ["lor", "Lost on Road"], ["cdf_dpmo", "CDF DPMO"],
      ].map(([key, label]) => <div className={styles.metric} key={key}>
        <span>{label}</span><strong>{snapshot.official?.metrics?.[key]?.value ?? "—"}</strong>
        <small>{snapshot.official?.metrics?.[key]?.standing || "Not graded here"}</small></div>)}</div>
      <div className={styles.briefing}><div className={styles.sectionHead}><h3>What needs attention</h3><span>{morning.priorities.length} checks</span></div>
        {morning.priorities.map(item => <article className={styles.priority} key={item.id}>
          <span className={item.severity === "high" ? styles.severityHigh : styles.severityReview}>{item.severity}</span>
          <div><strong>{item.title}</strong><p>{item.evidence}</p><small>Next: {item.next}</small></div>
          <button type="button" onClick={() => askIQ(item.title)}>Ask IQ ↗</button></article>)}
      </div>
      <details className={styles.collapsible}><summary>IQ Data Doctor <span>{doctor.issues.length} quality checks</span></summary>
      <div className={styles.doctor}><div className={styles.sectionHead}><h3>Data quality review</h3>
        <span>{doctor.counts.high} critical · {doctor.counts.review} review · {doctor.counts.info} info</span></div>
        <p>{doctor.statement}</p>
        {orderedIssues.slice(0, details ? 14 : 3).map(item => <article key={item.code} className={styles.qualityItem}>
          <strong>{item.severity.toUpperCase()} · {item.title}</strong><p>{item.evidence}</p>
          {details && <small>{item.action}</small>}</article>)}
        {doctor.issues.length > 3 && <button className={styles.more} type="button" onClick={() => setDetails(current => !current)}>{details ? "Show fewer" : "Show all " + doctor.issues.length + " checks"}</button>}
      </div>
      </details>
      <details className={styles.collapsible}><summary>Teach IQ <span>Feedback & private memory</span></summary>
      <AiLearningLoop site={snapshot.site} week={snapshot.week} year={snapshot.year} issues={doctor.issues} onChange={setLearning}/>
      </details>
      <div className={styles.bottom}><button type="button" className={styles.ask} onClick={() => askIQ()}>✦ Discuss this briefing with IQ</button>
        <small>You'll approve sharing this anonymous summary before IQ uses it in chat.</small></div>
      <details className={styles.collapsible}><summary>Report sources & limitations <span>View coverage</span></summary>
      <div className={styles.sourceBar}>
        <span><b>{snapshot.driverMetrics.rows}</b> weekly metric rows</span>
        <span><b>{snapshot.feedback.rows}</b> feedback source rows</span>
        <span><b>{snapshot.lorHistory.cases}</b> CHECK LOR all-time cases</span>
        <span><b>{snapshot.imports.overlappingPeriod}</b> matching-period imports</span>
      </div>
      <ul className={styles.limitations}>{snapshot.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
      </details>
    </div>}
  </section>;
}
