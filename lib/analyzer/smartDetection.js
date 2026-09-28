const SITE_RE = /(?:^|[^A-Z0-9])(D[A-Z]{1,4}\d{1,3})(?=$|[^A-Z0-9])/i;

function clean(value) {
  return String(value ?? "").trim();
}

function validSite(value) {
  const match = clean(value).toUpperCase().match(/^D[A-Z]{1,4}\d{1,3}$/);
  return match ? match[0] : "";
}

function filenameSite(fileName) {
  const match = clean(fileName).toUpperCase().match(SITE_RE);
  return match ? match[1] : "";
}

function canonicalReportType(reportType, fileName = "", label = "") {
  const type = clean(reportType).toLowerCase();
  const source = `${fileName} ${label}`.toLowerCase();

  if (/mentor_alias/.test(type)) return "EMENTOR_ALIAS_MASTER";
  if (/mentor_trip|^mentor$/.test(type)) return "EMENTOR";
  if (/iadc/.test(type)) return "DWC_IADC";
  if (/contact_compliance/.test(type)) return "CONTACT_COMPLIANCE";
  if (/customer_escalation/.test(type)) return "CUSTOMER_ESCALATION";
  if (/\bcdf\b/.test(type)) return "CDF";
  if (/\bpod\b/.test(type)) return "POD_QUALITY";
  if (/scorecard/.test(type)) return "DSP_SCORECARD";
  if (/identity_master/.test(type)) return "IDENTITY_MASTER";

  if (/dsp[^a-z0-9]*overview[^a-z0-9]*dashboard/.test(source)) return "DSP_OVERVIEW";
  if (/quality[^a-z0-9]*overview/.test(source)) return "QUALITY_OVERVIEW";
  if (/dsp[^a-z0-9]*delivery[^a-z0-9]*overview/.test(source)) return "DSP_DELIVERY_OVERVIEW";
  if (/dsc[^a-z0-9]*concession/.test(source)) return "DSC_CONCESSIONS";
  if (/dnr[^a-z0-9]*investigation/.test(source)) return "DNR_INVESTIGATIONS";
  if (/concession/.test(type) || /dnr[^a-z0-9]*concession/.test(source)) return "DNR_CONCESSIONS";
  if (/false[^a-z0-9]*scan/.test(source)) return "FALSE_SCAN";
  if (/\bphr\b/.test(source)) return "PHR";
  if (/same[^a-z0-9]*day.*capacity|capacity.*same[^a-z0-9]*day/.test(source)) return "SAME_DAY_CAPACITY_RELIABILITY";
  if (/capacity[^a-z0-9]*reliability/.test(source)) return "CAPACITY_RELIABILITY";
  if (/incentive[^a-z0-9]*rewards?/.test(source)) return "INCENTIVE_REWARDS";
  if (/inactive[^a-z0-9]*da[^a-z0-9]*offboarding/.test(source)) return "INACTIVE_DA_OFFBOARDING";
  if (/prime[^a-z0-9]*report/.test(source)) return "PRIME_REPORT";
  if (/daily[^a-z0-9]*report/.test(source)) return "OPERATIONAL_DAILY";
  if (/spreadsheet|pdf/.test(type)) return "GENERIC_REPORT";
  return type ? type.toUpperCase().replace(/[^A-Z0-9]+/g, "_") : "UNKNOWN";
}

function hasExplicitPeriodToken(value) {
  const text = clean(value);
  return (
    /(?:week|wk|w)[\s_\-]*\d{1,2}/i.test(text) ||
    /(?:^|[^0-9])20\d{2}[\-_](?:w)?\d{1,2}(?![\-_]\d{1,2})/i.test(text) ||
    /(?:^|[^0-9])20\d{2}[\-_]\d{2}[\-_]\d{2}(?!\d)/i.test(text)
  );
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function detectMentorGranularity(records = []) {
  const trips = records
    .map((record) => Number(record?.details?.mentor?.totalTrips))
    .filter((value) => Number.isFinite(value) && value >= 0);

  if (!trips.length) {
    return {
      granularity: "unknown",
      confidence: 0,
      evidence: { tripSamples: 0, medianTrips: null, dailyShare: null, weeklyShare: null },
    };
  }

  const med = median(trips);
  const dailyShare = trips.filter((value) => value <= 2).length / trips.length;
  const weeklyShare = trips.filter((value) => value >= 3).length / trips.length;

  if (med <= 2 && dailyShare >= 0.75) {
    return {
      granularity: "daily",
      confidence: Math.round(Math.min(100, 82 + dailyShare * 18)),
      evidence: { tripSamples: trips.length, medianTrips: med, dailyShare, weeklyShare },
    };
  }

  if (med >= 3 && weeklyShare >= 0.7) {
    return {
      granularity: "weekly",
      confidence: Math.round(Math.min(100, 82 + weeklyShare * 18)),
      evidence: { tripSamples: trips.length, medianTrips: med, dailyShare, weeklyShare },
    };
  }

  return {
    granularity: "needs_review",
    confidence: 55,
    evidence: { tripSamples: trips.length, medianTrips: med, dailyShare, weeklyShare },
  };
}

function outputSites(output) {
  const sites = new Set();
  const add = (value) => {
    const site = validSite(value);
    if (site) sites.add(site);
  };

  add(output?.site);
  add(output?.siteScorecard?.site);
  for (const record of output?.records || []) {
    add(record?.site);
    add(record?.details?.mentor?.station);
    add(record?.details?.activitySite);
  }
  for (const identity of output?.identities || []) add(identity?.site);
  return [...sites];
}

function outputGranularity(output, fallbackPeriod, fileName = "") {
  const canonical = canonicalReportType(output?.reportType, fileName, output?.label);
  if (canonical === "EMENTOR") {
    const mentor = detectMentorGranularity(output?.records || []);
    if (mentor.granularity !== "unknown") return mentor;
  }

  const period = output?.period || fallbackPeriod || {};
  if (period.granularity === "daily" || period.granularity === "weekly") {
    return {
      granularity: period.granularity,
      confidence: 76,
      evidence: { source: "period" },
    };
  }

  if (canonical === "OPERATIONAL_DAILY") {
    return { granularity: "daily", confidence: 90, evidence: { source: "report_signature" } };
  }

  if (/DWC_IADC|CDF|CONTACT_COMPLIANCE|POD_QUALITY|DSP_SCORECARD|CUSTOMER_ESCALATION|DNR_CONCESSIONS|DSC_CONCESSIONS|PHR|FALSE_SCAN|CAPACITY_RELIABILITY|SAME_DAY_CAPACITY_RELIABILITY|DSP_OVERVIEW|DSP_DELIVERY_OVERVIEW/.test(canonical)) {
    return { granularity: "weekly", confidence: 88, evidence: { source: "report_signature" } };
  }

  return { granularity: "unknown", confidence: 0, evidence: {} };
}

function segmentDetection(output, fileName, fallbackPeriod) {
  const sites = outputSites(output);
  const fileSite = filenameSite(fileName);
  const reportType = canonicalReportType(output?.reportType, fileName, output?.label);
  const granularity = outputGranularity(output, fallbackPeriod, fileName);
  const period = output?.period || fallbackPeriod || null;
  const periodSource = output?.periodSource
    || (/iadc-daily/i.test(String(output?.reportType || "")) ? "content_section" : null)
    || (hasExplicitPeriodToken(`${fileName} ${output?.label || ""}`) ? "source_name" : "fallback_current");
  const warnings = [];

  if (sites.length > 1) warnings.push({ code: "MULTI_SITE_SEGMENT", message: "This sheet/report segment contains more than one site." });
  if (sites.length === 1 && fileSite && sites[0] !== fileSite) {
    warnings.push({
      code: "SITE_CONFLICT",
      message: `Content says ${sites[0]} but filename says ${fileSite}.`,
      contentSite: sites[0],
      filenameSite: fileSite,
    });
  }
  if (granularity.granularity === "needs_review") {
    warnings.push({ code: "AMBIGUOUS_GRANULARITY", message: "Daily/weekly pattern is ambiguous and requires review." });
  }

  const detectedSite = sites.length === 1 ? sites[0] : sites.length > 1 ? "MULTI_SITE" : fileSite || "";
  let confidence = 45;
  if (reportType !== "UNKNOWN" && reportType !== "GENERIC_REPORT") confidence += 25;
  if (sites.length === 1) confidence += 15;
  else if (fileSite) confidence += 7;
  if (granularity.confidence >= 80) confidence += 10;
  if (output?.rows > 0) confidence += 5;
  if (warnings.some((warning) => warning.code === "SITE_CONFLICT")) confidence -= 25;
  if (reportType === "GENERIC_REPORT") confidence = Math.min(confidence, 68);

  return {
    label: output?.label || "Report",
    reportType,
    parserReportType: output?.reportType || "unknown",
    rows: Number(output?.rows || 0),
    site: detectedSite,
    contentSites: sites,
    filenameSite: fileSite,
    granularity: granularity.granularity,
    period,
    periodSource,
    confidence: Math.max(0, Math.min(100, Math.round(confidence))),
    evidence: {
      siteSource: sites.length ? "content" : fileSite ? "filename" : "none",
      granularity: granularity.evidence,
    },
    warnings,
  };
}

export function buildSmartFileDetection(outputs = [], fileName = "", fallbackPeriod = {}) {
  const parsedOutputs = outputs || [];
  const fallbackType = canonicalReportType("", fileName, "");
  const detectionOutputs = parsedOutputs.length
    ? parsedOutputs
    : fallbackType !== "UNKNOWN"
      ? [{ reportType: "", label: "", rows: 0 }]
      : [];
  const segments = detectionOutputs.map((output) => segmentDetection(output, fileName, fallbackPeriod));
  const fileSite = filenameSite(fileName);
  const contentSites = [...new Set(segments.flatMap((segment) => segment.contentSites || []).filter(Boolean))];
  const reportTypes = [...new Set(segments.map((segment) => segment.reportType).filter(Boolean))];
  const granularities = [...new Set(segments.map((segment) => segment.granularity).filter((value) => value && value !== "unknown"))];
  const warnings = segments.flatMap((segment) => segment.warnings || []);
  const explicitPeriods = segments.filter((segment) => segment.periodSource !== "fallback_current" && segment.period?.key);
  const explicitPeriodKeys = [...new Set(explicitPeriods.map((segment) => segment.period.key))];

  let site = "";
  if (contentSites.length === 1) site = contentSites[0];
  else if (contentSites.length > 1) site = "MULTI_SITE";
  else site = fileSite;

  if (contentSites.length === 1 && fileSite && contentSites[0] !== fileSite && !warnings.some((warning) => warning.code === "SITE_CONFLICT")) {
    warnings.push({
      code: "SITE_CONFLICT",
      message: `Content says ${contentSites[0]} but filename says ${fileSite}.`,
      contentSite: contentSites[0],
      filenameSite: fileSite,
    });
  }

  const granularity = granularities.length === 1
    ? granularities[0]
    : granularities.length > 1
      ? "mixed"
      : fallbackPeriod?.granularity || "unknown";

  if (granularity === "mixed") warnings.push({ code: "MIXED_GRANULARITY", message: "This file contains more than one reporting granularity." });
  if (site === "MULTI_SITE") warnings.push({ code: "MULTI_SITE_FILE", message: "This workbook contains data for multiple sites; import must be segmented by sheet/report." });
  if (explicitPeriodKeys.length > 1) warnings.push({ code: "MULTI_PERIOD_FILE", message: "This file contains multiple reporting periods and must be segmented before persistence." });

  const confidences = segments.map((segment) => segment.confidence).filter(Number.isFinite);
  const confidence = confidences.length
    ? Math.round(confidences.reduce((sum, value) => sum + value, 0) / confidences.length)
    : 20;

  const timeBoundTypes = reportTypes.filter((type) => !["IDENTITY_MASTER", "EMENTOR_ALIAS_MASTER"].includes(type));
  const hasExplicitPeriod = explicitPeriodKeys.length > 0 || hasExplicitPeriodToken(fileName);
  if (timeBoundTypes.length && !hasExplicitPeriod) {
    warnings.push({ code: "PERIOD_NOT_VERIFIED", message: "No explicit report date/week was found; the current week fallback must not be persisted." });
  }

  const requiresReview =
    !segments.length ||
    !site ||
    granularity === "unknown" ||
    warnings.some((warning) => ["SITE_CONFLICT", "AMBIGUOUS_GRANULARITY", "PERIOD_NOT_VERIFIED"].includes(warning.code)) ||
    reportTypes.includes("UNKNOWN") ||
    reportTypes.includes("GENERIC_REPORT");

  const resolvedPeriod = explicitPeriodKeys.length === 1
    ? explicitPeriods.find((segment) => segment.period?.key === explicitPeriodKeys[0])?.period || fallbackPeriod || null
    : explicitPeriodKeys.length > 1
      ? { key: "mixed", granularity: "mixed" }
      : fallbackPeriod || null;

  return {
    fileName,
    site,
    filenameSite: fileSite,
    contentSites,
    reportTypes,
    granularity,
    period: resolvedPeriod,
    confidence,
    requiresReview,
    warnings,
    segments,
  };
}

export function buildSmartImportPlan(fileResults = [], knownSites = []) {
  const known = new Set((knownSites || []).map(validSite).filter(Boolean));

  let files = (fileResults || []).map((result) => {
    const smart = result?.smart || {
      fileName: result?.name || "",
      site: "",
      contentSites: [],
      reportTypes: [],
      granularity: "unknown",
      confidence: 0,
      requiresReview: true,
      warnings: [{ code: "NO_SMART_DETECTION", message: "No smart detection metadata is available." }],
      segments: [],
    };

    const extraWarnings = [...(smart.warnings || [])];
    const detectedSites = smart.site === "MULTI_SITE"
      ? smart.contentSites || []
      : [smart.site].filter(Boolean);

    if (known.size) {
      for (const site of detectedSites) {
        const normalized = validSite(site);
        if (normalized && !known.has(normalized)) {
          extraWarnings.push({
            code: "UNKNOWN_WORKSPACE_SITE",
            message: `${normalized} is not registered in this workspace.`,
            site: normalized,
          });
        }
      }
    }

    const reviewCodes = new Set(["SITE_CONFLICT", "UNKNOWN_WORKSPACE_SITE", "AMBIGUOUS_GRANULARITY", "PARSE_ERROR", "ENCRYPTED_PDF"]);
    const state = smart.requiresReview || extraWarnings.some((warning) => reviewCodes.has(warning.code))
      ? "review"
      : extraWarnings.length
        ? "warning"
        : "ready";

    return {
      ...result,
      smart: { ...smart, warnings: extraWarnings },
      smartState: state,
    };
  });

  // Exact byte duplicates are removed before analysis. At this stage, the same
  // site/report/period with different hashes is a possible revised/conflicting report.
  const logicalGroups = new Map();
  files.forEach((result, index) => {
    const smart = result.smart || {};
    const periodKey = smart.period?.key || result.period?.key || "";
    if (
      !periodKey ||
      !smart.site ||
      smart.site === "MULTI_SITE" ||
      (smart.reportTypes || []).length !== 1
    ) return;
    const key = [smart.site, smart.reportTypes[0], periodKey].join("|");
    if (!logicalGroups.has(key)) logicalGroups.set(key, []);
    logicalGroups.get(key).push(index);
  });

  const logicalDuplicateGroups = [];
  for (const [key, indexes] of logicalGroups.entries()) {
    if (indexes.length < 2) continue;
    const hashes = new Set(indexes.map((index) => files[index]?.contentHash).filter(Boolean));
    // If hashes are unavailable, still surface the collision. Exact duplicates
    // should normally already be gone by this point.
    if (hashes.size === 1 && hashes.size > 0) continue;

    const [site, reportType, periodKey] = key.split("|");
    logicalDuplicateGroups.push({
      site,
      reportType,
      periodKey,
      files: indexes.map((index) => files[index]?.name).filter(Boolean),
    });

    for (const index of indexes) {
      const current = files[index];
      files[index] = {
        ...current,
        smartState: "review",
        smart: {
          ...current.smart,
          requiresReview: true,
          warnings: [
            ...(current.smart?.warnings || []),
            {
              code: "LOGICAL_REPORT_CONFLICT",
              message: `Another file has the same ${site} · ${reportType} · ${periodKey} identity but different content.`,
            },
          ],
        },
      };
    }
  }

  const siteCounts = new Map();
  const reportCounts = new Map();
  let ready = 0;
  let warnings = 0;
  let review = 0;

  for (const result of files) {
    if (result.smartState === "ready") ready += 1;
    else if (result.smartState === "warning") warnings += 1;
    else review += 1;

    const smart = result.smart || {};
    const detectedSites = smart.site === "MULTI_SITE" ? smart.contentSites || [] : [smart.site];
    for (const site of detectedSites.filter(Boolean)) siteCounts.set(site, (siteCounts.get(site) || 0) + 1);
    for (const type of smart.reportTypes || []) reportCounts.set(type, (reportCounts.get(type) || 0) + 1);
  }

  return {
    files,
    total: files.length,
    ready,
    warnings,
    review,
    siteCounts: Object.fromEntries([...siteCounts.entries()].sort()),
    reportCounts: Object.fromEntries([...reportCounts.entries()].sort()),
    logicalDuplicateGroups,
  };
}
