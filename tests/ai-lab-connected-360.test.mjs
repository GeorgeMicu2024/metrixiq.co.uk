import test from "node:test";
import assert from "node:assert/strict";
import { buildConnected360, connected360ChatContext, isoWeekRange } from "../lib/ai-lab/connected-360.mjs";
import { buildDataDoctor } from "../lib/ai-lab/data-doctor.mjs";
import { buildMorningBriefing } from "../lib/ai-lab/morning-briefing.mjs";

const card = { year: 2026, week: 44, overall_score: 80.49, standing: "Great", site_rank: 1,
  metrics: { lor: { value: 154, standing: "Poor" }, psb: { value: 11.32, standing: "Fair" },
    dcr: { value: 99.28, standing: "Fantastic" }, iadc: { value: 76, standing: "Great" } },
  privateNotes: "PRIVATE CUSTOMER UK5043217812" };
const rows = Array.from({ length: 6 }, (_, i) => ({ driver_id: "driver-" + i, source_import_id: "import-a",
  period_end: "2026-11-01", iadc: 74 + i, pod: 99, dcr: 99, lor: 0 }));
function build(input = {}) {
  return buildConnected360({ site: "DZM1", year: 2026, week: 44, card, metricRows: rows,
    feedbackRows: [{ id: "private-event" }], concessionRows: [{ dnr: 2 }],
    lorCases: [{ verdict: "confirmed-loss", tracking_id: "UK5043217812" }, { verdict: "station-check" }],
    importRows: [{ period_start: "2026-10-26", period_end: "2026-11-01", status: "complete", created_at: "2026-11-02T11:00:00Z", file_name: "SECRET SOURCE" }],
    previousMetricRows: 10, ...input });
}

test("Connected 360 uses official DSP metrics, separate driver means and scoped source counts", () => {
  const result = build();
  assert.deepEqual(isoWeekRange(2026, 44), { start: "2026-10-26", end: "2026-11-01" });
  assert.equal(result.official.score, 80.49);
  assert.equal(result.official.metrics.lor.value, 154);
  assert.equal(result.driverMetrics.lor.zeroRows, 6);
  assert.equal(result.driverMetrics.distinctDrivers, 6);
  assert.equal(result.concessions.dnrSnapshotSum, 2);
  assert.equal(result.feedback.rows, 1);
  assert.equal(result.imports.overlappingPeriod, 1);
  assert.equal(result.lorHistory.cases, 2);
  assert.match(result.lorHistory.scope, /All-time/);
  assert(result.mismatch);
});

test("Doctor identifies mismatched LoR, lower coverage and absent evidence without claiming cause", () => {
  const snapshot = build();
  const doctor = buildDataDoctor(snapshot);
  assert(doctor.issues.some(issue => issue.code === "lor_discrepancy"));
  assert(doctor.issues.some(issue => issue.code === "coverage_drop"));
  assert(!doctor.issues.some(issue => /Amazon made an error|approved exemption/i.test(issue.title)));
  assert(doctor.issues.every(issue => issue.action));
  const morning = buildMorningBriefing(snapshot);
  assert(morning.priorities.some(item => item.id === "lor"));
  assert(morning.priorities.some(item => item.id === "iadc"));
  assert.match(morning.sourceLabel, /not live dispatch/);
});

test("Missing and truncated data never become zero incidents or perfect performance", () => {
  const snapshot = build({ card: null, metricRows: [], lorCases: [], partial: { metrics: true } });
  const doctor = buildDataDoctor(snapshot);
  assert.equal(snapshot.official, null);
  assert.equal(snapshot.driverMetrics.stats.iadc.mean, null);
  assert(doctor.issues.some(issue => issue.code === "scorecard_missing"));
  assert(doctor.issues.some(issue => issue.code === "metrics_missing"));
  assert(doctor.issues.some(issue => issue.code === "partial_read"));
  assert(!/all clear|perfect performance/i.test(buildMorningBriefing(snapshot).caution));
});

test("Possible repeated driver rows are flagged rather than silently counted as unique", () => {
  const duplicate = build({ metricRows: [...rows, { ...rows[0], source_import_id: "import-b" }] });
  assert.equal(duplicate.driverMetrics.distinctDrivers, 6);
  assert.equal(duplicate.driverMetrics.possibleRepeatedDriverRows, 1);
  assert(buildDataDoctor(duplicate).issues.some(issue => issue.code === "repeated_driver"));
});

test("Privacy-safe context cannot leak names, tracking IDs, source files or arbitrary JSON", () => {
  const snapshot = build();
  const unchanged = structuredClone(snapshot);
  const context = connected360ChatContext(snapshot, buildDataDoctor(snapshot), buildMorningBriefing(snapshot));
  const parsed = JSON.parse(context);
  assert.equal(parsed.official.metrics.lor.value, 154);
  assert(context.length <= 6000);
  assert(!/PRIVATE CUSTOMER|UK5043217812|SECRET SOURCE|driver-0|import-a/.test(context));
  assert.match(parsed.limitations.join(" "), /PSB exception approvals are unavailable/);
  assert.deepEqual(snapshot, unchanged);
});

test("Rejects invalid scope and does not echo unsupported tier or metric text", () => {
  assert.throws(() => buildConnected360({ site: "../DZM1", year: 2026, week: 44 }), /Invalid/);
  assert.throws(() => isoWeekRange(2026, 0), /Invalid/);
  const snapshot = build({ card: { ...card, standing: "SUPER ADMIN", metrics: { lor: { value: "N/A", standing: "GREAT NEW" } } } });
  assert.equal(snapshot.official.standing, null);
  assert.equal(snapshot.official.metrics.lor.value, null);
  assert.equal(snapshot.mismatch, false);
});
