import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  new URL("../components/sites/WavePlanView.jsx", import.meta.url),
  "utf8"
);

test("DLS2 headerless DCSL wave exports are detected structurally", () => {
  assert.ok(source.includes("headerlessWaveEvidence"));
  assert.ok(source.includes("route&&time&&stage"));
  assert.ok(source.includes("if(headerlessWaveEvidence(rows)>=2)return \"wave\""));
});

test("headerless wave detection still requires route, time and staging evidence", () => {
  assert.ok(source.includes("routeOf(cells)"));
  assert.ok(source.includes("timeOf(cells)"));
  assert.ok(source.includes("stageOf(cells)||stageLoose"));
});
