"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { LEARNING_REASONS, normalizeLearningEntries, saveLearningDecision, summarizeLearning } from "../../lib/ai-lab/learning-loop.mjs";
import styles from "./AiLearningLoop.module.css";

const storageKey = uid => "metrixiq-iq-learning-v1:" + uid;
const cloudTable = "ai_lab_operator_feedback";

function fromCloud(rows) {
  return normalizeLearningEntries((rows || []).map(row => ({ ...row,
    time: new Date(row.updated_at).getTime(),
  })).sort((a, b) => a.time - b.time));
}

function toCloud(userId, entry) {
  return { user_id: userId, site: entry.site, code: entry.code, week: entry.week,
    year: entry.year, decision: entry.decision, reason: entry.reason,
    updated_at: new Date(entry.time).toISOString() };
}

export default function AiLearningLoop({ site, week, year, issues, onChange = () => {} }) {
  const [userId, setUserId] = useState("");
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("manual_review");
  const [editing, setEditing] = useState("");
  const [cloudState, setCloudState] = useState("Connecting…");
  const [localPending, setLocalPending] = useState([]);

  useEffect(() => {
    let active = true;
    getSupabaseBrowserClient().auth.getUser().then(async ({ data }) => {
      if (!active) return;
      const uid = data?.user?.id;
      if (!uid) { setError("Sign in to save personal feedback."); return; }
      setUserId(uid);
      let local = [];
      try { local = normalizeLearningEntries(JSON.parse(window.localStorage.getItem(storageKey(uid)) || "[]")); }
      catch { setError("Local feedback could not be read in this browser."); }
      try {
        const { data: rows, error: fetchError } = await getSupabaseBrowserClient().from(cloudTable)
          .select("site,code,year,week,decision,reason,updated_at")
          .eq("user_id", uid).order("updated_at", { ascending: false }).limit(80);
        if (fetchError) throw fetchError;
        if (!active) return;
        const remote = fromCloud(rows);
        const missing = local.filter(entry => !remote.some(saved =>
          saved.site === entry.site && saved.code === entry.code && saved.week === entry.week && saved.year === entry.year));
        setEntries(remote);
        setLocalPending(missing);
        setCloudState(missing.length ? "Cloud synced · previous browser reviews available to import" : "Cloud memory synced across devices");
      } catch {
        if (active) { setEntries(local); setCloudState("Cloud unavailable · local fallback only"); }
      }
    }).catch(() => { if (active) { setError("Could not verify the current user.");setCloudState("Private memory unavailable"); } });
    return () => { active = false; };
  }, []);

  const summary = useMemo(() => summarizeLearning(entries, site, issues), [entries, site, issues]);
  useEffect(() => { onChange(summary); }, [summary, onChange]);

  async function remember(code, decision) {
    if (!userId) return;
    let entry;
    try {
      const next = saveLearningDecision(entries, { site, week, year, code, decision, reason, time: Date.now() });
      window.localStorage.setItem(storageKey(userId), JSON.stringify(next));
      setEntries(next);
      setLocalPending(current => current.filter(item => !(item.site === site && item.week === week && item.year === year && item.code === code)));
      setEditing(""); setError("");
      entry = next.at(-1);
    } catch { setError("Could not save feedback in this browser. No operational data was changed.");return; }
    try {
      const { error: saveError } = await getSupabaseBrowserClient().from(cloudTable)
        .upsert(toCloud(userId, entry), { onConflict: "user_id,site,year,week,code" });
      if (saveError) { setCloudState("Cloud unavailable · feedback saved locally only");return; }
      setCloudState("Cloud memory synced across devices");
    } catch { setCloudState("Cloud unavailable · feedback saved locally only"); }
  }

  async function importLocalFeedback() {
    if (!userId || !localPending.length) return;
    try {
      const { error: saveError } = await getSupabaseBrowserClient().from(cloudTable)
        .upsert(localPending.map(row => toCloud(userId, row)), { onConflict: "user_id,site,year,week,code" });
      if (saveError) throw saveError;
      const merged = normalizeLearningEntries([...entries, ...localPending]);
      setEntries(merged); setLocalPending([]); setCloudState("Cloud memory synced across devices");setError("");
    } catch { setError("Could not import previous reviews. They remain available in this browser."); }
  }

  return <section className={styles.loop} aria-label="IQ Learning Loop">
    <header><div><span className={styles.eyebrow}>IQ LEARNING LOOP</span><h3>Teach IQ what matters to you</h3>
      <p>Review alerts to personalise future ordering. The evidence and severity never change.</p></div>
      <span className={styles.counter}>{summary.total} saved reviews</span></header>
    <div className={styles.list}>
      {issues.slice(0, 8).map(issue => {
        const latest = [...entries].reverse().find(row => row.site === site && row.week === week && row.year === year && row.code === issue.code);
        return <div className={styles.item} key={issue.code}>
          <span className={styles.title}>{issue.title}</span>
          {latest && <span className={styles.saved}>✓ {latest.decision === "useful" ? "Helpful" : "Needs review"}</span>}
          <button type="button" onClick={() => { setEditing(editing === issue.code ? "" : issue.code); setReason("manual_review"); }}>
            {editing === issue.code ? "Cancel" : latest ? "Update" : "Review"}</button>
          {editing === issue.code && <div className={styles.feedback}>
            <label>Why?<select value={reason} onChange={event => setReason(event.target.value)}>
              {LEARNING_REASONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <button type="button" className={styles.helpful} onClick={() => remember(issue.code, "useful")}>✓ Helpful</button>
            <button type="button" onClick={() => remember(issue.code, "needs_review")}>Needs correction</button>
          </div>}
        </div>;
      })}
    </div>
    {localPending.length > 0 && <button className={styles.import} type="button" onClick={importLocalFeedback}>
      Import {localPending.length} previous browser reviews into private cloud memory</button>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    <p className={styles.footnote}>{cloudState}. Your explicit feedback is stored in your private AI Lab memory; operational reports are never modified. No automatic model training.</p>
  </section>;
}
