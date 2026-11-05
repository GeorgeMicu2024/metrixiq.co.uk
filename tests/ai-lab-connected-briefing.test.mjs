import test from "node:test";
import assert from "node:assert/strict";
import { summarizeLiveData } from "../lib/ai-lab/live-summary.mjs";
import { buildConnectedBriefing } from "../lib/ai-lab/connected-briefing.mjs";

const current = summarizeLiveData({ site: "DZM1", period: "W44", metricRows: [
  { dcr: 96, iadc: 78, pod: 95, cdf_dpmo: 240, concessions: 2 },
  { dcr: 98, iadc: 82, pod: 97, cdf_dpmo: 260, concessions: 0 },
], feedbackRows: [{ feedback_l0: "Negative" }] });
const previous = summarizeLiveData({ site: "DZM1", period: "W43", metricRows: [
  { dcr: 99, iadc: 85, pod: 98, cdf_dpmo: 230, concessions: 0 },
] });

test("Connected briefing compares only authorised aggregate means and shows units", () => {
  const briefing = buildConnectedBriefing(current, previous);
  assert.equal(briefing.site, "DZM1");
  assert.equal(briefing.period, "W44");
  assert.equal(briefing.previousPeriod, "W43");
  assert.equal(briefing.metrics.find(item => item.key === "dcr").delta, -2);
  assert.equal(briefing.metrics.find(item => item.key === "iadc").delta, -5);
  assert.equal(briefing.metrics.find(item => item.key === "cdf_dpmo").delta, 20);
  assert(briefing.focus.some(item => /DCR/.test(item.title)));
  assert(briefing.context.includes("officialScorecard"));
  assert(briefing.warnings.some(item => /unweighted means/.test(item)));
});

test("Missing or partial sources never produce fake improvement or official scores", () => {
  const empty = summarizeLiveData({ site: "DZM1", period: "W45", truncated: { metrics: true } });
  const briefing = buildConnectedBriefing(empty, current, { partialDiscovery: true });
  assert.equal(briefing.metrics.find(item => item.key === "iadc").value, null);
  assert.equal(briefing.metrics.find(item => item.key === "iadc").delta, null);
  assert(briefing.focus.some(item => /coverage/i.test(item.title)));
  assert(briefing.warnings.some(item => /partial/.test(item)));
  assert(briefing.warnings.some(item => /discovery/.test(item)));
  assert(!briefing.context.includes("Great"));
});

test("Connected briefing blocks cross-site comparison and never includes raw identities", () => {
  const other = summarizeLiveData({ site: "DLS2", period: "W43", metricRows: [{ dcr: 98 }] });
  const briefing = buildConnectedBriefing(current, other);
  assert.equal(briefing.previousPeriod, null);
  assert(briefing.warnings.some(item => /No comparable previous/.test(item)));
  assert.throws(() => buildConnectedBriefing({ site: "../DZM1", period: "W44" }));
  assert(!/driverId|transporterId|customerName|trackingNumber/.test(briefing.context));
  const contaminated = { ...current,
    customerFeedback: { categories: [{ category: "Driver John Smith UK5043217812", records: 10 }] },
    rawRows: [{ driverName: "John Smith", trackingNumber: "UK5043217812" }] };
  const safe = buildConnectedBriefing(contaminated, previous);
  assert(!safe.context.includes("John Smith"));
  assert(!safe.context.includes("UK5043217812"));
  assert(safe.warnings.some(item => /do not identify a year/.test(item)));
});

test("a lower-coverage latest week is prioritised before interpreting trends", () => {
  const older = summarizeLiveData({ site: "DZM1", period: "W44", metricRows: Array.from({ length: 10 }, () => ({ dcr: 99 })) });
  const latest = summarizeLiveData({ site: "DZM1", period: "W45", metricRows: Array.from({ length: 5 }, () => ({ dcr: 96 })) });
  const result = buildConnectedBriefing(latest, older);
  assert.equal(result.focus[0].title, "Check week completeness");
  assert(result.warnings.some(item => /may be incomplete/.test(item)));
  assert.equal(result.metrics.find(item => item.key === "dcr").delta, -3);
});
