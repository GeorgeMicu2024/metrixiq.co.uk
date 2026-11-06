// IQ Learning Loop: explicit, browser-local Super Admin feedback only.
// No operational database writes, automated model training or unverified facts.

const SITE = /^[A-Z0-9]{3,6}$/;
const ISSUE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const DECISIONS = new Set(["useful", "needs_review"]);
const REASONS = new Set(["confirmed", "source_timing", "source_mismatch", "amazon_exception", "manual_review"]);

export const LEARNING_REASONS = Object.freeze([
  { value: "confirmed", label: "Confirmed in source" },
  { value: "source_timing", label: "Data arrived late" },
  { value: "source_mismatch", label: "Different source definition" },
  { value: "amazon_exception", label: "Possible Amazon exception" },
  { value: "manual_review", label: "Needs manual verification" },
]);

export function normalizeLearningEntries(entries) {
  if (!Array.isArray(entries)) return [];
  const clean = [];
  for (const row of entries.slice(-120)) {
    if (!SITE.test(row?.site || "") || !ISSUE.test(row?.code || "") ||
      !DECISIONS.has(row?.decision) || !REASONS.has(row?.reason) ||
      !Number.isSafeInteger(row?.week) || row.week < 1 || row.week > 53 ||
      !Number.isSafeInteger(row?.year) || row.year < 2020 || row.year > 2100 ||
      !Number.isFinite(row?.time) || row.time < 0) continue;
    clean.push({ site: row.site, code: row.code, decision: row.decision,
      reason: row.reason, week: row.week, year: row.year, time: row.time });
  }
  return clean.slice(-80);
}

export function saveLearningDecision(entries, input) {
  const normalized = normalizeLearningEntries([input]);
  if (!normalized.length) throw new Error("Invalid IQ feedback selection.");
  const entry = normalized[0];
  return normalizeLearningEntries([...normalizeLearningEntries(entries).filter(old =>
    !(old.site === entry.site && old.code === entry.code && old.week === entry.week && old.year === entry.year)), entry]);
}

export function summarizeLearning(entries, site, issues = []) {
  const allowed = new Set(issues.map(item => item?.code).filter(code => ISSUE.test(code || "")));
  const relevant = normalizeLearningEntries(entries).filter(entry => entry.site === site && allowed.has(entry.code));
  const byCode = {};
  for (const item of relevant) {
    const score = byCode[item.code] || { useful: 0, needs_review: 0, reasons: {} };
    score[item.decision]++;
    score.reasons[item.reason] = (score.reasons[item.reason] || 0) + 1;
    byCode[item.code] = score;
  }
  return { site, total: relevant.length, useful: relevant.filter(item => item.decision === "useful").length,
    needsReview: relevant.filter(item => item.decision === "needs_review").length, byCode };
}

// Feedback changes display priority within a severity tier, never evidence or risk severity.
export function orderIssuesWithLearning(issues, summary) {
  const severity = { high: 0, review: 1, info: 2 };
  return [...issues].sort((a, b) => (severity[a.severity] ?? 3) - (severity[b.severity] ?? 3) ||
    ((summary?.byCode?.[b.code]?.useful || 0) - (summary?.byCode?.[b.code]?.needs_review || 0)) -
    ((summary?.byCode?.[a.code]?.useful || 0) - (summary?.byCode?.[a.code]?.needs_review || 0)));
}

export function appendApprovedLearningContext(context, summary) {
  if (!summary || !SITE.test(summary.site || "")) return context;
  const allowed = Object.entries(summary.byCode || {}).filter(([code]) => ISSUE.test(code)).slice(0, 15)
    .map(([code, item]) => ({ code, markedUseful: Math.min(80, Math.max(0, Number(item.useful) || 0)),
      needsManualReview: Math.min(80, Math.max(0, Number(item.needs_review) || 0)) }));
  return JSON.stringify({ report: JSON.parse(context), userReviewedChecks: { site: summary.site, history: allowed,
    caution: "These are operator preferences, not verified outcomes or trained model weights." } });
}
