"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { WAVE_FIELDS, detectWavePlan, normalizedWaveRows, signatureFor } from "../../lib/ai-lab/wave-plan.mjs";
import styles from "./AiLabView.module.css";
import AiLabChat from "./AiLabChat";

const MEMORY_KEY = "metrixiq.aiLab.approvedWaveFormats.v1";
const ACCEPTED = ".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg,.webp,.bmp";

function readApprovedFormats() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(MEMORY_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter(item => item && typeof item.signature === "string" && item.columns && typeof item.columns === "object").slice(0, 50) : [];
  } catch {
    return [];
  }
}

function saveApprovedFormats(formats) {
  window.localStorage.setItem(MEMORY_KEY, JSON.stringify(formats.slice(0, 50)));
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
  const fileInput = useRef(null);
  const [templates, setTemplates] = useState([]);
  const [doc, setDoc] = useState(null);
  const [mapping, setMapping] = useState({});
  const [headerRow, setHeaderRow] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setTemplates(readApprovedFormats());
  }, []);

  const detected = useMemo(() => doc ? detectWavePlan(doc.matrix, templates) : null, [doc, templates]);
  const rows = useMemo(() => doc ? normalizedWaveRows(doc.matrix, mapping, headerRow) : [], [doc, mapping, headerRow]);
  const headers = headerRow >= 0 ? doc?.matrix?.[headerRow] || [] : [];
  const colCount = doc ? Math.min(40, Math.max(0, ...doc.matrix.slice(0, 20).map(row => row.length))) : 0;
  const mappedCount = Object.values(mapping).filter(Number.isInteger).length;
  const validMappings = Object.values(mapping).filter(Number.isInteger);
  const noDuplicateColumns = new Set(validMappings).size === validMappings.length;
  const safeReportContext = useMemo(() => {
    if (!doc) return "";
    const columns = Object.fromEntries(WAVE_FIELDS.filter(field => Number.isInteger(mapping[field.id]))
      .map(field => [field.id, String(headers[mapping[field.id]] || "Column " + (mapping[field.id] + 1)).slice(0, 70)]));
    const sample = rows.slice(0, 15).map(row => ({
      route: row.route, wave: row.wave, staging: row.staging, parking: row.parking, holding: row.holding, loading: row.loading,
    }));
    return JSON.stringify({ reportType: doc.mode, detectedRows: rows.length, columns, sample, approvedFormatCount: templates.length }).slice(0, 5800);
  }, [doc, mapping, headerRow, rows, templates]);


  async function processFile(file) {
    if (!file || busy) return;
    setBusy(true);
    setProgress(0);
    setError("");
    setNotice("");
    setDoc(null);
    try {
      const { readAiLabFile } = await import("../../lib/ai-lab/read-file.mjs");
      const result = await readAiLabFile(file, setProgress);
      if (!result.matrix.length) throw new Error("No readable rows found. Try a clearer image or a spreadsheet.");
      const proposed = detectWavePlan(result.matrix, templates);
      setDoc({ name: file.name, size: file.size, ...result });
      setHeaderRow(proposed.headerRow);
      setMapping(proposed.columns);
      setNotice(proposed.matchedTemplate
        ? "An approved format was recognised: " + proposed.matchedTemplate + ". Check the preview before exporting."
        : "New format detected. Review the suggested column mapping and approve it to remember this layout.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The file could not be read.");
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function updateMapping(field, column) {
    setMapping(current => {
      const next = { ...current };
      if (column === "") delete next[field];
      else next[field] = Number(column);
      return next;
    });
    setNotice("");
  }

  function approve() {
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
    try {
      saveApprovedFormats(next);
      setTemplates(next);
      setError("");
      setNotice("Format approved and saved in this browser. Similar reports will reuse the mapping.");
    } catch {
      setError("Browser storage is unavailable. Download the mapped CSV, or enable local storage.");
    }
  }

  function removeFormat(id) {
    if (!window.confirm("Remove this approved format from this browser?")) return;
    const next = templates.filter(template => template.id !== id);
    try {
      saveApprovedFormats(next);
      setTemplates(next);
      setNotice("Approved format removed. Uploaded report data was not stored.");
    } catch {
      setError("Could not update browser storage.");
    }
  }

  function downloadCsv() {
    if (!rows.length) return;
    const csv = [WAVE_FIELDS.map(field => csvValue(field.label)).join(","),
      ...rows.map(row => WAVE_FIELDS.map(field => csvValue(row[field.id])).join(","))].join("\r\n");
    const name = (doc?.name || "wave-plan").replace(/\.[^.]+$/, "");
    downloadText(name + "-ai-lab-preview.csv", "\uFEFF" + csv, "text/csv;charset=utf-8");
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
        <p>Upload a different Amazon report, detect its columns using OCR or spreadsheet reading, and teach MetrixIQ a reusable Wave Plan format.</p>
      </div>
      <div className={styles.pills}><span className={styles.pill}>SUPER ADMIN ONLY</span><span className={styles.pill + " " + styles.warn}>ISOLATED TEST MODE</span></div>
    </header>
    <div className={styles.layout}>
      <div className={styles.full}><AiLabChat reportContext={safeReportContext}/></div>
      <section className={styles.card}>
        <div className={styles.cardHead}><div><h2>1. Smart document upload</h2><p>Excel · CSV · PDF · screenshots · photos</p></div><span className={styles.pill}>LOCAL PROCESSING</span></div>
        <div className={styles.cardBody}>
          <label className={styles.drop} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); processFile(event.dataTransfer.files?.[0]); }}>
            <input ref={fileInput} type="file" accept={ACCEPTED} disabled={busy} onChange={event => processFile(event.target.files?.[0])} aria-label="Upload report for AI Lab analysis" />
            <span className={styles.uploadIcon} aria-hidden="true">⇧</span>
            <strong>{busy ? "Reading and recognising…" : "Choose a report or drop it here"}</strong>
            <small>Up to 15 MB · only one document at a time · nothing is uploaded to Supabase</small>
            <span className={styles.button}>{busy ? "Processing…" : "Select file"}</span>
          </label>
          {busy && <div className={styles.status} role="status">OCR / parsing in progress: {progress}%<div className={styles.progressTrack}><div className={styles.progressBar} style={{ width: progress + "%" }}/></div></div>}
          {error && <div className={styles.status + " " + styles.error} role="alert">{error}</div>}
          {notice && <div className={styles.status} role="status">{notice}</div>}
          {doc && <>
            <div className={styles.smallStats}>
              <div className={styles.stat}><strong>{doc.matrix.length}</strong><span>Detected rows</span></div>
              <div className={styles.stat}><strong>{mappedCount}/8</strong><span>Mapped fields</span></div>
              <div className={styles.stat}><strong>{detected?.confidence || 0}%</strong><span>Format confidence</span></div>
            </div>
            <p className={styles.muted} style={{ marginBottom: 0 }}>File: <strong>{doc.name}</strong> · {doc.mode}{doc.truncated ? " · Preview limited to first pages/rows" : ""}</p>
            {(doc.mode.includes("OCR") || (detected?.confidence || 0) < 70) && <p className={styles.note + " " + styles.warning}>Recognition may be incomplete. Check routes, wave numbers and load times against the source before using the result.</p>}
          </>}
        </div>
      </section>
      <section className={styles.card}>
        <div className={styles.cardHead}><div><h2>How learning works</h2><p>Approved formats, not autonomous code changes</p></div><span aria-hidden="true">🧠</span></div>
        <div className={styles.cardBody}>
          <ol className={styles.tipList}>
            <li>Read the report locally, including OCR for images and scanned PDF pages.</li>
            <li>Suggest columns such as Route, TRID, Wave, Staging and Loading.</li>
            <li>You verify the mapping; only an approved format is remembered.</li>
            <li>Similar future files use the saved mapping automatically.</li>
          </ol>
          <p className={styles.note} style={{ marginTop: 16 }}>No automatic edits to Wave Plan, drivers, scorecards, imports, site records or production code. Learned formats live in this browser only.</p>
        </div>
      </section>
      {doc && <section className={styles.card + " " + styles.full}>
        <div className={styles.cardHead}><div><h2>2. Verify column mapping</h2><p>Select the header row and correct anything the recognition missed.</p></div><span className={styles.pill}>REVIEW REQUIRED</span></div>
        <div className={styles.cardBody}>
          <label className={styles.label} style={{ maxWidth: 340 }}>Header row
            <select className={styles.select} value={headerRow} onChange={event => { setHeaderRow(Number(event.target.value)); setMapping({}); setError(""); }}>
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
            <button type="button" className={styles.button} disabled={mappedCount < 2 || !noDuplicateColumns} onClick={approve}>✓ Approve & learn format</button>
            <button type="button" className={styles.button + " " + styles.secondary} disabled={!rows.length} onClick={downloadCsv}>↓ Download preview CSV</button>
            <button type="button" className={styles.button + " " + styles.secondary} onClick={() => { setDoc(null); setError(""); setNotice(""); setMapping({}); }}>Discard report</button>
          </div>
        </div>
      </section>}
      {doc && <section className={styles.card + " " + styles.full}>
        <div className={styles.cardHead}><div><h2>3. Wave Plan preview</h2><p>Read-only output · {rows.length} candidate rows · showing first 25</p></div><span className={styles.pill + " " + styles.warn}>NOT SENT TO DAILY DISPATCH</span></div>
        <div className={styles.cardBody}>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr>{WAVE_FIELDS.map(field => <th key={field.id}>{field.label}</th>)}</tr></thead>
              <tbody>{rows.slice(0, 25).map((row, index) => <tr key={index}>{WAVE_FIELDS.map(field => <td key={field.id}>{row[field.id] || <span className={styles.blank}>—</span>}</td>)}</tr>)}</tbody>
            </table>
          </div>
          {!rows.length && <p className={styles.muted}>No usable rows yet. Check the header row and the mapping.</p>}
          {doc.text && <details style={{ marginTop: 14 }}><summary className={styles.muted} style={{ cursor: "pointer" }}>Show extracted OCR/PDF text</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 240, overflowY: "auto", fontSize: 11, color: "#5c7286" }}>{doc.text.slice(0, 10000)}</pre></details>}
        </div>
        <footer className={styles.footnote}>This preview is informational. Verify every route and time before operational use; the current Wave Plan generator remains unchanged.</footer>
      </section>}
      <section className={styles.card + " " + styles.full}>
        <div className={styles.cardHead}><div><h2>Approved format memory</h2><p>{templates.length} learned templates stored only on this device/browser</p></div><button type="button" className={styles.button + " " + styles.secondary} disabled={!templates.length} onClick={exportMemory}>↓ Export memory</button></div>
        <div className={styles.cardBody}>
          {templates.length ? <div className={styles.learned}>{templates.map(template => <div className={styles.template} key={template.id}>
            <div><strong>{template.name}</strong><small>Approved {todayLabel(template.approvedAt)} · {Object.keys(template.columns || {}).length} fields · layout signature only</small></div>
            <button type="button" className={styles.button + " " + styles.danger} onClick={() => removeFormat(template.id)} aria-label={"Remove " + template.name}>Remove</button>
          </div>)}</div> : <p className={styles.muted}>No approved formats yet. Upload a Wave Plan and confirm its columns to train recognition for this browser.</p>}
        </div>
        <footer className={styles.footnote}>Privacy: the memory contains column labels and mapping positions, not uploaded reports, parcel IDs, driver details or site data.</footer>
      </section>
    </div>
  </div>;
}
