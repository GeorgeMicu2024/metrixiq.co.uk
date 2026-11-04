import test from "node:test";
import assert from "node:assert/strict";
import { analyseBrain, normalizeBrainPeriods, sanitizeLearningNote } from "../lib/ai-lab/brain-insights.mjs";

const uuid = "8f763561-8258-4f34-8845-d42c58679174";
const second = "9fa63561-8258-4f34-8845-d42c58679174";
const drivers = [{ id: uuid, full_name: "Person A", site: "DZM1" }, { id: second, full_name: "Person B", site: "DLS2" }];

test("rejects invalid, duplicate or excessive periods", () => {
  assert.deepEqual(normalizeBrainPeriods(["w42", " W43 "]), ["W42", "W43"]);
  assert.throws(() => normalizeBrainPeriods(["W44", "W44"]));
  assert.throws(() => normalizeBrainPeriods(["W00"]));
  assert.throws(() => normalizeBrainPeriods(Array(13).fill("W3")));
});

test("early warning uses real period evidence and no names in model context", () => {
  const data = analyseBrain({
    site: "DZM1", periods: ["W42", "W43", "W44"], drivers,
    metricRows: [
      { driver_id: uuid, week_label: "W42", dcr: 99.8, iadc: 90, pod: 99 },
      { driver_id: uuid, week_label: "W43", dcr: 98.9, iadc: 78, pod: 98 },
      { driver_id: uuid, week_label: "W44", dcr: 97.6, iadc: 73, pod: 96 },
      { driver_id: second, week_label: "W44", dcr: 60 },
    ], feedbackRows: [{ week_label: "W44", feedback_l0: "Negative" }], concessionRows: [{ week_label: "W44", dnr: 2 }],
  });
  assert.equal(data.series.length, 3);
  assert.equal(data.series.at(-1).feedbackRecords, 1);
  assert.equal(data.series.at(-1).dnrSnapshotSum, 2);
  assert(data.alerts.some(alert => alert.id === "trend_iadc" && alert.severity === "high"));
  assert.equal(data.driverSignals.length, 1);
  assert.equal(data.driverSignals[0].driverName, "Person A");
  assert(data.driverSignals[0].signals.some(item => /IADC/.test(item)));
  assert(!data.context.includes("Person A"));
  assert(!data.context.includes(uuid));
  assert(!data.context.includes("Person B"));
  assert(!data.context.includes(second));
});

test("missing reports never mean zero faults and truncated sources warn", () => {
  const result = analyseBrain({ site: "DLS2", periods: ["W43", "W44"], truncated: true });
  assert(result.alerts.some(alert => alert.id === "missing_periods"));
  assert(result.alerts.some(alert => alert.id === "truncated"));
  assert.equal(result.driverSignalsTotal, 0);
});

test("only explicitly approved general learning notes pass validation", () => {
  assert.equal(sanitizeLearningNote(" Use Wave Plan staging separately. "), "Use Wave Plan staging separately.");
  assert.throws(() => sanitizeLearningNote("UK5043217812 is missing"));
  assert.throws(() => sanitizeLearningNote("Send email to driver@example.com"));
  assert.throws(() => sanitizeLearningNote("No"));
});
