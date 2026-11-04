import test from "node:test";
import assert from "node:assert/strict";
import { investigateBrain, searchApprovedLessons, buildProactiveDigest, buildCopilotDraft, proposeFormatSandbox, exportFormatSpec } from "../lib/ai-lab/ai-v2.mjs";

const snapshot = {
  site: "DZM1", periods: ["W43", "W44"], truncated: false, driverSignalsTotal: 2,
  alerts: [{ id: "trend_dcr", category: "trend", severity: "high", title: "DCR · recent deterioration", evidence: "W43: 99.1%; W44: 97.9%." }],
  driverSignals: [{ driverName: "Person A", driverId: "8f763561-8258-4f34-8845-d42c58679174", signals: ["DCR down 1.2 pp"] }],
  series: [
    { period: "W43", metrics: { dcr: { mean: 99.1, rows: 24 }, pod: { mean: 99, rows: 24 }, iadc: { mean: 82, rows: 24 }, cdf_dpmo: { mean: 100, rows: 24 }, concessions: { mean: 1, rows: 24 } }, coverage: { metricRecords: 24 } },
    { period: "W44", metrics: { dcr: { mean: 97.9, rows: 28 }, pod: { mean: 98, rows: 28 }, iadc: { mean: 78, rows: 28 }, cdf_dpmo: { mean: 125, rows: 28 }, concessions: { mean: 2, rows: 28 } }, coverage: { metricRecords: 28 } },
  ],
};

test("investigator compares authorised records with source references", () => {
  const r = investigateBrain(snapshot, "De ce a scăzut DCR în W44?");
  assert.match(r.title, /DZM1.*DCR/);
  assert(r.evidence.every(row => row.source === "driver_metrics · RLS-scoped"));
  assert.match(r.answer, /99\.1/);
  assert.match(r.answer, /97\.9/);
  assert(!r.context.includes("Person A"));
  assert(!r.context.includes("8f763561"));
});

test("investigator never leaks free-text personal references in chat context", () => {
  const r = investigateBrain(snapshot, "Why did DCR drop for driver Person A?");
  assert(!r.context.includes("Person A"));
  assert.equal(r.evidence.length, 2);
});

test("investigator reports missing week and insufficient evidence honestly", () => {
  const missing = investigateBrain(snapshot, "DCR in W38");
  assert.equal(missing.evidence.length, 0);
  assert.match(missing.answer, /not among/);
  assert.throws(() => investigateBrain(null, "What about DCR?"));
});

test("approved knowledge search ranks related operational terms but respects selected site", () => {
  const items = [{ id: "1", site: "DZM1", lesson: "Check staging lanes separately from wave labels." },
    { id: "2", site: "DLS2", lesson: "Check DCR missing parcels." },
    { id: "3", site: null, lesson: "Always verify parcel locker returns." }];
  assert.deepEqual(searchApprovedLessons(items, "staging wave", "DZM1").map(item => item.id), ["1"]);
  assert(!searchApprovedLessons(items, "missing parcels", "DZM1").some(item => item.id === "2"));
});

test("risk digest and copilot drafts never send messages or invent driver names", () => {
  const digest = buildProactiveDigest(snapshot);
  assert.equal(digest.high.length, 1);
  assert.equal(digest.driverCandidates, 2);
  const draft = buildCopilotDraft(snapshot, "briefing", "ro");
  assert.match(draft, /DZM1 W44/);
  assert(!draft.includes("Person A"));
  assert.match(buildCopilotDraft(snapshot,"tips","en"),/Please/);
});

test("format sandbox proposes mappings, performs structural checks without executing code", () => {
  const row = kind => ({ mode: "XLSX", headerRow: 0, matrix: [["Route","Loading","Driver"],["CA_A119","11:35","Example"]], mapping: { route: 0, loading: 1, driver: 2 } });
  const sandbox = proposeFormatSandbox({ route: row("route"), wave: row("wave") });
  assert(sandbox.tests.every(item => item.pass));
  const json = JSON.parse(exportFormatSpec(sandbox));
  assert.equal(json.mutation, "none");
  assert(!JSON.stringify(json).includes("CA_A119"));
  assert(!JSON.stringify(json).includes("Example"));
  assert.equal(proposeFormatSandbox({ route: row("route") }).tests[0].pass, false);
});
