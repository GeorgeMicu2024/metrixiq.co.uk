"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildCopilotDraft, buildProactiveDigest, exportFormatSpec, generateReviewedAdapter, investigateBrain, proposeFormatSandbox, searchApprovedLessons } from "../../lib/ai-lab/ai-v2.mjs";
import { readAiLabFile } from "../../lib/ai-lab/read-file.mjs";
import { classifyAmazonReport } from "../../lib/ai-lab/smart-import.mjs";
import { parseDriverQuestion } from "../../lib/ai-lab/driver-investigator.mjs";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { detectFormatDrift, driftAdapterDraft } from "../../lib/ai-lab/format-drift.mjs";
import { mergeApprovedKnowledge } from "../../lib/ai-lab/semantic-memory.mjs";
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
  const blob = new Blob([content], { type: name.endsWith(".mjs") ? "text/javascript;charset=utf-8" : "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");link.href = url;link.download = name;document.body.appendChild(link);link.click();link.remove();
  } finally { window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
}

export default function AiV2Workspace({ analysis = null, scope = null, lessons = [], documents = {}, approvedFormats = [], onContextChange = () => {}, onAskAI = () => {} }) {
  const [task, setTask] = useState("investigator");
  const [question, setQuestion] = useState("");
  const [investigation, setInvestigation] = useState(null);
  const [driverResult, setDriverResult] = useState(null);
  const [investigatorBusy, setInvestigatorBusy] = useState(false);
  const [knowledgeQuery, setKnowledgeQuery] = useState("");
  const [semanticMatches, setSemanticMatches] = useState([]);
  const [semanticBusy, setSemanticBusy] = useState(false);
  const [semanticMessage, setSemanticMessage] = useState("");
  const semanticVersion = useRef(0);
  const [draftMode, setDraftMode] = useState("tips");
  const [language, setLanguage] = useState("en");
  const [message, setMessage] = useState("");
  const investigationVersion = useRef(0);
  const [imported, setImported] = useState([]);
  const [readerBusy, setReaderBusy] = useState(false);
  useEffect(() => { investigationVersion.current += 1;setInvestigation(null);setDriverResult(null);setMessage(""); }, [analysis, scope]);
  const digest = useMemo(() => buildProactiveDigest(analysis), [analysis]);
  const knowledgeSite = scope?.site || analysis?.site || "";
  const knowledge = useMemo(() => searchApprovedLessons(lessons, knowledgeQuery, knowledgeSite), [lessons, knowledgeQuery, knowledgeSite]);
  const foundKnowledge = useMemo(() => mergeApprovedKnowledge(lessons, knowledge, semanticMatches, knowledgeSite), [lessons, knowledge, semanticMatches, knowledgeSite]);
  useEffect(() => { semanticVersion.current += 1;setSemanticMatches([]);setSemanticMessage(""); }, [knowledgeQuery, knowledgeSite, lessons]);
  const sandbox = useMemo(() => proposeFormatSandbox(documents), [documents]);
  const drift = useMemo(() => detectFormatDrift(documents, approvedFormats), [documents, approvedFormats]);
  const driftAdapter = useMemo(() => driftAdapterDraft(drift), [drift]);
  const draft = useMemo(() => {
    try { return buildCopilotDraft(analysis, draftMode, language); }
    catch { return "Load an AI Brain analysis first to prepare an evidence-aware draft."; }
  }, [analysis, draftMode, language]);

  async function searchByMeaning() {
    if (semanticBusy || knowledgeQuery.trim().length < 3 || !lessons.length) return;
    const version = ++semanticVersion.current;
    setSemanticBusy(true);setSemanticMessage("");
    try {
      const { data, error } = await getSupabaseBrowserClient().functions.invoke("ai-lab-semantic-memory", {
        body: { action: "search", query: knowledgeQuery.trim(), site: knowledgeSite || null },
      });
      if (error || !Array.isArray(data?.matches)) throw new Error("Semantic search unavailable");
      if (semanticVersion.current !== version) return;
      setSemanticMatches(data.matches);
      setSemanticMessage(data.matches.length
        ? "Meaning-based matches combined with your keyword results."
        : "No close semantic matches. Keyword results remain available.");
    } catch {
      if (semanticVersion.current === version) setSemanticMessage("Semantic search unavailable · keyword search still works.");
    } finally { setSemanticBusy(false); }
  }

  async function runQuestion() {
    if (investigatorBusy) return;
    const version = ++investigationVersion.current;
    setMessage("");setInvestigation(null);setDriverResult(null);onContextChange("");
    try {
      setInvestigation(investigateBrain(analysis, question));
      const parsed = parseDriverQuestion(question);
      if (!parsed || !scope?.organizationId || scope.site !== analysis?.site) return;
      setInvestigatorBusy(true);
      const client = getSupabaseBrowserClient();
      const { data: { session } } = await client.auth.getSession();
      if (!session?.access_token) throw new Error("Super Admin session expired.");
      const response = await fetch("/api/ai-lab/investigate", { method: "POST", cache: "no-store",
        headers: { Authorization: "Bearer " + session.access_token, "Content-Type": "application/json" },
        body: JSON.stringify({ organization: scope.organizationId, site: scope.site, periods: analysis.periods, question }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.result) throw new Error(body.error || "Authorised driver query failed.");
      if (version === investigationVersion.current) setDriverResult(body.result);
    } catch (error) { setMessage(error.message || "Could not investigate the selected reports."); }
    finally { setInvestigatorBusy(false); }
  }

  function askWithEvidence() {
    if (!investigation?.context) return;
    const context = driverResult?.context ? JSON.stringify({ metrics: JSON.parse(investigation.context), drivers: JSON.parse(driverResult.context) }) : investigation.context;
    onContextChange(context.slice(0, 5800));
    onAskAI(`Explică analiza de date pentru ${analysis?.site || "stația selectată"}. Arată dovezile și limitările, apoi pașii practici. Nu inventa cauze și nu atribui vină șoferilor.`);
  }

  async function copyText(value) {
    try { await copy(value);setMessage("Copied. Review before sending anything externally."); }
    catch (error) { setMessage(error.message || "Could not copy text."); }
  }

  async function inspectFiles(input) {
    const files = Array.from(input || []).slice(0, 4);
    if (!files.length || readerBusy) return;
    setReaderBusy(true);setMessage("");
    const summaries = [];
    try {
      for (const file of files) {
        try {
          const result = await readAiLabFile(file);
          const classification = classifyAmazonReport(result.matrix, file.name);
          summaries.push({ id: file.name + ":" + file.size + ":" + summaries.length, filename: file.name.slice(0, 100),
            kind: classification.kind, confidence: classification.confidence, explanation: classification.message,
            reasons: classification.reasons, rows: result.matrix.length, sheets: result.availableSheets?.length || 0,
            mode: result.mode, truncated: Boolean(result.truncated), status: "review" });
        } catch (cause) {
          summaries.push({ id: file.name + ":error:" + summaries.length, filename: file.name.slice(0, 100), status: "error", explanation: String(cause.message || "Could not read file.").slice(0, 200) });
        }
      }
      setImported(summaries);
    } finally { setReaderBusy(false); }
  }

  function discussDrift() {
    const context = JSON.stringify({ source: "AI Lab local structural comparison", mutation: "none",
      approvedLayoutsAvailable: drift.approvedCount, comparisons: drift.results,
      limitations: "Only header positions and approved schema were compared. No source rows or station validity were verified. Review all mappings manually." });
    onContextChange(context.slice(0, 4900));
    onAskAI("Explică diferențele dintre formatul Wave Plan/Route Plan actual și structurile aprobate. Menționează coloanele mutate, lipsă sau ambigue și verificările manuale necesare. Nu spune că ai schimbat vreun parser și nu propune publicare automată.");
  }

  function explainImports() {
    if (!imported.length) return;
    const context = JSON.stringify({ source: "Browser-only AI Lab format inspection", files: imported.map(item => ({
      kind: item.kind, confidence: item.confidence, rows: item.rows, sheets: item.sheets, mode: item.mode,
      reasons: item.reasons, truncated: item.truncated, status: item.status,
    })), limitations: "Formats are unapproved guesses. Filenames, file content, names, TRIDs and raw rows were not shared." });
    onContextChange(context);
    onAskAI("Explică tipurile de rapoarte Amazon detectate, riscurile de recunoaștere și ce coloane ar trebui verificate manual. Nu modifica date și nu presupune că un format este aprobat.");
  }

  return <section className={styles.panel} aria-label="AI Lab advanced intelligence workspace">
    <header className={styles.header}><div><span className={styles.kicker}>METRIXIQ · ISOLATED TOOLS</span><h2>AI Intelligence Workspace <span>✦</span></h2>
      <p>Six controlled extensions. Existing station modules are untouched; every report check is read-only.</p></div><span className={styles.badge}>SUPER ADMIN</span></header>
    <div className={styles.actions}>{ACTIONS.map(([id, title, subtitle]) => <button key={id} type="button" className={task === id ? styles.active : styles.action} onClick={() => {setTask(id);setMessage("");}} aria-pressed={task === id}>
      <strong>{title}</strong><small>{subtitle}</small></button>)}</div>
    <div className={styles.content}>
      {task === "investigator" && <><h3>AI Investigator · verified sources</h3>
        <p className={styles.hint}>Start with an AI Brain analysis above. The investigator handles Romanian and English metric questions using only the data already authorised and loaded.</p>
        <form className={styles.row} onSubmit={event => {event.preventDefault();runQuestion();}}><input value={question} maxLength={500} onChange={event => setQuestion(event.target.value)} placeholder="Cine are IADC sub 80% la DZM1?" aria-label="Investigation question"/><button type="submit" className={styles.button} disabled={!analysis || investigatorBusy || question.trim().length < 5}>{investigatorBusy ? "Checking authorised drivers…" : "Investigate ↗"}</button></form>
        {investigation && <div className={styles.result}><h4>{investigation.title}</h4><p>{investigation.answer}</p>
          {!!investigation.evidence.length && <div className={styles.tableWrap}><table><thead><tr><th>Source</th><th>Period</th><th>Metric</th><th>Mean</th><th>Numeric records</th></tr></thead><tbody>{investigation.evidence.map((row, index) => <tr key={index}><td>{row.source}</td><td>{row.period}</td><td>{row.metric}</td><td>{row.mean}{row.unit}</td><td>{row.numericRows}</td></tr>)}</tbody></table></div>}
          <small>{investigation.limitations}</small><button type="button" className={styles.button} disabled={!investigation.context} onClick={askWithEvidence}>✦ Explain in AI chat</button></div>}
        {driverResult && <div className={styles.result}><h4>Verified driver query · {driverResult.totalMatches} matches among {driverResult.analysedDrivers} comparable drivers</h4>
          <p>{driverResult.criterion.metric.toUpperCase()} {driverResult.criterion.comparison} {driverResult.criterion.threshold}{driverResult.criterion.unit} · periods {driverResult.periods.join(", ")}</p>
          {!!driverResult.matches.length && <div className={styles.tableWrap}><table><thead><tr><th>Driver (private)</th><th>Last period</th><th>Mean</th><th>Previous</th><th>Source rows</th></tr></thead><tbody>{driverResult.matches.map(row => <tr key={row.driverId}><td>{row.driverName}</td><td>{row.period}</td><td>{row.mean}{driverResult.criterion.unit}</td><td>{row.previous ?? "—"}</td><td>{row.numericRows}</td></tr>)}</tbody></table></div>}
          <small>{driverResult.limitations}{driverResult.truncated ? " SOURCE CAP REACHED." : ""} Driver names are never passed to the AI model as evidence.</small></div>}
      </>}
      {task === "knowledge" && <><h3>Approved knowledge search</h3>
        <p className={styles.hint}>Private Super Admin lessons. Search by meaning (English gte-small embeddings) alongside Romanian/English operational keyword matches. The built-in model does not reliably understand all Romanian phrasing.</p>
        <form className={styles.row} onSubmit={event => {event.preventDefault();searchByMeaning();}}>
          <input className={styles.fullInput} value={knowledgeQuery} onChange={event => setKnowledgeQuery(event.target.value)}
            placeholder="Caută staging, concesii, NOA, DCR…" maxLength={160} aria-label="Approved learning note query"/>
          <button type="submit" className={styles.button} disabled={semanticBusy || !lessons.length || knowledgeQuery.trim().length < 3}>
            {semanticBusy ? "Searching…" : "✦ Search by meaning"}</button>
        </form>
        {!lessons.length && <p className={styles.hint}>Approve your first learning note in AI Brain above to build the knowledge base.</p>}
        {semanticMessage && <p role="status" className={styles.hint}>{semanticMessage}</p>}
        {!!knowledgeQuery && <div className={styles.stack}>{foundKnowledge.length ? foundKnowledge.map(row => <div className={styles.result} key={row.id}>
          <strong>{row.site}</strong><p>{row.lesson}</p>
          <small>{row.method === "semantic" ? `Meaning match · ${row.relevance}% cosine similarity` : `Keyword match · ${row.relevance} relevance points`} · approved private note</small>
        </div>) : <p className={styles.hint}>No approved note matched. A missing result is not proof the rule does not exist.</p>}</div>}
      </>}
      {task === "reader" && <><h3>Universal Format Reader · review mode</h3><p className={styles.hint}>Reads the two files already uploaded in AI Lab. It never replaces Daily Dispatch parsers or applies an unapproved mapping.</p>
        <div className={styles.result}><h4>Inspect additional Amazon files</h4><p>Check up to four reports together (Excel, CSV, PDF or image). Parsing and OCR stay in this browser. Nothing is uploaded to the server or imported into a station.</p>
          <input type="file" multiple accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg,.webp,.bmp" disabled={readerBusy} aria-label="Inspect multiple Amazon reports" onChange={event => {inspectFiles(event.target.files);event.target.value = "";}}/>
          {readerBusy && <p role="status">Reading reports locally…</p>}
          {imported.length > 0 && <div className={styles.stack}>{imported.map(row => <div key={row.id} className={styles.result}>
            <strong>{row.filename} · {row.kind || "Unreadable"}</strong><p>{row.explanation}</p>
            {row.status !== "error" && <small>{row.confidence}% classification confidence · {row.rows} visible rows · {row.mode}{row.truncated ? " · TRUNCATED" : ""}<br/>{(row.reasons || []).join(", ")}</small>}
          </div>)}</div>}
          {imported.length > 0 && <div className={styles.row}><button type="button" className={styles.button} onClick={explainImports}>✦ Discuss classifications in AI chat</button><button type="button" className={styles.button} onClick={() => {setImported([]);onContextChange("");}}>Clear local results</button></div>}
        </div>
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
        <div className={styles.result}><h4>✦ AI Format Drift Detector · approved structure comparison</h4>
          <p>Compares the two locally uploaded plans against {drift.approvedCount} privately approved layout(s). No report rows, driver identifiers or raw headers are sent anywhere. Suggestions are review-only.</p>
          <div className={styles.twoCols}>{drift.results.map(item => <div key={item.kind} className={styles.result}>
            <h4>{item.kind === "route" ? "Route Plan" : "Wave Plan"} · {item.state.toUpperCase()}</h4>
            {Number.isFinite(item.confidence) && <small>Closest approved header overlap: {item.confidence}% · not proof of correctness</small>}
            {!!item.changes?.length && <ul>{item.changes.map((change, index) => <li key={index}>{change.field}: {change.type} · column {change.fromColumn} → {change.toColumn}</li>)}</ul>}
            {!!item.issues?.length && <ul>{item.issues.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
            {item.state === "unchanged" && <p className={styles.pass}>✓ Approved headers match. Still verify station and row contents.</p>}
          </div>)}</div>
          <div className={styles.row}><button type="button" className={styles.button}
              onClick={() => download("metrixiq-ai-drift-review.json", JSON.stringify(drift, null, 2))}>Download drift review JSON</button>
            <button type="button" className={styles.button} disabled={!driftAdapter}
              onClick={() => download("metrixiq-ai-drift-adapter-review.mjs", generateReviewedAdapter(driftAdapter))}>Download suggested JS adapter (review only)</button>
            <button type="button" className={styles.button} disabled={!drift.approvedCount || drift.results.every(item => item.state === "missing")}
              onClick={discussDrift}>✦ Explain drift in AI chat</button></div>
          {!driftAdapter && <p className={styles.warning}>No complete safe adapter can be proposed yet. Upload both plans, map and approve an original format, then resolve missing or ambiguous fields.</p>}
          <small>Suggestions never update approved formats, site data or existing Daily Dispatch parsers. Manual review is always required.</small>
        </div>
        <div className={styles.stack}>{sandbox.tests.map(test => <p className={test.pass ? styles.pass : styles.warning} key={test.name}>{test.pass ? "✓" : "⚠"} {test.name}</p>)}</div>
        <pre className={styles.code}>{exportFormatSpec(sandbox)}</pre>
        <div className={styles.row}><button type="button" className={styles.button} onClick={() => download("metrixiq-ai-format-proposal.json",exportFormatSpec(sandbox))}>Download JSON adapter proposal</button>
          <button type="button" className={styles.button} disabled={sandbox.slots.some(slot => slot.missing)} onClick={() => download("metrixiq-ai-format-adapter-review.mjs",generateReviewedAdapter(sandbox))}>Download review-only JavaScript adapter</button></div>
        <details><summary>Preview generated JS (not executed)</summary><pre className={styles.code}>{generateReviewedAdapter(sandbox)}</pre></details>
        <small>{sandbox.disclaimer}</small>
      </>}
      {message && <p role="status" className={styles.status}>{message}</p>}
    </div>
  </section>;
}
