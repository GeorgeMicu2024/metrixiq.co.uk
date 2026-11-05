// AI Lab only. Deterministic, RLS-report-based briefing; no database access,
// predictions, official scores, or mutations. Suitable for private AI context.
const METRICS = Object.freeze([
  { metric: "DCR", key: "dcr", unit: "%", higherBetter: true,
    action: "Check eligible delivery denominators, missing parcels and reported station exceptions." },
  { metric: "IADC", key: "iadc", unit: "%", higherBetter: true,
    action: "Review in-app compliance steps, customer instructions and Notify on Arrival evidence." },
  { metric: "POD", key: "pod", unit: "%", higherBetter: true,
    action: "Review photo reject reasons, clarity and required delivery evidence." },
  { metric: "CDF DPMO", key: "cdf_dpmo", unit: "DPMO", higherBetter: false,
    action: "Inspect actual negative feedback reasons before selecting coaching actions." },
  { metric: "Concessions (metric record)", key: "concessions", unit: "count", higherBetter: false,
    action: "Reconcile concession records with shipment status and source evidence." },
]);

const numberOrNull = value => typeof value === "number" && Number.isFinite(value) ? value : null;
const round = value => Math.round(value * 100) / 100;

function safeCoverage(value) {
  return {
    metricRecords: Math.max(0, Number(value?.metricRecords) || 0),
    feedbackEvents: Math.max(0, Number(value?.feedbackEvents) || 0),
    concessionSnapshotRecords: Math.max(0, Number(value?.concessionSnapshotRecords) || 0),
    truncated: value?.truncated === true,
  };
}

function findMetric(report, label) {
  return Array.isArray(report?.metricSummaries)
    ? report.metricSummaries.find(item => item?.metric === label) : null;
}

export function buildConnectedBriefing(current, previous = null, { partialDiscovery = false } = {}) {
  if (!current || !/^[A-Z0-9]{3,6}$/.test(String(current.site || "")) ||
      !/^W(?:[1-9]|[1-4][0-9]|5[0-3])(?::20\d{2}-\d{2}-\d{2})?$/.test(String(current.period || ""))) {
    throw new Error("Choose an authorised station and reporting week.");
  }
  const comparable = previous && previous.site === current.site && previous.period !== current.period ? previous : null;
  const coverage = safeCoverage(current.coverage);
  const previousCoverage = comparable ? safeCoverage(comparable.coverage) : null;
  const metrics = METRICS.map(spec => {
    const currentMetric = findMetric(current, spec.metric);
    const priorMetric = comparable ? findMetric(comparable, spec.metric) : null;
    const value = numberOrNull(currentMetric?.unweightedRecordMean);
    const before = numberOrNull(priorMetric?.unweightedRecordMean);
    const records = Math.max(0, Number(currentMetric?.numericRecords) || 0);
    const previousRecords = Math.max(0, Number(priorMetric?.numericRecords) || 0);
    const delta = value !== null && before !== null && records && previousRecords ? round(value - before) : null;
    return { key: spec.key, label: spec.metric, unit: spec.unit, value, before, delta,
      records, previousRecords, worsening: delta !== null && (spec.higherBetter ? delta < 0 : delta > 0), action: spec.action };
  });

  const warnings = [];
  if (!coverage.metricRecords) warnings.push("No accessible driver-metric records for this week. Missing data does not mean good performance.");
  if (coverage.truncated || previousCoverage?.truncated) warnings.push("At least one source reached its read limit. Counts and means may be partial.");
  if (partialDiscovery) warnings.push("The week list may be incomplete because the discovery query reached its limit.");
  if (comparable && previousCoverage?.metricRecords === 0) warnings.push("The comparison week has no accessible driver-metric records.");
  const lowerCoverage = previousCoverage?.metricRecords > 0 && coverage.metricRecords > 0 &&
    coverage.metricRecords < previousCoverage.metricRecords * 0.8;
  if (lowerCoverage) warnings.push(`The selected week has fewer metric records (${coverage.metricRecords} versus ${previousCoverage.metricRecords}). It may be incomplete or have different import coverage; trend comparisons need verification.`);
  if (!comparable) warnings.push("No comparable previous week is available; movement cannot be calculated.");
  warnings.push("Amazon W-number labels do not identify a year in this view; verify import dates before cross-year comparisons.");
  warnings.push("These are unweighted means across accessible metric rows, not official Amazon site scores. Source rows may overlap.");

  const focus = [];
  if (!coverage.metricRecords) focus.push({ title: "Verify report coverage", detail: "No driver-metric rows were returned for the selected week.",
    action: "Check that the correct station and weekly report were imported." });
  if (lowerCoverage) focus.push({ title: "Check week completeness",
    detail: `Only ${coverage.metricRecords} metric rows are available versus ${previousCoverage.metricRecords} in ${comparable.period}. This may reflect partial imports or changed route volume.`,
    action: "Confirm both weeks have comparable imports before interpreting metric movement." });
  if (coverage.truncated) focus.push({ title: "Review partial source data", detail: "The source cap was reached; totals and averages may be incomplete.",
    action: "Use a narrower reporting scope and verify the underlying source before making decisions." });
  for (const metric of metrics.filter(item => item.worsening && item.records > 0)) {
    focus.push({ title: metric.label + " needs review",
      detail: `${metric.label} moved from ${metric.before} to ${metric.value} ${metric.unit === "%" ? "%" : metric.unit} across available unweighted records (${metric.previousRecords} before, ${metric.records} now).`,
      action: metric.action });
  }
  if (!focus.length) focus.push({ title: "Check available evidence",
    detail: "No deterioration could be established from comparable numeric records. This does not prove the station is problem-free.",
    action: "Review feedback reasons, missing periods and the official scorecard before setting priorities." });

  const top = focus.slice(0, 3);
  const context = JSON.stringify({
    source: "MetrixIQ Connected Intelligence; caller-authorised Supabase RLS summaries; read-only and descriptive",
    site: current.site, currentPeriod: current.period, previousPeriod: comparable?.period || null,
    coverage, previousCoverage,
    metrics: metrics.map(({ key, label, unit, value, before, delta, records, previousRecords }) =>
      ({ key, label, unit, unweightedRecordMean: value, previousUnweightedMean: before, delta, numericRows: records, previousNumericRows: previousRecords })),
    feedbackEventCount: coverage.feedbackEvents,
    priorities: top, limitations: warnings,
    officialScorecard: "Not available from this aggregate endpoint; never infer or invent a tier or weighted score",
    personallyIdentifyingData: "None included",
  }).slice(0, 5800);
  return { site: current.site, period: current.period, previousPeriod: comparable?.period || null,
    coverage, previousCoverage, metrics, focus: top, warnings, context };
}
