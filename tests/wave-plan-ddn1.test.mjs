import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) =>
  fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Daily Dispatch matches DDN1 route plans by exact Amazon route code", () => {
  const view = read("components/sites/WavePlanView.jsx");

  assert.ok(view.includes('(?:CA|CB|SA|AA)'));
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

  assert.ok(view.includes("uniqueDriverNames(v.names)"));
  assert.ok(view.includes('names.length?names.join(" / ")'));
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


test("single-TRID routes never concatenate DB and Route Plan name variants", () => {
  const view = read("components/sites/WavePlanView.jsx");

  assert.ok(view.includes("if(trids.length===1)"));
  assert.ok(view.includes("const preferred=dbNames[0]||explicitNames[0]||prev.names[0]"));
  assert.ok(view.includes("names=preferred?[preferred]:[]"));
  assert.ok(view.includes("uniqueDriverNames"));
  assert.ok(view.includes("nameIdentityKey"));
});

test("Daily Dispatch exposes a manual Edit Driver Names drawer", () => {
  const view = read("components/sites/WavePlanView.jsx");
  const css = read("app/globals.css");

  assert.ok(view.includes("Edit Driver Names"));
  assert.ok(view.includes("openNameEditor"));
  assert.ok(view.includes("applyNameEdits"));
  assert.ok(view.includes("wave-name-editor"));
  assert.ok(view.includes("Corrected name for "));
  assert.ok(css.includes(".wave-name-editor-backdrop"));
  assert.ok(css.includes(".wave-name-editor-table"));
});

test("manual driver-name corrections override auto-cleaned names without mutating source identity", () => {
  const view = read("components/sites/WavePlanView.jsx");

  assert.ok(view.includes("autoRouteDrivers"));
  assert.ok(view.includes("new Map(autoRouteDrivers)"));
  assert.ok(view.includes("const current=autoRouteDrivers.get(route)"));
  assert.ok(view.includes("if(value&&value!==row.current)next[key]=value;else delete next[key]"));
});


test("DEH1 partial OCR is reconciled only when matched routes share a consistent departure group", () => {
  const view = read("components/sites/WavePlanView.jsx");

  assert.ok(view.includes("const deh1Recovery=useMemo"));
  assert.ok(view.includes("matched<3||deltas.length<3"));
  assert.ok(view.includes("spread<=10&&median>=-15&&median<=60&&ratio>=.8"));
  assert.ok(view.includes("effectiveRouteCompatibility"));
  assert.ok(view.includes("DCSL routes reconciled from Route Plan"));
});
\n\ntest("DEH1 Gate Time falls back to 25 minutes before Load Time when OCR misses it", () => {\n  const view = read("components/sites/WavePlanView.jsx");\n\n  assert.ok(view.includes("const deh1GateFallback"));\n  assert.ok(view.includes("n-25+1440"));\n  assert.ok(view.includes("x.gateTime||(isDeh1&&direct?deh1GateFallback(amazon)"));\n});\n