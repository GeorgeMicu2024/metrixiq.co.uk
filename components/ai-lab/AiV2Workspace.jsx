"use client";

import { useEffect, useMemo, useState } from "react";
import { buildCopilotDraft, buildProactiveDigest, exportFormatSpec, investigateBrain, proposeFormatSandbox, searchApprovedLessons } from "../../lib/ai-lab/ai-v2.mjs";
import styles from "./AiV2Workspace.module.css";

const ACTIONS = [
  ["investigator", "🔎 Investigator", "Ask about verified performance"],
  ["knowledge", "🧠 Knowledge Search", "Find approved lessons"],
  ["reader", "📁 Format Reader", "Review both uploaded plans"],
  ["alerts", "🚨 Alert Digest", "Review emerging risks"],
  ["copilot", "💬 Operations Copilot", "Draft practical messages"],
  ["sandbox", "🧪 Format Sandbox", "Test an isolated adapter"],
];

function copy(value) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
  throw new Error("Clipboard unavailable; select the text manually.");
}

function download(name, content) {
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");link.href = url;link.download = name;document.body.appendChild(link);link.click();link.remove();
  } finally { window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
}

export default function AiV2Workspace({ analysis = null, lessons = [], documents = {}, onContextChange = () => {}, onAskAI = () => {} }) {
  const [task, setTask] = useState("investigator");
  const [question, setQuestion] = useState("");
  const [investigation, setInvestigation] = useState(null);
  const [knowledgeQuery, setKnowledgeQuery] = useState("");
  const [draftMode, setDraftMode] = useState("tips");
  const [language, setLanguage] = useState("en");
  const [message, setMessage] = useState("");
  useEffect(() => { setInvestigation(null);setMessage(""); }, [analysis]);
  const digest = useMemo(() => buildProactiveDigest(analysis), [analysis]);
  const knowledge = useMemo(() => searchApprovedLessons(lessons, knowledgeQuery, analysis?.site || ""), [lessons, knowledgeQuery, analysis?.site]);
  const sandbox = useMemo(() => proposeFormatSandbox(documents), [documents]);
  const draft = useMemo(() => {
    try { return buildCopilotDraft(analysis, draftMode, language); }
    catch { return "Load an AI Brain analysis first to prepare an evidence-aware draft."; }
  }, [analysis, draftMode, language]);

  function runQuestion() {
    setMessage("");setInvestigation(null);onContextChange("");
    try { setInvestigation(investigateBrain(analysis, question)); }
    catch (error) { setMessage(error.message || "Could not investigate the selected reports."); }
  }

  function askWithEvidence() {
    if (!investigation?.context) return;
    onContextChange(investigation.context);
    onAskAI(`Explică analiza de date pentru ${analysis?.site || "stația selectată"}. Arată dovezile și limitările, apoi pașii practici. Nu inventa cauze și nu atribui vină șoferilor.`);
  }

  async function copyText(value) {
    try { await copy(value);setMessage("Copied. Review before sending anything externally."); }
    catch (error) { setMessage(error.message || "Could not copy text."); }
  }

  return <section className={styles.panel} aria-label="AI Lab advanced intelligence workspace">
    <header className={styles.header}><div><span className={styles.kicker}>METRIXIQ · ISOLATED TOOLS</span><h2>AI Intelligence Workspace <span>✦</span></h2>
      <p>Six controlled extensions. Existing station modules are untouched; every report check is read-only.</p></div><span className={styles.badge}>SUPER ADMIN</span></header>
    <div className={styles.actions}>{ACTIONS.map(([id, title, subtitle]) => <button key={id} type="button" className={task === id ? styles.active : styles.action} onClick={() => {setTask(id);setMessage("");}} aria-pressed={task === id}>
      <strong>{title}</strong><small>{subtitle}</small></button>)}</div>
    <div className={styles.content}>
      {task === "investigator" && <><h3>AI Investigator · verified sources</h3>
        <p className={styles.hint}>Start with an AI Brain analysis above. The investigator handles Romanian and English metric questions using only the data already authorised and loaded.</p>
        <form className={styles.row} onSubmit={event => {event.preventDefault();runQuestion();}}><input value={question} maxLength={500} onChange={event => setQuestion(event.target.value)} placeholder="De ce a scăzut DCR la DZM1?" aria-label="Investigation question"/><button type="submit" className={styles.button} disabled={!analysis || question.trim().length < 5}>Investigate ↗</button></form>
        {investigation && <div className={styles.result}><h4>{investigation.title}</h4><p>{investigation.answer}</p>
          {!!investigation.evidence.length && <div className={styles.tableWrap}><table><thead><tr><th>Source</th><th>Period</th><th>Metric</th><th>Mean</th><th>Numeric records</th></tr></thead><tbody>{investigation.evidence.map((row, index) => <tr key={index}><td>{row.source}</td><td>{row.period}</td><td>{row.metric}</td><td>{row.mean}{row.unit}</td><td>{row.numericRows}</td></tr>)}</tbody></table></div>}
          <small>{investigation.limitations}</small><button type="button" className={styles.button} disabled={!investigation.context} onClick={askWithEvidence}>✦ Explain in AI chat</button></div>}
      </>}
      {task === "knowledge" && <><h3>Approved knowledge search</h3><p className={styles.hint}>Search your own RLS-protected learning notes. This version matches keywords and related operational terms; vector-based semantic embeddings are a separate upgrade.</p>
        <input className={styles.fullInput} value={knowledgeQuery} onChange={event => setKnowledgeQuery(event.target.value)} placeholder="Search staging, concessions, NOA, DCR…" maxLength={160}/>
        {!lessons.length && <p className={styles.hint}>Approve your first learning note in AI Brain above to build the knowledge base.</p>}
        {!!knowledgeQuery && <div className={styles.stack}>{knowledge.length ? knowledge.map(row => <div className={styles.result} key={row.id}><strong>{row.site}</strong><p>{row.lesson}</p><small>Matching terms: {row.relevance} relevance points · approved private note</small></div>) : <p className={styles.hint}>No matching approved notes. This does not mean the rule does not exist outside your memory.</p>}</div>}
      </>}
      {task === "reader" && <><h3>Universal Format Reader · review mode</h3><p className={styles.hint}>Reads the two files already uploaded in AI Lab. It never replaces Daily Dispatch parsers or applies an unapproved mapping.</p>
        <div className={styles.twoCols}>{sandbox.slots.map(slot => <div key={slot.kind} className={styles.result}><h4>{slot.kind === "route" ? "Route Plan" : "Wave Plan"}</h4>
          {slot.missing ? <p>Not uploaded in AI Lab yet.</p> : <><p>{slot.fileType || "Source format"} · {slot.columns.length} visible columns</p><small>{Object.entries(slot.fields).map(([field, source]) => `${field} ← ${source.sourceHeader}`).join(" · ") || "No fields approved yet"}</small></>}
        </div>)}</div><p className={styles.warning}>{sandbox.warnings.length ? sandbox.warnings.join(" · ") : "Both sources have been inspected. Validate mappings before operational use."}</p>
        <button type="button" className={styles.button} disabled={sandbox.slots.some(slot => slot.missing)} onClick={() => setTask("sandbox")}>Test adapter in Sandbox →</button>
      </>}
      {task === "alerts" && <><h3>Proactive Intelligence · risk digest</h3>{!digest ? <p className={styles.hint}>Load historical data in AI Brain first.</p> : <div className={styles.result}>
        <h4>{digest.site} · {digest.period}</h4><p><b>{digest.high.length}</b> high priority signals · <b>{digest.review.length}</b> additional reviews · <b>{digest.driverCandidates}</b> driver candidates.</p>
        <ol>{[...digest.high,...digest.review].map(item => <li key={item.id}><strong>{item.title}</strong> — {item.evidence}</li>)}</ol><small>{digest.note}{digest.partial ? " Source cap reached." : ""}</small>
        <button type="button" className={styles.button} onClick={() => copyText(`${digest.site} ${digest.period}\n${[...digest.high,...digest.review].map(x => x.title+": "+x.evidence).join("\n")}\n${digest.note}`)}>Copy risk digest</button>
        <p className={styles.hint}>Automatic scanning currently operates while AI Lab is open. An unattended scheduled job needs a separately authorised background identity and delivery channel.</p>
      </div>}</>}
      {task === "copilot" && <><h3>Operations Copilot · drafts only</h3><p className={styles.hint}>Uses the authorised summary to prepare a message. No message is sent to drivers or Amazon.</p>
        <div className={styles.row}><label>Task<select value={draftMode} onChange={event => setDraftMode(event.target.value)}><option value="tips">Driver tip</option><option value="briefing">Management briefing</option><option value="checklist">Dispatch checklist</option></select></label>
          <label>Language<select value={language} onChange={event => setLanguage(event.target.value)}><option value="en">English</option><option value="ro">Română</option></select></label></div>
        <textarea className={styles.draft} rows={7} value={draft} readOnly aria-label="Operations draft"/><button type="button" className={styles.button} disabled={!analysis} onClick={() => copyText(draft)}>Copy reviewed draft</button>
      </>}
      {task === "sandbox" && <><h3>Format Sandbox · non-executable proposal</h3><p className={styles.hint}>Creates a declarative format adapter from your approved source mappings, runs safe structural checks, and lets you export the proposal. It never runs generated JavaScript or writes a GitHub PR.</p>
        <div className={styles.stack}>{sandbox.tests.map(test => <p className={test.pass ? styles.pass : styles.warning} key={test.name}>{test.pass ? "✓" : "⚠"} {test.name}</p>)}</div>
        <pre className={styles.code}>{exportFormatSpec(sandbox)}</pre>
        <button type="button" className={styles.button} onClick={() => download("metrixiq-ai-format-proposal.json",exportFormatSpec(sandbox))}>Download isolated adapter proposal</button>
        <small>{sandbox.disclaimer}</small>
      </>}
      {message && <p role="status" className={styles.status}>{message}</p>}
    </div>
  </section>;
}
