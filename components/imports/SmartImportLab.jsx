"use client";

import { useEffect, useRef, useState } from "react";
import { analyseFiles } from "../../lib/analyzer";
import { buildSmartImportPlan } from "../../lib/analyzer/smartDetection";
import { expandImportFiles } from "../../lib/imports/archive";
import { deduplicateFilesByContent } from "../../lib/imports/contentFingerprint";
import { IMPORT_ACCEPT, formatFileSize } from "../../lib/imports/preflight";
import { buildStagingPlan } from "../../lib/imports/stagingPlan";
import { clearBrowserStaging, loadBrowserStaging, saveBrowserStaging } from "../../lib/imports/browserStaging";

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
  const [browserStage, setBrowserStage] = useState(null);

  useEffect(() => {
    try {
      setBrowserStage(loadBrowserStaging(sessionStorage));
    } catch {}
  }, []);

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

  function stageDryRun() {
    if (!result?.staging) return;
    try {
      const snapshot = saveBrowserStaging(sessionStorage, result.staging);
      setBrowserStage(snapshot);
      setMessage("Dry-run staging snapshot created in this browser session. No Supabase writes were made.");
    } catch (error) {
      setMessage(error?.message || "Could not create browser staging snapshot.");
    }
  }

  function discardDryRunStage() {
    try { clearBrowserStaging(sessionStorage); } catch {}
    setBrowserStage(null);
    setMessage("Dry-run staging snapshot discarded. No database data was changed.");
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
      const fileResults = (analysis.fileResults || []).map((row, index) => ({
        ...row,
        contentHash: deduped.hashes.get(deduped.uniqueFiles[index]) || "",
      }));
      const analysed = { ...analysis, fileResults };
      const plan = buildSmartImportPlan(fileResults, sites);
      const staging = buildStagingPlan({
        analysis: analysed,
        plan,
        exactDuplicates: deduped.duplicates,
      });

      setResult({
        analysis: analysed,
        plan,
        staging,
        archives: expanded.archives,
        archiveWarnings: expanded.warnings,
        exactDuplicates: deduped.duplicates,
        extractedCount: expanded.files.length,
        uniqueCount: deduped.uniqueFiles.length,
      });
      setPhase("done");
      setMessage(
        `Dry run complete. ${plan.ready} ready · ${plan.warnings} warning · ${plan.review} review · ${deduped.duplicates.length} exact duplicate${deduped.duplicates.length === 1 ? "" : "s"} skipped · ${plan.logicalDuplicateGroups?.length || 0} logical conflict group${(plan.logicalDuplicateGroups?.length || 0) === 1 ? "" : "s"}.`
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
        <article className={result.exactDuplicates.length ? "warn" : "good"}><span>Exact duplicates</span><strong>{result.exactDuplicates.length}</strong><small>SHA-256 matches skipped</small></article>
        <article className={plan.logicalDuplicateGroups?.length ? "bad" : "good"}><span>Logical conflicts</span><strong>{plan.logicalDuplicateGroups?.length || 0}</strong><small>same site/report/period, changed bytes</small></article>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel-head">
          <div>
            <span className="page-kicker">STAGING PREVIEW</span>
            <h2>Where the validated data would go</h2>
            <p>This is a routing simulation only. No rows are inserted, updated or deleted.</p>
          </div>
          <div className="importv2-head-actions">
            {browserStage
              ? <button className="btn ghost" onClick={discardDryRunStage}>Discard stage</button>
              : <button className="btn primary" onClick={stageDryRun} disabled={!result.staging?.readyFiles}>Stage Dry Run</button>}
            <span className="importv2-readiness good">DB WRITES OFF</span>
          </div>
        </div>
        <div className="importv2-kpis">
          <article className="good"><span>Ready files</span><strong>{result.staging?.readyFiles || 0}</strong><small>eligible for staging</small></article>
          <article className={result.staging?.blockedFiles ? "bad" : "good"}><span>Blocked</span><strong>{result.staging?.blockedFiles || 0}</strong><small>must be reviewed first</small></article>
          <article><span>Source rows</span><strong>{result.staging?.sourceRows || 0}</strong><small>driver-period evidence</small></article>
          <article><span>Feedback rows</span><strong>{result.staging?.feedbackRows || 0}</strong><small>CDF / escalation evidence</small></article>
          <article><span>Site scorecards</span><strong>{result.staging?.scorecardRows || 0}</strong><small>detected site snapshots</small></article>
        </div>
        {browserStage && <div className="importv2-message good" style={{ marginTop: 12 }}>
          ✓ Dry-run staged at {new Date(browserStage.createdAt).toLocaleString("en-GB")} · {browserStage.summary?.readyFiles || 0} ready files · session-only metadata · no DB writes.
        </div>}
        <div className="importv2-preview-grid" style={{ marginTop: 14 }}>
          <article>
            <h3>Approved destinations</h3>
            <div className="importv2-tags">
              {Object.entries(result.staging?.destinations || {}).map(([target, count]) => <span key={target}>{target} · {count}</span>)}
              {!Object.keys(result.staging?.destinations || {}).length && <span>No destination is safe yet</span>}
            </div>
          </article>
          <article>
            <h3>Safety gate</h3>
            <p>
              Exact duplicates: <b>{result.staging?.exactDuplicatesSkipped || 0}</b> ·
              Logical conflict groups: <b>{result.staging?.logicalConflictGroups || 0}</b> ·
              Blocked files: <b>{result.staging?.blockedFiles || 0}</b>
            </p>
          </article>
        </div>
      </section>

      {(result.staging?.blocked?.length || 0) > 0 && <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel-head">
          <div><h2>Blocked before staging</h2><p>These items would not be allowed to write anywhere until the issue is resolved.</p></div>
        </div>
        <div className="importv2-actions-list">
          {result.staging.blocked.map((item) => <div key={item.fileName}>
            <b>!</b>
            <p>
              <strong>{item.fileName}</strong><br/>
              {(item.reasons || []).map((reason) => reason.code + ": " + reason.message).join(" · ")}
            </p>
          </div>)}
        </div>
      </section>}

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel-head">
          <div><h2>Detection results</h2><p>Content evidence wins over filename. Conflicts are surfaced instead of guessed.</p></div>
        </div>
        <div className="table-wrap smartlab-detection-wrap">
          <table className="data-table smartlab-detection-table">
            <thead><tr><th>File</th><th>Report</th><th>Site</th><th>Period</th><th>Confidence</th><th>Status</th></tr></thead>
            <tbody>
              {plan.files.map((row) => {
                const smart = row.smart || {};
                const warningText = (smart.warnings || []).map((warning) => warning.message).join(" · ");
                return <tr key={row.name}>
                  <td data-label="File">
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
                  <td data-label="Report">{(smart.reportTypes || []).join(", ") || row.reportType || "Unknown"}</td>
                  <td data-label="Site">{smart.site || "Needs review"}</td>
                  <td data-label="Period">{smart.granularity || row.period?.granularity || "unknown"}</td>
                  <td data-label="Confidence"><b>{smart.confidence ?? 0}%</b></td>
                  <td data-label="Status"><span className={"importv2-readiness " + tone(row.smartState)}>{label(row.smartState)}</span></td>
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

      {(plan.logicalDuplicateGroups?.length || 0) > 0 && <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel-head"><div><h2>Possible updated/conflicting reports</h2><p>Same site, report family and period, but different file content. Review before any future persistence step.</p></div></div>
        <div className="importv2-actions-list">
          {plan.logicalDuplicateGroups.map((group) => <div key={[group.site, group.reportType, group.periodKey].join("|")}>
            <b>!</b><p><strong>{group.site} · {group.reportType} · {group.periodKey}</strong><br/>{group.files.join(" · ")}</p>
          </div>)}
        </div>
      </section>}

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
