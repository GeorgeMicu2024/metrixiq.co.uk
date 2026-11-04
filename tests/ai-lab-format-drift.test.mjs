import test from "node:test";
import assert from "node:assert/strict";
import { detectFormatDrift, driftAdapterDraft } from "../lib/ai-lab/format-drift.mjs";

const approved = [
  { id: "r", name: "Driver Private File.xlsx", signature: "route|driver name|trid",
    columns: { route: 0, driver: 1, trid: 2 } },
  { id: "w", name: "Wave Sheet", signature: "route|wave|staging lane|load time",
    columns: { route: 0, wave: 1, staging: 2, loading: 3 } },
];
const doc = (headers) => ({ matrix: [headers, ["CA_A123", "Driver Private", "UK5043217812", "11:30"]], headerRow: 0, mapping: {} });

test("unchanged approved layout produces no drift and no source-row leakage", () => {
  const result = detectFormatDrift({ route: doc(["Route", "Driver Name", "TRID"]), wave: doc(["Route", "Wave", "Staging Lane", "Load Time"]) }, approved);
  assert.deepEqual(result.results.map(item => item.state), ["unchanged", "unchanged"]);
  assert(driftAdapterDraft(result));
  assert(!JSON.stringify(result).includes("Driver Private"));
  assert(!JSON.stringify(result).includes("CA_A123"));
});

test("moved headers and added columns are flagged with safe proposed mappings", () => {
  const result = detectFormatDrift({ wave: doc(["Wave", "Route", "Load Time", "Staging Lane", "Gate"]) }, approved);
  const wave = result.results[1];
  assert.equal(wave.state, "review");
  assert.equal(wave.proposedMapping.route, 1);
  assert.equal(wave.proposedMapping.loading, 2);
  assert(wave.changes.some(item => item.type === "moved"));
  assert.equal(wave.addedColumns, 1);
  assert.equal(driftAdapterDraft(result), null);
});

test("duplicate approved header blocks automatic adapter proposal", () => {
  const result = detectFormatDrift({ wave: doc(["Route", "Route", "Wave", "Staging Lane", "Load Time"]) }, approved);
  assert.equal(result.results[1].state, "blocked");
  assert.match(result.results[1].issues.join(" "), /ambiguous/);
});

test("missing approved column never silently fills with a guess", () => {
  const result = detectFormatDrift({ wave: doc(["Route", "Wave", "Staging Lane", "Other"]) }, approved);
  assert.equal(result.results[1].state, "blocked");
  assert.equal(result.results[1].proposedMapping.loading, undefined);
});

test("unknown and untrained formats require manual approval", () => {
  const document = { wave: doc(["Alpha", "Beta", "Gamma"]) };
  assert.equal(detectFormatDrift(document, approved).results[1].state, "new");
  assert.equal(detectFormatDrift(document, []).results[1].state, "untrained");
});
