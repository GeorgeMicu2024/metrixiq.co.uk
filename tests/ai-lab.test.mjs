import test from "node:test";
import assert from "node:assert/strict";
import { cleanMatrix, detectWavePlan, gridFromOcrText, normalizedWaveRows } from "../lib/ai-lab/wave-plan.mjs";

test("Wave Plan recognises standard Amazon column names", () => {
  const matrix = [
    ["Wave", "Route", "Driver Name", "TRID", "Staging Lane", "Load Time"],
    ["12", "CA_A292", "Example Driver", "A123456789", "A07", "11:35"],
    ["13", "CA_A105", "Another Driver", "A987654321", "B02", "12:00"],
  ];
  const result = detectWavePlan(matrix);
  assert.equal(result.headerRow, 0);
  assert.deepEqual(result.columns, { route: 1, driver: 2, trid: 3, wave: 0, staging: 4, loading: 5 });
  const rows = normalizedWaveRows(result.matrix, result.columns, result.headerRow);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].route, "CA_A292");
  assert.equal(rows[1].staging, "B02");
});

test("Wave Plan finds headers below report title and detects DZM1 parking/holding", () => {
  const matrix = [
    ["Amazon Logistics — Wave Plan"],
    ["Report date", "2026-11-04"],
    ["Route Number", "Wave Number", "1st Floor Parking", "Holding (0 floor)", "Loading Time"],
    ["SA_A02", "10", "10:50", "11:00", "11:15"],
  ];
  const result = detectWavePlan(matrix);
  assert.equal(result.headerRow, 2);
  assert.equal(result.columns.parking, 2);
  assert.equal(result.columns.holding, 3);
  assert.equal(result.columns.loading, 4);
  assert.equal(normalizedWaveRows(result.matrix, result.columns, result.headerRow)[0].route, "SA_A02");
});

test("approved formats are reused without changing source data", () => {
  const matrix = [["Route", "Wave", "Load Time"], ["CA_A001", "11", "11:30"]];
  const before = JSON.stringify(matrix);
  const first = detectWavePlan(matrix);
  const learned = { name: "W45 Wave Plan", signature: first.signature, columns: first.columns };
  const again = detectWavePlan(matrix, [learned]);
  assert.equal(again.matchedTemplate, "W45 Wave Plan");
  assert.equal(again.confidence, 96);
  assert.equal(JSON.stringify(matrix), before);
});

test("OCR text can identify route lines and avoid inventing missing fields", () => {
  const matrix = gridFromOcrText("WAVE 12 CA_A292 11:35 Staging A07\nWAVE 13 CA_A105 12:00");
  const result = detectWavePlan(matrix);
  const rows = normalizedWaveRows(result.matrix, result.columns, result.headerRow);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].route, "CA_A292");
  assert.equal(rows[0].staging, "A07");
  assert.equal(rows[1].staging, "");
});

test("matrix sanitation bounds untrusted documents", () => {
  const rows = Array.from({ length: 2000 }, () => Array.from({ length: 60 }, () => "x".repeat(400)));
  const result = cleanMatrix(rows);
  assert.equal(result.length, 1500);
  assert.equal(result[0].length, 50);
  assert.equal(result[0][0].length, 250);
});

test("reordered Amazon columns follow their headings rather than stale saved positions", () => {
  const initial = [["Route", "Wave", "Load Time", "Staging Lane"], ["CA_A292", "12", "11:35", "A07"]];
  const approved = detectWavePlan(initial);
  const learned = { name: "Existing Amazon format", signature: approved.signature, columns: approved.columns };
  const reordered = [["Wave", "Staging Lane", "Route", "Load Time"], ["13", "B02", "CA_A105", "12:00"]];
  const result = detectWavePlan(reordered, [learned]);
  assert.equal(result.matchedTemplate, learned.name);
  assert.deepEqual(result.columns, { route: 2, wave: 0, staging: 1, loading: 3 });
  const [row] = normalizedWaveRows(result.matrix, result.columns, result.headerRow);
  assert.equal(row.route, "CA_A105");
  assert.equal(row.wave, "13");
  assert.equal(row.staging, "B02");
  assert.equal(row.loading, "12:00");
});

test("learned custom headings work even with no standard Amazon aliases", () => {
  const first = [["Run identifier", "Sort order", "Planned clock"], ["CA_A292", "12", "11:35"]];
  const learned = { name: "Custom template", signature: "run identifier|sort order|planned clock", columns: { route: 0, wave: 1, loading: 2 } };
  const reordered = [["Planned clock", "Run identifier", "Sort order"], ["12:00", "SA_A02", "13"]];
  const result = detectWavePlan(reordered, [learned]);
  assert.equal(result.headerRow, 0);
  assert.equal(result.matchedTemplate, "Custom template");
  const [row] = normalizedWaveRows(result.matrix, result.columns, result.headerRow);
  assert.deepEqual([row.route, row.wave, row.loading], ["SA_A02", "13", "12:00"]);
});

test("ambiguous duplicated headings never inherit unsafe saved column positions", () => {
  const learned = { name: "Ambiguous", signature: "route|wave|loading|lane", columns: { route: 0, wave: 1, loading: 2 } };
  const changed = [["Wave", "Route", "Route", "Loading"], ["12", "CA_A100", "CA_A200", "11:30"]];
  const result = detectWavePlan(changed, [learned]);
  assert.equal(result.matchedTemplate, null);
  assert.equal(result.columns.route, 1);
});

test("approved examples suggest mappings after a minor header typo", () => {
  const approved = { name: "DZM1 approved", signature: "run identifier|sort order|planned clock",
    columns: { route: 0, wave: 1, loading: 2 } };
  const changed = [["Planned clok", "Run identifier", "Sort order"], ["12:00", "CA_A212", "11"]];
  const result = detectWavePlan(changed, [approved]);
  assert.equal(result.matchedTemplate, "DZM1 approved");
  assert.equal(result.templateMatch, "adapted");
  assert.equal(result.confidence, 83);
  assert.deepEqual(result.columns, { route: 1, wave: 2, loading: 0 });
  assert.equal(result.learnedChanges[0].field, "loading");
});

test("learning rejects two renamed columns and conflicting approved examples", () => {
  const approved = { name: "Original", signature: "run identifier|sort order|planned clock",
    columns: { route: 0, wave: 1, loading: 2 } };
  const twoTypos = [["Run identifer", "Sort ordr", "Planned clock"], ["CA_A212", "12", "11:30"]];
  assert.equal(detectWavePlan(twoTypos, [approved]).matchedTemplate, null);
  const alternate = { name: "Conflicting", signature: approved.signature,
    columns: { route: 1, wave: 0, loading: 2 } };
  const reordered = [["Sort order", "Run identifier", "Planned clock"], ["12", "CA_A212", "11:30"]];
  assert.equal(detectWavePlan(reordered, [approved, alternate]).matchedTemplate, null);
});

test("approved learning stays within the correct source type", () => {
  const template = { name: "Route-specific", sourceType: "route", signature: "run identifier|sort order|planned clock",
    columns: { route: 0, wave: 1, loading: 2 } };
  const matrix = [["Run identifier", "Sort order", "Planned clock"], ["CA_A212", "12", "11:30"]];
  assert.equal(detectWavePlan(matrix, [template], "route").matchedTemplate, "Route-specific");
  assert.equal(detectWavePlan(matrix, [template], "wave").matchedTemplate, null);
});
