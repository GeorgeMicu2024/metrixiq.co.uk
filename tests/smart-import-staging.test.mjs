import test from "node:test";
import assert from "node:assert/strict";

import { buildStagingPlan, stagingPlanIsCommittable } from "../lib/imports/stagingPlan.js";

function file({
  name,
  type,
  site = "DLS2",
  period = "2026-W38",
  granularity = "weekly",
  state = "ready",
  warnings = [],
  hash = "hash",
  rows = 10,
}) {
  return {
    name,
    rows,
    contentHash: hash,
    smartState: state,
    smart: {
      fileName: name,
      site,
      contentSites: site === "MULTI_SITE" ? ["DLS2", "DDN1"] : [site],
      reportTypes: [type],
      granularity,
      period: period ? { key: period, granularity } : null,
      confidence: 99,
      requiresReview: state === "review",
      warnings,
      segments: [],
    },
  };
}

test("staging routes scorecards to imports, driver metrics and site scorecards", () => {
  const plan = buildStagingPlan({
    analysis: { fileResults: [], periods: [], siteScorecards: [{}], feedbackEvents: [] },
    plan: {
      files: [file({ name: "scorecard.pdf", type: "DSP_SCORECARD" })],
      logicalDuplicateGroups: [],
    },
    exactDuplicates: [],
  });

  assert.equal(plan.readyFiles, 1);
  assert.equal(plan.blockedFiles, 0);
  assert.equal(plan.destinations.imports, 1);
  assert.equal(plan.destinations.driver_metrics, 1);
  assert.equal(plan.destinations.site_scorecards, 1);
});

test("daily eMentor routes to mentor daily snapshots instead of weekly driver metrics", () => {
  const plan = buildStagingPlan({
    analysis: { fileResults: [], periods: [], siteScorecards: [], feedbackEvents: [] },
    plan: {
      files: [file({
        name: "Driver Report_2026-09-27.xlsx",
        type: "EMENTOR",
        granularity: "daily",
        period: "2026-09-27",
      })],
      logicalDuplicateGroups: [],
    },
  });

  assert.equal(plan.destinations.imports, 1);
  assert.equal(plan.destinations.mentor_daily_snapshots, 1);
  assert.equal(plan.destinations.driver_metrics, undefined);
});

test("DNR concessions route to weekly concessions and driver metrics", () => {
  const plan = buildStagingPlan({
    analysis: { periods: [] },
    plan: {
      files: [file({ name: "dnr.xlsx", type: "DNR_CONCESSIONS" })],
      logicalDuplicateGroups: [],
    },
  });

  assert.equal(plan.destinations.imports, 1);
  assert.equal(plan.destinations.driver_metrics, 1);
  assert.equal(plan.destinations.concessions_weekly_snapshots, 1);
});

test("CDF routes feedback evidence without guessing driver metrics", () => {
  const plan = buildStagingPlan({
    analysis: { periods: [], feedbackEvents: [{}, {}] },
    plan: {
      files: [file({ name: "cdf.html", type: "CDF" })],
      logicalDuplicateGroups: [],
    },
  });

  assert.equal(plan.destinations.imports, 1);
  assert.equal(plan.destinations.feedback_events, 1);
  assert.equal(plan.destinations.driver_metrics, undefined);
  assert.equal(plan.feedbackRows, 2);
});

test("period conflicts and encrypted PDFs are blocked before staging", () => {
  const plan = buildStagingPlan({
    analysis: { periods: [] },
    plan: {
      files: [
        file({
          name: "Prime_Report.pdf",
          type: "PRIME_REPORT",
          period: null,
          state: "review",
          warnings: [{ code: "PERIOD_NOT_VERIFIED", message: "No explicit period." }],
        }),
        file({
          name: "Incentive_Rewards.pdf",
          type: "INCENTIVE_REWARDS",
          state: "review",
          warnings: [{ code: "ENCRYPTED_PDF", message: "Encrypted." }],
        }),
      ],
      logicalDuplicateGroups: [],
    },
  });

  assert.equal(plan.readyFiles, 0);
  assert.equal(plan.blockedFiles, 2);
  assert.equal(plan.destinations.imports, undefined);
  assert.ok(plan.blocked.flatMap((item) => item.reasons).some((reason) => reason.code === "ENCRYPTED_PDF"));
});

test("recognised families without approved persistence mapping stay blocked", () => {
  const plan = buildStagingPlan({
    analysis: { periods: [] },
    plan: {
      files: [file({ name: "capacity.pdf", type: "CAPACITY_RELIABILITY" })],
      logicalDuplicateGroups: [],
    },
  });

  assert.equal(plan.readyFiles, 0);
  assert.equal(plan.blockedFiles, 1);
  assert.ok(plan.blocked[0].reasons.some((reason) => reason.code === "NO_METRIC_DESTINATION"));
});

test("staging cannot be considered committable with blocked items or conflicts", () => {
  assert.equal(stagingPlanIsCommittable({
    writesEnabled: false,
    readyFiles: 3,
    blockedFiles: 0,
    logicalConflictGroups: 0,
  }), true);

  assert.equal(stagingPlanIsCommittable({
    writesEnabled: false,
    readyFiles: 3,
    blockedFiles: 1,
    logicalConflictGroups: 0,
  }), false);

  assert.equal(stagingPlanIsCommittable({
    writesEnabled: false,
    readyFiles: 3,
    blockedFiles: 0,
    logicalConflictGroups: 1,
  }), false);
});

test("dry-run staging is explicitly non-writing", () => {
  const plan = buildStagingPlan({
    analysis: { periods: [] },
    plan: {
      files: [file({ name: "pod.pdf", type: "POD_QUALITY" })],
      logicalDuplicateGroups: [],
    },
  });

  assert.equal(plan.mode, "dry_run");
  assert.equal(plan.writesEnabled, false);
});
