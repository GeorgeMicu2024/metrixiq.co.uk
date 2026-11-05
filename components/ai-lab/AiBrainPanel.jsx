"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { normalizeBrainPeriods, sanitizeLearningNote } from "../../lib/ai-lab/brain-insights.mjs";
import AiPredictivePanel from "./AiPredictivePanel";
import styles from "./AiBrainPanel.module.css";

const MEMORY_TABLE = "ai_lab_learning_notes";

async function accessToken() {
  const { data: { session } } = await getSupabaseBrowserClient().auth.getSession();
  if (!session?.access_token) throw new Error("Super Admin session expired. Please sign in again.");
  return session.access_token;
}

async function getJson(path, bearer) {
  const response = await fetch(path, { headers: { Authorization: "Bearer " + bearer }, cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Authorised report unavailable.");
  return data;
}

export default function AiBrainPanel({ onContextChange = () => {}, onAskAI = () => {}, onAnalysisChange = () => {}, onLessonsChange = () => {}, onScopeChange = () => {} }) {
  const [sites, setSites] = useState([]);
  const [selection, setSelection] = useState("");
  const [periodText, setPeriodText] = useState("");
  const [available, setAvailable] = useState([]);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [autoScan, setAutoScan] = useState(false);
  const [lastScan, setLastScan] = useState("");
  const [userId, setUserId] = useState("");
  const [lessons, setLessons] = useState([]);
  const [lesson, setLesson] = useState("");
  const [learningStatus, setLearningStatus] = useState("Connecting private learning memory…");
  const [includeLessons, setIncludeLessons] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const client = getSupabaseBrowserClient();
        const { data: { user }, error: authError } = await client.auth.getUser();
        if (authError || !user || !active) return;
        const { data, error: readError } = await client.from(MEMORY_TABLE).select("id,site,lesson,created_at")
          .eq("user_id", user.id).order("created_at", { ascending: false }).limit(30);
        if (!active) return;
        setUserId(user.id);
        setLessons(data || []); onLessonsChange(data || []);
        setLearningStatus(readError ? "Memory not configured yet · read-only analysis works" : "Private approved learning · synced across devices");
      } catch { if (active) setLearningStatus("Learning memory unavailable · analysis still works"); }
    })();
    return () => { active = false; };
  }, []);

  function invalidate() { setResult(null); setError(""); onContextChange(""); onAnalysisChange(null); }

  async function loadWeeks(stationKey, bearer) {
    const [organization, site] = stationKey.split("|");
    const query = new URLSearchParams({ organization, site, list: "weeks" });
    const data = await getJson("/api/ai-lab/brain?" + query, bearer);
    const periods = Array.isArray(data.periods) ? data.periods : [];
    setAvailable(periods);
    setPeriodText(periods.slice(0, 8).reverse().join(", "));
  }

  async function connect() {
    if (busy) return;
    setBusy(true); invalidate();
    try {
      const bearer = await accessToken();
      const data = await getJson("/api/ai-lab/live-report?list=sites", bearer);
      const allowed = Array.isArray(data.sites) ? data.sites : [];
      setSites(allowed);
      if (!allowed.length) throw new Error("No authorised stations available.");
      const key = allowed[0].organizationId + "|" + allowed[0].site;
      setSelection(key); onScopeChange({ organizationId: allowed[0].organizationId, site: allowed[0].site });
      await loadWeeks(key, bearer);
    } catch (cause) { setError(cause.message || "Connection failed."); }
    finally { setBusy(false); }
  }

  async function changeStation(key) {
    setSelection(key); const [organizationId, site] = key.split("|"); onScopeChange({ organizationId, site }); setPeriodText(""); setAvailable([]); invalidate();
    setBusy(true);
    try { await loadWeeks(key, await accessToken()); }
    catch (cause) { setError(cause.message || "Could not discover periods."); }
    finally { setBusy(false); }
  }

  async function analyse(quiet = false) {
    if (!selection || busy) return;
    let periods;
    try { periods = normalizeBrainPeriods(periodText.split(",")); }
    catch (cause) { setError(cause.message); return; }
    setBusy(true); if (!quiet) invalidate();
    try {
      const [organization, site] = selection.split("|");
      const query = new URLSearchParams({ organization, site, periods: periods.join(",") });
      const data = await getJson("/api/ai-lab/brain?" + query, await accessToken());
      setResult(data.analysis); onAnalysisChange(data.analysis); setError("");
      setLastScan(new Date().toLocaleString());
      // User must actively opt in to AI chat context; these are local, anonymous analysis outputs.
      onContextChange("");
    } catch (cause) { setError(cause.message || "AI Brain analysis failed."); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    if (!autoScan || !selection || !result) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && !busy) analyse(true);
    }, 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [autoScan, selection, periodText, result, busy]);

  async function saveLesson() {
    if (!userId || saving) return;
    let approved;
    try { approved = sanitizeLearningNote(lesson); }
    catch (cause) { setLearningStatus(cause.message); return; }
    setSaving(true);
    try {
      const site = selection.split("|")[1] || null;
      const { data, error: insertError } = await getSupabaseBrowserClient().from(MEMORY_TABLE)
        .insert({ user_id: userId, site, lesson: approved }).select("id,site,lesson,created_at").single();
      if (insertError) throw insertError;
      const next = [data, ...lessons].slice(0, 30); setLessons(next); onLessonsChange(next); setLesson("");
      try {
        const { data: indexed, error: indexError } = await getSupabaseBrowserClient().functions.invoke("ai-lab-semantic-memory", {
          body: { action: "index", lessonId: data.id },
        });
        setLearningStatus(!indexError && indexed?.indexed
          ? "Approved lesson saved across devices and indexed for meaning search."
          : "Lesson saved privately across devices. Semantic indexing is temporarily unavailable.");
      } catch {
        setLearningStatus("Lesson saved privately across devices. Semantic indexing is temporarily unavailable.");
      }
    } catch { setLearningStatus("Could not save approved lesson. Check private memory permissions."); }
    finally { setSaving(false); }
  }

  async function rebuildSemanticIndex() {
    if (!userId || saving || !lessons.length) return;
    setSaving(true);
    setLearningStatus("Indexing approved notes only · existing reports remain untouched…");
    let indexed = 0;
    try {
      const client = getSupabaseBrowserClient();
      for (const item of lessons.slice(0, 30)) {
        const { data, error } = await client.functions.invoke("ai-lab-semantic-memory", {
          body: { action: "index", lessonId: item.id },
        });
        if (!error && data?.indexed) indexed++;
      }
      setLearningStatus(`Semantic memory indexed ${indexed}/${Math.min(lessons.length, 30)} approved notes. Keyword fallback remains active.`);
    } catch {
      setLearningStatus(`Indexed ${indexed} notes before the service became unavailable. Your approved notes are safe.`);
    } finally { setSaving(false); }
  }

  async function removeLesson(id) {
    if (!userId || saving) return;
    setSaving(true);
    try {
      const { error: deleteError } = await getSupabaseBrowserClient().from(MEMORY_TABLE).delete().eq("user_id", userId).eq("id", id);
      if (deleteError) throw deleteError;
      const next = lessons.filter(item => item.id !== id); setLessons(next); onLessonsChange(next); setLearningStatus("Approved lesson removed.");
    } catch { setLearningStatus("Could not remove lesson."); }
    finally { setSaving(false); }
  }

  function askAI() {
    if (!result) return;
    let extra = "";
    if (includeLessons) {
      const matching = lessons.filter(item => !item.site || item.site === result.site).slice(0, 6);
      extra = JSON.stringify({ approvedGeneralLessons: matching.map(item => sanitizeLearningNote(item.lesson)) });
    }
    const context = result.context + (extra ? "\n" + extra : "");
    onContextChange(context.slice(0, 5800));
    onAskAI(`Analyse the historical data for ${result.site} (${result.periods.join(", ")}). Identify evidence-backed risks, gaps and three practical improvements. Reply in English without inventing results or assigning blame to drivers.`);
  }

  function askPrediction(context, question) {
    onContextChange(context);
    onAskAI(question);
  }

  return <section className={styles.panel} aria-label="MetrixIQ AI Brain">
    <div className={styles.header}><div><span className={styles.kicker}>METRIXIQ · PRIVATE INTELLIGENCE</span><h2>AI Brain <span>✦</span></h2>
      <p>Historical Intelligence · Driver Signals · Predictive Alerts · Approved Learning</p></div>
      <span className={styles.badge}>SUPER ADMIN · READ ONLY</span></div>
    <div className={styles.setup}>
      <button className={styles.primary} onClick={connect} disabled={busy} type="button">{sites.length ? "↻ Refresh access" : "Connect historical data"}</button>
      {!!sites.length && <><label>Station<select value={selection} disabled={busy} onChange={event => changeStation(event.target.value)}>
        {sites.map(item => <option key={item.organizationId + "|" + item.site} value={item.organizationId + "|" + item.site}>{item.site} · {item.label}</option>)}
      </select></label><label className={styles.weeks}>Amazon week labels (oldest → newest)
        <input value={periodText} disabled={busy} maxLength={150} placeholder="W37, W38, W39, W40, W41, W42, W43, W44" onChange={event => { setPeriodText(event.target.value.toUpperCase().replace(/[^A-Z0-9,: -]/g, "")); invalidate(); }}/>
      </label><button type="button" className={styles.primary} disabled={busy || !periodText.trim()} onClick={() => analyse()}>{busy ? "Reading…" : "✦ Analyse history"}</button></>}
    </div>
    {!!available.length && <p className={styles.hint}>Discovered weekly periods: {available.slice(0, 12).join(", ")}. Edit the list to compare up to 12 periods; use consistent weekly imports.</p>}
    {busy && <p role="status" className={styles.hint}>Checking RLS-scoped records and computing driver signals…</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {!result && <p className={styles.hint}>AI Brain reads existing reports without editing them. Driver names appear only here; the AI model receives aggregate evidence after you explicitly allow it.</p>}
    {result && <div className={styles.content}>
      <div className={styles.statusRow}><strong>{result.site} · {result.periods.length} periods</strong><span>Last scanned: {lastScan}</span><label className={styles.checkbox}><input type="checkbox" checked={autoScan} onChange={event => setAutoScan(event.target.checked)}/> Re-scan every 5 min while open</label></div>
      <AiPredictivePanel analysis={result} onAskAI={askPrediction}/>
      <div className={styles.miniGrid}>{result.series.map(item => <div className={styles.week} key={item.period}>
        <strong>{item.period}</strong><span>{item.coverage.metricRecords} metric rows</span>
        <small>DCR {item.metrics.dcr.mean ?? "–"}% · IADC {item.metrics.iadc.mean ?? "–"}%</small>
        <small>POD {item.metrics.pod.mean ?? "–"}% · CDF {item.metrics.cdf_dpmo.mean ?? "–"}</small>
        <small>{item.feedbackRecords} feedback rows · {item.dnrSnapshotSum} DNR snapshot sum</small>
      </div>)}</div>
      <div className={styles.columns}><div><h3>Early-warning alerts <span>{result.alerts.length}</span></h3>
        {!result.alerts.length && <p className={styles.hint}>No trend alert found in available comparable records. This does not prove absence of problems.</p>}
        {result.alerts.map(alert => <article className={styles.alert} key={alert.id}>
          <span className={alert.severity === "high" ? styles.severe : styles.review}>{alert.severity}</span><strong>{alert.title}</strong><p>{alert.evidence}</p><small>{alert.action}</small>
        </article>)}
      </div><div><h3>Driver Intelligence <span>{result.driverSignalsTotal}</span></h3>
        <p className={styles.hint}>RLS-authorised names, displayed privately. Signals need source verification; they are not automatic judgments.</p>
        {!result.driverSignals.length && <p className={styles.hint}>No comparable two-period driver signals found.</p>}
        <div className={styles.driverList}>{result.driverSignals.map(driver => <article className={styles.driver} key={driver.driverId}>
          <strong>{driver.driverName}</strong><span>{driver.from} → {driver.to} · {driver.sourceRows} source rows</span>
          <ul>{driver.signals.map(signal => <li key={signal}>{signal}</li>)}</ul>
        </article>)}</div>
        {result.driverSignalsTotal > result.driverSignals.length && <small>Showing first {result.driverSignals.length}; aggregate context includes all detected signals.</small>}
      </div></div>
      <div className={styles.advice}><strong>Evidence limits</strong><p>{result.description} Source rows can overlap across imports, record means are unweighted, and missing periods reduce confidence.{result.truncated ? " The read-only source limit was reached: results may be incomplete." : ""}</p>
        <label className={styles.checkbox}><input type="checkbox" checked={includeLessons} onChange={event => setIncludeLessons(event.target.checked)}/> Include my approved general lessons in AI context</label>
        <button type="button" className={styles.primary} onClick={askAI}>✦ Explain patterns in AI chat</button>
        <small>Chat still requires your separate opt-in to send the selected report summary to NVIDIA.</small>
      </div>
    </div>}
    <div className={styles.memory}><div><h3>Learning Memory · approved corrections</h3><p>Teach the assistant general rules and format corrections. Saved only for your Super Admin account; no automatic model fine-tuning.</p></div>
      <p className={styles.hint}>{learningStatus}</p><div className={styles.memoryForm}><textarea rows={2} maxLength={350} value={lesson} onChange={event => setLesson(event.target.value)} placeholder="Example: At DZM1, staging codes are not wave numbers; validate against the Wave Plan before matching."/>
        <button type="button" disabled={!userId || saving || lesson.trim().length < 10} className={styles.primary} onClick={saveLesson}>✓ Approve & remember</button></div>
      <small>No driver names, TRIDs, UK tracking numbers, phone numbers or customer details in learning notes.</small>
      {!!lessons.length && <button type="button" disabled={saving} className={styles.primary} onClick={rebuildSemanticIndex}>↻ Rebuild semantic index for approved notes</button>}
      {!!lessons.length && <ul className={styles.lessons}>{lessons.slice(0, 12).map(item => <li key={item.id}><span><b>{item.site || "General"}</b> · {item.lesson}</span><button type="button" disabled={saving} onClick={() => removeLesson(item.id)}>Remove</button></li>)}</ul>}
    </div>
  </section>;
}
