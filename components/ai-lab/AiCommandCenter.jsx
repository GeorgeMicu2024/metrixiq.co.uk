"use client";

import { useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { buildCommandInsights } from "../../lib/ai-lab/command-insights.mjs";
import styles from "./AiCommandCenter.module.css";

const PERIOD = /^W(?:[1-9]|[1-4][0-9]|5[0-3])(?::20\d{2}-\d{2}-\d{2})?$/;
const TABS = [
  ["briefing", "Daily Briefing"],
  ["detective", "Performance Detective"],
  ["trends", "Trend Analysis"],
  ["copilot", "Operations Copilot"],
];

function displayMetric(metric) {
  if (metric?.mean === null || metric?.mean === undefined) return "No data";
  return String(metric.mean) + (metric.unit === "percent" ? "%" : metric.unit === "DPMO" ? " DPMO" : "");
}

function deltaLabel(row) {
  if (row.delta === null) return "Not comparable";
  return (row.delta > 0 ? "+" : "") + row.delta + (row.unit === "percent" ? " pp" : row.unit === "DPMO" ? " DPMO" : "");
}

export default function AiCommandCenter({ onContextChange = () => {}, onAskAI = () => {} }) {
  const [sites, setSites] = useState([]);
  const [selectedSite, setSelectedSite] = useState("");
  const [currentPeriod, setCurrentPeriod] = useState("");
  const [previousPeriod, setPreviousPeriod] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [tab, setTab] = useState("briefing");

  function invalidate() {
    setResult(null);
    setError("");
    onContextChange("");
  }

  async function token() {
    const { data: { session } } = await getSupabaseBrowserClient().auth.getSession();
    if (!session?.access_token) throw new Error("Your Super Admin session has expired. Sign in again.");
    return session.access_token;
  }

  async function connect() {
    if (busy) return;
    setBusy(true);
    setError("");
    invalidate();
    try {
      const response = await fetch("/api/ai-lab/live-report?list=sites", {
        headers: { Authorization: "Bearer " + await token() }, cache: "no-store",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not load authorised sites.");
      const allowed = Array.isArray(body.sites) ? body.sites : [];
      setSites(allowed);
      setSelectedSite(allowed.length ? allowed[0].organizationId + "|" + allowed[0].site : "");
      if (!allowed.length) setError("No authorised station profiles are available.");
    } catch (cause) {
      setError(cause.message || "Could not connect to authorised reports.");
    } finally {
      setBusy(false);
    }
  }

  async function analyse() {
    if (busy || !selectedSite) return;
    const [organization, site] = selectedSite.split("|");
    const current = currentPeriod.trim().toUpperCase();
    const previous = previousPeriod.trim().toUpperCase();
    if (!PERIOD.test(current) || (previous && (!PERIOD.test(previous) || previous === current))) {
      setError("Use valid, different Amazon week labels: W44 or W44:2026-10-30.");
      return;
    }
    setBusy(true);
    invalidate();
    try {
      const bearer = await token();
      async function fetchReport(period) {
        const query = new URLSearchParams({ organization, site, period });
        const response = await fetch("/api/ai-lab/live-report?" + query.toString(), {
          headers: { Authorization: "Bearer " + bearer }, cache: "no-store",
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body.report) throw new Error(body.error || "The authorised summary is unavailable.");
        return body.report;
      }
      const [currentReport, previousReport] = await Promise.all([
        fetchReport(current), previous ? fetchReport(previous) : Promise.resolve(null),
      ]);
      const insights = buildCommandInsights(currentReport, previousReport);
      setResult(insights);
      setTab("briefing");
      onContextChange(insights.context);
    } catch (cause) {
      setError(cause.message || "Could not analyse the selected reports.");
    } finally {
      setBusy(false);
    }
  }

  function ask(prompt) {
    if (!result) return;
    onAskAI(prompt);
  }

  const briefing = result?.briefing;
  const detective = result?.detective;
  const trend = result?.trend;

  return <section className={styles.panel} aria-label="AI Command Center">
    <div className={styles.header}>
      <div>
        <span className={styles.eyebrow}>METRIXIQ · READ-ONLY INTELLIGENCE</span>
        <h2>AI Command Center <span aria-hidden="true">✦</span></h2>
        <p>Briefings, cross-metric hypotheses, trends and an operations copilot based on authorised station summaries.</p>
      </div>
      <span className={styles.badge}>SUPER ADMIN · ISOLATED</span>
    </div>
    <div className={styles.setup}>
      <button className={styles.button} type="button" disabled={busy} onClick={connect}>
        {sites.length ? "↻ Refresh authorised sites" : "Connect authorised sites"}
      </button>
      {sites.length > 0 && <>
        <label className={styles.field}>Station
          <select value={selectedSite} disabled={busy} onChange={event => { setSelectedSite(event.target.value); invalidate(); }}>
            {sites.map(site => <option key={site.organizationId + "|" + site.site} value={site.organizationId + "|" + site.site}>{site.site} · {site.label}</option>)}
          </select>
        </label>
        <label className={styles.field}>Selected Amazon week
          <input value={currentPeriod} maxLength={20} disabled={busy} placeholder="W44" onChange={event => { setCurrentPeriod(event.target.value.toUpperCase().replace(/[^A-Z0-9:-]/g, "")); invalidate(); }}/>
        </label>
        <label className={styles.field}>Compare with (optional)
          <input value={previousPeriod} maxLength={20} disabled={busy} placeholder="W43" onChange={event => { setPreviousPeriod(event.target.value.toUpperCase().replace(/[^A-Z0-9:-]/g, "")); invalidate(); }}/>
        </label>
        <button className={styles.button} type="button" disabled={busy || !currentPeriod} onClick={analyse}>{busy ? "Analysing…" : "✦ Analyse reports"}</button>
      </>}
    </div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {busy && <p className={styles.status} role="status">Reading private, RLS-scoped summaries. No raw driver/customer records are requested…</p>}
    {!result && <p className={styles.hint}>Choose one week for the briefing and investigation. Choose two different weeks for trend comparison. The source may be incomplete; no data is modified or sent to the AI model during loading.</p>}
    {result && <>
      <div className={styles.tabRow} role="group" aria-label="AI analysis views">
        {TABS.map(([id, label]) => <button key={id} type="button" onClick={() => setTab(id)} aria-pressed={tab === id} className={tab === id ? styles.tabActive : styles.tab}>{label}</button>)}
      </div>
      <div className={styles.content}>
        {tab === "briefing" && <>
          <div className={styles.contentHead}>
            <h3>Daily Briefing · {briefing.site} {briefing.period}</h3>
            <p>{briefing.caveat}</p>
          </div>
          <div className={styles.metricGrid}>
            {briefing.metrics.map(item => <div key={item.label} className={styles.metric}>
              <span>{item.label}</span><strong>{displayMetric(item)}</strong><small>{item.records} numeric source rows · unweighted mean</small>
            </div>)}
          </div>
          <div className={styles.twoCols}>
            <div><h4>Priority checks</h4>{briefing.alerts.map(item => <div className={styles.finding} key={item.code}>
              <span className={item.severity === "high" ? styles.high : ""}>{item.severity}</span>
              <div><strong>{item.title}</strong><p>{item.explanation}</p></div>
            </div>)}</div>
            <div><h4>Recommended next checks</h4><ol className={styles.actions}>{briefing.nextActions.map(item => <li key={item}>{item}</li>)}</ol></div>
          </div>
          <button type="button" className={styles.button} onClick={() => ask(`Pregătește un briefing operațional pentru ${briefing.site} ${briefing.period}, cu 3 priorități, datele care lipsesc și pași practici. Nu prezenta mediile descriptive ca scoruri oficiale.`)}>✦ Explain briefing with AI</button>
        </>}
        {tab === "detective" && <>
          <div className={styles.contentHead}><h3>Performance Detective</h3><p>{detective.caveat}</p></div>
          {detective.signals.map(signal => <div className={styles.signal} key={signal.code}>
            <strong>{signal.title}</strong><p>{signal.evidence}</p><p><b>What to check:</b> {signal.investigate}</p><small>{signal.caveat}</small>
          </div>)}
          <button type="button" className={styles.button} onClick={() => ask(`Analizează ipotezele Performance Detective pentru ${detective.site} ${detective.period}. Ce dovezi suplimentare sunt necesare? Separă corelația de cauzalitate și prioritizează verificările.`)}>✦ Investigate with AI</button>
        </>}
        {tab === "trends" && <>
          <div className={styles.contentHead}><h3>Trend Analysis</h3><p>Comparison uses unweighted record means, not official station score changes.</p></div>
          {!trend ? <p className={styles.hint}>Enter a different comparison week above, then reload the summaries.</p> : <>
            <div className={styles.tableWrap}><table><thead><tr><th>Metric</th><th>{trend.previousPeriod}</th><th>{trend.currentPeriod}</th><th>Difference</th><th>Records (before / now)</th></tr></thead>
              <tbody>{trend.changes.map(item => <tr key={item.label}>
                <td>{item.label}</td><td>{item.previous ?? "—"}</td><td>{item.current ?? "—"}</td><td>{deltaLabel(item)}</td><td>{item.previousRecords} / {item.currentRecords}</td>
              </tr>)}</tbody></table></div>
            <div className={styles.warningBox}>{trend.warnings.map(item => <p key={item}>⚠ {item}</p>)}</div>
            <button type="button" className={styles.button} onClick={() => ask(`Compară ${trend.site} ${trend.previousPeriod} cu ${trend.currentPeriod}. Explică schimbările DCR, POD, IADC, CDF și concesii, diferențele de acoperire și 3 acțiuni prioritare; nu inventa scoruri oficiale.`)}>✦ Explain trends with AI</button>
          </>}
        </>}
        {tab === "copilot" && <>
          <div className={styles.contentHead}><h3>Operations Copilot</h3><p>Choose a task to prepare a contextual Romanian question in the existing private AI chat.</p></div>
          <div className={styles.copilotGrid}>
            <button type="button" onClick={() => ask(`Sunt responsabil de ${briefing.site}. Pentru ${briefing.period}, care sunt cele mai importante trei probleme confirmate, ce nu putem determina și care este planul de acțiune de astăzi?`)}>✦ Top 3 priorities</button>
            <button type="button" onClick={() => ask(`Analizează DCR, POD, IADC, CDF și concesiile la ${briefing.site} ${briefing.period}. Ce relații posibile există și ce dovezi ar trebui verificate?`)}>✦ Connect the metrics</button>
            <button type="button" onClick={() => ask(`Scrie un mesaj scurt în engleză pentru șoferi, cu un singur sfat de îmbunătățire bazat exclusiv pe problemele confirmate în ${briefing.site} ${briefing.period}.`)}>✦ Driver coaching message</button>
            <button type="button" onClick={() => ask(`Creează un plan de verificare pentru dispecerat la ${briefing.site} ${briefing.period}, cu pași, dovezi necesare și priorități. Nu modifica date sau rute.`)}>✦ Dispatch checklist</button>
          </div>
        </>}
      </div>
      <div className={styles.footer}>Source: existing Super Admin read-only reporting API. Snapshot coverage: {briefing.coverage.metricRecords} metric rows, {briefing.coverage.feedbackEvents} feedback events, {briefing.coverage.concessionSnapshotRecords} concession rows{briefing.coverage.truncated ? " · TRUNCATED" : ""}. Chat actions only prepare prompts; you must explicitly opt in before sending a summary to the model.</div>
    </>}
  </section>;
}
