import test from "node:test";
import assert from "node:assert/strict";
import { parseDriverQuestion, evaluateDrivers } from "../lib/ai-lab/driver-investigator.mjs";

const uuid = "8f763561-8258-4f34-8845-d42c58679174";
const second = "9fa63561-8258-4f34-8845-d42c58679174";
const input = {
  site: "DZM1", periods: ["W43", "W44"], query: "Care șoferi sunt sub 80% IADC?",
  directory: [{ id: uuid, site: "DZM1", full_name: "Person A" }, { id: second, site: "DLS2", full_name: "Person B" }],
  metricRows: [
    { driver_id: uuid, week_label: "W43", iadc: 86 },
    { driver_id: uuid, week_label: "W44", iadc: 77 },
    { driver_id: uuid, week_label: "W44", iadc: 79 },
    { driver_id: second, week_label: "W44", iadc: 35 },
    { driver_id: uuid, week_label: "W44", iadc: null },
  ],
};

test("Romanian and English questions parse with explicit thresholds", () => {
  assert.deepEqual(parseDriverQuestion("Care șoferi sunt sub 80% IADC?"), { metric: "iadc", threshold: 80, comparison: "below", unit: "%", isDefaultThreshold: false });
  assert.deepEqual(parseDriverQuestion("Which drivers have DCR above 99?"), { metric: "dcr", threshold: 99, comparison: "above", unit: "%", isDefaultThreshold: false });
  assert.equal(parseDriverQuestion("Explain overall results"), null);
  assert.throws(() => parseDriverQuestion("Drivers below 200% IADC"));
});

test("RLS-scoped directory prevents unrelated driver output and excludes identifiers from model context", () => {
  const result = evaluateDrivers(input);
  assert.equal(result.analysedDrivers, 1);
  assert.equal(result.totalMatches, 1);
  assert.equal(result.matches[0].driverName, "Person A");
  assert.equal(result.matches[0].mean, 78);
  assert.equal(result.matches[0].previous, 86);
  assert.equal(result.matches[0].numericRows, 2);
  assert(!result.context.includes("Person A"));
  assert(!result.context.includes(uuid));
  assert(!result.context.includes("Person B"));
});

test("null values are not counted as zero, all comparisons use available periods", () => {
  const result = evaluateDrivers({ ...input, query: "Which drivers are above 80 IADC?" });
  assert.equal(result.totalMatches, 0);
  assert.throws(() => evaluateDrivers({ ...input, site: "invalid site" }));
});
