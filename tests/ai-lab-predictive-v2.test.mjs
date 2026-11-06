import test from "node:test";
import assert from "node:assert/strict";
import { analyseBrain } from "../lib/ai-lab/brain-insights.mjs";
import { buildPredictiveInsights } from "../lib/ai-lab/predictive-insights.mjs";

const weeks = ["W39", "W40", "W41", "W42", "W43", "W44", "W45"];
function build(values) {
  const analysis = analyseBrain({ site: "DZM1", periods: weeks,
    metricRows: weeks.flatMap((week, i) => Array.from({ length: 8 }, () => ({
      week_label: week, dcr: values[i], iadc: values[i], pod: values[i], cdf_dpmo: 100 + i * 10,
    }))) });
  return buildPredictiveInsights(analysis);
}

test("Predictive V2 selects damped trend only after a stronger walk-forward backtest", () => {
  const predicted = build([90, 88, 86, 84, 82, 80, 78]);
  const iadc = predicted.forecasts.find(item => item.key === "iadc");
  assert.equal(iadc.backtest.selectedModel, "damped_trend");
  assert(iadc.backtest.improvementPercent >= 15);
  assert.equal(iadc.backtest.holdouts, 3);
  assert(iadc.forecast < iadc.latest);
  assert.deepEqual(iadc.evaluationHistory.map(entry => entry.week), ["W43", "W44", "W45"]);
  assert(iadc.evaluationHistory.every(entry => Number.isFinite(entry.actual) && Number.isFinite(entry.selectedEstimate)));
});

test("Unreliable trends fall back to no-change estimate and do not invent alarms", () => {
  const predicted = build([80, 90, 80, 90, 80, 90, 80]);
  const iadc = predicted.forecasts.find(item => item.key === "iadc");
  assert.equal(iadc.backtest.selectedModel, "persistence");
  assert.equal(iadc.forecast, iadc.latest);
  assert.equal(iadc.nextWeekChange, 0);
  assert.equal(iadc.signal, null);
  assert(iadc.confidence.startsWith("Low"));
  assert.equal(iadc.evaluationHistory.length, 3);
});

test("Model evaluation stays anonymous and does not mutate source records", () => {
  const predicted = build([89, 88, 87, 86, 85, 84, 83]);
  const parsed = JSON.parse(predicted.context);
  assert.equal(parsed.forecasts.find(row => row.metric === "IADC").backtest.selectedModel, "damped_trend");
  assert(predicted.context.length < 6000);
  assert(!/driver_id|tracking|email|customer/i.test(predicted.context));
});
