import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDriverFeedback,
  collectFeedbackPeriods,
  driverFeedbackIssues,
  isDriverScorecardCohortRow,
  scorecardTier,
} from "../lib/scorecards/driverFeedback.js";

const base = {
  driver_id: "driver-a",
  site: "DZM1",
  week_label: "W43",
  period_end: "2026-10-25",
  drivers: { id: "driver-a", trid: "TRID-A", full_name: "George Example", site: "DLS2" },
  raw_data: { source_files: ["UK-DCSL-DZM1-W43-DSP-Scorecard.pdf"] },
  fico: 850,
  dcr: 100,
  dsc_dpmo: 0,
  lor: 0,
  pod: 100,
  cc: 100,
  ce_dpmo: 0,
  cdf_dpmo: 0,
  psb: 0,
  concessions: 0,
};

test("scorecard feedback uses the same evidence-based site cohort", () => {
  assert.equal(isDriverScorecardCohortRow(base), true);
  assert.equal(isDriverScorecardCohortRow({
    ...base, raw_data: { source_files: ["DZM1-POD-W43.xlsx"] },
  }), false);
  assert.equal(isDriverScorecardCohortRow({
    ...base, raw_data: { source_files: ["UK-DCSL-DLS2-W43-DSP-Scorecard.pdf"] },
  }), false);
});

test("official activity site wins over the driver's historical site", () => {
  const periods = collectFeedbackPeriods([base], "DZM1", ["DZM1"]);
  assert.equal(periods.length, 1);
  assert.equal(periods[0].site, "DZM1");
  assert.equal(periods[0].rows[0].drivers.site, "DLS2");
  assert.equal(collectFeedbackPeriods([base], "DLS2", ["DLS2"]).length, 0);
  assert.equal(collectFeedbackPeriods([base], "all", ["DXM3"]).length, 0);
});

test("feedback generates one message per driver and prefers fuller records", () => {
  const partial = {
    ...base,
    fico: 770,
    dcr: null,
    dsc_dpmo: null,
    pod: null,
    cc: null,
    ce_dpmo: null,
    cdf_dpmo: null,
    psb: null,
    lor: null,
  };
  const result = collectFeedbackPeriods([partial, base, { ...base, driver_id: "driver-b",
    drivers: { id: "driver-b", trid: "TRID-B", full_name: "Alex Example" } }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].rows.length, 2);
  assert.equal(result[0].rows.find((row) => row.driver_id === "driver-a").fico, 850);
});

test("excellent drivers get positive feedback without invented failures", () => {
  const feedback = buildDriverFeedback(base, { site: "DZM1", weekLabel: "W43" });
  assert.equal(feedback.score, 100);
  assert.equal(scorecardTier(feedback.score).label, "Fantastic Plus");
  assert.equal(feedback.issues.length, 0);
  assert.match(feedback.message, /Hi George/);
  assert.match(feedback.message, /Good work/);
});

test("poor scorecard metrics produce specific actionable messages", () => {
  const row = { ...base, fico: 788, dcr: 98.8, pod: 98.5, cc: 75, concessions: 2 };
  const issues = driverFeedbackIssues(row);
  assert.ok(issues.some((item) => item.key === "fico"));
  assert.ok(issues.some((item) => item.key === "dcr"));
  assert.ok(issues.some((item) => item.key === "pod"));
  assert.ok(issues.some((item) => item.key === "cc"));
  assert.ok(issues.some((item) => item.key === "concessions"));
  const concise = buildDriverFeedback(row);
  const detailed = buildDriverFeedback(row, { detail: "detailed", tone: "firm" });
  assert.match(concise.message, /Action:/);
  assert.match(detailed.message, /Concessions|concession/);
  assert.match(detailed.message, /Please take these points seriously/);
  assert.ok(detailed.message.length > concise.message.length);
  assert.doesNotMatch(concise.message, /you were speeding/i);
});

test("N/A metrics are not blamed on drivers", () => {
  const row = { ...base, fico: "-", cc: "-", concessions: 0 };
  const issues = driverFeedbackIssues(row);
  assert.equal(issues.some((item) => item.key === "fico"), false);
  assert.equal(issues.some((item) => item.key === "cc"), false);
  const text = buildDriverFeedback(row).message;
  assert.doesNotMatch(text, /FICO —/);
});

test("missing scores request data review, not an accusation", () => {
  const empty = { ...base, fico: null, dcr: null, dsc_dpmo: null, lor: null,
    pod: null, cc: null, ce_dpmo: null, cdf_dpmo: null, psb: null,
    concessions: 0 };
  const feedback = buildDriverFeedback(empty);
  assert.equal(feedback.score, null);
  assert.match(feedback.message, /insufficient data/);
  assert.doesNotMatch(feedback.message, /These areas need to improve/);
});
