import test from "node:test";
import assert from "node:assert/strict";
import { analyseBrain } from "../lib/ai-lab/brain-insights.mjs";
import { buildPredictiveInsights } from "../lib/ai-lab/predictive-insights.mjs";

const weeks = ["W39", "W40", "W41", "W42", "W43", "W44"];
function history(periods = weeks, { rows = 8, truncated = false, overrides = {} } = {}) {
  return analyseBrain({ site: "DZM1", periods,
    metricRows: periods.flatMap((period, index) => Array.from({ length: rows }, () => ({
      week_label: period, iadc: 90 - index * 2, dcr: 99 - index * 0.5,
      pod: 99, cdf_dpmo: 100 + index * 10, concessions: 1,
      ...overrides[period],
    }))),
    truncated,
  });
}

test("Predictive Intelligence provides cautious, walk-forward-checked one-week metrics", () => {
  const forecast = buildPredictiveInsights(history());
  const iadc = forecast.forecasts.find(item => item.key === "iadc");
  assert.equal(forecast.site, "DZM1");
  assert.equal(iadc.status, "projected");
  assert.equal(iadc.latest, 80);
  assert(iadc.forecast < 80);
  assert(iadc.confidence.startsWith("Moderate"));
  assert.equal(iadc.backtest.holdouts, 2);
  assert(iadc.backtest.meanAbsoluteError < iadc.backtest.persistenceBaselineError);
  assert(iadc.indicativeRange[0] <= iadc.forecast && iadc.indicativeRange[1] >= iadc.forecast);
  assert(forecast.alerts.some(item => /IADC may fall below/.test(item.title)));
  assert(forecast.forecasts.some(item => item.key === "cdf_dpmo" && item.forecast > item.latest));
  assert(forecast.description.includes("no automatic actions"));
});

test("Short, missing or non-consecutive history cannot produce a forecast", () => {
  const short = buildPredictiveInsights(history(["W42", "W43", "W44"]));
  assert(short.forecasts.every(item => item.status === "unavailable"));
  assert(short.warnings.some(item => /At least five/.test(item)));
  const missing = buildPredictiveInsights(history(["W39", "W40", "W41", "W43", "W44"]));
  assert(missing.forecasts.every(item => item.status === "unavailable"));
  assert(missing.warnings.some(item => /not strictly consecutive/.test(item)));
  const rollover = buildPredictiveInsights(history(["W49", "W50", "W51", "W52", "W1"]));
  assert(rollover.forecasts.every(item => item.status === "unavailable"));
});

test("Truncated coverage withholds all estimates instead of guessing", () => {
  const result = buildPredictiveInsights(history(weeks, { truncated: true }));
  assert(result.forecasts.every(item => item.status === "unavailable"));
  assert(result.forecasts.every(item => item.confidence === "Insufficient evidence"));
  assert(result.warnings.some(item => /source read limit/.test(item)));
  assert.equal(result.alerts.length, 0);
});

test("Implausible metric and unstable row populations block only unsupported metrics", () => {
  const implausible = buildPredictiveInsights(history(weeks, { overrides: { W42: { iadc: 125 } } }));
  assert.equal(implausible.forecasts.find(item => item.key === "iadc").status, "unavailable");
  assert.equal(implausible.forecasts.find(item => item.key === "dcr").status, "projected");
  const scope = history();
  scope.series[2].metrics.dcr.rows = 1;
  const insufficient = buildPredictiveInsights(scope);
  assert.equal(insufficient.forecasts.find(item => item.key === "dcr").status, "unavailable");
});

test("A volatile or flat series never receives a fabricated high-confidence warning", () => {
  const flat = history(weeks, { overrides: Object.fromEntries(weeks.map(period => [period, { iadc: 87, dcr: 99, cdf_dpmo: 200 }])) });
  const result = buildPredictiveInsights(flat);
  assert.equal(result.alerts.length, 0);
  assert(result.forecasts.every(item => item.confidence.startsWith("Low")));
  assert(result.warnings.some(item => /does not mean there is no operational risk/.test(item)));
});

test("AI context includes only allowlisted aggregates, never driver or parcel data", () => {
  const privateReport = history();
  privateReport.driverSignals = [{ driverName: "PRIVATE PERSON", driverId: "SECRET DRIVER ID", tracking: "UK5043217812" }];
  privateReport.series[0].secretCustomer = "SECRET CUSTOMER";
  const before = structuredClone(privateReport);
  const result = buildPredictiveInsights(privateReport);
  const parsed = JSON.parse(result.context);
  assert.equal(parsed.site, "DZM1");
  assert(result.context.length <= 6000);
  assert(!/PRIVATE PERSON|SECRET DRIVER ID|UK5043217812|SECRET CUSTOMER/.test(result.context));
  assert.match(parsed.prohibitedInterpretation, /Not trained machine learning/);
  assert.deepEqual(privateReport, before);
});

test("Malformed or mismatched scope is rejected", () => {
  assert.throws(() => buildPredictiveInsights(null), /valid authorised/);
  assert.throws(() => buildPredictiveInsights({ ...history(), site: "../DZM1" }), /valid authorised/);
  assert.throws(() => buildPredictiveInsights({ ...history(), periods: ["W39"] }), /valid authorised/);
});
