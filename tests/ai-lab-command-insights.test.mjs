import test from "node:test";
import assert from "node:assert/strict";
import { buildDailyBriefing, detectPerformanceSignals, compareReportPeriods, buildCommandInsights } from "../lib/ai-lab/command-insights.mjs";

function report(period, overrides = {}) {
  return {
    site: "DZM1", period,
    coverage: { metricRecords: 25, feedbackEvents: 4, concessionSnapshotRecords: 2, truncated: false },
    metricSummaries: [
      ["DCR", "percent", 98.2], ["POD", "percent", 96.5], ["IADC", "percent", 73.4],
      ["CDF DPMO", "DPMO", 220], ["Concessions (metric record)", "count", 1.5],
    ].map(([metric, unit, mean]) => ({ metric, unit, numericRecords: 25, unweightedRecordMean: mean })),
    customerFeedback: { records: 4, categories: [{ category: "DELIVERY ISSUE", records: 4 }] },
    concessions: { totalDnrAcrossReturnedSnapshotRows: 5 },
    ...overrides,
  };
}

test("daily briefing uses actual aggregate metric values and explicitly warns about coverage", () => {
  const result = buildDailyBriefing(report("W44"));
  assert.ok(result.alerts.some(alert => alert.code === "iadc_below_80"));
  assert.equal(result.metrics.find(metric => metric.label === "IADC").mean, 73.4);
  assert.match(result.caveat, /not verified today's live/);
  assert.ok(result.nextActions.length);
});

test("detective labels relationships as hypotheses, never facts", () => {
  const result = detectPerformanceSignals(report("W44"));
  assert.ok(result.signals.some(signal => signal.code === "iadc_cdf"));
  assert.ok(result.signals.every(signal => /Possible connection only/.test(signal.caveat)));
});

test("trend comparison preserves units, counts and arithmetic direction", () => {
  const current = report("W44");
  const previous = report("W43", { metricSummaries: report("W43").metricSummaries.map(row =>
    row.metric === "IADC" ? { ...row, unweightedRecordMean: 82 } : row) });
  const trend = compareReportPeriods(current, previous);
  const iadc = trend.changes.find(row => row.label === "IADC");
  assert.equal(iadc.delta, -8.6);
  assert.equal(iadc.unit, "percent");
  assert.equal(iadc.diagnosticDirection, "unfavourable");
  assert.ok(trend.warnings.some(message => /unweighted/.test(message)));
});

test("missing metrics do not become numeric zero or fake trends", () => {
  const empty = report("W44", { coverage: { metricRecords: 0, truncated: true }, metricSummaries: [] });
  const briefing = buildDailyBriefing(empty);
  assert.equal(briefing.metrics[0].mean, null);
  assert.ok(briefing.alerts.some(item => item.code === "missing_metrics"));
  const trend = compareReportPeriods(empty, report("W43"));
  assert.equal(trend.changes[0].delta, null);
  assert.ok(trend.warnings.some(message => /truncated/.test(message)));
});

test("rejects comparison between different sites or identical periods", () => {
  assert.throws(() => compareReportPeriods(report("W44"), report("W44")), /different/);
  assert.throws(() => compareReportPeriods(report("W44"), report("W43", { site: "DLS2" })), /same station/);
});

test("AI context contains only allowlisted aggregates and no driver or customer details", () => {
  const current = report("W44", { secretDriverName: "PRIVATE_DRIVER", secretTrid: "PRIVATE_TRID", customerFeedback: {
    records: 2, categories: [{ category: "PRIVATE_CUSTOMER_NAME", records: 2 }],
  } });
  const summary = buildCommandInsights(current, report("W43"));
  assert.ok(summary.context.includes("DZM1"));
  assert.equal(summary.context.includes("PRIVATE_DRIVER"), false);
  assert.equal(summary.context.includes("PRIVATE_TRID"), false);
  assert.equal(summary.context.includes("PRIVATE_CUSTOMER_NAME"), false);
  assert.ok(summary.context.length <= 5200);
});

test("insights require valid structured period and source coverage", () => {
  assert.throws(() => buildCommandInsights(report("W100")), /authorised aggregate/);
  assert.throws(() => buildCommandInsights({ site: "DZM1", period: "W44" }), /authorised aggregate/);
});
