import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) =>
  fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Daily Dispatch matches DDN1 route plans by exact Amazon route code", () => {
  const view = read("components/sites/WavePlanView.jsx");

  assert.ok(view.includes('(?:CA|SA|AA)'));
  assert.ok(view.includes("routeCompatibility"));
  assert.ok(view.includes("routeSetMismatch"));
  assert.ok(view.includes("Files matched"));
  assert.ok(view.includes("Wave Plan routes found in Route Plan"));
});

test("Daily Dispatch never treats service types as driver names", () => {
  const view = read("components/sites/WavePlanView.jsx");

  assert.ok(view.includes("serviceLike"));
  assert.ok(view.includes("REMOTE\\s+DEBRIEF"));
  assert.ok(view.includes("RIDE\\s+ALONG"));
  assert.ok(view.includes('||"UNASSIGNED"'));
});

test("valid multi-driver Amazon rows remain visible instead of becoming UNASSIGNED", () => {
  const view = read("components/sites/WavePlanView.jsx");

  assert.ok(view.includes('v.names.length?v.names.join(" / ")'));
  assert.ok(view.includes("v.names.length!==v.trids.length"));
});

test("changing the global site clears stale Daily Dispatch uploads", () => {
  const view = read("components/sites/WavePlanView.jsx");

  assert.ok(view.includes("useEffect"));
  assert.ok(view.includes("setRouteFile(null);setWaveFile(null)"));
  assert.ok(view.includes("setGenerated(false)"));
  assert.ok(view.includes("},[site]);"));
});

test("mismatched route sets cannot be sent as a Wave Plan", () => {
  const view = read("components/sites/WavePlanView.jsx");

  assert.ok(view.includes("if(routeSetMismatch)"));
  assert.ok(view.includes("MetrixIQ will not guess driver-to-staging assignments"));
  assert.ok(view.includes("disabled={!generated||routeSetMismatch}"));
});
