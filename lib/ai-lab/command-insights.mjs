// Read-only, explainable AI Lab insights from existing authorised aggregate snapshots.
// These are descriptive signals, never official Amazon/DSP scores or causal findings.

const METRICS = [
  { label: "DCR", higherBetter: true },
  { label: "POD", higherBetter: true },
  { label: "IADC", higherBetter: true },
  { label: "CDF DPMO", higherBetter: false },
  { label: "Concessions (metric record)", higherBetter: false },
];

function finite(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function rounded(value) {
  return Math.round(value * 100) / 100;
}

function isValidReport(report) {
  return report && /^[A-Z0-9]{3,6}$/.test(String(report.site || "")) &&
    /^W(?:[1-9]|[1-4][0-9]|5[0-3])(?::20\d{2}-\d{2}-\d{2})?$/.test(String(report.period || "")) &&
    Array.isArray(report.metricSummaries) && report.coverage && typeof report.coverage === "object";
}

function metric(report, label) {
  const found = report.metricSummaries.find(item => item?.metric === label);
  if (!found || !Number.isInteger(found.numericRecords) || found.numericRecords < 1) return null;
  const mean = finite(found.unweightedRecordMean);
  if (mean === null) return null;
  return { label, unit: String(found.unit || ""), mean, records: found.numericRecords,
    unavailableRecords: Number(found.unavailableRecords) || 0 };
}

function feedbackCount(report) {
  return Math.max(0, Number(report.customerFeedback?.records) || 0);
}

function dnrCount(report) {
  return Math.max(0, Number(report.concessions?.totalDnrAcrossReturnedSnapshotRows) || 0);
}

function coverage(report) {
  return {
    metricRecords: Math.max(0, Number(report.coverage.metricRecords) || 0),
    feedbackEvents: Math.max(0, Number(report.coverage.feedbackEvents) || 0),
    concessionSnapshotRecords: Math.max(0, Number(report.coverage.concessionSnapshotRecords) || 0),
    truncated: report.coverage.truncated === true,
  };
}

export function buildDailyBriefing(report) {
  if (!isValidReport(report)) throw new Error("An authorised aggregate report is required.");
  const sourceCoverage = coverage(report);
  const metrics = METRICS.map(definition => metric(report, definition.label));
  const alerts = [];
  function alert(severity, code, title, explanation) { alerts.push({ severity, code, title, explanation }); }

  if (sourceCoverage.truncated) alert("high", "partial_rows", "Source preview was truncated", "Counts and averages may be partial; do not treat them as official totals.");
  if (!sourceCoverage.metricRecords) alert("high", "missing_metrics", "No matching metric rows", "Check the selected Amazon week and the authorised import coverage; zero rows do not mean zero problems.");
  const iadc = metrics[2];
  if (iadc && iadc.mean < 80) alert("high", "iadc_below_80", "IADC needs attention", "The descriptive record mean is below the 80% operational target; review NOA and customer-contact practice.");
  const missing = metrics.filter(item => item === null).length;
  if (missing) alert("medium", "missing_measurements", "Some metrics have no numeric values", `${missing} of ${METRICS.length} metric groups cannot be evaluated from the selected records.`);
  if (feedbackCount(report)) alert("medium", "cdf_feedback_events", "Customer feedback records present", "Review feedback categories before attributing any cause to a driver.");
  if (dnrCount(report)) alert("medium", "dnr_snapshot_records", "DNR snapshot values present", "Check concession evidence; snapshot sums are not verified unique concessions.");
  if (!alerts.length) alert("info", "review_complete", "No predefined alert triggered", "This is not proof of Fantastic performance; validate the underlying reports.");

  const nextActions = [];
  if (alerts.some(item => item.code === "partial_rows" || item.code === "missing_metrics" || item.code === "missing_measurements"))
    nextActions.push("Confirm report completeness, station and Amazon week before making decisions.");
  if (alerts.some(item => item.code === "iadc_below_80"))
    nextActions.push("Coach NOA/customer contact and following the app's recommended delivery option; verify driver-level evidence separately.");
  if (feedbackCount(report)) nextActions.push("Review customer feedback categories and identify concrete POD/placement examples.");
  if (dnrCount(report)) nextActions.push("Investigate DNR concessions using the normal evidence and exemption workflow.");
  if (!nextActions.length) nextActions.push("Check daily exceptions and compare the next authorised reporting period.");

  return { site: report.site, period: report.period, coverage: sourceCoverage,
    metrics: metrics.map((item, index) => item || { label: METRICS[index].label, mean: null, records: 0, unit: "" }),
    alerts, nextActions: nextActions.slice(0, 4),
    caveat: "A briefing generated from the selected Amazon reporting period, not verified today's live dispatch state." };
}

export function detectPerformanceSignals(report) {
  if (!isValidReport(report)) throw new Error("An authorised aggregate report is required.");
  const iadc = metric(report, "IADC");
  const pod = metric(report, "POD");
  const dcr = metric(report, "DCR");
  const feedback = feedbackCount(report);
  const dnr = dnrCount(report);
  const signals = [];
  const push = (code, title, evidence, investigate) => signals.push({ code, title, evidence, investigate,
    caveat: "Possible connection only. These aggregates cannot establish individual responsibility or causation." });
  if (iadc && iadc.mean < 80 && feedback) push("iadc_cdf", "Contact compliance and feedback deserve a joint review",
    `IADC descriptive mean ${iadc.mean}% with ${feedback} feedback source records.`,
    "Compare NOA/contact behaviour with categorised feedback using separately authorised driver evidence.");
  if (pod && pod.mean < 98 && feedback) push("pod_cdf", "Check whether POD quality relates to customer feedback",
    `POD descriptive mean ${pod.mean}% and ${feedback} feedback source records. The 98% trigger is diagnostic, not an official threshold.`,
    "Review blurry or bypassed photos and the feedback categories; don't infer a shared cause from these totals.");
  if (dcr && dcr.mean < 98 && dnr) push("dcr_dnr", "Investigate DCR alongside DNR records",
    `DCR descriptive mean ${dcr.mean}% and DNR snapshot sum ${dnr}. The 98% trigger is diagnostic only.`,
    "Check station-side missing, RTS/OOR, failed pickup and exemption classifications before assigning blame.");
  if (dnr && feedback) push("dnr_feedback", "DNR and customer feedback appear in the same period",
    `${dnr} summed DNR snapshot values and ${feedback} feedback source records.`,
    "Compare incident types and time windows; co-occurrence is not evidence of the same cause.");
  if (!signals.length) push("insufficient_correlation", "No supported cross-metric signal identified",
    "The selected aggregate values do not support a specific cross-metric hypothesis.",
    "Review category breakdown and request more complete reporting before drawing conclusions.");
  return { site: report.site, period: report.period, signals, truncated: coverage(report).truncated,
    caveat: "Hypotheses for investigation only, not automated driver findings." };
}

export function compareReportPeriods(current, previous) {
  if (!isValidReport(current) || !isValidReport(previous)) throw new Error("Two authorised aggregate reports are required.");
  if (current.site !== previous.site) throw new Error("Comparisons must use the same station.");
  if (current.period === previous.period) throw new Error("Choose two different Amazon reporting periods.");
  const changes = METRICS.map(definition => {
    const now = metric(current, definition.label);
    const before = metric(previous, definition.label);
    const delta = now && before && now.unit === before.unit ? rounded(now.mean - before.mean) : null;
    return { label: definition.label, unit: now?.unit || before?.unit || "", current: now?.mean ?? null,
      previous: before?.mean ?? null, currentRecords: now?.records || 0, previousRecords: before?.records || 0,
      delta, direction: delta === null ? "insufficient-data" : delta > 0 ? "up" : delta < 0 ? "down" : "unchanged",
      diagnosticDirection: delta === null || delta === 0 ? "unknown" : (delta > 0) === definition.higherBetter ? "favourable" : "unfavourable" };
  });
  const currCoverage = coverage(current), prevCoverage = coverage(previous);
  const warnings = ["Changes are differences in unweighted record means, never official site performance movements."];
  if (currCoverage.truncated || prevCoverage.truncated) warnings.push("At least one source is truncated; do not treat the change as a final total.");
  if (!currCoverage.metricRecords || !prevCoverage.metricRecords) warnings.push("One period has no metric source records.");
  if (currCoverage.metricRecords !== prevCoverage.metricRecords) warnings.push("Source row counts differ; comparisons may reflect different populations/imports.");
  return { site: current.site, currentPeriod: current.period, previousPeriod: previous.period,
    currentCoverage: currCoverage, previousCoverage: prevCoverage, changes, warnings };
}

export function buildCommandInsights(current, previous = null) {
  const briefing = buildDailyBriefing(current);
  const detective = detectPerformanceSignals(current);
  const trend = previous ? compareReportPeriods(current, previous) : null;
  // No raw rows, names, TRIDs, tracking numbers, or customer text in AI context.
  const context = {
    source: "Super-Admin-authorised, RLS-scoped MetrixIQ aggregate snapshots; read-only",
    station: briefing.site, currentPeriod: briefing.period, previousPeriod: trend?.previousPeriod || null,
    coverage: briefing.coverage,
    descriptiveMetrics: briefing.metrics.map(({ label, mean, unit, records }) => ({ label, mean, unit, records })),
    briefingAlerts: briefing.alerts.map(({ code, severity }) => ({ code, severity })),
    hypotheses: detective.signals.map(({ code, title }) => ({ code, title })),
    periodChanges: trend?.changes.map(({ label, delta, unit, currentRecords, previousRecords, direction }) =>
      ({ label, delta, unit, currentRecords, previousRecords, direction })) || [],
    limitations: ["Unweighted means; overlapping source records possible; counts are not verified unique drivers or incidents.",
      "No causal inference, official scores, station edits or driver responsibility determination.",
      "No names, TRIDs, parcel numbers, raw rows or customer content were shared."],
  };
  return { briefing, detective, trend, context: JSON.stringify(context).slice(0, 5200) };
}
