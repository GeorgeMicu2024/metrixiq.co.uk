"use client";

import { useMemo, useRef, useState } from "react";
import { analyseFiles } from "../../lib/analyzer";
import {
  IMPORT_ACCEPT,
  fileFingerprint,
  prepareImportFiles,
  summarizePreflight,
} from "../../lib/imports/preflight";
import { buildImportIntelligence } from "../../lib/imports/analysisSummary";

function phaseLabel(phase) {
  if (phase === "analysing") return "Detecting reports";
  if (phase === "saving") return "Validating & saving";
  if (phase === "done") return "Import complete";
  if (phase === "error") return "Action required";
  return "Ready";
}

function statusLabel(status) {
  if (status === "parsed") return "Recognised";
  if (status === "read") return "Needs review";
  if (status === "error") return "Error";
  if (status === "unsupported") return "Unsupported";
  return status || "Read";
}

export default function SmartImportView({ onImported, analysis }) {
  const input = useRef(null);
  const [files, setFiles] = useState([]);
  const [phase, setPhase] = useState("idle");
  const [message, setMessage] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [duplicateCount, setDuplicateCount] = useState(0);

  const busy = phase === "analysing" || phase === "saving";
  const preflight = useMemo(() => summarizePreflight(files), [files]);
  const intelligence = useMemo(() => buildImportIntelligence(analysis), [analysis]);
  const importableFiles = useMemo(
    () => preflight.items
      .filter((item) => item.assessment.status !== "blocked")
      .map((item) => item.file),
    [preflight]
  );

  function addFiles(incoming) {
    const prepared = prepareImportFiles(files, incoming);
    setFiles(prepared.files);
    setDuplicateCount(prepared.duplicates);
    setMessage("");
    if (phase === "error" || phase === "done") setPhase("idle");
  }

  function removeFile(file) {
    const fingerprint = fileFingerprint(file);
    setFiles((current) => current.filter((item) => fileFingerprint(item) !== fingerprint));
    setDuplicateCount(0);
    setMessage("");
  }

  function clearFiles() {
    setFiles([]);
    setDuplicateCount(0);
    setMessage("");
    setPhase("idle");
    if (input.current) input.current.value = "";
  }

  function browse() {
    input.current?.click();
  }

  async function run() {
    if (!importableFiles.length || busy) return;

    setPhase("analysing");
    setMessage("");

    try {
      const result = await analyseFiles(importableFiles);

      if (!result.recognizedFiles) {
        throw new Error("No supported report structure was detected in the selected files.");
      }

      setPhase("saving");
      const saved = await onImported(result, importableFiles);

      const skipped = preflight.blocked
        ? ` · ${preflight.blocked} blocked file${preflight.blocked === 1 ? "" : "s"} skipped`
        : "";

      setMessage(
        `Saved ${saved?.savedMetrics ?? 0} driver-week records · ${saved?.savedScorecards ?? 0} site scorecards · ${saved?.savedFeedback ?? 0} CDF events · ${saved?.unmatched ?? 0} unmatched${skipped}.`
      );
      setPhase("done");
    } catch (error) {
      setMessage(error?.message || "Unknown import error");
      setPhase("error");
    }
  }

  const onDrop = (event) => {
    event.preventDefault();
    setDragActive(false);
    addFiles(event.dataTransfer?.files || []);
  };

  return (
    <>
      <div className="page-heading smart-import-heading">
        <div>
          <span className="page-kicker">SMART DATA INGESTION</span>
          <h1>Smart Import</h1>
          <p>
            Upload operational reports together. MetrixIQ detects report types,
            reporting periods and driver identities before saving trusted history.
          </p>
        </div>
        <div className="page-actions">
          {files.length > 0 && (
            <button type="button" className="btn ghost" onClick={clearFiles} disabled={busy}>
              Clear
            </button>
          )}
          <button type="button" className="btn primary" onClick={browse} disabled={busy}>
            Add files
          </button>
        </div>
      </div>

      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept={IMPORT_ACCEPT}
        onChange={(event) => {
          addFiles(event.target.files || []);
          event.target.value = "";
        }}
      />

      <section
        className={`smart-import-drop ${dragActive ? "active" : ""} ${files.length ? "compact" : ""}`}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          if (event.currentTarget === event.target) setDragActive(false);
        }}
        onDrop={onDrop}
        onClick={browse}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") browse();
        }}
      >
        <div className="smart-import-icon">⇧</div>
        <div>
          <span className="smart-import-eyebrow">DROPZONE</span>
          <h2>{dragActive ? "Drop files to add them" : "Drop weekly operational reports here"}</h2>
          <p>
            Excel, CSV/TSV, ODS, HTML, PDF, JSON, XML and text · Multi-file · Multi-week · TRID aware
          </p>
        </div>
        <span className="smart-import-browse">Browse files</span>
      </section>

      {duplicateCount > 0 && (
        <div className="smart-import-notice">
          {duplicateCount} duplicate file{duplicateCount === 1 ? " was" : "s were"} ignored.
        </div>
      )}

      {files.length > 0 && (
        <>
          <section className="smart-import-status-grid">
            <article>
              <span>Selected</span>
              <strong>{files.length}</strong>
              <small>{preflight.ready + preflight.warnings} importable</small>
            </article>
            <article className={preflight.blocked ? "warn" : ""}>
              <span>Preflight</span>
              <strong>{preflight.blocked ? `${preflight.blocked} blocked` : "Ready"}</strong>
              <small>{preflight.warnings ? `${preflight.warnings} warning${preflight.warnings === 1 ? "" : "s"}` : "No file warnings"}</small>
            </article>
            <article>
              <span>Total size</span>
              <strong>
                {(preflight.totalBytes / 1024 / 1024).toFixed(preflight.totalBytes >= 10 * 1024 * 1024 ? 1 : 2)} MB
              </strong>
              <small>Browser-side analysis</small>
            </article>
            <article className={phase === "error" ? "bad" : phase === "done" ? "good" : ""}>
              <span>Pipeline</span>
              <strong>{phaseLabel(phase)}</strong>
              <small>
                {phase === "analysing"
                  ? "Report detection & identity matching"
                  : phase === "saving"
                    ? "Persisting trusted historical evidence"
                    : "Preflight → analyse → validate → persist"}
              </small>
            </article>
          </section>

          <section className="panel smart-import-review">
            <div className="panel-head">
              <div>
                <h2>Import queue</h2>
                <p>Review every file before MetrixIQ writes anything to your workspace.</p>
              </div>
              <button
                type="button"
                className="btn primary"
                onClick={run}
                disabled={busy || importableFiles.length === 0}
              >
                {phase === "analysing"
                  ? "Detecting reports…"
                  : phase === "saving"
                    ? "Saving trusted history…"
                    : `Analyse & save ${importableFiles.length} file${importableFiles.length === 1 ? "" : "s"}`}
              </button>
            </div>

            <div className="smart-file-list">
              {preflight.items.map((item) => {
                const previous = analysis?.fileResults?.find((result) => result.name === item.file.name);
                return (
                  <article key={item.fingerprint} className={`smart-file-row ${item.assessment.status}`}>
                    <span className="smart-file-type">{item.extension.toUpperCase() || "FILE"}</span>
                    <div className="smart-file-main">
                      <b>{item.file.name}</b>
                      <small>{item.sizeLabel} · {item.assessment.message}</small>
                    </div>
                    <div className="smart-file-state">
                      <span className={`smart-file-badge ${item.assessment.status}`}>
                        {item.assessment.label}
                      </span>
                      {previous && (
                        <small>{previous.reportType || statusLabel(previous.status)}</small>
                      )}
                    </div>
                    <button
                      type="button"
                      className="smart-file-remove"
                      aria-label={`Remove ${item.file.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        removeFile(item.file);
                      }}
                      disabled={busy}
                    >
                      ×
                    </button>
                  </article>
                );
              })}
            </div>

            {message && (
              <div className={`smart-import-message ${phase === "error" ? "error" : "success"}`}>
                <b>{phase === "error" ? "Import needs attention" : "Import completed"}</b>
                <span>{message}</span>
              </div>
            )}
          </section>
        </>
      )}

      {analysis && (
        <section className="smart-analysis-shell">
          <div className="smart-analysis-head">
            <div>
              <span className="page-kicker">LATEST ANALYSIS</span>
              <h2>Data readiness</h2>
              <p>How complete and trustworthy the latest imported evidence is.</p>
            </div>
            <div className={`smart-readiness ${intelligence.tone}`}>
              <strong>{intelligence.readiness}</strong>
              <span>/100</span>
              <small>{intelligence.label}</small>
            </div>
          </div>

          <section className="smart-analysis-grid">
            <article className="panel smart-analysis-summary">
              <div className="smart-result-grid">
                <div><span>Drivers</span><strong>{analysis.driverCount || 0}</strong></div>
                <div><span>Periods</span><strong>{analysis.periods?.length || 0}</strong></div>
                <div><span>TRID matches</span><strong>{analysis.matchedByTrid || 0}</strong></div>
                <div className={analysis.unmatchedDrivers ? "warn" : ""}>
                  <span>Unmatched</span><strong>{analysis.unmatchedDrivers || 0}</strong>
                </div>
              </div>

              <div className="smart-report-coverage">
                <span>Detected report coverage</span>
                <div>
                  {intelligence.reportTypes.length
                    ? intelligence.reportTypes.map((type) => <b key={type}>{type}</b>)
                    : <em>No classified report types yet</em>}
                </div>
              </div>
            </article>

            <article className="panel smart-next-actions">
              <div className="panel-head">
                <div>
                  <h2>Smart next actions</h2>
                  <p>Recommended from the latest import evidence.</p>
                </div>
              </div>
              <div className="smart-action-list">
                {intelligence.strengths.map((text) => (
                  <div key={text} className="positive"><span>✓</span><p>{text}</p></div>
                ))}
                {intelligence.actions.map((text, index) => (
                  <div key={text}><span>{String(index + 1).padStart(2, "0")}</span><p>{text}</p></div>
                ))}
              </div>
            </article>
          </section>

          <section className="panel smart-diagnostics">
            <div className="panel-head">
              <div>
                <h2>File diagnostics</h2>
                <p>Detection result and evidence extracted from every analysed report.</p>
              </div>
              <span className="panel-badge">
                {analysis.recognizedFiles || 0}/{analysis.fileResults?.length || 0} recognised
              </span>
            </div>
            <div className="table-wrap">
              <table className="data-table import-diagnostics-table">
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Detected report</th>
                    <th>Period</th>
                    <th>Rows</th>
                    <th>Status</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {(analysis.fileResults || []).map((result) => {
                    const period =
                      result.period?.key ||
                      (result.period?.weekLabel
                        ? `${result.period?.year || ""} ${result.period.weekLabel}`.trim()
                        : "—");
                    const status = result.status || "read";
                    return (
                      <tr key={result.name}>
                        <td>
                          <b>{result.name}</b>
                          <small className="history-date">{String(result.type || "").toUpperCase()}</small>
                        </td>
                        <td>{result.reportType || "Not classified"}</td>
                        <td>{period}</td>
                        <td>{result.rows ?? 0}</td>
                        <td>
                          <span className={`import-status ${status}`}>{statusLabel(status)}</span>
                        </td>
                        <td>
                          {result.error ||
                            (result.recognized
                              ? "Recognised and stored as workspace evidence"
                              : status === "unsupported"
                                ? "Unsupported file type"
                                : "File read, but no supported report structure was detected")}
                        </td>
                      </tr>
                    );
                  })}
                  {!analysis.fileResults?.length && (
                    <tr>
                      <td colSpan="6">
                        <div className="ops-mini-empty">No file diagnostics available.</div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      )}
    </>
  );
}
