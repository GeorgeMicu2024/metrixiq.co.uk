"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { analyseFiles } from "../../lib/analyzer";
import { buildSmartImportPlan } from "../../lib/analyzer/smartDetection";
import { expandImportFiles } from "../../lib/imports/archive";
import { deduplicateFilesByContent } from "../../lib/imports/contentFingerprint";
import { IMPORT_ACCEPT, classifyImportFile, fileExtension, formatFileSize } from "../../lib/imports/preflight";
import { buildStagingPlan } from "../../lib/imports/stagingPlan";
import { buildRemoteStagingPayload } from "../../lib/imports/stagingPayload";
import { approveSmartImportBatch, commitSmartImportProduction, preflightSmartImportProduction, stageSmartImportPayload } from "../../lib/imports/stagingRemote";
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

export default function SmartImportLab({ sites = [], organizationId = "", onDetectedSite, onProductionCommitted }) {
  const input = useRef(null);
  const flowRef = useRef(null);
  const autoAnalyseKey = useRef("");
  const autoStageKey = useRef("");
  const [files, setFiles] = useState([]);
  const [phase, setPhase] = useState("idle");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState(null);
  const [browserStage, setBrowserStage] = useState(null);
  const [remoteStage, setRemoteStage] = useState(null);
  const [remoteBusy, setRemoteBusy] = useState(false);
  const [remoteError, setRemoteError] = useState("");
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [approvalError, setApprovalError] = useState("");
  const [approvedBatch, setApprovedBatch] = useState(null);
  const [productionPreflight, setProductionPreflight] = useState(null);
  const [productionBusy, setProductionBusy] = useState(false);
  const [productionError, setProductionError] = useState("");
  const [productionCommit, setProductionCommit] = useState(null);
  const [commitBusy, setCommitBusy] = useState(false);
  const [commitError, setCommitError] = useState("");
  const [showCommitSummary, setShowCommitSummary] = useState(false);
  const [showTechnical, setShowTechnical] = useState(false);
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

  useEffect(() => {
    setProductionCommit(null);
    setCommitError("");
  }, [approvedBatch?.batchId]);

  function syncDetectedSite(plan) {
    const detected = Object.keys(plan?.siteCounts || {}).filter((site) => /^D[A-Z]{2}\d{1,2}$/.test(String(site || "").toUpperCase()));
    if (detected.length === 1 && typeof onDetectedSite === "function") onDetectedSite(detected[0].toUpperCase());
  }

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
    setRemoteError("");
    setApprovedBatch(null);
    setProductionPreflight(null);
    setProductionError("");
    setApprovedBatch(null);
    setProductionPreflight(null);
    setProductionError("");
    try { clearBrowserStaging(sessionStorage); } catch {}
    setBrowserStage(null);
    setMessage("");
    setShowCommitSummary(false);
    setShowTechnical(false);
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
    setRemoteError("");
    setApprovedBatch(null);
    setProductionPreflight(null);
    setProductionError("");
    setApprovedBatch(null);
    setProductionPreflight(null);
    setProductionError("");
    try { clearBrowserStaging(sessionStorage); } catch {}
    setBrowserStage(null);
    setMessage("");
    setShowCommitSummary(false);
    setShowTechnical(false);
    autoAnalyseKey.current = "";
    autoStageKey.current = "";
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
    setRemoteError("");
    setApprovedBatch(null);
    setProductionPreflight(null);
    setProductionError("");
    setApprovedBatch(null);
    setProductionPreflight(null);
    setProductionError("");
    try { clearBrowserStaging(sessionStorage); } catch {}
    setBrowserStage(null);
    setMessage("");
    setShowCommitSummary(false);
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
    syncDetectedSite(plan);
    setResult((current) => ({
      ...current,
      analysis: analysed,
      plan,
      staging,
      excludedCount: nextExcluded.length,
    }));
    setRemoteStage(null);
    setRemoteError("");
    setApprovedBatch(null);
    setProductionPreflight(null);
    setProductionError("");
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
    setRemoteError("");
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
      setRemoteError("");
      setApprovedBatch(null);
      setApprovalError("");
      setProductionPreflight(null);
      setProductionError("");
      setProductionPreflight(null);
      setProductionError("");
      setMessage(
        "Safely staged in MetrixIQ Staging · " +
        staged.readyFiles + " ready · " +
        staged.duplicateFiles + " duplicate" + (staged.duplicateFiles === 1 ? "" : "s") + " · " +
        staged.records + " evidence records · " +
        (staged.reconciled ? "reconciled · " : "") +
        (staged.alreadyStaged ? "already staged · " : "") +
        "production untouched."
      );
    } catch (error) {
      const failure = error?.message || "Could not write this batch to MetrixIQ Staging.";
      setRemoteError(failure);
      setRemoteStage(null);
      setMessage(failure);
    } finally {
      setRemoteBusy(false);
    }
  }

  async function runProductionPreflight(batchId = approvedBatch?.batchId) {
    if (!batchId || productionBusy) return null;
    setProductionBusy(true);
    setProductionError("");
    setProductionPreflight(null);
    try {
      const preflight = await preflightSmartImportProduction({
        batchId,
        organizationId,
      });
      setProductionPreflight(preflight);
      setMessage(
        preflight.ready
          ? "Safety check passed. This batch is ready for the final Production import."
          : "Production safety check found blocking issues. No Production rows were changed."
      );
      return preflight;
    } catch (error) {
      setProductionError(error?.message || "Production preflight failed.");
      return null;
    } finally {
      setProductionBusy(false);
    }
  }

  async function approveStagedBatch() {
    if (!remoteStage?.batchId || approvalBusy || approvedBatch) return;
    if (!organizationId) {
      setApprovalError("Workspace organisation is missing.");
      return;
    }

    setApprovalBusy(true);
    setApprovalError("");
    try {
      const approved = await approveSmartImportBatch({
        batchId: remoteStage.batchId,
        organizationId,
      });
      setApprovedBatch(approved);
      setProductionPreflight(null);
      setProductionError("");
      setMessage("Batch approved. Running the final Production safety check automatically…");
      await runProductionPreflight(approved.batchId);
    } catch (error) {
      setApprovalError(error?.message || "Could not approve this staging batch.");
    } finally {
      setApprovalBusy(false);
    }
  }

  async function commitToProduction() {
    if (
      !approvedBatch?.batchId ||
      !productionPreflight?.ready ||
      !productionPreflight?.batchFingerprint ||
      commitBusy ||
      productionCommit?.committed
    ) return;

    setCommitBusy(true);
    setCommitError("");
    try {
      const committed = await commitSmartImportProduction({
        batchId: approvedBatch.batchId,
        organizationId,
        expectedFingerprint: productionPreflight.batchFingerprint,
      });
      setProductionCommit(committed);
      setProductionPreflight((current) => ({ ...(current || {}), ...committed }));
      setShowCommitSummary(true);
      setMessage(
        committed.alreadyCommitted
          ? "This approved batch was already committed to Production. No duplicate writes were made."
          : "Production commit completed successfully. The approved batch is now live."
      );
      if (typeof onProductionCommitted === "function") {
        await onProductionCommitted(committed);
      }
    } catch (error) {
      setCommitError(error?.message || "Production commit failed.");
    } finally {
      setCommitBusy(false);
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
      syncDetectedSite(plan);

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
  const normalizedPreview = useMemo(() => {
    if (
      !result?.staging ||
      !organizationId ||
      result.staging.blockedFiles ||
      result.staging.logicalConflictGroups ||
      !result.staging.readyFiles
    ) return null;

    try {
      return buildRemoteStagingPayload({
        organizationId,
        analysis: result.analysis,
        plan: result.plan,
        staging: result.staging,
        exactDuplicates: result.exactDuplicates,
      }).summary;
    } catch {
      return null;
    }
  }, [result, organizationId]);

  const canStageRemote = Boolean(
    result?.staging?.readyFiles &&
    !result?.staging?.blockedFiles &&
    !result?.staging?.logicalConflictGroups &&
    !plan?.review &&
    organizationId &&
    !remoteBusy &&
    !remoteStage
  );

  const fileSignature = files.map((file) => [file.name, file.size, file.lastModified].join(":")).join("|");

  useEffect(() => {
    if (!files.length || phase !== "idle" || result) return;
    if (!fileSignature || autoAnalyseKey.current === fileSignature) return;
    autoAnalyseKey.current = fileSignature;
    const timer = window.setTimeout(() => {
      analyse();
      window.setTimeout(() => flowRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [fileSignature, files.length, phase, result]);

  useEffect(() => {
    if (!canStageRemote || !result?.staging) return;
    const key = [fileSignature, result.staging.readyFiles, result.staging.sourceRows, result.staging.feedbackRows].join("|");
    if (!key || autoStageKey.current === key) return;
    autoStageKey.current = key;
    const timer = window.setTimeout(() => stageToTestDb(), 220);
    return () => window.clearTimeout(timer);
  }, [canStageRemote, fileSignature, result?.staging?.readyFiles, result?.staging?.sourceRows, result?.staging?.feedbackRows]);

  const workflowStep = productionCommit?.committed
    ? 4
    : productionPreflight?.ready
      ? 4
      : remoteStage
        ? 3
        : files.length
          ? 2
          : 1;

  const workflowStatus = productionCommit?.committed
    ? "Import complete"
    : commitBusy
      ? "Writing to Production…"
      : productionPreflight?.ready
        ? "Ready for Production"
        : productionBusy || approvalBusy
          ? "Validating safety gates…"
          : remoteBusy
            ? "Staging automatically…"
            : remoteStage
              ? "Ready for approval"
              : phase === "analysing"
                ? "Detecting reports…"
                : files.length
                  ? "Preparing batch…"
                  : "Ready for files";

  const commitSiteBreakdown = useMemo(() => {
    if (Array.isArray(productionCommit?.siteBreakdown) && productionCommit.siteBreakdown.length) {
      return productionCommit.siteBreakdown;
    }
    return Object.entries(plan?.siteCounts || {}).map(([site, count]) => ({
      site,
      files: count,
      driverMetrics: 0,
      feedbackEvents: 0,
      scorecards: 0,
      records: 0,
    }));
  }, [productionCommit, plan]);

  return <section className="smartlab-root" ref={flowRef}>
    <section className="smartlab-hero-v2">
      <div className="smartlab-hero-copy">
        <span className="page-kicker">METRIXIQ SMART IMPORT</span>
        <h2>Upload once. MetrixIQ handles the workflow.</h2>
        <p>Report type, site, period, duplicate checks and staging are detected automatically. You only step in when something needs review or before the final Production import.</p>
      </div>
      <div className={"smartlab-live-status step-" + workflowStep}>
        <span className="smartlab-live-dot"></span>
        <div><small>Current status</small><strong>{workflowStatus}</strong></div>
      </div>
    </section>

    <div className="smartlab-stepper" aria-label="Smart Import progress">
      {[
        ["1", "Upload", "Select reports"],
        ["2", "Detect", "Automatic analysis"],
        ["3", "Validate", "Staging + safety"],
        ["4", "Import", "Production"],
      ].map(([number, title, detail], index) => {
        const step = index + 1;
        const state = workflowStep > step ? "done" : workflowStep === step ? "active" : "";
        return <div className={"smartlab-step " + state} key={title}>
          <span>{workflowStep > step ? "✓" : number}</span>
          <div><strong>{title}</strong><small>{detail}</small></div>
        </div>;
      })}
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

    <section
      className={"smartlab-drop-v2 " + (files.length ? "has-files" : "")}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        addFiles(event.dataTransfer?.files || []);
      }}
      onClick={() => !files.length && input.current?.click()}
    >
      {!files.length ? <>
        <div className="smartlab-drop-icon">⇧</div>
        <div className="smartlab-drop-copy">
          <h3>Drop your operational reports here</h3>
          <p>Excel, CSV, HTML, PDF, JSON, XML, text or ZIP. Mixed sites and reporting periods are supported.</p>
        </div>
        <button className="btn primary smartlab-choose" type="button" onClick={(event) => { event.stopPropagation(); input.current?.click(); }}>Choose reports</button>
      </> : <>
        <div className="smartlab-drop-icon ready">✓</div>
        <div className="smartlab-drop-copy">
          <h3>{files.length} report{files.length === 1 ? "" : "s"} selected</h3>
          <p>{phase === "analysing" ? "Smart Detection is running automatically…" : remoteBusy ? "Validated data is being staged automatically…" : workflowStatus}</p>
        </div>
        <div className="smartlab-file-actions">
          <button className="btn ghost" type="button" onClick={(event) => { event.stopPropagation(); input.current?.click(); }} disabled={phase === "analysing" || remoteBusy}>Add more</button>
          <button className="smartlab-text-action" type="button" onClick={(event) => { event.stopPropagation(); clear(); }} disabled={phase === "analysing" || remoteBusy}>Start over</button>
        </div>
      </>}
    </section>

    {files.length > 0 && <div className="smartlab-file-summary">
      {files.slice(0, 4).map((file) => <span key={[file.name, file.size, file.lastModified].join(":")} title={file.name}>
        <b>{String(file.name).split(".").pop()?.toUpperCase() || "FILE"}</b>{file.name}
      </span>)}
      {files.length > 4 && <span className="more">+{files.length - 4} more</span>}
    </div>}

    {(message || remoteError || approvalError || productionError || commitError) && <div className={"smartlab-flow-message " + ((remoteError || approvalError || productionError || commitError || phase === "error") ? "error" : "good")}>
      <span>{remoteError || approvalError || productionError || commitError || message}</span>
      {phase === "error" && files.length > 0 && <button className="smartlab-inline-retry" type="button" onClick={analyse}>Retry detection</button>}
    </div>}

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
        <div className="panel-head smartlab-stage-head">
          <div>
            <span className="page-kicker">AUTOMATED VALIDATION</span>
            <h2>{remoteStage ? "Validated in isolated staging" : remoteBusy ? "Validating the batch…" : "Preparing safe staging"}</h2>
            <p>MetrixIQ automatically stages clean batches, reconciles normalized records and keeps Production locked until the final approval.</p>
          </div>
          <span className={"smartlab-auto-badge " + (remoteStage ? "done" : "")}>
            {remoteStage ? "✓ Staging complete" : remoteBusy ? "Working…" : "Automatic"}
          </span>
        </div>
        {remoteBusy && <div className="importv2-message" style={{ marginTop: 12 }}>
          ⏳ Sending validated batch to MetrixIQ Staging and reconciling stored records…
        </div>}
        {remoteError && <div className="importv2-message error smartlab-remote-error" style={{ marginTop: 12 }}>
          <span>✕ Staging failed: {remoteError}</span>
          <button className="smartlab-inline-retry" type="button" onClick={() => { autoStageKey.current = ""; stageToTestDb(); }} disabled={remoteBusy}>Retry staging</button>
        </div>}
        <div className="smartlab-validation-summary">
          <article><span>Files</span><strong>{result.staging?.readyFiles || 0}</strong><small>{result.staging?.blockedFiles ? result.staging.blockedFiles + " need review" : "all validated"}</small></article>
          <article><span>Evidence</span><strong>{(normalizedPreview?.normalizedDriverRecords ?? result.staging?.sourceRows ?? 0) + (normalizedPreview?.normalizedFeedbackRecords ?? result.staging?.feedbackRows ?? 0) + (normalizedPreview?.normalizedScorecardRecords ?? result.staging?.scorecardRows ?? 0)}</strong><small>normalized records</small></article>
          <article><span>Sites</span><strong>{Object.keys(plan?.siteCounts || {}).length}</strong><small>{Object.keys(plan?.siteCounts || {}).join(" · ") || "detecting"}</small></article>
        </div>
        {remoteStage && <div className="importv2-message good smartlab-remote-stage" style={{ marginTop: 12 }}>
          ✓ MetrixIQ Staging · Batch <b>{String(remoteStage.batchId || "").slice(0, 8)}</b> · {remoteStage.readyFiles || 0} ready · {remoteStage.duplicateFiles || 0} duplicates · {remoteStage.records || 0} evidence records · {remoteStage.reconciled ? "reconciled · " : ""}{remoteStage.alreadyStaged ? "already staged · " : ""}production untouched.
          {remoteStage.reconciled && <small style={{ display: "block", marginTop: 6 }}>
            Stored: {remoteStage.driverRecords || 0} driver-period · {remoteStage.feedbackRecords || 0} feedback · {remoteStage.scorecardRecords || 0} site scorecards.
          </small>}
        </div>}
        {remoteStage && <div className="smartlab-approval-card" style={{ marginTop: 12 }}>
          <div>
            <span className="page-kicker">FINAL SAFETY GATE</span>
            <h3>{productionPreflight?.ready ? "Ready for Production" : approvedBatch ? "Running Production safety check" : "Review and approve this batch"}</h3>
            <p>
              {productionPreflight?.ready
                ? "All safety checks passed. Review the totals below, then run the final Production import."
                : approvedBatch
                  ? "MetrixIQ is validating the frozen batch against Production automatically."
                  : "One approval freezes the reconciled staging batch and automatically runs the zero-write Production preflight."}
            </p>
          </div>
          <div className="smartlab-approval-actions">
            <button
              className="btn primary"
              type="button"
              onClick={approveStagedBatch}
              disabled={approvalBusy || !!approvedBatch || !remoteStage.reconciled}
            >
              {approvalBusy || productionBusy ? "Validating…" : approvedBatch ? "Approved ✓" : "Approve & validate"}
            </button>
            <span className="importv2-readiness good">{productionPreflight?.ready ? "SAFETY CHECK PASSED" : "PRODUCTION LOCKED"}</span>
          </div>
          {approvalError && <div className="importv2-message error">
            ✕ Approval failed: {approvalError}
          </div>}
          {approvedBatch && <div className="importv2-message good">
            ✓ Batch <b>{String(approvedBatch.batchId || "").slice(0, 8)}</b> approved
            {approvedBatch.approvedAt ? " · " + new Date(approvedBatch.approvedAt).toLocaleString("en-GB") : ""}
            {approvedBatch.alreadyApproved ? " · already approved" : ""} · production untouched.
          </div>}
        </div>}
        {approvedBatch && <div className="smartlab-production-preflight" style={{ marginTop: 12 }}>
          <div className="smartlab-production-head">
            <div>
              <span className="page-kicker">PRODUCTION SUMMARY</span>
              <h3>{productionPreflight?.ready ? "Everything is ready to import" : "Production safety check"}</h3>
              <p>No Production rows are written until you press the final Import button.</p>
            </div>
            {productionError && <button className="btn ghost" type="button" onClick={() => runProductionPreflight()} disabled={productionBusy}>{productionBusy ? "Retrying…" : "Retry check"}</button>}
          </div>

          {productionError && <div className="importv2-message error">
            ✕ Production preflight failed: {productionError}
          </div>}

          {productionPreflight && <div className="smartlab-production-result">
            <div className={"importv2-message " + (productionPreflight.ready ? "good" : "error")}>
              {productionPreflight.ready
                ? "✓ Production preflight passed · zero writes."
                : "✕ Production preflight blocked · zero writes."}
            </div>

            <div className="smartlab-production-grid">
              <article><span>Imports</span><strong>{productionPreflight.imports?.files || 0}</strong><small>files to register</small></article>
              <article><span>Drivers</span><strong>{productionPreflight.drivers?.toCreate || 0}</strong><small>new driver identities</small></article>
              <article><span>Driver metrics</span><strong>{productionPreflight.driverMetrics?.records || 0}</strong><small>{productionPreflight.driverMetrics?.inserts || 0} insert · {productionPreflight.driverMetrics?.updates || 0} update</small></article>
              <article><span>Feedback</span><strong>{productionPreflight.feedbackEvents?.records || 0}</strong><small>{productionPreflight.feedbackEvents?.inserts || 0} insert · {productionPreflight.feedbackEvents?.updates || 0} update</small></article>
              <article><span>Scorecards</span><strong>{productionPreflight.siteScorecards?.records || 0}</strong><small>{productionPreflight.siteScorecards?.inserts || 0} insert · {productionPreflight.siteScorecards?.updates || 0} update</small></article>
              <article><span>DNR snapshots</span><strong>{productionPreflight.concessionsWeekly?.records || 0}</strong><small>{productionPreflight.concessionsWeekly?.inserts || 0} insert · {productionPreflight.concessionsWeekly?.updates || 0} update</small></article>
              <article><span>Daily detail held</span><strong>{productionPreflight.driverMetrics?.dailyDetailSkipped || 0}</strong><small>kept out of weekly driver_metrics</small></article>
            </div>

            {(productionPreflight.invalidDriverIdentities > 0 || (productionPreflight.unsupportedTargets || []).length > 0) && <div className="importv2-message error">
              Commit blocked · invalid identities: {productionPreflight.invalidDriverIdentities || 0}
              {(productionPreflight.unsupportedTargets || []).length
                ? " · unsupported targets: " + productionPreflight.unsupportedTargets.join(", ")
                : ""}
            </div>}

            <div className="smartlab-production-actions">
              <button
                className="btn primary"
                type="button"
                onClick={commitToProduction}
                disabled={!productionPreflight.ready || commitBusy || productionCommit?.committed}
              >
                {commitBusy
                  ? "Committing…"
                  : productionCommit?.committed
                    ? "Committed ✓"
                    : "Import to Production"}
              </button>
              <span className={"importv2-readiness " + (productionCommit?.committed ? "good" : "warn")}>
                {productionCommit?.committed
                  ? "PRODUCTION COMMIT COMPLETE"
                  : "TRANSACTION + FINGERPRINT PROTECTION READY"}
              </span>
            </div>
            {commitError && <div className="importv2-message error">× {commitError}</div>}
            {productionCommit?.committed && <div className="importv2-message good">
              ✓ Production committed · {productionCommit.imports?.files || 0} imports · {productionCommit.driverMetrics?.records || 0} weekly driver metrics · {productionCommit.feedbackEvents?.records || 0} feedback events.
            </div>}
          </div>}
        </div>}

        <div className="smartlab-detail-toggle">
          <button className="smartlab-text-action" type="button" onClick={() => setShowTechnical((value) => !value)}>
            {showTechnical ? "Hide technical details" : "View technical details"}
          </button>
        </div>
        {showTechnical && <div className="importv2-preview-grid" style={{ marginTop: 10 }}>
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
        </div>}
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

      {showTechnical && <section className="panel" style={{ marginTop: 16 }}>
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
      </section>}

      {showTechnical && <section className="importv2-preview-grid" style={{ marginTop: 16 }}>
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
      </section>}

      {showTechnical && (plan.logicalDuplicateGroups?.length || 0) > 0 && <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel-head"><div><h2>Possible updated/conflicting reports</h2><p>Same site, report family and period, but different file content. Review before any future persistence step.</p></div></div>
        <div className="importv2-actions-list">
          {plan.logicalDuplicateGroups.map((group) => <div key={[group.site, group.reportType, group.periodKey].join("|")}>
            <b>!</b><p><strong>{group.site} · {group.reportType} · {group.periodKey}</strong><br/>{group.files.join(" · ")}</p>
          </div>)}
        </div>
      </section>}

      {showTechnical && result.exactDuplicates.length > 0 && <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel-head"><div><h2>Exact duplicates skipped</h2><p>Different filenames with identical bytes are detected by SHA-256.</p></div></div>
        <div className="importv2-actions-list">
          {result.exactDuplicates.map((item) => <div className="good" key={item.file.name + item.hash}>
            <b>✓</b><p>{item.file.name} = {item.duplicateOf.name}</p>
          </div>)}
        </div>
      </section>}

      {showTechnical && (result.archiveWarnings?.length || 0) > 0 && <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel-head"><div><h2>Archive warnings</h2></div></div>
        <div className="importv2-actions-list">
          {result.archiveWarnings.map((warning, index) => <div key={warning.code + index}><b>!</b><p>{warning.message}</p></div>)}
        </div>
      </section>}
    </>}

    {showCommitSummary && productionCommit?.committed && <div className="smartlab-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowCommitSummary(false); }}>
      <div className="smartlab-success-modal" role="dialog" aria-modal="true" aria-labelledby="smart-import-success-title">
        <div className="smartlab-success-icon">✓</div>
        <span className="page-kicker">IMPORT COMPLETE</span>
        <h2 id="smart-import-success-title">Data is live in MetrixIQ</h2>
        <p>The approved batch was committed successfully. Here is exactly what was processed for each detected site.</p>

        <div className="smartlab-success-totals">
          <div><span>Files</span><strong>{productionCommit.imports?.files || 0}</strong></div>
          <div><span>Driver metrics</span><strong>{productionCommit.driverMetrics?.records || 0}</strong></div>
          <div><span>Feedback</span><strong>{productionCommit.feedbackEvents?.records || 0}</strong></div>
        </div>

        <div className="smartlab-site-breakdown">
          {commitSiteBreakdown.map((item) => <article key={item.site}>
            <div><strong>{item.site}</strong><span>{item.files || 0} file{Number(item.files || 0) === 1 ? "" : "s"}</span></div>
            <div className="smartlab-site-stats">
              <span><b>{item.driverMetrics || 0}</b> metrics</span>
              <span><b>{item.feedbackEvents || 0}</b> feedback</span>
              <span><b>{item.scorecards || 0}</b> scorecards</span>
            </div>
          </article>)}
          {!commitSiteBreakdown.length && <div className="smartlab-empty-breakdown">Import completed, but no site-level breakdown was returned for this historical batch.</div>}
        </div>

        <div className="smartlab-success-actions">
          <button className="btn primary" type="button" onClick={() => setShowCommitSummary(false)}>Done</button>
          <button className="btn ghost" type="button" onClick={() => { setShowCommitSummary(false); clear(); }}>Import another batch</button>
        </div>
      </div>
    </div>}
  </section>;
}
