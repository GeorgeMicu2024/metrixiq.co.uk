const DESTINATIONS = Object.freeze({
  importAudit: "imports",
  driverMetrics: "driver_metrics",
  siteScorecards: "site_scorecards",
  feedbackEvents: "feedback_events",
  mentorDaily: "mentor_daily_snapshots",
  concessions: "concessions_weekly_snapshots",
  unmatched: "unmatched_driver_records",
});

function canonical(value) {
  return String(value || "").trim().toUpperCase();
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function destinationsForType(type, granularity) {
  const report = canonical(type);
  const targets = [DESTINATIONS.importAudit];

  if (report === "EMENTOR" && granularity === "daily") {
    targets.push(DESTINATIONS.mentorDaily);
    return targets;
  }

  if ([
    "DSP_SCORECARD",
    "DSP_OVERVIEW",
    "QUALITY_OVERVIEW",
    "DWC_IADC",
    "CONTACT_COMPLIANCE",
    "POD_QUALITY",
    "DNR_CONCESSIONS",
    "DSC_CONCESSIONS",
    "PHR",
    "FALSE_SCAN",
    "OPERATIONAL_DAILY",
    "EMENTOR",
  ].includes(report)) {
    targets.push(DESTINATIONS.driverMetrics);
  }

  if (report === "DSP_SCORECARD") {
    targets.push(DESTINATIONS.siteScorecards);
  }

  if (report === "CDF" || report === "CUSTOMER_ESCALATION") {
    targets.push(DESTINATIONS.feedbackEvents);
  }

  if (report === "DNR_CONCESSIONS") {
    targets.push(DESTINATIONS.concessions);
  }

  return unique(targets);
}

function filePeriodKey(file) {
  return file?.smart?.period?.key || file?.period?.key || null;
}

function fileSites(file) {
  const smart = file?.smart || {};
  if (smart.site === "MULTI_SITE") return unique(smart.contentSites || []);
  return smart.site ? [smart.site] : [];
}

function blockingWarnings(file) {
  const codes = new Set([
    "SITE_CONFLICT",
    "UNKNOWN_WORKSPACE_SITE",
    "AMBIGUOUS_GRANULARITY",
    "PERIOD_NOT_VERIFIED",
    "PARSE_ERROR",
    "ENCRYPTED_PDF",
    "LOGICAL_REPORT_CONFLICT",
    "NO_SMART_DETECTION",
  ]);
  return (file?.smart?.warnings || []).filter((warning) => codes.has(warning.code));
}

export function buildStagingPlan({
  analysis,
  plan,
  exactDuplicates = [],
} = {}) {
  const files = plan?.files || analysis?.fileResults || [];
  const stagedFiles = [];
  const blockedFiles = [];
  const destinationCounts = new Map();

  for (const file of files) {
    const smart = file.smart || {};
    const warnings = blockingWarnings(file);
    const reportTypes = unique(smart.reportTypes || []);
    const sites = fileSites(file);
    const periodKey = filePeriodKey(file);
    const granularity = smart.granularity || file?.period?.granularity || "unknown";
    const targets = unique(reportTypes.flatMap((type) => destinationsForType(type, granularity)));
    const reasons = warnings.map((warning) => ({
      code: warning.code,
      message: warning.message,
    }));

    if (!reportTypes.length) {
      reasons.push({ code: "REPORT_TYPE_MISSING", message: "No canonical report family was detected." });
    }
    if (!sites.length) {
      reasons.push({ code: "SITE_MISSING", message: "No site could be verified." });
    }
    if (!periodKey && !reportTypes.every((type) => ["IDENTITY_MASTER", "EMENTOR_ALIAS_MASTER"].includes(type))) {
      reasons.push({ code: "PERIOD_MISSING", message: "No verified reporting period is available." });
    }
    if (targets.length === 1 && targets[0] === DESTINATIONS.importAudit) {
      reasons.push({ code: "NO_METRIC_DESTINATION", message: "This report is recognised but has no approved metric destination yet." });
    }

    const item = {
      fileName: file.name || smart.fileName || "",
      contentHash: file.contentHash || "",
      reportTypes,
      sites,
      periodKey,
      granularity,
      confidence: Number(smart.confidence || 0),
      targets,
      rows: Number(file.rows || 0),
      reasons,
    };

    if (reasons.length || file.smartState === "review") {
      blockedFiles.push(item);
      continue;
    }

    stagedFiles.push(item);
    for (const target of targets) {
      destinationCounts.set(target, (destinationCounts.get(target) || 0) + 1);
    }
  }

  const sourceRows = (analysis?.periods || []).reduce(
    (sum, period) => sum + Number(period?.drivers?.length || 0),
    0
  );

  const feedbackRows = Number(analysis?.feedbackEvents?.length || 0);
  const scorecardRows = Number(analysis?.siteScorecards?.length || 0);

  return {
    mode: "dry_run",
    writesEnabled: false,
    totalFiles: files.length,
    readyFiles: stagedFiles.length,
    blockedFiles: blockedFiles.length,
    exactDuplicatesSkipped: exactDuplicates.length,
    logicalConflictGroups: Number(plan?.logicalDuplicateGroups?.length || 0),
    sourceRows,
    feedbackRows,
    scorecardRows,
    destinations: Object.fromEntries([...destinationCounts.entries()].sort()),
    files: stagedFiles,
    blocked: blockedFiles,
  };
}

export function stagingPlanIsCommittable(staging) {
  return Boolean(
    staging &&
    staging.writesEnabled === false &&
    staging.readyFiles > 0 &&
    staging.blockedFiles === 0 &&
    staging.logicalConflictGroups === 0
  );
}

export { DESTINATIONS };
