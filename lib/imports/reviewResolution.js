const RESOLVABLE_WARNING_CODES = new Set([
  "SITE_CONFLICT",
  "UNKNOWN_WORKSPACE_SITE",
  "AMBIGUOUS_GRANULARITY",
  "PERIOD_NOT_VERIFIED",
  "MULTI_PERIOD_FILE",
  "MULTI_SITE_FILE",
  "LOGICAL_REPORT_CONFLICT",
  "NO_SMART_DETECTION",
]);

const HARD_BLOCK_CODES = new Set([
  "PARSE_ERROR",
  "ENCRYPTED_PDF",
  "EMPTY_FILE",
  "UNREADABLE_FILE",
  "UNSUPPORTED_FILE",
]);

export const APPROVED_REVIEW_REPORT_TYPES = Object.freeze([
  "DSP_SCORECARD",
  "DWC_IADC",
  "EMENTOR",
  "POD_QUALITY",
  "DNR_CONCESSIONS",
  "DSC_CONCESSIONS",
  "CDF",
  "CONTACT_COMPLIANCE",
  "CUSTOMER_ESCALATION",
  "OPERATIONAL_DAILY",
  "DSP_OVERVIEW",
  "QUALITY_OVERVIEW",
  "DSP_DELIVERY_OVERVIEW",
  "PHR",
  "FALSE_SCAN",
]);

export function validManualPeriod(value) {
  const period = String(value || "").trim();
  return (
    /^20\d{2}-W(?:0?[1-9]|[1-4]\d|5[0-3])$/i.test(period) ||
    /^20\d{2}-\d{2}-\d{2}$/.test(period)
  );
}

export function canManuallyEditDetection(row) {
  const warnings = row?.smart?.warnings || [];
  return !warnings.some((warning) => HARD_BLOCK_CODES.has(warning?.code));
}

export function applyReviewResolutions(fileResults = [], {
  overrides = {},
  excluded = [],
} = {}) {
  const excludedSet = new Set(excluded || []);

  return (fileResults || [])
    .filter((row) => !excludedSet.has(row?.name))
    .map((row) => {
      const override = overrides?.[row?.name];
      if (!override) return row;
      if (!canManuallyEditDetection(row)) return row;

      const site = String(override.site || "").trim().toUpperCase();
      const reportType = String(override.reportType || "").trim().toUpperCase();
      const periodKey = String(override.periodKey || "").trim();
      const granularity = String(override.granularity || "").trim();
      const baseGranularity = granularity === "weekly_with_daily_detail" ? "weekly" : granularity;

      const warnings = (row.smart?.warnings || []).filter(
        (warning) => !RESOLVABLE_WARNING_CODES.has(warning?.code)
      );
      const hardBlocked = warnings.some((warning) => HARD_BLOCK_CODES.has(warning?.code));
      const missing =
        !site ||
        !reportType ||
        !validManualPeriod(periodKey) ||
        !["daily", "weekly", "weekly_with_daily_detail"].includes(granularity);

      if (!missing && !hardBlocked) {
        warnings.push({
          code: "MANUAL_OVERRIDE",
          severity: "info",
          message: "Detection was reviewed and corrected manually before staging.",
        });
      }

      return {
        ...row,
        reportType,
        period: {
          ...(row.period || {}),
          key: periodKey || row.period?.key || null,
          granularity: baseGranularity || row.period?.granularity || null,
        },
        smart: {
          ...(row.smart || {}),
          site,
          contentSites: site ? [site] : [],
          reportTypes: reportType ? [reportType] : [],
          granularity,
          period: {
            ...(row.smart?.period || row.period || {}),
            key: periodKey || row.smart?.period?.key || row.period?.key || null,
            granularity: baseGranularity || row.smart?.period?.granularity || row.period?.granularity || null,
          },
          requiresReview: Boolean(missing || hardBlocked),
          warnings,
          manualOverride: {
            site,
            reportType,
            periodKey,
            granularity,
            reviewedAt: new Date().toISOString(),
          },
          evidence: {
            ...(row.smart?.evidence || {}),
            siteSource: "user",
            periodSource: "user",
            reportTypeSource: "user",
          },
        },
      };
    });
}
