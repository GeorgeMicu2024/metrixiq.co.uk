import test from "node:test";
import assert from "node:assert/strict";
import { summarizeLiveData } from "../lib/ai-lab/live-summary.mjs";
import { buildConnectedBriefing } from "../lib/ai-lab/connected-briefing.mjs";
import { buildIqActionCenter } from "../lib/ai-lab/action-center.mjs";

const prior = summarizeLiveData({ site: "DZM1", period: "W43", metricRows: [
  { dcr: 99.3, iadc: 84, pod: 99, cdf_dpmo: 190, concessions: 0 },
  { dcr: 99.1, iadc: 86, pod: 99, cdf_dpmo: 210, concessions: 0 },
] });
const latest = summarizeLiveData({ site: "DZM1", period: "W44", metricRows: [
  { dcr: 97.2, iadc: 72, pod: 97, cdf_dpmo: 240, concessions: 2 },
  { dcr: 97.6, iadc: 74, pod: 97, cdf_dpmo: 260, concessions: 1 },
] });

test("Action Center prioritises IADC reference and numeric deteriorations with evidence", () => {
  const result = buildIqActionCenter(buildConnectedBriefing(latest, prior));
  assert.equal(result.site, "DZM1");
  assert.equal(result.period, "W44");
  assert(result.counts.high >= 1);
  assert(result.tasks.some(task => task.id === "iadc_reference" && task.severity === "high"));
  assert(result.tasks.some(task => task.id === "trend_dcr" && /99\.2% → 97\.4%/.test(task.evidence)));
  assert(result.tasks.some(task => task.id === "trend_cdf_dpmo" && /DPMO/.test(task.evidence)));
  assert(result.tasks.every(task => task.nextStep && task.basis && task.confidence));
  assert(result.tasks.every((task, index, tasks) => !index ||
    ({ high: 0, watch: 1, verify: 2 })[tasks[index - 1].severity] <= ({ high: 0, watch: 1, verify: 2 })[task.severity]));
  assert.equal(JSON.parse(result.context).metrics.find(row => row.name === "IADC").unweightedMean, 73);
  assert.match(result.notice, /not connected/);
});

test("Missing, truncated and lower-coverage data produce data-quality blockers first", () => {
  const missing = summarizeLiveData({ site: "DZM1", period: "W45", truncated: { metrics: true } });
  const result = buildIqActionCenter(buildConnectedBriefing(missing, latest));
  assert.equal(result.tasks[0].severity, "high");
  assert(result.tasks.some(task => task.id === "missing_source"));
  assert(result.tasks.some(task => task.id === "partial_source"));
  assert(result.tasks.some(task => task.id === "comparison_missing"));
  assert(!result.tasks.some(task => task.id.startsWith("trend_")));
  assert.match(result.tasks[0].confidence, /Limited source/);
  const reduced = summarizeLiveData({ site: "DZM1", period: "W45", metricRows: [{ dcr: 95 }] });
  const older = summarizeLiveData({ site: "DZM1", period: "W44", metricRows: Array.from({ length: 8 }, () => ({ dcr: 98 })) });
  assert(buildIqActionCenter(buildConnectedBriefing(reduced, older)).tasks.some(task => task.id === "coverage_drop"));
});

test("Action Center does not mistake missing metrics for zeros or claim all is well", () => {
  const current = summarizeLiveData({ site: "DLS2", period: "W44", metricRows: [{ dcr: 99, iadc: 90 }] });
  const result = buildIqActionCenter(buildConnectedBriefing(current));
  assert(result.tasks.some(task => task.id === "comparison_missing"));
  assert(!result.tasks.some(task => task.id === "iadc_reference"));
  assert(!result.tasks.some(task => task.id.startsWith("trend_")));
  assert(result.tasks.every(task => !/problem-free|all clear/i.test(task.evidence)));
});

test("Only allowlisted descriptive data enters compact, parseable AI context", () => {
  const compromised = { ...latest,
    rawRows: [{ driverName: "PRIVATE DRIVER", trackingNumber: "UK5043217812" }],
    metricSummaries: latest.metricSummaries.map(metric => ({ ...metric, privateCustomer: "SECRET CUSTOMER" })),
  };
  const original = structuredClone(compromised);
  const result = buildIqActionCenter(buildConnectedBriefing(compromised, prior));
  const context = JSON.parse(result.context);
  assert.equal(context.station, "DZM1");
  assert(result.context.length <= 6000);
  assert(!/PRIVATE DRIVER|UK5043217812|SECRET CUSTOMER/.test(result.context));
  assert(!/driverId|transporterId|customerName|trackingNumber/.test(result.context));
  assert.match(context.limitations, /not.*official/i);
  assert.deepEqual(compromised, original);
});

test("Rejects invalid briefing scope", () => {
  assert.throws(() => buildIqActionCenter(null), /valid authorised/);
  assert.throws(() => buildIqActionCenter({ site: "../../DZM1", period: "W44", metrics: [] }), /valid authorised/);
  assert.throws(() => buildIqActionCenter({ site: "DZM1", period: "W54", metrics: [] }), /valid authorised/);
});
