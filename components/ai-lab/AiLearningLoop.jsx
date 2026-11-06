"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { LEARNING_REASONS, normalizeLearningEntries, saveLearningDecision, summarizeLearning } from "../../lib/ai-lab/learning-loop.mjs";
import styles from "./AiLearningLoop.module.css";

const storageKey = uid => "metrixiq-iq-learning-v1:" + uid;

export default function AiLearningLoop({ site, week, year, issues, onChange = () => {} }) {
  const [userId, setUserId] = useState("");
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("manual_review");
  const [editing, setEditing] = useState("");

  useEffect(() => {
    let active = true;
    getSupabaseBrowserClient().auth.getUser().then(({ data }) => {
      if (!active) return;
      const uid = data?.user?.id;
      if (!uid) { setError("Sign in to save personal feedback."); return; }
      setUserId(uid);
      try { setEntries(normalizeLearningEntries(JSON.parse(window.localStorage.getItem(storageKey(uid)) || "[]"))); }
      catch { setError("Local feedback cannot be read in this browser."); }
    }).catch(() => { if (active) setError("Could not verify the current user."); });
    return () => { active = false; };
  }, []);

  const summary = useMemo(() => summarizeLearning(entries, site, issues), [entries, site, issues]);
  useEffect(() => { onChange(summary); }, [summary, onChange]);

  function remember(code, decision) {
    if (!userId) return;
    try {
      const next = saveLearningDecision(entries, { site, week, year, code, decision, reason, time: Date.now() });
      window.localStorage.setItem(storageKey(userId), JSON.stringify(next));
      setEntries(next);
      setEditing(""); setError("");
    } catch { setError("Feedback could not be saved locally. No operational data was changed."); }
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
    {error && <p className={styles.error} role="alert">{error}</p>}
    <p className={styles.footnote}>Private to this signed-in user and browser. No database writes, automatic AI training or changes to site performance data. Feedback can be updated at any time.</p>
  </section>;
}
