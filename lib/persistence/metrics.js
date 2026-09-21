import { TARGETS } from "../config/performance.js";
import { isUsablePersonName } from "../identity.js";

const ANALYSIS_VERSION = "professional-v6";

const METRIC_FIELDS = [
  "dcr",
  "pod",
  "iadc",
  "cc",
  "fico",
  "ementor",
  "mentor_score",
  "psb",
  "reattempts",
  "concessions",
  "lor",
  "delivered",
  "dnr_dpmo",
  "dsc_dpmo",
  "ce_dpmo",
  "cdf_dpmo",
  "scorecard_score",
  "tier",
];

export function numberOrNull(value) {
  return value == null || value === "" || Number.isNaN(Number(value))
    ? null
    : Number(value);
}

function unionSources(a, b) {
  return [...new Set([
    ...(Array.isArray(a) ? a : []),
    ...(Array.isArray(b) ? b : []),
  ])];
}

function confidenceFor(driver) {
  const sourceCount = Array.isArray(driver?.sources) ? driver.sources.length : 0;
  const metricCount = Object.keys(driver?.rawMetrics || {}).length;
  const identityBonus = isUsablePersonName(driver?.name) ? 10 : 0;
  return Math.min(100, 55 + sourceCount * 8 + metricCount * 3 + identityBonus);
}

export function performanceFrom(row) {
  const parts = [];

  if (row.dcr != null) {
    parts.push(Math.min(105, (Number(row.dcr) / TARGETS.dcr) * 100));
  }
  if (row.pod != null) {
    parts.push(Math.min(105, (Number(row.pod) / TARGETS.pod) * 100));
  }
  if (row.iadc != null) {
    parts.push(Math.min(105, (Number(row.iadc) / TARGETS.iadc) * 100));
  }

  const mentor = row.mentor_score ?? row.ementor ?? row.fico;
  if (mentor != null) {
    parts.push(Math.min(105, (Number(mentor) / TARGETS.mentor) * 100));
  }

  return parts.length
    ? Math.round(parts.reduce((sum, value) => sum + value, 0) / parts.length)
    : null;
}

export function riskFrom(row) {
  let points = 0;

  if (row.dcr != null && Number(row.dcr) < TARGETS.dcr) points += 2;
  if (row.pod != null && Number(row.pod) < TARGETS.pod) points += 2;
  if (row.iadc != null && Number(row.iadc) < TARGETS.iadc) points += 2;

  const mentor = row.mentor_score ?? row.ementor ?? row.fico;
  if (mentor != null && Number(mentor) < TARGETS.mentor) points += 1;

  if (row.cc != null && Number(row.cc) < TARGETS.cc) points += 1;
  if (row.concessions != null && Number(row.concessions) >= 3) points += 2;

  return points >= 4 ? "High" : points >= 2 ? "Medium" : "Low";
}

export function issueFrom(row) {
  if (row.dcr != null && Number(row.dcr) < TARGETS.dcr) {
    return `DCR below ${TARGETS.dcr.toFixed(2)}% target`;
  }
  if (row.pod != null && Number(row.pod) < TARGETS.pod) {
    return `POD below ${TARGETS.pod.toFixed(2)}% target`;
  }
  if (row.iadc != null && Number(row.iadc) < TARGETS.iadc) {
    return `IADC below ${TARGETS.iadc}% target`;
  }

  const mentor = row.mentor_score ?? row.ementor ?? row.fico;
  if (mentor != null && Number(mentor) < TARGETS.mentor) {
    return `Mentor score below ${TARGETS.mentor}`;
  }

  if (row.cc != null && Number(row.cc) < TARGETS.cc) {
    return `Contact Compliance below ${TARGETS.cc.toFixed(2)}% target`;
  }

  if (row.concessions != null && Number(row.concessions) >= 3) {
    return "Repeated concessions";
  }

  return "No active concern";
}

export function metricRowFromDriver(
  driver,
  organizationId,
  driverId,
  period,
  importIdByFile
) {
  const raw = driver.rawMetrics || {};
  const sources = Array.isArray(driver.sources)
    ? driver.sources
    : period.sourceFiles || [];
  const firstImportId =
    sources.map((name) => importIdByFile.get(name)).find(Boolean) || null;
  const mentor = numberOrNull(
    raw.mentor_score ?? driver.mentor_score ?? driver.ementor ?? driver.fico
  );

  const row = {
    organization_id: organizationId,
    driver_id: driverId,
    source_import_id: firstImportId,
    period_start: period.periodStart || null,
    period_end: period.periodEnd || null,
    week_label: period.granularity === "daily" ? `${period.weekLabel || "W"}:${period.periodEnd}` : (period.weekLabel || period.key),
    dcr: numberOrNull(raw.dcr),
    pod: numberOrNull(raw.pod),
    iadc: numberOrNull(raw.iadc),
    cc: numberOrNull(raw.cc),
    fico: mentor,
    ementor: mentor,
    mentor_score: mentor,
    psb: numberOrNull(raw.psb),
    reattempts: numberOrNull(raw.reattempts),
    concessions: numberOrNull(raw.concessions),
    lor: numberOrNull(raw.lor),
    delivered: numberOrNull(raw.delivered),
    dnr_dpmo: numberOrNull(raw.dnr_dpmo),
    dsc_dpmo: numberOrNull(raw.dsc_dpmo),
    ce_dpmo: numberOrNull(raw.ce_dpmo),
    cdf_dpmo: numberOrNull(raw.cdf_dpmo),
    scorecard_score: numberOrNull(raw.scorecard_score),
    tier: raw.tier || null,
    data_confidence: confidenceFor(driver),
    raw_data: {
      ...raw,
      dwc: raw.dwc ?? driver.dwc ?? null,
      phr: raw.phr ?? driver.phr ?? null,
      dnr: raw.dnr ?? null,
      rts: raw.rts ?? null,
      podFails: raw.podFails ?? null,
      ccFails: raw.ccFails ?? null,
      mentor: driver.details?.mentor || null,
      pod_detail: driver.details?.pod || null,
      dwc_detail: driver.details?.dwc || null,
      compliance_summary: driver.details?.complianceSummary || null,
      contact_compliance_detail: driver.details?.contactCompliance || null,
      cdf_feedback_count: driver.details?.cdfFeedbackCount ?? null,
      customer_escalation_incidents:
        driver.details?.customerEscalationIncidents ?? null,
      source_files: sources,
      metric_granularity: period.granularity || "weekly", calendar_week: period.weekLabel || null, metric_date: period.granularity === "daily" ? (period.periodEnd || null) : null, analysis_version: ANALYSIS_VERSION,
    },
  };

  row.performance = performanceFrom(row);
  row.risk = riskFrom(row);
  row.issue = issueFrom(row);

  return row;
}

export function mergeMetricRows(oldRow, freshRow) {
  const merged = {
    ...freshRow,
    source_import_id:
      freshRow.source_import_id || oldRow?.source_import_id || null,
    period_start: freshRow.period_start || oldRow?.period_start || null,
    period_end: freshRow.period_end || oldRow?.period_end || null,
    data_confidence:
      Math.max(
        numberOrNull(freshRow.data_confidence) || 0,
        numberOrNull(oldRow?.data_confidence) || 0
      ) || null,
  };

  for (const field of METRIC_FIELDS) {
    if (freshRow[field] == null) {
      merged[field] = oldRow?.[field] ?? null;
    }
  }

  const oldRaw = oldRow?.raw_data || {};
  const freshRaw = freshRow.raw_data || {};

  merged.raw_data = {
    ...oldRaw,
    ...freshRaw,
    mentor: freshRaw.mentor || oldRaw.mentor || null,
    pod_detail: freshRaw.pod_detail || oldRaw.pod_detail || null,
    source_files: unionSources(oldRaw.source_files, freshRaw.source_files),
    analysis_version: ANALYSIS_VERSION,
  };

  merged.performance = performanceFrom(merged);
  merged.risk = riskFrom(merged);
  merged.issue = issueFrom(merged);

  return merged;
}
