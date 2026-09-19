import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

test("Driver Scorecards V2.2 keeps Formula v1 exact weights and thresholds", () => {
  const view = read("components/scorecards/DriverScorecardsV22.jsx");

  for (const fragment of [
    'weight: 17',
    'weight: 6',
    'weight: 8',
    'weight: 10',
    'weight: 7',
    'if (raw < 750)',
    'if (raw >= 810)',
    '(raw - 750) / 70',
    '(1180 - raw) / (1200 - 800)',
    'formulaDpmo(row.lor, 220)',
    'formulaDpmo(row.cdf_dpmo, 4000)',
    'raw >= 2 ? 0 : raw === 1 ? 0.5 : 1',
    'raw <= 1 ? raw : raw <= 10 ? raw / 10 : raw / 100',
  ]) {
    assert.ok(view.includes(fragment), `missing formula fragment: ${fragment}`);
  }
});

test("Driver Scorecards V2.2 persists manual FICO overrides by driver and week", () => {
  const view = read("components/scorecards/DriverScorecardsV22.jsx");

  assert.ok(view.includes('.from("driver_metrics")'));
  assert.ok(view.includes('mentor_score: value'));
  assert.ok(view.includes('ementor: value'));
  assert.ok(view.includes('fico: value'));
  assert.ok(view.includes('.eq("driver_id", editRow.driver_id)'));
  assert.ok(view.includes('.eq("week_label", editRow.week_label)'));
  assert.ok(view.includes('manual_fico_override'));
  assert.ok(view.includes('scorecard_formula_version: "v1"'));
});
