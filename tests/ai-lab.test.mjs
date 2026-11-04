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
