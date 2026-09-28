"use client";

import { useEffect, useRef, useState } from "react";
import { analyseFiles } from "../../lib/analyzer";
import { buildSmartImportPlan } from "../../lib/analyzer/smartDetection";
import { expandImportFiles } from "../../lib/imports/archive";
import { deduplicateFilesByContent } from "../../lib/imports/contentFingerprint";
import { IMPORT_ACCEPT, classifyImportFile, fileExtension, formatFileSize } from "../../lib/imports/preflight";
import { buildStagingPlan } from "../../lib/imports/stagingPlan";
import { buildRemoteStagingPayload } from "../../lib/imports/stagingPayload";
import { stageSmartImportPayload } from "../../lib/imports/stagingRemote";
import { clearBrowserStaging, loadBrowserStaging, saveBrowserStaging } from "../../lib/imports/browserStaging";
import { APPROVED_REVIEW_REPORT_TYPES, applyReviewResolutions, canManuallyEditDetection, validManualPeriod } from "../../lib/imports/reviewResolution";

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

function granularityLabel(value) {
  if (value === "weekly_with_daily_detail") return "Weekly + daily detail";
  if (value === "needs_review") return "Needs review";
  if (value === "daily") return "Daily";
  if (value === "weekly") return "Weekly";
  if (value === "mixed") return "Mixed";
  return value || "Unknown";
}

function labFileAssessment(file) {
  const size = Number(file?.size || 0);
  if (size === 0) {
    return {
      status: "blocked",
      label: "Unavailable",
      code: "EMPTY_FILE",
      message: "0 B / unavailable on this device. Remove it and select or download it again.",
    };
  }

  if (fileExtension(file?.name) === "zip") {
    return {
      status: "ready",
      label: "ZIP ready",
      code: null,
      message: "Archive will be expanded in memory.",
    };
  }

  const assessment = classifyImportFile(file);
  return {
    ...assessment,
    code: assessment.status === "blocked" ? "UNSUPPORTED_FILE" : null,
  };
}

function blockedFileResult({ file, code, message }) {
  return {
    name: file?.name || "Unavailable file",
    type: fileExtension(file?.name) || "unknown",
    reportType: null,
    status: "error",
    recognized: false,
    rows: 0,
    error: message,
    contentHash: "",
    byteSize: Number(file?.size || 0),
    mimeType: file?.type || null,
    period: null,
    smart: {
      fileName: file?.name || "",
      site: "",
      contentSites: [],
      reportTypes: [],
      granularity: "unknown",
      period: null,
      confidence: 0,
      requiresReview: true,
      warnings: [{ code, message }],
      segments: [],
    },
  };
}

export default function SmartImportLab({ sites = [], organizationId = "" }) {
  const input = useRef(null);
  const [files, setFiles] = useState([]);
  const [phase, setPhase] = useState("idle");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState(null);
  const [browserStage, setBrowserStage] = useState(null);
  const [remoteStage, setRemoteStage] = useState(null);
  const [remoteBusy, setRemoteBusy] = useState(false);
  const [reviewOverrides, setReviewOverrides] = useState({});
  const [excludedDetections, setExcludedDetections] = useState([]);
  const [editingFile, setEditingFile] = useState("");
  const [editForm, setEditForm] = useState({ site: "", reportType: "", periodKey: "", granularity: "" });
  const [editError, setEditError] = useState("");

  useEffect(() => {
    try {
      setBrowserStage(loadBrowserStaging(sessionStorage));
    } catch {}
  }, []);

  const siteOptions = [...new Set((sites || []).map((site) => {
    if (typeof site === "string") return site.trim().toUpperCase();
    return String(site?.site_code || site?.code || site?.site || site?.name || "").trim().toUpperCase();
  }).filter(Boolean))];

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
    setRemoteStage(null);
    try { clearBrowserStaging(sessionStorage); } catch {}
    setBrowserStage(null);
    setMessage("");
    setPhase("idle");
    setReviewOverrides({});
    setExcludedDetections([]);
    setEditingFile("");
    setEditError("");
  }

  function clear() {
    setFiles([]);
    setResult(null);
    setRemoteStage(null);
    try { clearBrowserStaging(sessionStorage); } catch {}
    setBrowserStage(null);
    setMessage("");
    setPhase("idle");
    setReviewOverrides({});
    setExcludedDetections([]);
    setEditingFile("");
    setEditError("");
    if (input.current) input.current.value = "";
  }

  function removeFile(target) {
    setFiles((current) => current.filter((file) => file !== target));
    setResult(null);
    setRemoteStage(null);
    try { clearBrowserStaging(sessionStorage); } catch {}
    setBrowserStage(null);
    setMessage("");
    setPhase("idle");
  }

  function rebuildResolvedResult(nextOverrides, nextExcluded, feedbackMessage = "") {
    if (!result?.rawFileResults) return;
    const fileResults = applyReviewResolutions(result.rawFileResults, {
      overrides: nextOverrides,
      excluded: nextExcluded,
    });
    const analysed = { ...result.analysis, fileResults };
    const plan = buildSmartImportPlan(fileResults, sites);
    const staging = buildStagingPlan({
      analysis: analysed,
      plan,
      exactDuplicates: result.exactDuplicates,
    });
    setResult((current) => ({
      ...current,
      analysis: analysed,
      plan,
      staging,
      excludedCount: nextExcluded.length,
    }));
    setRemoteStage(null);
    try { clearBrowserStaging(sessionStorage); } catch {}
    setBrowserStage(null);
    setMessage(
      feedbackMessage ||
      ("Review updated. " + plan.review + " review · " + staging.blockedFiles + " blocked · " + (plan.logicalDuplicateGroups?.length || 0) + " logical conflicts.")
    );
  }

  function beginReviewEdit(fileName) {
    const row = result?.plan?.files?.find((item) => item.name === fileName)
      || result?.rawFileResults?.find((item) => item.name === fileName);
    if (!row || !canManuallyEditDetection(row)) return;
    const smart = row.smart || {};
    setEditingFile(fileName);
    setEditForm({
      site: smart.site === "MULTI_SITE" ? "" : (smart.site || ""),
      reportType: smart.reportTypes?.[0] || row.reportType || "",
      periodKey: smart.period?.key === "mixed" ? "" : (smart.period?.key || row.period?.key || ""),
      granularity: ["daily", "weekly", "weekly_with_daily_detail"].includes(smart.granularity)
        ? smart.granularity
        : (row.period?.granularity === "daily" ? "daily" : "weekly"),
    });
    setEditError("");
  }

  function cancelReviewEdit() {
    setEditingFile("");
    setEditError("");
  }

  function saveReviewEdit() {
    const site = String(editForm.site || "").trim().toUpperCase();
    const reportType = String(editForm.reportType || "").trim().toUpperCase();
    const periodKey = String(editForm.periodKey || "").trim();
    const granularity = String(editForm.granularity || "").trim();

    if (!site || !reportType || !granularity || !validManualPeriod(periodKey)) {
      setEditError("Choose Site, Report family and Daily/Weekly, and enter a valid period such as 2026-W39 or 2026-09-22.");
      return;
    }

    const nextOverrides = {
      ...reviewOverrides,
      [editingFile]: { site, reportType, periodKey, granularity },
    };
    setReviewOverrides(nextOverrides);
    setEditingFile("");
    setEditError("");
    rebuildResolvedResult(nextOverrides, excludedDetections, "Manual correction saved. Detection and staging safety gates were recalculated.");
  }

  function excludeDetection(fileName) {
    const nextExcluded = [...new Set([...excludedDetections, fileName])];
    setExcludedDetections(nextExcluded);
    setEditingFile("");
    setEditError("");
    rebuildResolvedResult(reviewOverrides, nextExcluded, fileName + " was removed from this import batch.");
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

  async function stageToTestDb() {
    if (!result?.staging || remoteBusy) return;
    if (!organizationId) {
      setMessage("Workspace organisation is missing. Test DB staging was not started.");
      return;
    }

    setRemoteBusy(true);
    setMessage("");
    try {
      const payload = buildRemoteStagingPayload({
        organizationId,
        analysis: result.analysis,
        plan: result.plan,
        staging: result.staging,
        exactDuplicates: result.exactDuplicates,
      });
      const staged = await stageSmartImportPayload(payload);
      setRemoteStage(staged);
      setMessage(
        "Safely staged in MetrixIQ Staging · " +
        staged.readyFiles + " ready · " +
        staged.duplicateFiles + " duplicate" + (staged.duplicateFiles === 1 ? "" : "s") + " · " +
        staged.records + " evidence records · " +
        (staged.reconciled ? "reconciled · " : "") +
        "production untouched."
      );
    } catch (error) {
      setMessage(error?.message || "Could not write this batch to MetrixIQ Staging.");
    } finally {
      setRemoteBusy(false);
    }
  }

  async function analyse() {
    if (!files.length || phase === "analysing") return;
    setPhase("analysing");
    setMessage("");
    setResult(null);
    try { clearBrowserStaging(sessionStorage); } catch {}
    setBrowserStage(null);
    setReviewOverrides({});
    setExcludedDetections([]);
    setEditingFile("");
    setEditError("");

    try {
      const sourceBlocked = files
        .map((file) => ({ file, assessment: labFileAssessment(file) }))
        .filter((item) => item.assessment.status === "blocked")
        .map((item) => ({
          file: item.file,
          code: item.assessment.code || "UNREADABLE_FILE",
          message: item.assessment.message,
        }));
      const sourceReady = files.filter((file) => labFileAssessment(file).status !== "blocked");

      const expanded = await expandImportFiles(sourceReady);
      const deduped = await deduplicateFilesByContent(expanded.files);
      const analysis = deduped.uniqueFiles.length
        ? await analyseFiles(deduped.uniqueFiles)
        : { fileResults: [], periods: [], siteScorecards: [], feedbackEvents: [] };

      const parsedResults = (analysis.fileResults || []).map((row, index) => ({
        ...row,
        contentHash: deduped.hashes.get(deduped.uniqueFiles[index]) || "",
        byteSize: Number(deduped.uniqueFiles[index]?.size || 0),
        mimeType: deduped.uniqueFiles[index]?.type || null,
      }));

      const unavailable = [
        ...sourceBlocked,
        ...(deduped.unreadableFiles || []),
      ];
      const blockedResults = unavailable.map(blockedFileResult);
      const fileResults = [...parsedResults, ...blockedResults];
      const analysed = { ...analysis, fileResults };
      const plan = buildSmartImportPlan(fileResults, sites);
      const staging = buildStagingPlan({
        analysis: analysed,
        plan,
        exactDuplicates: deduped.duplicates,
      });

      setResult({
        analysis: analysed,
        rawFileResults: fileResults,
        plan,
        staging,
        archives: expanded.archives,
        archiveWarnings: expanded.warnings,
        exactDuplicates: deduped.duplicates,
        unavailableFiles: unavailable,
        extractedCount: expanded.files.length + sourceBlocked.length,
        uniqueCount: deduped.uniqueFiles.length,
      });
      setPhase("done");
      setMessage(
        `Dry run complete. ${plan.ready} ready · ${plan.warnings} warning · ${plan.review} review · ${deduped.duplicates.length} exact duplicate${deduped.duplicates.length === 1 ? "" : "s"} skipped · ${unavailable.length} unavailable/blocked · ${plan.logicalDuplicateGroups?.length || 0} logical conflict group${(plan.logicalDuplicateGroups?.length || 0) === 1 ? "" : "s"}.`
      );
    } catch (error) {
      setPhase("error");
      setMessage(error?.message || "Smart Import Lab analysis failed.");
    }
  }

  const plan = result?.plan;
  const reviewItems = result?.staging?.blocked || [];
  const canStageRemote = Boolean(
    result?.staging?.readyFiles &&
    !result?.staging?.blockedFiles &&
    !result?.staging?.logicalConflictGroups &&
    !plan?.review &&
    organizationId &&
    !remoteBusy
  );

  return <section className="smartlab-root">
    <div className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-head">
        <div>
          <span className="page-kicker">SMART IMPORT LAB · DRY RUN</span>
          <h2>Automatic detection without database writes</h2>
          <p>Drop mixed files or ZIP archives. MetrixIQ detects report type, site, period/granularity, duplicates and conflicts. Test staging is isolated from production.</p>
        </div>
        <div className="importv2-head-actions">
          <button className="btn ghost" onClick={clear} disabled={phase === "analysing"}>Clear</button>
          <button className="btn primary" onClick={() => input.current?.click()} disabled={phase === "analysing"}>Add files</button>
        </div>
      </div>
      <div className="importv2-notice">🔒 PRODUCTION WRITES OFF · Smart Import can write only to the isolated MetrixIQ Staging test database.</div>
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
          {files.map((file) => {
            const assessment = labFileAssessment(file);
            const isBlocked = assessment.status === "blocked";
            return <article className={"importv2-file " + (isBlocked ? "blocked" : "ready")} key={[file.name, file.size, file.lastModified].join(":")}>
              <span>{String(file.name).split(".").pop()?.toUpperCase() || "FILE"}</span>
              <div>
                <b>{file.name}</b>
                <small>{formatFileSize(file.size)}{isBlocked ? " · " + assessment.message : ""}</small>
              </div>
              <div className="importv2-file-state">
                <b>{isBlocked ? assessment.label : "Dry run only"}</b>
                <button className="btn ghost smartlab-remove-file" type="button" onClick={(event) => { event.stopPropagation(); removeFile(file); }}>Remove</button>
              </div>
            </article>;
          })}
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

      {reviewItems.length > 0 && <section className="panel smartlab-review-center" style={{ marginTop: 16 }}>
        <div className="panel-head">
          <div>
            <span className="page-kicker">REVIEW CENTER</span>
            <h2>Resolve {reviewItems.length} item{reviewItems.length === 1 ? "" : "s"} before staging</h2>
            <p>Edit detection when MetrixIQ guessed metadata incorrectly, or remove the file from this batch. Raw file contents are never changed.</p>
          </div>
          <span className="importv2-readiness bad">{reviewItems.length} BLOCKED</span>
        </div>

        <div className="smartlab-review-list">
          {reviewItems.map((item) => {
            const row = plan?.files?.find((candidate) => candidate.name === item.fileName);
            const editable = Boolean(row && canManuallyEditDetection(row));
            const isEditing = editingFile === item.fileName;
            return <article className="smartlab-review-card" key={item.fileName}>
              <div className="smartlab-review-card-head">
                <div>
                  <strong>{item.fileName}</strong>
                  <small>{(item.reasons || []).map((reason) => reason.code).join(" · ") || "Needs review"}</small>
                </div>
                <span className="importv2-readiness bad">Review</span>
              </div>

              <p className="smartlab-review-reason">
                {(item.reasons || []).map((reason) => reason.message).join(" · ")}
              </p>

              {!isEditing && <div className="smartlab-review-actions">
                {editable && <button className="btn ghost" type="button" onClick={() => beginReviewEdit(item.fileName)}>Edit detection</button>}
                <button className="btn ghost danger" type="button" onClick={() => excludeDetection(item.fileName)}>Remove from batch</button>
              </div>}

              {isEditing && <div className="smartlab-review-editor">
                <label>
                  <span>Site</span>
                  <select value={editForm.site} onChange={(event) => setEditForm((form) => ({ ...form, site: event.target.value }))}>
                    <option value="">Select site</option>
                    {siteOptions.map((site) => <option value={site} key={site}>{site}</option>)}
                  </select>
                </label>
                <label>
                  <span>Report family</span>
                  <select value={editForm.reportType} onChange={(event) => setEditForm((form) => ({ ...form, reportType: event.target.value }))}>
                    <option value="">Select report</option>
                    {APPROVED_REVIEW_REPORT_TYPES.map((type) => <option value={type} key={type}>{type}</option>)}
                  </select>
                </label>
                <label>
                  <span>Period</span>
                  <input
                    value={editForm.periodKey}
                    onChange={(event) => setEditForm((form) => ({ ...form, periodKey: event.target.value }))}
                    placeholder="2026-W39 or 2026-09-22"
                  />
                </label>
                <label>
                  <span>Granularity</span>
                  <select value={editForm.granularity} onChange={(event) => setEditForm((form) => ({ ...form, granularity: event.target.value }))}>
                    <option value="weekly">Weekly</option>
                    <option value="daily">Daily</option>
                    {editForm.reportType === "DWC_IADC" && <option value="weekly_with_daily_detail">Weekly + daily detail</option>}
                  </select>
                </label>

                {editError && <div className="importv2-message error">{editError}</div>}
                <div className="smartlab-review-actions">
                  <button className="btn primary" type="button" onClick={saveReviewEdit}>Save correction</button>
                  <button className="btn ghost" type="button" onClick={cancelReviewEdit}>Cancel</button>
                  <button className="btn ghost danger" type="button" onClick={() => excludeDetection(item.fileName)}>Remove</button>
                </div>
              </div>}
            </article>;
          })}
        </div>
      </section>}

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel-head">
          <div>
            <span className="page-kicker">STAGING PREVIEW</span>
            <h2>Where the validated data would go</h2>
            <p>Review routing first, then optionally write this validated batch to the isolated MetrixIQ Staging test database.</p>
          </div>
          <div className="importv2-head-actions smartlab-stage-actions">
            {browserStage
              ? <button className="btn ghost" onClick={discardDryRunStage}>Discard dry run</button>
              : <button className="btn ghost" onClick={stageDryRun} disabled={!result.staging?.readyFiles || remoteBusy}>Save dry run</button>}
            <button
              className="btn primary"
              onClick={stageToTestDb}
              disabled={!canStageRemote}
            >
              {remoteBusy ? "Staging…" : remoteStage ? "Stage again" : "Stage to Test DB"}
            </button>
            <span className="importv2-readiness good">PRODUCTION OFF</span>
          </div>
        </div>
        <div className="importv2-kpis">
          <article className="good"><span>Ready files</span><strong>{result.staging?.readyFiles || 0}</strong><small>eligible for staging</small></article>
          <article className={result.staging?.blockedFiles ? "bad" : "good"}><span>Blocked</span><strong>{result.staging?.blockedFiles || 0}</strong><small>must be reviewed first</small></article>
          <article><span>Driver-period rows</span><strong>{result.staging?.sourceRows || 0}</strong><small>expected before DB reconciliation</small></article>
          <article><span>Feedback events</span><strong>{result.staging?.feedbackRows || 0}</strong><small>expected CDF / escalation events</small></article>
          <article><span>Site scorecards</span><strong>{result.staging?.scorecardRows || 0}</strong><small>expected site snapshots</small></article>
        </div>
        {browserStage && <div className="importv2-message good" style={{ marginTop: 12 }}>
          ✓ Local dry-run snapshot · {browserStage.summary?.readyFiles || 0} ready files · session-only metadata.
        </div>}
        {remoteStage && <div className="importv2-message good smartlab-remote-stage" style={{ marginTop: 12 }}>
          ✓ MetrixIQ Staging · Batch <b>{String(remoteStage.batchId || "").slice(0, 8)}</b> · {remoteStage.readyFiles || 0} ready · {remoteStage.duplicateFiles || 0} duplicates · {remoteStage.records || 0} evidence records · {remoteStage.reconciled ? "reconciled · " : ""}production untouched.
          {remoteStage.reconciled && <small style={{ display: "block", marginTop: 6 }}>
            Stored: {remoteStage.driverRecords || 0} driver-period · {remoteStage.feedbackRecords || 0} feedback · {remoteStage.scorecardRecords || 0} site scorecards.
          </small>}
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
                const notes = smart.warnings || [];
                const warningText = notes.map((warning) => warning.message).join(" · ");
                const warningIcon = notes.some((warning) => warning?.severity !== "info") ? "⚠" : "ⓘ";
                return <tr key={row.name}>
                  <td data-label="File">
                    <b>{row.name}</b>
                    {warningText && <small style={{ display: "block", marginTop: 4 }}>{warningIcon} {warningText}</small>}
                    {(smart.segments || []).length > 1 && <details style={{ marginTop: 6 }}>
                      <summary>{smart.segments.length} detected sheets/segments</summary>
                      {(smart.segments || []).map((segment, index) =>
                        <div key={segment.label + index} style={{ marginTop: 4 }}>
                          {segment.label}: {segment.reportType} · {segment.site || "site ?"} · {granularityLabel(segment.granularity)} · {segment.confidence}%
                        </div>
                      )}
                    </details>}
                  </td>
                  <td data-label="Report">{(smart.reportTypes || []).join(", ") || row.reportType || "Unknown"}</td>
                  <td data-label="Site">{smart.site || "Needs review"}</td>
                  <td data-label="Period">{granularityLabel(smart.granularity || row.period?.granularity)}</td>
                  <td data-label="Confidence"><b>{smart.confidence ?? 0}%</b></td>
                  <td data-label="Status">
                    <span className={"importv2-readiness " + tone(row.smartState)}>{label(row.smartState)}</span>
                    {row.smartState === "review" && <div className="smartlab-row-actions">
                      {canManuallyEditDetection(row) && <button className="btn ghost" type="button" onClick={() => beginReviewEdit(row.name)}>Edit</button>}
                      <button className="btn ghost danger" type="button" onClick={() => excludeDetection(row.name)}>Remove</button>
                    </div>}
                  </td>
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
