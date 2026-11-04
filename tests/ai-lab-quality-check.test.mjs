import test from "node:test";
import assert from "node:assert/strict";
import { evaluateWavePlanQuality, parsePlanTime } from "../lib/ai-lab/quality-check.mjs";

const mapping = { route: 0, trid: 1, wave: 2, staging: 3, parking: 4, holding: 5, loading: 6 };
const routeRows = [{ route: "CA_A101", trid: "SECRET_TRID", driver: "Private Driver" }];
const waveRows = [{ route: "CA_A101", trid: "SECRET_TRID", wave: "11", staging: "B2", parking: "11:00", holding: "11:10", loading: "11:25" }];
const joined = { rows: [{ ...routeRows[0], ...waveRows[0], matchStatus: "Matched" }], matched: 1, routeOnly: 0, waveOnly: 0, conflicts: 0, ambiguous: 0 };

function run(props = {}) {
  return evaluateWavePlanQuality({ routeRows, waveRows, joined, routeMapping: mapping, waveMapping: mapping, ...props });
}

test("parses UK 24-hour and optional 12-hour times safely", () => {
  assert.equal(parsePlanTime("11:25"), 685);
  assert.equal(parsePlanTime("1:05 PM"), 785);
  assert.equal(parsePlanTime("24:05"), null);
  assert.equal(parsePlanTime("12:66"), null);
});

test("accepts correct DZM1 Parking +10 and Holding +15 timing", () => {
  const report = run({ profile: "DZM1" });
  assert.equal(report.counts.high, 0);
  assert.equal(report.risk, "No problems flagged by selected checks");
});

test("detects DZM1 timing errors without editing routes", () => {
  const wrongWave = [{ ...waveRows[0], holding: "11:13", loading: "11:31" }];
  const report = run({ profile: "DZM1", waveRows: wrongWave, joined: { ...joined, rows: [{ ...joined.rows[0], ...wrongWave[0] }] } });
  assert.ok(report.findings.some(item => item.code === "dzm1_parking_holding"));
  assert.ok(report.findings.some(item => item.code === "dzm1_holding_loading"));
});

test("general profile does not falsely enforce DZM1-only time rules", () => {
  const wrongWave = [{ ...waveRows[0], holding: "11:13", loading: "11:31" }];
  const report = run({ waveRows: wrongWave, joined: { ...joined, rows: [{ ...joined.rows[0], ...wrongWave[0] }] } });
  assert.equal(report.findings.some(item => item.code.startsWith("dzm1_")), false);
});

test("reports unmatched rows, missing fields and duplicate routes", () => {
  const missing = { ...waveRows[0], wave: "", staging: "", loading: "" };
  const report = run({
    routeRows: [...routeRows, { ...routeRows[0] }], waveRows: [missing],
    joined: { ...joined, rows: [{ ...joined.rows[0], ...missing }], routeOnly: 1, waveOnly: 1 },
  });
  const codes = report.findings.map(item => item.code);
  for (const code of ["unmatched_route", "unmatched_wave", "duplicate_route_plan", "missing_wave", "missing_staging", "missing_loading"]) assert.ok(codes.includes(code), code);
});

test("warns when critical identifiers or DZM1 time columns are unmapped", () => {
  const report = run({ profile: "DZM1", routeMapping: {}, waveMapping: {} });
  assert.ok(report.findings.some(item => item.code === "route_identity_unmapped"));
  assert.ok(report.findings.some(item => item.code === "wave_identity_unmapped"));
  assert.ok(report.findings.some(item => item.code === "dzm1_unmapped_parking"));
});

test("AI summary never includes driver names or raw TRID values", () => {
  const report = run({ routeRows: [...routeRows, { route: "CA_A102", trid: "SECRET_TRID" }] });
  assert.ok(report.findings.some(item => item.code === "trid_reused_route"));
  assert.equal(JSON.stringify(report.aiSummary).includes("SECRET_TRID"), false);
  assert.equal(JSON.stringify(report.aiSummary).includes("Private Driver"), false);
});
