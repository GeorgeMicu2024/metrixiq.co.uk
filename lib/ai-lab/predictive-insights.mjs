// AI Lab only. A transparent, one-week statistical projection from existing
// RLS-scoped weekly aggregate summaries. No training, persistence, external
// prediction service, official score inference, or production writes.

const METRICS = Object.freeze([
  { key: "dcr", label: "DCR", unit: "%", higherBetter: true },
  { key: "iadc", label: "IADC", unit: "%", higherBetter: true },
  { key: "pod", label: "POD", unit: "%", higherBetter: true },
  { key: "cdf_dpmo", label: "CDF DPMO", unit: "DPMO", higherBetter: false },
]);

const PERIOD = /^W([1-9]|[1-4][0-9]|5[0-3])(?::20\d{2}-\d{2}-\d{2})?$/;
const finite = value => typeof value === "number" && Number.isFinite(value);
const round = value => Math.round(value * 100) / 100;
const median = values => {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
};

function dampedNext(values, metric) {
  const recent = values.slice(-4);
  const differences = recent.slice(1).map((value, index) => value - recent[index]);
  const last = recent.at(-1);
  const change = median(differences) * 0.75;
  // One-week caps avoid treating a short run of bad imports as unlimited growth.
  const cap = metric.unit === "%" ? 5 : Math.max(50, Math.min(500, last * 0.3));
  const bounded = last + Math.max(-cap, Math.min(cap, change));
  return round(metric.unit === "%" ? Math.max(0, Math.min(100, bounded)) : Math.max(0, bounded));
}

function withinMetricRange(value, metric) {
  return finite(value) && value >= 0 && (metric.unit !== "%" || value <= 100) && value <= 1000000;
}

function unavailable(metric, why) {
  return { key: metric.key, label: metric.label, unit: metric.unit,
    status: "unavailable", reason: why, confidence: "Insufficient evidence",
    forecast: null, indicativeRange: null, nextWeekChange: null, signal: null };
}

/** Does not claim calibrated predictive accuracy. Uses a tiny walk-forward holdout. */
export function buildPredictiveInsights(analysis) {
  if (!analysis || !/^[A-Z0-9]{3,6}$/.test(String(analysis.site || "")) ||
    !Array.isArray(analysis.series) || !Array.isArray(analysis.periods) ||
    analysis.series.length !== analysis.periods.length || analysis.series.length > 12 ||
    analysis.series.some((entry, index) => entry?.period !== analysis.periods[index] || !PERIOD.test(entry.period))) {
    throw new Error("A valid authorised historical analysis is required.");
  }

  const selected = analysis.periods;
  const weekNumbers = selected.map(period => Number(PERIOD.exec(period)[1]));
  // W52 -> W1 is an ambiguous year boundary unless dates have been verified.
  const consecutive = weekNumbers.every((week, index) => !index || week === weekNumbers[index - 1] + 1);
  const truncated = analysis.truncated === true || analysis.series.some(entry => entry.coverage?.truncated === true);
  const warnings = [
    "One-week projections of unweighted source-record means, not official Amazon scores or verified forecasts.",
    "Week labels alone do not establish a year; confirm the actual import dates and population before operational decisions.",
    "Source rows can overlap across imports; numerical projections do not establish cause or driver responsibility.",
  ];
  if (selected.length < 5) warnings.unshift("At least five consecutive reporting weeks are required for a provisional projection.");
  if (!consecutive) warnings.unshift("Selected weeks are not strictly consecutive, or cross an unresolved year boundary.");
  if (truncated) warnings.unshift("A source read limit was reached; projections are withheld until coverage is verified.");

  const forecasts = METRICS.map(metric => {
    if (selected.length < 5) return unavailable(metric, "Select at least five consecutive weeks with numeric source rows.");
    if (!consecutive) return unavailable(metric, "Week sequence is incomplete, out of order or crosses an unverified year boundary.");
    if (truncated) return unavailable(metric, "One or more source reports are truncated.");

    const points = analysis.series.map(entry => ({ value: entry.metrics?.[metric.key]?.mean,
      rows: entry.metrics?.[metric.key]?.rows }));
    if (points.some(point => !withinMetricRange(point.value, metric) || !Number.isSafeInteger(point.rows) || point.rows < 3)) {
      return unavailable(metric, "One or more weeks have missing, invalid or fewer than three numeric metric rows.");
    }
    const counts = points.map(point => point.rows);
    if (Math.min(...counts) < median(counts) * 0.65) {
      return unavailable(metric, "Metric source-row coverage differs too much between weeks to compare safely.");
    }

    const values = points.map(point => point.value);
    const latest = values.at(-1);
    const forecast = dampedNext(values, metric);
    const nextWeekChange = round(forecast - latest);
    const backtests = [];
    for (let index = 4; index < values.length; index++) {
      const projected = dampedNext(values.slice(0, index), metric);
      backtests.push({ error: Math.abs(projected - values[index]),
        naiveError: Math.abs(values[index - 1] - values[index]) });
    }
    const errors = backtests.map(entry => entry.error);
    const meanAbsoluteError = errors.length ? round(errors.reduce((sum, error) => sum + error, 0) / errors.length) : null;
    const baselineError = backtests.length ? round(backtests.reduce((sum, entry) => sum + entry.naiveError, 0) / backtests.length) : null;
    // Even when this tiny historical check beats persistence, it warrants at
    // most Moderate confidence; accuracy is not calibrated or guaranteed.
    const betterThanBaseline = backtests.length >= 2 && baselineError > 0 && meanAbsoluteError < baselineError * 0.85;
    const confidence = betterThanBaseline ? "Moderate (limited backtest)" : "Low (unvalidated trend)";
    const halfWidth = backtests.length >= 2 ? Math.max(metric.unit === "%" ? 1 : 20,
      round(meanAbsoluteError * 1.5), round(Math.abs(nextWeekChange) * 0.5)) : null;
    const indicativeRange = halfWidth === null ? null : [round(Math.max(0, forecast - halfWidth)),
      round(metric.unit === "%" ? Math.min(100, forecast + halfWidth) : forecast + halfWidth)];
    const deteriorating = metric.higherBetter ? nextWeekChange < 0 : nextWeekChange > 0;
    const threshold = metric.unit === "%" ? 0.5 : 5;
    const mayCrossIadcReference = metric.key === "iadc" && latest >= 80 && forecast < 80;
    const signal = betterThanBaseline && (mayCrossIadcReference || deteriorating && Math.abs(nextWeekChange) >= threshold)
      ? { kind: "watch", title: mayCrossIadcReference ? "IADC may fall below the 80% coaching reference" : `${metric.label} may deteriorate next week`,
        nextStep: "Review source consistency, recent changes and the official reports before taking action." } : null;

    return { key: metric.key, label: metric.label, unit: metric.unit, status: "projected",
      latest, forecast, nextWeekChange, indicativeRange, confidence, signal,
      model: "Damped median of the last three weekly movements",
      backtest: { holdouts: backtests.length, meanAbsoluteError, persistenceBaselineError: baselineError },
      sourceRows: counts, reason: betterThanBaseline
        ? "This method beat a no-change baseline on the available walk-forward checks; the sample is still small."
        : "Historical checks were too few or did not beat a no-change baseline. Do not rely on this estimate alone." };
  });

  const alerts = forecasts.filter(item => item.signal).map(item => ({ metric: item.label, ...item.signal,
    evidence: `${item.label}: last mean ${item.latest}${item.unit === "%" ? "%" : " DPMO"}; indicative next-week estimate ${item.forecast}${item.unit === "%" ? "%" : " DPMO"}.`,
    confidence: item.confidence }));
  if (!alerts.length) warnings.push("No backtest-supported early-warning projection was found. This does not mean there is no operational risk.");

  // Only derived, allowlisted metrics are sent to chat after an explicit opt-in.
  const context = JSON.stringify({
    source: "IQ Predictive Intelligence; RLS-authorised historical metric aggregates; read-only, heuristic",
    site: analysis.site, periods: selected,
    forecasts: forecasts.map(item => ({ metric: item.label, status: item.status,
      latest: item.latest ?? null, nextWeekEstimate: item.forecast, range: item.indicativeRange,
      confidence: item.confidence, backtest: item.backtest || null, reason: item.reason })),
    alerts, limitations: warnings,
    prohibitedInterpretation: "Not trained machine learning, calibrated probability, official score, verified incident or driver-specific prediction. No driver identities included.",
  });
  return { site: analysis.site, periods: selected, forecasts, alerts, warnings, context,
    description: "Read-only statistical scenario · next reporting week · no automatic actions" };
}
