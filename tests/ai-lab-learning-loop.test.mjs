import test from "node:test";
import assert from "node:assert/strict";
import { normalizeLearningEntries, saveLearningDecision, summarizeLearning,
  orderIssuesWithLearning, appendApprovedLearningContext } from "../lib/ai-lab/learning-loop.mjs";

const one = (code, decision = "useful", week = 44) => ({ site: "DZM1", code, decision,
  reason: "manual_review", week, year: 2026, time: 1793920000000 });
const issues = [
  { code: "metrics_missing", severity: "high", title: "Missing data" },
  { code: "lor_discrepancy", severity: "review", title: "LoR discrepancy" },
  { code: "coverage_drop", severity: "review", title: "Coverage drop" },
];

test("IQ Learning Loop accepts only allowlisted anonymous feedback, bounded to 80 entries", () => {
  const bad = { ...one("lor_discrepancy"), site: "DZM1<script>", customer: "SECRET CUSTOMER" };
  assert.deepEqual(normalizeLearningEntries([bad]), []);
  const entries = normalizeLearningEntries(Array.from({ length: 150 }, (_, index) =>
    ({ ...one("coverage_drop"), week: 44, time: index })));
  assert.equal(entries.length, 80);
  assert(!JSON.stringify(entries).includes("SECRET CUSTOMER"));
  assert.throws(() => saveLearningDecision([], { ...one("coverage_drop"), decision: "trained" }), /Invalid/);
});

test("Repeated correction replaces a decision for the same station/week/check", () => {
  const initial = saveLearningDecision([], one("coverage_drop"));
  const corrected = saveLearningDecision(initial, one("coverage_drop", "needs_review"));
  assert.equal(corrected.length, 1);
  assert.equal(corrected[0].decision, "needs_review");
  assert.equal(saveLearningDecision(corrected, one("coverage_drop", "useful", 43)).length, 2);
});

test("Feedback personalises ordering within severity only, not severity or evidence", () => {
  const original = structuredClone(issues);
  const summary = summarizeLearning([one("coverage_drop"), one("coverage_drop", "useful", 43),
    one("lor_discrepancy", "needs_review"), one("coverage_drop", "useful", 42),
    one("private_unknown"), { ...one("coverage_drop"), site: "DLS2" }], "DZM1", issues);
  assert.equal(summary.total, 4);
  const ordered = orderIssuesWithLearning(issues, summary);
  assert.deepEqual(ordered.map(issue => issue.code), ["metrics_missing", "coverage_drop", "lor_discrepancy"]);
  assert.deepEqual(issues, original);
});

test("IQ chat context contains operator review counts, no identifiers, notes or PII", () => {
  const summary = summarizeLearning([one("coverage_drop"), one("lor_discrepancy", "needs_review")], "DZM1", issues);
  const output = appendApprovedLearningContext(JSON.stringify({ site: "DZM1", officialScore: 80.49 }), summary);
  const parsed = JSON.parse(output);
  assert.equal(parsed.site, "DZM1");
  assert.equal(parsed.officialScore, 80.49);
  assert.equal(parsed.userReviewedChecks.history.length, 2);
  assert(!/1793920000000|SECRET|customer|driver|tracking/i.test(output));
  assert.match(parsed.userReviewedChecks.caution, /not verified/);
  assert.equal(appendApprovedLearningContext(JSON.stringify({ site: "DLS2" }), summary), JSON.stringify({ site: "DLS2" }));
  const longReport = JSON.stringify({ site: "DZM1", note: "a".repeat(5760) });
  const bounded = appendApprovedLearningContext(longReport, summary);
  assert(bounded.length < 6000);
  assert.equal(JSON.parse(bounded).site, "DZM1");
});
