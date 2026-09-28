"use client";

import { useRef, useState } from "react";
import { analyseFiles } from "../../lib/analyzer";
import { buildSmartImportPlan } from "../../lib/analyzer/smartDetection";
import { expandImportFiles } from "../../lib/imports/archive";
import { deduplicateFilesByContent } from "../../lib/imports/contentFingerprint";
import { IMPORT_ACCEPT, formatFileSize } from "../../lib/imports/preflight";

function tone(state) {
  if (state === "ready") return "good";
  if (state === "warning") return "warn";
  return "bad";
}

function label(state) {
  if (state === "ready") return "Ready";
  if (state === "warning") return "Warning";
  return "Review";
}

export default function SmartImportLab({ sites = [] }) {
  const input = useRef(null);
  const [files, setFiles] = useState([]);
  const [phase, setPhase] = useState("idle");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState(null);

  function addFiles(incoming) {
    const next = [...files];
    const seen = new Set(next.map((file) => [file.name, file.size, file.lastModified].join(":")));
    for (const file of Array.from(incoming || [])) {
      const key = [file.name, file.size, file.lastModified].join(":");
      if (seen.has(key)) continue;
      seen.add(key);
      next.push(file);
    }
    setFiles(next);
    setResult(null);
    setMessage("");
    setPhase("idle");
  }

  function clear() {
    setFiles([]);
    setResult(null);
    setMessage("");
    setPhase("idle");
    if (input.current) input.current.value = "";
  }

  async function analyse() {
    if (!files.length || phase === "analysing") return;
    setPhase("analysing");
    setMessage("");
    setResult(null);

    try {
      const expanded = await expandImportFiles(files);
      const deduped = await deduplicateFilesByContent(expanded.files);
      const analysis = await analyseFiles(deduped.uniqueFiles);
      const plan = buildSmartImportPlan(analysis.fileResults, sites);

      setResult({
        analysis,
        plan,
        archives: expanded.archives,
        archiveWarnings: expanded.warnings,
        exactDuplicates: deduped.duplicates,
        extractedCount: expanded.files.length,
        uniqueCount: deduped.uniqueFiles.length,
      });
      setPhase("done");
      setMessage(
        `Dry run complete. ${plan.ready} ready · ${plan.warnings} warning · ${plan.review} review · ${deduped.duplicates.length} exact duplicate${deduped.duplicates.length === 1 ? "" : "s"} skipped.`
      );
    } catch (error) {
      setPhase("error");
      setMessage(error?.message || "Smart Import Lab analysis failed.");
    }
  }

  const plan = result?.plan;

  return <section className="smartlab-root">
    <div className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-head">
        <div>
          <span className="page-kicker">SMART IMPORT LAB · DRY RUN</span>
          <h2>Automatic detection without database writes</h2>
          <p>Drop mixed files or ZIP archives. MetrixIQ detects report type, site, period/granularity, content duplicates and conflicts. This lab never saves to Supabase.</p>
        </div>
        <div className="importv2-head-actions">
          <button className="btn ghost" onClick={clear} disabled={phase === "analysing"}>Clear</button>
          <button className="btn primary" onClick={() => input.current?.click()} disabled={phase === "analysing"}>Add files</button>
        </div>
      </div>
      <div className="importv2-notice">🔒 DB WRITES OFF · Existing Import Center save flow is untouched.</div>
    </div>

    <input
      ref={input}
      type="file"
      multiple
      hidden
      accept={IMPORT_ACCEPT + ",.zip"}
      onChange={(event) => {
        addFiles(event.target.files || []);
        event.target.value = "";
      }}
    />

    <div
      className="importv2-drop"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        addFiles(event.dataTransfer?.files || []);
      }}
      onClick={() => input.current?.click()}
    >
      <span>⇧</span>
      <div>
        <b>Drop reports or ZIP archives here</b>
        <p>Excel, CSV, HTML, PDF, JSON, XML, text and ZIP · mixed sites supported · SHA-256 duplicate detection</p>
      </div>
      <em>Browse</em>
    </div>

    {files.length > 0 && <>
      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel-head">
          <div>
            <h2>Lab queue</h2>
            <p>{files.length} selected source{files.length === 1 ? "" : "s"}. ZIP contents are expanded only in memory.</p>
          </div>
          <button className="btn primary" onClick={analyse} disabled={phase === "analysing"}>
            {phase === "analysing" ? "Analysing…" : "Run Smart Detection"}
          </button>
        </div>
        <div className="importv2-file-list">
          {files.map((file) => <article className="importv2-file ready" key={[file.name, file.size, file.lastModified].join(":")}>
            <span>{String(file.name).split(".").pop()?.toUpperCase() || "FILE"}</span>
            <div><b>{file.name}</b><small>{formatFileSize(file.size)}</small></div>
            <div className="importv2-file-state"><b>Dry run only</b></div>
          </article>)}
        </div>
        {message && <div className={"importv2-message " + (phase === "error" ? "error" : "good")}>{message}</div>}
      </section>
    </>}

    {plan && <>
      <section className="importv2-kpis" style={{ marginTop: 16 }}>
        <article><span>Extracted</span><strong>{result.extractedCount}</strong><small>{result.uniqueCount} unique by SHA-256</small></article>
        <article className="good"><span>Ready</span><strong>{plan.ready}</strong><small>automatic classification</small></article>
        <article className={plan.warnings ? "warn" : ""}><span>Warnings</span><strong>{plan.warnings}</strong><small>safe to inspect</small></article>
        <article className={plan.review ? "bad" : "good"}><span>Needs review</span><strong>{plan.review}</strong><small>no automatic commit</small></article>
        <article className={result.exactDuplicates.length ? "warn" : "good"}><span>Duplicates</span><strong>{result.exactDuplicates.length}</strong><small>exact content skipped</small></article>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel-head">
          <div><h2>Detection results</h2><p>Content evidence wins over filename. Conflicts are surfaced instead of guessed.</p></div>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>File</th><th>Report</th><th>Site</th><th>Period</th><th>Confidence</th><th>Status</th></tr></thead>
            <tbody>
              {plan.files.map((row) => {
                const smart = row.smart || {};
                const warningText = (smart.warnings || []).map((warning) => warning.message).join(" · ");
                return <tr key={row.name}>
                  <td>
                    <b>{row.name}</b>
                    {warningText && <small style={{ display: "block", marginTop: 4 }}>⚠ {warningText}</small>}
                    {(smart.segments || []).length > 1 && <details style={{ marginTop: 6 }}>
                      <summary>{smart.segments.length} detected sheets/segments</summary>
                      {(smart.segments || []).map((segment, index) =>
                        <div key={segment.label + index} style={{ marginTop: 4 }}>
                          {segment.label}: {segment.reportType} · {segment.site || "site ?"} · {segment.granularity} · {segment.confidence}%
                        </div>
                      )}
                    </details>}
                  </td>
                  <td>{(smart.reportTypes || []).join(", ") || row.reportType || "Unknown"}</td>
                  <td>{smart.site || "Needs review"}</td>
                  <td>{smart.granularity || row.period?.granularity || "unknown"}</td>
                  <td><b>{smart.confidence ?? 0}%</b></td>
                  <td><span className={"importv2-readiness " + tone(row.smartState)}>{label(row.smartState)}</span></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="importv2-preview-grid" style={{ marginTop: 16 }}>
        <article className="panel">
          <div className="panel-head"><div><h2>Sites detected</h2><p>No manual site selection was used.</p></div></div>
          <div className="importv2-tags">
            {Object.entries(plan.siteCounts).map(([site, count]) => <span key={site}>{site} · {count}</span>)}
            {!Object.keys(plan.siteCounts).length && <span>No site detected</span>}
          </div>
        </article>
        <article className="panel">
          <div className="panel-head"><div><h2>Report families</h2><p>Canonical Smart Import classification.</p></div></div>
          <div className="importv2-tags">
            {Object.entries(plan.reportCounts).map(([type, count]) => <span key={type}>{type} · {count}</span>)}
          </div>
        </article>
      </section>

      {result.exactDuplicates.length > 0 && <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel-head"><div><h2>Exact duplicates skipped</h2><p>Different filenames with identical bytes are detected by SHA-256.</p></div></div>
        <div className="importv2-actions-list">
          {result.exactDuplicates.map((item) => <div className="good" key={item.file.name + item.hash}>
            <b>✓</b><p>{item.file.name} = {item.duplicateOf.name}</p>
          </div>)}
        </div>
      </section>}

      {(result.archiveWarnings?.length || 0) > 0 && <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel-head"><div><h2>Archive warnings</h2></div></div>
        <div className="importv2-actions-list">
          {result.archiveWarnings.map((warning, index) => <div key={warning.code + index}><b>!</b><p>{warning.message}</p></div>)}
        </div>
      </section>}
    </>}
  </section>;
}
