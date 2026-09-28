import test from "node:test";
import assert from "node:assert/strict";

import {
  APPROVED_REVIEW_REPORT_TYPES,
  applyReviewResolutions,
  canManuallyEditDetection,
  validManualPeriod,
} from "../lib/imports/reviewResolution.js";

function row({
  name = "report.xlsx",
  site = "",
  type = "GENERIC_REPORT",
  period = null,
  granularity = "unknown",
  warnings = [],
  status = "read",
} = {}) {
  return {
    name,
    status,
    reportType: type,
    smart: {
      fileName: name,
      site,
      contentSites: site ? [site] : [],
      reportTypes: [type],
      granularity,
      period,
      confidence: 55,
      requiresReview: true,
      warnings,
      segments: [],
    },
  };
}

test("manual review accepts ISO week and date periods", () => {
  assert.equal(validManualPeriod("2026-W39"), true);
  assert.equal(validManualPeriod("2026-W9"), true);
  assert.equal(validManualPeriod("2026-09-22"), true);
  assert.equal(validManualPeriod("W39"), false);
  assert.equal(validManualPeriod("2026-W99"), false);
});

test("manual review can resolve metadata-only conflicts", () => {
  const input = row({
    name: "report.xlsx",
    warnings: [
      { code: "SITE_CONFLICT", message: "content vs filename" },
      { code: "PERIOD_NOT_VERIFIED", message: "period missing" },
    ],
  });

  const [resolved] = applyReviewResolutions([input], {
    overrides: {
      "report.xlsx": {
        site: "DLS2",
        reportType: "DSP_SCORECARD",
        periodKey: "2026-W39",
        granularity: "weekly",
      },
    },
  });

  assert.equal(resolved.smart.site, "DLS2");
  assert.deepEqual(resolved.smart.reportTypes, ["DSP_SCORECARD"]);
  assert.equal(resolved.smart.period.key, "2026-W39");
  assert.equal(resolved.smart.requiresReview, false);
  assert.ok(resolved.smart.warnings.some((warning) => warning.code === "MANUAL_OVERRIDE"));
  assert.equal(resolved.smart.evidence.siteSource, "user");
});

test("manual review cannot bypass unreadable or encrypted content", () => {
  for (const code of ["PARSE_ERROR", "ENCRYPTED_PDF", "EMPTY_FILE", "UNREADABLE_FILE"]) {
    const input = row({
      warnings: [{ code, message: code }],
      status: "error",
    });
    assert.equal(canManuallyEditDetection(input), false);

    const [resolved] = applyReviewResolutions([input], {
      overrides: {
        [input.name]: {
          site: "DLS2",
          reportType: "DSP_SCORECARD",
          periodKey: "2026-W39",
          granularity: "weekly",
        },
      },
    });
    assert.equal(resolved.smart.requiresReview, true);
    assert.equal(resolved.smart.reportTypes[0], "GENERIC_REPORT");
  }
});

test("review removal excludes only the selected detection", () => {
  const rows = [
    row({ name: "keep.pdf", site: "DLS2", type: "DSP_SCORECARD", period: { key: "2026-W38" }, granularity: "weekly" }),
    row({ name: "remove.xlsx", site: "DDN1", type: "IDENTITY_MASTER", period: { key: "2026-W39" }, granularity: "weekly" }),
  ];

  const resolved = applyReviewResolutions(rows, { excluded: ["remove.xlsx"] });
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].name, "keep.pdf");
});

test("review editor only offers report families with approved staging destinations", () => {
  assert.ok(APPROVED_REVIEW_REPORT_TYPES.includes("DSP_SCORECARD"));
  assert.ok(APPROVED_REVIEW_REPORT_TYPES.includes("EMENTOR"));
  assert.ok(APPROVED_REVIEW_REPORT_TYPES.includes("DNR_CONCESSIONS"));
  assert.equal(APPROVED_REVIEW_REPORT_TYPES.includes("IDENTITY_MASTER"), false);
});
