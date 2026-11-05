"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { buildConnectedBriefing } from "../../lib/ai-lab/connected-briefing.mjs";
import { buildIqActionCenter } from "../../lib/ai-lab/action-center.mjs";
import styles from "./AiConnectedBriefing.module.css";

async function bearer() {
  const { data: { session } } = await getSupabaseBrowserClient().auth.getSession();
  if (!session?.access_token) throw new Error("Your Super Admin session expired. Sign in again.");
  return session.access_token;
}

async function requestJson(path, token, signal) {
  const response = await fetch(path, {
    cache: "no-store", signal, headers: { Authorization: "Bearer " + token },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Authorised data is unavailable.");
  return body;
}

function formatMetric(metric) {
  if (metric.value === null) return "No data";
  return metric.value + (metric.unit === "%" ? "%" : metric.unit === "DPMO" ? " DPMO" : "");
}

function formatDelta(metric) {
  if (metric.delta === null) return "No comparison";
  return (metric.delta > 0 ? "+" : "") + metric.delta + (metric.unit === "%" ? " pp" : metric.unit === "DPMO" ? " DPMO" : "");
}

export default function AiConnectedBriefing({ onContextChange = () => {}, onAskAI = () => {} }) {
  const [sites, setSites] = useState([]);
  const [selection, setSelection] = useState("");
  const [periods, setPeriods] = useState([]);
  const [period, setPeriod] = useState("");
  const [partialDiscovery, setPartialDiscovery] = useState(false);
  const [briefing, setBriefing] = useState(null);
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(true);
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [loadedAt, setLoadedAt] = useState("");
  const [queueFilter, setQueueFilter] = useState("all");

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    (async () => {
      setConnecting(true);setError("");
      try {
        const data = await requestJson("/api/ai-lab/live-report?list=sites", await bearer(), controller.signal);
        if (!active) return;
        const allowed = Array.isArray(data.sites) ? data.sites : [];
        const preferred = allowed.find(item => item.site === "DZM1") || allowed[0];
        setSites(allowed);
        setSelection(current => allowed.some(item => item.organizationId + "|" + item.site === current)
          ? current : preferred ? preferred.organizationId + "|" + preferred.site : "");
        if (!allowed.length) setError("No authorised active stations are available.");
      } catch (cause) { if (active && cause.name !== "AbortError") setError(cause.message || "Could not connect to authorised stations."); }
      finally { if (active) setConnecting(false); }
    })();
    return () => { active = false;controller.abort(); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setPeriods([]);setPeriod("");setBriefing(null);setLoadedAt("");setPartialDiscovery(false);onContextChange("");
    if (!selection) return () => controller.abort();
    const [organization, site] = selection.split("|");
    (async () => {
      setLoading(true);setError("");
      try {
        const query = new URLSearchParams({ organization, site, list: "weeks" });
        const data = await requestJson("/api/ai-lab/brain?" + query, await bearer(), controller.signal);
        if (!active) return;
        const available = Array.isArray(data.periods) ? data.periods.filter(item => /^W(?:[1-9]|[1-4][0-9]|5[0-3])$/.test(item)) : [];
        setPeriods(available);
        setPartialDiscovery(data.partialDiscovery === true);
        setPeriod(available[0] || "");
        if (!available.length) setError("No weekly metric periods were found for this station. Import a report before requesting a briefing.");
      } catch (cause) { if (active && cause.name !== "AbortError") setError(cause.message || "Could not discover reporting weeks."); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false;controller.abort(); };
  }, [selection, refresh, onContextChange]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setBriefing(null);setLoadedAt("");onContextChange("");
    if (!selection || !period || !periods.includes(period)) return () => controller.abort();
    const [organization, site] = selection.split("|");
    const previousPeriod = periods[periods.indexOf(period) + 1] || "";
    (async () => {
      setLoading(true);setError("");
      try {
        const token = await bearer();
        const query = label => "/api/ai-lab/live-report?" + new URLSearchParams({ organization, site, period: label });
        const [current, previous] = await Promise.all([
          requestJson(query(period), token, controller.signal),
          previousPeriod ? requestJson(query(previousPeriod), token, controller.signal) : Promise.resolve(null),
        ]);
        if (!active) return;
        const result = buildConnectedBriefing(current.report, previous?.report || null, { partialDiscovery });
        const actionCenter = buildIqActionCenter(result);
        setBriefing({ ...result, actionCenter });
        setQueueFilter("all");
        setLoadedAt(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
        onContextChange(actionCenter.context);
      } catch (cause) { if (active && cause.name !== "AbortError") setError(cause.message || "Could not load the private briefing."); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false;controller.abort(); };
  }, [selection, period, periods, partialDiscovery, refresh, onContextChange]);

  function askIQ() {
    if (!briefing) return;
    onAskAI(`IQ, review the authorised ${briefing.site} ${briefing.period} Action Center${briefing.previousPeriod ? " compared with " + briefing.previousPeriod : ""}. Tell me the three highest evidence-backed priorities, what remains uncertain and what I should check next. Do not invent an official scorecard tier.`);
  }

  function askAbout(task) {
    if (!briefing || !task) return;
    onAskAI(`IQ, help me investigate the ${task.title.toLowerCase()} finding for ${briefing.site} ${briefing.period}. Explain what the aggregate evidence supports, what it cannot prove, and a practical step-by-step verification plan. Do not attribute blame or invent an official score.`);
  }

  return <section className={styles.panel} aria-label="IQ Connected Intelligence Daily Briefing">
    <div className={styles.header}>
      <div><span className={styles.kicker}>IQ CONNECTED INTELLIGENCE</span><h2>Daily Briefing <span aria-hidden="true">✦</span></h2>
        <p>Latest available weekly data · private, read-only · not a live dispatch feed</p></div>
      <span className={styles.badge}>SUPER ADMIN</span>
    </div>
    <div className={styles.controls}>
      <label>Station
        <select value={selection} disabled={connecting || loading && !sites.length || !sites.length} onChange={event => setSelection(event.target.value)}>
          {!sites.length && <option value="">{connecting ? "Connecting…" : "No stations"}</option>}
          {sites.map(item => <option key={item.organizationId + "|" + item.site} value={item.organizationId + "|" + item.site}>{item.site} · {item.label}</option>)}
        </select>
      </label>
      <label>Amazon week
        <select value={period} disabled={!periods.length || loading} onChange={event => setPeriod(event.target.value)}>
          {!periods.length && <option value="">No week available</option>}
          {periods.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      <button type="button" className={styles.refresh} disabled={connecting || loading || !selection} onClick={() => setRefresh(value => value + 1)}>↻ Refresh</button>
    </div>
    {(connecting || loading) && <p className={styles.status} role="status">Checking authorised weekly reports…</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {!briefing && !error && !loading && !connecting && <p className={styles.hint}>Choose a station with imported weekly metrics to generate a briefing.</p>}
    {briefing && <div className={styles.body}>
      <div className={styles.summary}><div><strong>{briefing.site} · {briefing.period}</strong>
        <span>{briefing.previousPeriod ? "Compared with " + briefing.previousPeriod : "No previous week available"} · Checked at {loadedAt}</span></div>
        <span className={styles.coverage}>{briefing.coverage.metricRecords} metric rows</span>
      </div>
      <p className={styles.metricNotice}>Unweighted record means — not official station scores</p>
      <div className={styles.metrics}>{briefing.metrics.filter(metric => metric.key !== "concessions").map(metric => <div className={styles.metric} key={metric.key}>
        <span>{metric.label}</span><strong>{formatMetric(metric)}</strong>
        <small className={metric.worsening ? styles.down : styles.neutral}>{formatDelta(metric)} · {metric.records} rows</small>
      </div>)}</div>
      <section className={styles.actionCenter} aria-label="IQ Action Center">
        <div className={styles.actionHeading}>
          <div><span className={styles.kicker}>PROACTIVE INTELLIGENCE</span><h3>IQ Action Center</h3>
            <p>Evidence-led checks, ordered by urgency · no actions are executed</p></div>
          <div className={styles.actionCounts} aria-label="Action counts">
            <span className={styles.highCount}>{briefing.actionCenter.counts.high} priority</span>
            <span>{briefing.actionCenter.counts.watch} watch</span>
            <span>{briefing.actionCenter.counts.verify} verify</span>
          </div>
        </div>
        <div className={styles.queueFilters} role="group" aria-label="Filter IQ actions">
          {[["all", "All checks"], ["priority", "Priority & trends"], ["data", "Data quality"]].map(([key, label]) =>
            <button type="button" key={key} aria-pressed={queueFilter === key}
              className={queueFilter === key ? styles.filterActive : styles.filterButton} onClick={() => setQueueFilter(key)}>{label}</button>)}
        </div>
        <div className={styles.actionList}>
          {briefing.actionCenter.tasks.filter(task => queueFilter === "all" ||
            (queueFilter === "priority" ? task.category === "performance" : task.category === "data")).map(task =>
            <article className={styles.actionItem} key={task.id}>
              <div className={styles.actionTop}>
                <span className={task.severity === "high" ? styles.severityHigh : task.severity === "watch" ? styles.severityWatch : styles.severityVerify}>
                  {task.severity === "high" ? "Priority" : task.severity === "watch" ? "Watch" : "Verify"}</span>
                <strong>{task.title}</strong>
              </div>
              <p>{task.evidence}</p><p className={styles.nextAction}><b>Next check:</b> {task.nextStep}</p>
              <div className={styles.actionFoot}><small>{task.basis} · {task.confidence}</small>
                <button type="button" onClick={() => askAbout(task)}>Ask IQ ↗</button></div>
            </article>)}
          {!briefing.actionCenter.tasks.some(task => queueFilter === "all" ||
            (queueFilter === "priority" ? task.category === "performance" : task.category === "data")) &&
            <p className={styles.emptyFilter}>No checks in this category for the selected reporting week. This does not confirm that the station has no issues.</p>}
        </div>
        <p className={styles.actionDisclaimer}>{briefing.actionCenter.notice}</p>
      </section>
      <div className={styles.bottom}><button type="button" className={styles.ask} onClick={askIQ}>✦ Discuss this briefing with IQ</button>
        <span>Review the context and explicitly enable sharing in chat before sending it to the AI model.</span></div>
      <details className={styles.caveats}><summary>Source coverage & limitations ({briefing.warnings.length})</summary>
        <ul>{briefing.warnings.map(item => <li key={item}>{item}</li>)}</ul>
      </details>
    </div>}
  </section>;
}
