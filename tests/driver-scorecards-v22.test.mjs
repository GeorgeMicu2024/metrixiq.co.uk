import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { calculateDriverScorecard } from "../lib/scorecards/driverScoreFormula.js";

const read = (path) => fs.readFileSync(path, "utf8");

test("Driver Scorecards V2.2 matches the exact point-band formula", () => {
  const formula = read("lib/scorecards/driverScoreFormula.js");

  for (const fragment of [
    "if (fico >= 849) return 17",
    "if (fico >= 825) return 15",
    "if (fico >= 810) return 10",
    "if (fico >= 800) return 8",
    "if (fico >= 780) return 5",
    "if (dcr >= 0.999) return 17",
    "if (dcr >= 0.992) return 15",
    "if (dsc < 0.01) return 17",
    "return lor === 0 ? 6 : 0",
    "if (pod >= 0.9999) return 8",
    "if (cc >= 0.999) return 8",
    "return ce <= 0 ? 10 : 0",
    "if (cdf <= 4420) return 10",
    "return psb === 0 ? 7 : 0",
  ]) {
    assert.ok(formula.includes(fragment), `missing formula fragment: ${fragment}`);
  }

  assert.equal(calculateDriverScorecard({
    mentor_score: 847,
    dcr: 99.29,
    dsc_dpmo: 0,
    lor: 0,
    pod: 99.77,
    cc: 100,
    ce_dpmo: 0,
    cdf_dpmo: 2049,
    psb: 0,
    raw_data: { source_files: ["Week37-DSP-Scorecard.pdf"] },
  }).value, 95);
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
  assert.ok(view.includes('scorecard_formula_version: "v2-point-bands"'));
});
