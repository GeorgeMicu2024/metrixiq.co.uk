import test from "node:test";
import assert from "node:assert/strict";
import { summarizeLiveData } from "../lib/ai-lab/live-summary.mjs";

test("AI live report produces only allowlisted aggregates and no private identifiers", () => {
  const report = summarizeLiveData({
    site: "DZM1", period: "W44",
    metricRows: [{ dcr: 98, pod: 99, iadc: 80, driver_name: "Private Driver", tracking_id: "UK123" }, { dcr: null, pod: 97, iadc: 90 }],
    feedbackRows: [{ feedback_l0: "Delivery location", customer: "Private Customer" }],
    concessionRows: [{ dnr: 2, driver_trid: "SECRET" }, { dnr: 0 }],
  });
  assert.equal(report.metricSummaries[0].numericRecords, 1);
  assert.equal(report.metricSummaries[1].unweightedRecordMean, 98);
  assert.equal(report.concessions.totalDnrAcrossReturnedSnapshotRows, 2);
  assert.doesNotMatch(JSON.stringify(report), /Private|UK123|SECRET/);
});

test("Missing reports are unknown rather than perfect performance or no incidents", () => {
  const report = summarizeLiveData({ site: "DLS2", period: "W43" });
  assert.equal(report.metricSummaries[0].numericRecords, 0);
  assert.equal(report.metricSummaries[0].unweightedRecordMean, undefined);
  assert.match(report.limitations.join(" "), /does not prove zero/);
});

test("Partial source data is clearly marked and week/site validation is strict", () => {
  const report = summarizeLiveData({ site: "DZM1", period: "W44:2026-10-30", truncated: { feedback: true } });
  assert.equal(report.coverage.truncated, true);
  assert.throws(() => summarizeLiveData({ site: "DZM1;DROP", period: "W44" }));
  assert.throws(() => summarizeLiveData({ site: "DZM1", period: "2026-W44" }));
});
