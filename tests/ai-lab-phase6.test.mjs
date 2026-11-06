import test from "node:test";
import assert from "node:assert/strict";
import { londonMorningWindow, safeDailyPriorities } from "../lib/ai-lab/daily-schedule.mjs";
import { captureWaveLearning } from "../lib/ai-lab/wave-learning.mjs";
import { normalizeApprovedFormats } from "../lib/ai-lab/user-state.mjs";
import { analyseBrain } from "../lib/ai-lab/brain-insights.mjs";
import { buildPredictiveInsights } from "../lib/ai-lab/predictive-insights.mjs";
import { GET } from "../app/api/cron/ai-lab-daily/route.js";

test("UK daily scheduling handles Greenwich winter and summer daylight changes", () => {
  const winter = londonMorningWindow(new Date("2026-11-06T08:53:00Z"));
  const summer = londonMorningWindow(new Date("2026-07-06T07:53:00Z"));
  const skipped = londonMorningWindow(new Date("2026-07-06T08:53:00Z"));
  assert.equal(winter.due, true);
  assert.equal(winter.date, "2026-11-06");
  assert.equal(summer.due, true);
  assert.equal(summer.hour, 8);
  assert.equal(skipped.due, false);
});

test("Only bounded reviewed aggregate priorities appear in automated cache", () => {
  const actual = safeDailyPriorities(Array.from({ length: 15 }, (_, i) => ({
    id: `review_${i}`, title: "A".repeat(300), severity: "high", evidence: "B".repeat(500), next: "C".repeat(500),
    tracking: "UK5043217812", name: "PRIVATE PERSON",
  })));
  assert.equal(actual.length, 4);
  assert(actual.every(item => item.title.length <= 130 && item.evidence.length <= 240));
  assert(!JSON.stringify(actual).includes("UK5043217812"));
});

test("Scheduled endpoint never exposes service operations without CRON_SECRET", async () => {
  const reply = await GET(new Request("https://example.com/api/cron/ai-lab-daily"));
  assert.equal(reply.status, 401);
  assert.equal((await reply.json()).ok, false);
});

test("Only explicit human-approved Wave Plan column corrections are remembered", () => {
  const suggested = { route: 0, wave: 1, loading: 2 };
  const approved = { route: 0, wave: 3, loading: 2, staging: 4 };
  const lesson = captureWaveLearning(suggested, approved);
  assert.equal(lesson.correctedFields, 2);
  const saved = normalizeApprovedFormats([{ id: "1", name: "Waves", signature: "route|wave|time|wave b|stage",
    columns: approved, sourceType: "wave", approvedAt: "2026-11-06", learning: lesson,
    rawDriverName: "SECRET PERSON" }]);
  assert.equal(saved[0].learning.corrections.length, 2);
  assert(!JSON.stringify(saved).includes("SECRET PERSON"));
  assert.deepEqual(suggested, { route: 0, wave: 1, loading: 2 });
});

test("Predictive V3 policy history is strictly forward-only and reports error honestly", () => {
  const periods = ["W39", "W40", "W41", "W42", "W43", "W44", "W45", "W46"];
  const analysis = analyseBrain({ site: "DZM1", periods, metricRows: periods.flatMap((week, index) =>
    Array.from({ length: 8 }, () => ({ week_label: week, dcr: 99, pod: 99, iadc: 90 - 2 * index, cdf_dpmo: 100 + index * 5 }))) });
  const result = buildPredictiveInsights(analysis);
  const target = result.forecasts.find(item => item.key === "iadc");
  assert.equal(target.backtest.sequentialPolicyChecks, 4);
  assert.deepEqual(target.policyHistory.map(item => item.method), ["persistence", "persistence", "damped_trend", "damped_trend"]);
  assert(target.backtest.sequentialPolicyError >= 0);
  assert(target.backtest.sequentialPolicyImprovementPercent !== null);
  assert.equal(JSON.parse(result.context).site, "DZM1");
});
