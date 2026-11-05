// Private AI Lab only. Evidence-based operational checks from authorised, read-only
// aggregate summaries. No model training, database writes or official score inference.

const METRIC_RULES = Object.freeze({
  iadc: { label: "IADC", higherBetter: true, followUp: "Review first-option compliance, Notify on Arrival and customer-instruction evidence." },
  dcr: { label: "DCR", higherBetter: true, followUp: "Reconcile eligible parcels, station exceptions, missing items and RTS classifications." },
  pod: { label: "POD", higherBetter: true, followUp: "Inspect rejected or bypassed photos and coaching evidence before contacting drivers." },
  cdf_dpmo: { label: "CDF DPMO", higherBetter: false, followUp: "Review actual feedback categories and dates before attributing negative feedback." },
  concessions: { label: "Concessions", higherBetter: false, followUp: "Reconcile weekly concessions with source shipments, DNR reasons and approved exceptions." },
});

const rank = { high: 0, watch: 1, verify: 2 };
const finite = value => typeof value === "number" && Number.isFinite(value);
const bounded = value => Number.isSafeInteger(value) && value > 0 ? Math.min(value, 1000000) : 0;
const display = (value, unit) => `${value}${unit === "%" ? "%" : unit === "DPMO" ? " DPMO" : ""}`;

/** Build a deterministic queue from the already sanitised Connected Briefing. */
export function buildIqActionCenter(briefing) {
  if (!briefing || !/^[A-Z0-9]{3,6}$/.test(String(briefing.site || "")) ||
    !/^W(?:[1-9]|[1-4][0-9]|5[0-3])(?::20\d{2}-\d{2}-\d{2})?$/.test(String(briefing.period || "")) ||
    !Array.isArray(briefing.metrics)) throw new Error("A valid authorised weekly briefing is required.");

  const coverage = briefing.coverage || {};
  const priorCoverage = briefing.previousCoverage || {};
  const currentRows = bounded(coverage.metricRecords);
  const priorRows = bounded(priorCoverage.metricRecords);
  const truncated = coverage.truncated === true || priorCoverage.truncated === true;
  const limited = truncated || !currentRows || (priorRows > 0 && currentRows < priorRows * 0.8);
  const confidence = limited ? "Limited source coverage" : "Descriptive aggregate evidence";
  const tasks = [];
  const add = (id, severity, category, title, evidence, nextStep, basis) => {
    tasks.push({ id, severity, category, title, evidence, nextStep, basis, confidence });
  };

  if (!currentRows) add("missing_source", "high", "data", "Verify imported reporting data",
    `No accessible metric rows were returned for ${briefing.site} ${briefing.period}.`,
    "Check the selected station, week and import completeness. Zero rows do not mean zero incidents.", "Missing source coverage");
  if (truncated) add("partial_source", "high", "data", "Check the source read limit",
    "At least one weekly report reached a read limit; counts and averages may be partial.",
    "Inspect the original imports and narrow the scope before interpreting performance.", "Truncated report");
  if (priorRows && currentRows && currentRows < priorRows * 0.8) add("coverage_drop", "high", "data", "Check week-to-week coverage",
    `${currentRows} accessible metric rows versus ${priorRows} in ${briefing.previousPeriod}.`,
    "Confirm import completeness and comparable reporting populations before investigating changes.", "Coverage fell by more than 20%");

  // The 80% IADC threshold is an operational review reference, never an
  // official Amazon station-score calculation on these unweighted rows.
  const iadc = briefing.metrics.find(metric => metric?.key === "iadc");
  if (currentRows && finite(iadc?.value) && bounded(iadc.records) && iadc.value < 80) {
    add("iadc_reference", "high", "performance", "Review IADC against the 80% reference",
      `Unweighted IADC mean ${display(iadc.value, "%")} across ${bounded(iadc.records)} numeric rows; this is below the 80% coaching reference.`,
      METRIC_RULES.iadc.followUp, "Reference check, not official compliance");
  }

  for (const [key, spec] of Object.entries(METRIC_RULES)) {
    const metric = briefing.metrics.find(item => item?.key === key);
    if (!metric || !currentRows || !bounded(metric.records) || !bounded(metric.previousRecords) ||
      !finite(metric.value) || !finite(metric.before) || !finite(metric.delta)) continue;
    const unfavourable = spec.higherBetter ? metric.delta < 0 : metric.delta > 0;
    if (!unfavourable) continue;
    const change = `${metric.delta > 0 ? "+" : ""}${metric.delta}${metric.unit === "%" ? " pp" : metric.unit === "DPMO" ? " DPMO" : ""}`;
    add(`trend_${key}`, key === "iadc" && metric.delta <= -5 ? "high" : "watch", "performance",
      `${spec.label} needs a trend review`,
      `Unweighted mean ${display(metric.before, metric.unit)} → ${display(metric.value, metric.unit)} (${change}); numeric rows ${bounded(metric.previousRecords)} → ${bounded(metric.records)}.`,
      spec.followUp, "Week-to-week change in record means");
  }

  if (!briefing.previousPeriod || !priorRows || !currentRows) add("comparison_missing", "verify", "data", "Check historical comparison",
    "No complete, comparable pair of weekly metric summaries is available.",
    "Confirm weekly import dates and the reporting year before comparing W-number labels.", "Trend evidence is unavailable");

  tasks.sort((a, b) => rank[a.severity] - rank[b.severity] || a.id.localeCompare(b.id));
  if (!tasks.length) add("review_evidence", "verify", "data", "Review evidence before concluding",
    "No supported deterioration or coverage issue was detected in the available aggregates.",
    "Check official Amazon scorecards, feedback reasons and CHECK LOR separately; these are not available in this snapshot.", "Absence of a signal is not proof of good performance");

  const counts = { high: tasks.filter(task => task.severity === "high").length,
    watch: tasks.filter(task => task.severity === "watch").length,
    verify: tasks.filter(task => task.severity === "verify").length };
  const contextData = {
    source: "IQ Action Center: deterministic checks on user-authorised, RLS-scoped weekly aggregates",
    station: briefing.site, week: briefing.period, comparedWith: briefing.previousPeriod || null,
    coverage: { metricRows: currentRows, previousMetricRows: priorRows, truncated },
    metrics: briefing.metrics.filter(metric => METRIC_RULES[metric?.key]).map(metric => ({
      name: METRIC_RULES[metric.key].label,
      unweightedMean: finite(metric.value) ? metric.value : null,
      previousUnweightedMean: finite(metric.before) ? metric.before : null,
      delta: finite(metric.delta) ? metric.delta : null,
      unit: metric.unit, rows: bounded(metric.records), previousRows: bounded(metric.previousRecords),
    })),
    actions: tasks.slice(0, 10).map(({ id, severity, title, evidence, nextStep, basis }) =>
      ({ id, severity, title, evidence, nextStep, basis })),
    limitations: "Read-only advisory triage, not daily live dispatch, official station scores, verified incidents, causal findings, predictions or a trained ML model. No driver/customer identifiers included.",
  };
  while (JSON.stringify(contextData).length > 5800 && contextData.actions.length > 1) contextData.actions.pop();
  return { site: briefing.site, period: briefing.period, counts, tasks, context: JSON.stringify(contextData),
    notice: "Weekly descriptive evidence only · official Scorecards and CHECK LOR are not connected to this view." };
}
