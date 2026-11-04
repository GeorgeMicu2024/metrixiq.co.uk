"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { WAVE_FIELDS, detectWavePlan, normalizedWaveRows, signatureFor } from "../../lib/ai-lab/wave-plan.mjs";
import styles from "./AiLabView.module.css";
import AiLabChat from "./AiLabChat";
import AiCommandCenter from "./AiCommandCenter";
import { classifyAmazonReport } from "../../lib/ai-lab/smart-import.mjs";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { AI_LAB_STATE_TABLE, normalizeApprovedFormats } from "../../lib/ai-lab/user-state.mjs";
import { mergeRouteAndWavePlans } from "../../lib/ai-lab/merge-plans.mjs";
import { evaluateWavePlanQuality, QUALITY_PROFILES } from "../../lib/ai-lab/quality-check.mjs";

const MEMORY_KEY = "metrixiq.aiLab.approvedWaveFormats.v1";
const ACCEPTED = ".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg,.webp,.bmp";

function readApprovedFormats(userId = "") {
  try {
    const key = userId ? MEMORY_KEY + "." + userId : MEMORY_KEY;
    return normalizeApprovedFormats(JSON.parse(window.localStorage.getItem(key) || "[]"));
  } catch {
    return [];
  }
}

function saveApprovedFormats(formats, userId) {
  if (!userId) throw new Error("Sign in before saving formats.");
  window.localStorage.setItem(MEMORY_KEY + "." + userId, JSON.stringify(normalizeApprovedFormats(formats)));
}

function downloadText(name, content, type) {
  const objectUrl = URL.createObjectURL(new Blob([content], { type }));
  const element = window.document.createElement("a");
  element.href = objectUrl;
  element.download = name;
  window.document.body.appendChild(element);
  element.click();
  element.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function csvValue(value) {
  let str = String(value ?? "");
  if (/^[\s]*[=+\-@]/.test(str)) str = "'" + str;
  return '"' + str.replace(/"/g, '""') + '"';
}

function todayLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-GB");
}

function columnName(index) {
  let number = index + 1;
  let name = "";
  while (number > 0) {
    number--;
    name = String.fromCharCode(65 + number % 26) + name;
    number = Math.floor(number / 26);
  }
  return name;
}

export default function AiLabView() {

  const [templates, setTemplates] = useState([]);
  const [cloudUserId, setCloudUserId] = useState("");
  const [cloudState, setCloudState] = useState("Connecting private memory…");
  const [documents, setDocuments] = useState({ route: null, wave: null });
  const [activeSource, setActiveSource] = useState("wave");
  const [qualityProfile, setQualityProfile] = useState("standard");
  const [suggestedPrompt, setSuggestedPrompt] = useState(null);
  const [commandContext, setCommandContext] = useState("");
  const chatAnchor = useRef(null);
  const doc = documents[activeSource];
  const mapping = doc?.mapping || {};
  const headerRow = doc?.headerRow ?? -1;
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    async function loadMemory() {
      try {
        const client = getSupabaseBrowserClient();
        const { data: { user }, error: authError } = await client.auth.getUser();
        if (authError || !user?.id || !active) return;
        const currentLocal = readApprovedFormats(user.id);
        const { data: cloud, error: fetchError } = await client.from(AI_LAB_STATE_TABLE)
          .select("approved_formats").eq("user_id", user.id).maybeSingle();
        if (!active) return;
        setCloudUserId(user.id);
        const cloudFormats = normalizeApprovedFormats(cloud?.approved_formats);
        const selected = !fetchError && cloud ? cloudFormats : currentLocal.length ? currentLocal : readApprovedFormats();
        setTemplates(selected);
        saveApprovedFormats(selected, user.id);
        if (fetchError) {
          setCloudState("Cloud memory unavailable · local fallback");
        } else if (!cloud && selected.length) {
          const { error } = await client.from(AI_LAB_STATE_TABLE).upsert({
            user_id: user.id, approved_formats: selected, updated_at: new Date().toISOString(),
          }, { onConflict: "user_id" });
          if (active) setCloudState(error ? "Local memory only" : "Formats synced across devices");
        } else {
          setCloudState("Private memory synced across devices");
        }
      } catch {
        if (active) setCloudState("Cloud memory unavailable · local fallback");
      }
    }
    loadMemory();
    return () => { active = false; };
  }, []);

  async function persistFormats(next) {
    try {
      saveApprovedFormats(next, cloudUserId);
      if (!cloudUserId) return false;
      const { error } = await getSupabaseBrowserClient().from(AI_LAB_STATE_TABLE).upsert({
        user_id: cloudUserId,
        approved_formats: normalizeApprovedFormats(next),
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      if (error) throw error;
      setCloudState("Private memory synced across devices");
      return true;
    } catch {
      setCloudState("Cloud memory unavailable · local fallback");
      return false;
    }
  }

  const detected = useMemo(() => doc ? detectWavePlan(doc.matrix, templates) : null, [doc, templates]);
  const rows = useMemo(() => doc ? normalizedWaveRows(doc.matrix, mapping, headerRow) : [], [doc, mapping, headerRow]);
  const routeRows = useMemo(() => documents.route
    ? normalizedWaveRows(documents.route.matrix, documents.route.mapping, documents.route.headerRow) : [], [documents.route]);
  const waveRows = useMemo(() => documents.wave
    ? normalizedWaveRows(documents.wave.matrix, documents.wave.mapping, documents.wave.headerRow) : [], [documents.wave]);
  const joined = useMemo(() => documents.route && documents.wave
    ? mergeRouteAndWavePlans(routeRows, waveRows) : null, [documents.route, documents.wave, routeRows, waveRows]);
  const quality = useMemo(() => joined ? evaluateWavePlanQuality({
    routeRows, waveRows, joined, profile: qualityProfile,
    routeMapping: documents.route.mapping, waveMapping: documents.wave.mapping,
  }) : null, [routeRows, waveRows, joined, documents.route, documents.wave, qualityProfile]);
  const previewRows = joined ? joined.rows : rows;
  const headers = headerRow >= 0 ? doc?.matrix?.[headerRow] || [] : [];
  const colCount = doc ? Math.min(40, Math.max(0, ...doc.matrix.slice(0, 20).map(row => row.length))) : 0;
  const mappedCount = Object.values(mapping).filter(Number.isInteger).length;
  const validMappings = Object.values(mapping).filter(Number.isInteger);
  const noDuplicateColumns = new Set(validMappings).size === validMappings.length;
  const safeReportContext = useMemo(() => {
    if (!doc && !templates.length) return "";
    const approvedLayouts = templates.slice(0, 8).map(item => ({
      headers: String(item.signature || "").split("|").slice(0, 20),
      fieldPositions: item.columns,
    }));
    const summary = quality ? { qualityCheck: quality.aiSummary, approvedLayouts } : { approvedLayouts };
    if (doc) {
      const columns = Object.fromEntries(WAVE_FIELDS.filter(field => Number.isInteger(mapping[field.id]))
        .map(field => [field.id, String(headers[mapping[field.id]] || "Column " + (mapping[field.id] + 1)).slice(0, 70)]));
      const waveCounts = new Map();
      const routeCounts = new Map();
      for (const row of previewRows) {
        if (row.wave) waveCounts.set(row.wave, (waveCounts.get(row.wave) || 0) + 1);
        if (row.route) routeCounts.set(row.route, (routeCounts.get(row.route) || 0) + 1);
      }
      const checks = {};
      for (const field of ["route", "wave", "staging", "loading"]) {
        if (joined || Number.isInteger(mapping[field])) checks["missing_" + field] = previewRows.filter(row => !row[field]).length;
      }
      checks.repeatedRoutesForReview = [...routeCounts].filter(([, count]) => count > 1).slice(0, 15).map(([route, count]) => ({ route, count }));
      if (joined) checks.twoFileMatching = { matched: joined.matched, routeOnly: joined.routeOnly, waveOnly: joined.waveOnly, ambiguous: joined.ambiguous, conflicts: joined.conflicts };
      summary.currentReport = {
        reportType: joined ? "Route Plan + Wave Plan (local match; review required)" : doc.mode, detectedRows: previewRows.length, columns: joined ? {
          routePlan: Object.fromEntries(WAVE_FIELDS.filter(field => Number.isInteger(documents.route.mapping[field.id]))
            .map(field => [field.id, String(documents.route.matrix[documents.route.headerRow]?.[documents.route.mapping[field.id]] || field.label).slice(0, 70)])),
          wavePlan: Object.fromEntries(WAVE_FIELDS.filter(field => Number.isInteger(documents.wave.mapping[field.id]))
            .map(field => [field.id, String(documents.wave.matrix[documents.wave.headerRow]?.[documents.wave.mapping[field.id]] || field.label).slice(0, 70)])),
        } : columns, checks,
        waveDistribution: [...waveCounts].slice(0, 20).map(([wave, count]) => ({ wave, count })),
        sample: previewRows.slice(0, 12).map(row => ({
          route: row.route, wave: row.wave, staging: row.staging, parking: row.parking, holding: row.holding, loading: row.loading,
        })),
      };
    }
    return JSON.stringify(summary).slice(0, 5900);
  }, [doc, documents, mapping, headerRow, previewRows, joined, quality, templates]);

  async function processFile(file, source) {
    if (!file || busy || !["route", "wave"].includes(source)) return;
    setBusy(true);
    setProgress(0);
    setError("");
    setNotice("");
    try {
      const { readAiLabFile } = await import("../../lib/ai-lab/read-file.mjs");
      const result = await readAiLabFile(file, setProgress);
      if (!result.matrix.length) throw new Error("No readable rows found. Try a clearer image or a spreadsheet.");
      const proposed = detectWavePlan(result.matrix, templates);
      const classification = classifyAmazonReport(result.matrix, file.name);
      setDocuments(current => ({
        ...current,
        [source]: { name: file.name, size: file.size, sourceFile: file, ...result,
          classification, headerRow: proposed.headerRow, mapping: proposed.columns },
      }));
      setActiveSource(source);
      setQualityProfile("standard"); // Require explicit station rules for each newly uploaded pair.
      setNotice(proposed.matchedTemplate
        ? "Recognised an approved " + source + " format: " + proposed.matchedTemplate + ". Check the columns before using the preview."
        : "New " + source + " format detected. Review the proposed columns; approve them to remember this layout.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The file could not be read.");
    } finally {
      setBusy(false);
    }
  }

  async function switchSheet(source, sheetName) {
    const original = documents[source];
    if (busy || !original?.sourceFile || !sheetName) return;
    setBusy(true);
    setProgress(0);
    setError("");
    setNotice("");
    try {
      const { readAiLabFile } = await import("../../lib/ai-lab/read-file.mjs");
      const result = await readAiLabFile(original.sourceFile, setProgress, { sheetName });
      if (!result.matrix.length) throw new Error("The selected sheet has no readable rows.");
      const proposed = detectWavePlan(result.matrix, templates);
      const classification = classifyAmazonReport(result.matrix, original.name);
      setDocuments(current => ({ ...current, [source]: { ...current[source], ...result,
        classification, headerRow: proposed.headerRow, mapping: proposed.columns } }));
      setActiveSource(source);
      setQualityProfile("standard");
      setNotice("Selected sheet changed. Review the suggested mappings before approving or exporting.");
    } catch (cause) {
      setError(cause.message || "Could not read the selected sheet.");
    } finally { setBusy(false); }
  }

  function moveSuggestedFile(source) {
    const target = documents[source]?.classification?.suggestedSlot;
    if (!target || target === source) return;
    if (documents[target]) { setError("Remove the existing " + target + " file before moving this report."); return; }
    setDocuments(current => ({ ...current, [target]: current[source], [source]: null }));
    setActiveSource(target);
    setQualityProfile("standard");
    setError("");
    setNotice("Moved to the suggested slot. Review its column mappings before approving.");
  }

  function updateMapping(field, column) {
    setDocuments(current => ({
      ...current,
      [activeSource]: {
        ...current[activeSource],
        mapping: { ...(current[activeSource]?.mapping || {}), [field]: column === "" ? undefined : Number(column) },
      },
    }));
    setNotice("");
  }

  function updateHeaderRow(value) {
    setDocuments(current => ({
      ...current,
      [activeSource]: { ...current[activeSource], headerRow: Number(value), mapping: {} },
    }));
    setError("");
  }

  function clearFile(source) {
    setDocuments(current => ({ ...current, [source]: null }));
    setQualityProfile("standard");
    if (source === activeSource) setActiveSource(source === "route" ? "wave" : "route");
    setError("");
    setNotice("");
  }

  async function approve() {
    if (!doc || !Number.isInteger(headerRow) || headerRow < 0) {
      setError("Choose a header row containing column names before saving a reusable format.");
      return;
    }
    if (mappedCount < 2 || !noDuplicateColumns) {
      setError("Map at least two different columns. One source column cannot represent two fields.");
      return;
    }
    const signature = signatureFor(headers);
    if (!signature) {
      setError("The selected header row is empty.");
      return;
    }
    const existing = templates.find(item => item.signature === signature);
    const next = [{
      id: existing?.id || String(Date.now()),
      name: doc.name.replace(/\.[^.]+$/, ""),
      signature,
      columns: { ...mapping },
      approvedAt: new Date().toISOString(),
    }, ...templates.filter(item => item.signature !== signature)].slice(0, 50);
    setTemplates(next);
    const synced = await persistFormats(next);
    setError("");
    setNotice(synced ? "Format approved and synced across your devices." : "Format approved locally. Cloud sync unavailable; export a backup.");
  }

  async function removeFormat(id) {
    if (!window.confirm("Remove this approved format from this browser?")) return;
    const next = templates.filter(template => template.id !== id);
    setTemplates(next);
    const synced = await persistFormats(next);
    setNotice(synced ? "Approved format removed from private cloud memory." : "Removed locally. Cloud sync unavailable.");
  }

  function downloadCsv() {
    if (!previewRows.length) return;
    const exportFields = joined ? [{ id: "matchStatus", label: "Match status" }, ...WAVE_FIELDS] : WAVE_FIELDS;
    const csv = [exportFields.map(field => csvValue(field.label)).join(","),
      ...previewRows.map(row => exportFields.map(field => csvValue(row[field.id])).join(","))].join("\r\n");
    const name = joined ? "combined-route-wave-plan" : (doc?.name || "wave-plan").replace(/\.[^.]+$/, "");
    downloadText(name + "-ai-lab-preview.csv", "\uFEFF" + csv, "text/csv;charset=utf-8");
  }

  function exportQualityFindings() {
    if (!quality) return;
    const fields = ["Severity", "Check", "Count", "What to review", "Route examples"];
    const lines = [fields.map(csvValue).join(","), ...quality.findings.map(item =>
      [item.severity, item.title, item.count, item.description, item.examples.join(" / ")].map(csvValue).join(","))];
    downloadText("metrixiq-ai-lab-quality-check.csv", "\uFEFF" + lines.join("\r\n"), "text/csv;charset=utf-8");
  }

  function askQualityAi(plan = false) {
    setSuggestedPrompt({ id: String(Date.now()) + Math.random().toString(36), text: plan
      ? "Pe baza verificării AI Quality Check, creează un plan de acțiune prioritar pentru dispecerat. Separă erorile confirmate de verificările manuale necesare; nu inventa date și nu modifica rute."
      : "Explică verificarea AI Quality Check pentru Route Plan și Wave Plan. Care sunt cele mai grave riscuri, ce date lipsesc și ce să verific concret înainte de dispatch? Răspunde în română." });
    chatAnchor.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function askCommandAi(text) {
    setSuggestedPrompt({ id: String(Date.now()) + Math.random().toString(36), text, source: "command" });
    chatAnchor.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function exportMemory() {
    if (!templates.length) return;
    downloadText("metrixiq-ai-lab-approved-formats.json", JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), templates }, null, 2), "application/json");
  }

  return <div className={styles.shell}>
    <header className={styles.hero}>
      <div>
        <span className={styles.kicker}>METRIXIQ INTELLIGENCE · EXPERIMENTAL</span>
        <h1>AI Lab <span aria-hidden="true">✦</span></h1>
        <p>Upload Route Plan and Wave Plan together, check route matches, and teach MetrixIQ their approved formats without changing Daily Dispatch.</p>
      </div>
      <div className={styles.pills}><span className={styles.pill}>SUPER ADMIN ONLY</span><span className={styles.pill + " " + styles.warn}>ISOLATED TEST MODE</span></div>
    </header>
    <div className={styles.layout}>
      <div className={styles.full} ref={chatAnchor}><AiLabChat reportContext={safeReportContext} commandContext={commandContext} suggestedPrompt={suggestedPrompt}/></div>
      <div className={styles.full}><AiCommandCenter onContextChange={setCommandContext} onAskAI={askCommandAi}/></div>
      <section className={styles.card}>
        <div className={styles.cardHead}><div><h2>1. Upload both plans</h2><p>Route Plan + Wave Plan · Excel, CSV, PDF or image</p></div><span className={styles.pill}>LOCAL PROCESSING</span></div>
        <div className={styles.cardBody}>
          <div className={styles.uploadPair}>
            {[
              { key: "route", label: "Route Plan", description: "Routes, drivers and TRIDs" },
              { key: "wave", label: "Wave Plan", description: "Waves, staging and loading times" },
            ].map(slot => <div className={styles.uploadSlot} key={slot.key}>
              <label className={styles.drop} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); processFile(event.dataTransfer.files?.[0], slot.key); }}>
                <input type="file" accept={ACCEPTED} disabled={busy}
                  onChange={event => { processFile(event.target.files?.[0], slot.key); event.target.value = ""; }}
                  aria-label={"Upload " + slot.label + " for AI Lab analysis"}/>
                <span className={styles.uploadIcon} aria-hidden="true">⇧</span>
                <strong>{slot.label}</strong>
                <small>{documents[slot.key]?.name || slot.description}</small>
                <span className={styles.button}>{documents[slot.key] ? "Replace file" : "Select file"}</span>
              </label>
              {documents[slot.key] && <div className={styles.slotInfo}>
                <span>✓ Loaded · {documents[slot.key].mode}</span>
                <button type="button" className={styles.button + " " + styles.secondary}
                  disabled={busy} onClick={() => clearFile(slot.key)}>Remove</button>
              </div>}
              {documents[slot.key]?.classification && <div className={styles.smartHint}>
                <strong>✦ Smart Import: {documents[slot.key].classification.kind === "unknown" ? "Uncertain format" : "Likely " + documents[slot.key].classification.kind + " report"}{documents[slot.key].classification.confidence ? " · " + documents[slot.key].classification.confidence + "% hint" : ""}</strong>
                <small>{documents[slot.key].classification.message}</small>
                {documents[slot.key].classification.suggestedSlot && documents[slot.key].classification.suggestedSlot !== slot.key &&
                  <button type="button" className={styles.button + " " + styles.secondary}
                    disabled={busy || Boolean(documents[documents[slot.key].classification.suggestedSlot])}
                    onClick={() => moveSuggestedFile(slot.key)}>Move to {documents[slot.key].classification.suggestedSlot === "route" ? "Route Plan" : "Wave Plan"}</button>}
              </div>}
              {documents[slot.key]?.availableSheets?.length > 1 && <label className={styles.label} style={{ marginTop: 8 }}>
                Excel sheet
                <select className={styles.select} value={documents[slot.key].selectedSheet || ""}
                  disabled={busy} onChange={event => switchSheet(slot.key, event.target.value)}>
                  {documents[slot.key].availableSheets.map(sheet => <option key={sheet} value={sheet}>{sheet}</option>)}
                </select>
              </label>}
            </div>)}
          </div>
          <p className={styles.muted}>Upload either file first, then the other. Use reports for the same site and day. 15 MB maximum per file. Reports stay in this browser; only approved layout signatures can be saved.</p>
          {busy && <div className={styles.status} role="status">OCR / parsing in progress: {progress}%<div className={styles.progressTrack}><div className={styles.progressBar} style={{ width: progress + "%" }}/></div></div>}
          {error && <div className={styles.status + " " + styles.error} role="alert">{error}</div>}
          {notice && <div className={styles.status} role="status">{notice}</div>}
          {(documents.route || documents.wave) && <div className={styles.row} style={{ marginTop: 12 }}>
            <button type="button" className={styles.button + (activeSource === "route" ? "" : " " + styles.secondary)}
              disabled={!documents.route || busy} onClick={() => setActiveSource("route")}>Review Route Plan</button>
            <button type="button" className={styles.button + (activeSource === "wave" ? "" : " " + styles.secondary)}
              disabled={!documents.wave || busy} onClick={() => setActiveSource("wave")}>Review Wave Plan</button>
          </div>}
          {doc && <>
            <div className={styles.smallStats}>
              <div className={styles.stat}><strong>{doc.matrix.length}</strong><span>Rows in selected file</span></div>
              <div className={styles.stat}><strong>{mappedCount}/8</strong><span>Mapped fields</span></div>
              <div className={styles.stat}><strong>{detected?.confidence || 0}%</strong><span>Format confidence</span></div>
            </div>
            <p className={styles.muted}>Reviewing: <strong>{doc.name}</strong> · {doc.mode}{doc.truncated ? " · Preview limited to first pages/rows" : ""}</p>
            {(doc.mode.includes("OCR") || (detected?.confidence || 0) < 70) && <p className={styles.note + " " + styles.warning}>Recognition may be incomplete. Check column mappings, routes and times against the source.</p>}
          </>}
          {joined && <>
            <div className={styles.pairStats}>
              <div className={styles.stat}><strong>{joined.matched}</strong><span>Matched routes</span></div>
              <div className={styles.stat}><strong>{joined.routeOnly}</strong><span>Route Plan only</span></div>
              <div className={styles.stat}><strong>{joined.waveOnly}</strong><span>Wave Plan only</span></div>
              <div className={styles.stat}><strong>{joined.ambiguous + joined.conflicts}</strong><span>Need review</span></div>
            </div>
            {(joined.routeOnly || joined.waveOnly || joined.ambiguous || joined.conflicts) > 0 &&
              <p className={styles.note + " " + styles.warning}>Not all rows could be safely matched. Review each file's Route ID / TRID mapping and the Match status in the combined preview. Nothing is matched by row order.</p>}
            {!joined.matched && <p className={styles.note + " " + styles.warning}>No safe matches found yet. Both reports need a Route or TRID column; check the source mappings before exporting.</p>}
          </>}
        </div>
      </section>
      <section className={styles.card}>
        <div className={styles.cardHead}><div><h2>Smart Import learning</h2><p>Recognises likely report types and reusable approved layouts</p></div><span aria-hidden="true">🧠</span></div>
        <div className={styles.cardBody}>
          <ol className={styles.tipList}>
            <li>Read the report locally, including OCR for images and scanned PDF pages.</li>
            <li>Suggest columns such as Route, TRID, Wave, Staging and Loading.</li>
            <li>You verify the mapping; only an approved format is remembered.</li>
            <li>Upload both plans; combine only uniquely matching Route IDs or TRIDs and flag mismatches.</li>
            <li>Similar future files use saved mappings automatically across your signed-in devices.</li>
          </ol>
          <p className={styles.note} style={{ marginTop: 16 }}>No automatic edits to Daily Dispatch, drivers, scorecards, site records or production code. Only approved column layouts sync to private memory.</p>
        </div>
      </section>
      {doc && <section className={styles.card + " " + styles.full}>
        <div className={styles.cardHead}><div><h2>2. Verify {activeSource === "route" ? "Route Plan" : "Wave Plan"} columns</h2><p>Select the header row and correct mappings for each uploaded file separately.</p></div><span className={styles.pill}>REVIEW REQUIRED</span></div>
        <div className={styles.cardBody}>
          <label className={styles.label} style={{ maxWidth: 340 }}>Header row
            <select className={styles.select} value={headerRow} onChange={event => updateHeaderRow(event.target.value)}>
              <option value={-1}>No detectable header</option>
              {doc.matrix.slice(0, 25).map((row, index) => <option key={index} value={index}>Row {index + 1} — {row.slice(0, 4).join(" / ").slice(0, 85)}</option>)}
            </select>
          </label>
          <div className={styles.mapping}>
            {WAVE_FIELDS.map(field => <label key={field.id} className={styles.label}>{field.label}
              <select className={styles.select} value={Number.isInteger(mapping[field.id]) ? mapping[field.id] : ""} onChange={event => updateMapping(field.id, event.target.value)}>
                <option value="">— Not available —</option>
                {Array.from({ length: colCount }, (_, index) => <option key={index} value={index}>Column {columnName(index)} — {String(headers[index] || doc.matrix[0]?.[index] || "Unnamed").slice(0, 44)}</option>)}
              </select>
            </label>)}
          </div>
          {!noDuplicateColumns && <p className={styles.note + " " + styles.warning}>Two fields currently use the same column. Correct the mapping before saving.</p>}
          <div className={styles.row} style={{ marginTop: 18 }}>
            <button type="button" className={styles.button} disabled={!cloudUserId || mappedCount < 2 || !noDuplicateColumns} onClick={approve}>✓ Approve & learn format</button>
            <button type="button" className={styles.button + " " + styles.secondary} disabled={!previewRows.length} onClick={downloadCsv}>↓ Download preview CSV</button>
            <button type="button" className={styles.button + " " + styles.secondary} onClick={() => clearFile(activeSource)}>Remove selected file</button>
          </div>
        </div>
      </section>}
      {doc && <section className={styles.card + " " + styles.full}>
        <div className={styles.cardHead}><div><h2>3. {joined ? "Combined Route + Wave Plan preview" : "Single-file preview"}</h2><p>Read-only output · {previewRows.length} candidate rows · showing first 25</p></div><span className={styles.pill + " " + styles.warn}>NOT SENT TO DAILY DISPATCH</span></div>
        <div className={styles.cardBody}>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr>{joined && <th>Match</th>}{WAVE_FIELDS.map(field => <th key={field.id}>{field.label}</th>)}</tr></thead>
              <tbody>{previewRows.slice(0, 25).map((row, index) => <tr key={index}>{joined && <td><span className={row.matchStatus === "Matched" ? styles.matchGood : styles.matchWarn}>{row.matchStatus}</span></td>}{WAVE_FIELDS.map(field => <td key={field.id}>{row[field.id] || <span className={styles.blank}>—</span>}</td>)}</tr>)}</tbody>
            </table>
          </div>
          {!previewRows.length && <p className={styles.muted}>No usable rows yet. Check the header row and the mappings for both files.</p>}
          {doc.text && <details style={{ marginTop: 14 }}><summary className={styles.muted} style={{ cursor: "pointer" }}>Show extracted OCR/PDF text</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 240, overflowY: "auto", fontSize: 11, color: "#5c7286" }}>{doc.text.slice(0, 10000)}</pre></details>}
        </div>
        <footer className={styles.footnote}>This preview is informational. Verify all unmatched and conflicting rows before operational use; the current Wave Plan generator remains unchanged.</footer>
      </section>}
      {quality && <section className={styles.card + " " + styles.full} aria-label="AI Lab quality check">
        <div className={styles.cardHead}>
          <div><h2>4. AI Quality Check</h2><p>Local, read-only checks · optional AI explanations · not an official dispatch score</p></div>
          <span className={styles.pill + (quality.counts.high ? " " + styles.warn : "")}>{quality.risk}</span>
        </div>
        <div className={styles.cardBody}>
          <label className={styles.label} style={{ maxWidth: 400 }}>
            Station timing rules
            <select className={styles.select} value={qualityProfile} onChange={event => setQualityProfile(event.target.value)}>
              {QUALITY_PROFILES.map(profile => <option key={profile.id} value={profile.id}>{profile.label}</option>)}
            </select>
          </label>
          <p className={styles.muted}>Select DZM1 only for DZM1 files. The station and report date cannot yet be independently verified from these uploads.</p>
          <div className={styles.qualityStats}>
            <div className={styles.stat}><strong>{quality.counts.matched}</strong><span>Safely matched</span></div>
            <div className={styles.stat}><strong>{quality.counts.high}</strong><span>High-priority checks</span></div>
            <div className={styles.stat}><strong>{quality.counts.medium}</strong><span>Other checks</span></div>
          </div>
          <div className={styles.qualityList}>
            {quality.findings.length ? quality.findings.slice().sort((a, b) =>
              ({ high: 0, medium: 1, info: 2 })[a.severity] - ({ high: 0, medium: 1, info: 2 })[b.severity]
            ).slice(0, 16).map(item => <div className={styles.qualityIssue} key={item.code}>
              <span className={item.severity === "high" ? styles.qualityHigh : item.severity === "medium" ? styles.qualityMedium : styles.qualityInfo}>{item.severity.toUpperCase()}</span>
              <div className={styles.qualityText}>
                <strong>{item.title} · {item.count}</strong>
                <p>{item.description}</p>
                {item.examples.length > 0 && <small>Route examples: {item.examples.join(", ")}</small>}
              </div>
            </div>) : <p className={styles.note}>No anomalies were flagged by the selected checks. This does not replace source verification.</p>}
            {quality.findings.length > 16 && <p className={styles.muted}>{quality.findings.length - 16} additional checks are included in the CSV export.</p>}
          </div>
          <div className={styles.row} style={{ marginTop: 16 }}>
            <button type="button" className={styles.button} onClick={() => askQualityAi(false)}>✦ Explain risks with AI</button>
            <button type="button" className={styles.button + " " + styles.secondary} onClick={() => askQualityAi(true)}>✦ Suggest action plan</button>
            <button type="button" className={styles.button + " " + styles.secondary} onClick={exportQualityFindings}>↓ Export quality findings</button>
          </div>
          <p className={styles.muted}>AI buttons prepare a question in the chat. To share the private aggregate findings with the model, you must explicitly tick “Share selected report summary with AI”. No operational data is edited.</p>
        </div>
      </section>}
      <section className={styles.card + " " + styles.full}>
        <div className={styles.cardHead}><div><h2>Approved format memory</h2><p>{templates.length} approved templates · {cloudState}</p></div><button type="button" className={styles.button + " " + styles.secondary} disabled={!templates.length} onClick={exportMemory}>↓ Export memory</button></div>
        <div className={styles.cardBody}>
          {templates.length ? <div className={styles.learned}>{templates.map(template => <div className={styles.template} key={template.id}>
            <div><strong>{template.name}</strong><small>Approved {todayLabel(template.approvedAt)} · {Object.keys(template.columns || {}).length} fields · layout signature only</small></div>
            <button type="button" className={styles.button + " " + styles.danger} onClick={() => removeFormat(template.id)} aria-label={"Remove " + template.name}>Remove</button>
          </div>)}</div> : <p className={styles.muted}>No approved formats yet. Upload a Route Plan or Wave Plan and confirm its columns to teach this account its layout.</p>}
        </div>
        <footer className={styles.footnote}>Privacy: approved column layouts are saved privately for this Super Admin account. Uploaded reports, parcel IDs, driver details and site data are not stored in memory.</footer>
      </section>
    </div>
  </div>;
}
