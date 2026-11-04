// AI Lab only. Deterministic, read-only diagnostics; no model training or writes.
import { summarizeLiveData } from "./live-summary.mjs";

export const BRAIN_PERIOD = /^W(?:[1-9]|[1-4][0-9]|5[0-3])(?::20\d{2}-\d{2}-\d{2})?$/;
export const BRAIN_METRICS = [
  { field: "dcr", label: "DCR", higherBetter: true, unit: "%" },
  { field: "pod", label: "POD", higherBetter: true, unit: "%" },
  { field: "iadc", label: "IADC", higherBetter: true, unit: "%" },
  { field: "cdf_dpmo", label: "CDF DPMO", higherBetter: false, unit: " DPMO" },
  { field: "concessions", label: "Concessions (metric record)", higherBetter: false, unit: "" },
];

const numeric = value => value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
const round = number => Math.round(number * 100) / 100;
const mean = values => values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
const isUuid = id => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id || ""));

export function normalizeBrainPeriods(input) {
  if (!Array.isArray(input) || input.length > 12 || !input.length) throw new Error("Choose 1–12 reporting periods.");
  const periods = input.map(value => String(value).toUpperCase().trim());
  if (periods.some(period => !BRAIN_PERIOD.test(period)) || new Set(periods).size !== periods.length) throw new Error("Invalid or duplicate Amazon week labels.");
  return periods;
}

function average(rows, field) {
  return mean(rows.map(row => numeric(row?.[field])).filter(value => value !== null));
}

export function analyseBrain({ site, periods, metricRows = [], feedbackRows = [], concessionRows = [], drivers = [], truncated = false }) {
  if (!/^[A-Z0-9]{3,6}$/.test(site)) throw new Error("Invalid site.");
  const selected = normalizeBrainPeriods(periods);
  const series = selected.map(period => {
    const metrics = metricRows.filter(row => row.week_label === period);
    const feedback = feedbackRows.filter(row => row.week_label === period);
    const concessions = concessionRows.filter(row => row.week_label === period);
    const report = summarizeLiveData({ site, period, metricRows: metrics, feedbackRows: feedback, concessionRows: concessions, truncated: { metrics: truncated, feedback: truncated, concessions: truncated } });
    return {
      period,
      metrics: Object.fromEntries(BRAIN_METRICS.map(spec => [spec.field, {
        mean: average(metrics, spec.field),
        rows: metrics.filter(row => numeric(row?.[spec.field]) !== null).length,
      }])),
      feedbackRecords: report.coverage.feedbackEvents,
      dnrSnapshotSum: report.concessions.totalDnrAcrossReturnedSnapshotRows,
      coverage: report.coverage,
    };
  });

  const alerts = [];
  for (const spec of BRAIN_METRICS) {
    const values = series.map(item => ({ period: item.period, ...item.metrics[spec.field] })).filter(item => item.mean !== null);
    if (values.length < 2) continue;
    const latest = values.at(-1), previous = values.at(-2);
    const rawDelta = round(latest.mean - previous.mean);
    const deterioration = spec.higherBetter ? rawDelta < 0 : rawDelta > 0;
    const magnitude = Math.abs(rawDelta);
    const threshold = spec.unit === "%" ? 0.5 : 1;
    if (!deterioration || magnitude < threshold) continue;
    const three = values.length >= 3 && (spec.higherBetter
      ? values.at(-3).mean > previous.mean && previous.mean > latest.mean
      : values.at(-3).mean < previous.mean && previous.mean < latest.mean);
    alerts.push({
      id: "trend_" + spec.field, category: "trend", severity: three ? "high" : "review",
      title: spec.label + (three ? " · 3-period deterioration" : " · recent deterioration"),
      evidence: `${previous.period}: ${previous.mean}${spec.unit} (${previous.rows} rows); ${latest.period}: ${latest.mean}${spec.unit} (${latest.rows} rows). Change ${rawDelta > 0 ? "+" : ""}${rawDelta}${spec.unit === "%" ? " pp" : spec.unit}.`,
      action: "Check import coverage, period comparability and source evidence before attributing a cause.",
      periods: [previous.period, latest.period],
    });
  }
  const missing = series.filter(item => item.coverage.metricRecords === 0).map(item => item.period);
  if (missing.length) alerts.unshift({ id: "missing_periods", category: "coverage", severity: "review", title: "Missing metric records", evidence: "No authorised driver_metrics rows in " + missing.join(", ") + ".", action: "Check week labels and imported data; zero records do not mean zero problems.", periods: missing });
  if (truncated) alerts.unshift({ id: "truncated", category: "coverage", severity: "high", title: "Partial data – source cap reached", evidence: "At least one authorised source exceeded the row limit.", action: "Reduce the number of periods or compare separately. Never interpret partial totals as official scores.", periods: selected });
  if (selected.length < 3) alerts.push({ id: "short_history", category: "coverage", severity: "review", title: "Short historical window", evidence: selected.length + " period(s) selected.", action: "Use at least three comparable weekly periods for trend-based early warnings.", periods: selected });

  const allowedIds = new Set(drivers.map(driver => String(driver.id)));
  const names = new Map(drivers.filter(driver => isUuid(driver.id) && String(driver.site || "").toUpperCase() === site).map(driver => [driver.id, String(driver.full_name || "").trim().slice(0, 90)]));
  const perDriver = new Map();
  for (const row of metricRows) {
    if (!isUuid(row.driver_id) || !allowedIds.has(row.driver_id) || !selected.includes(row.week_label)) continue;
    if (!perDriver.has(row.driver_id)) perDriver.set(row.driver_id, new Map());
    const byPeriod = perDriver.get(row.driver_id);
    if (!byPeriod.has(row.week_label)) byPeriod.set(row.week_label, []);
    byPeriod.get(row.week_label).push(row);
  }
  const driverSignals = [];
  for (const [driverId, history] of perDriver) {
    const points = selected.filter(period => history.has(period)).map(period => {
      const rows = history.get(period);
      return { period, dcr: average(rows, "dcr"), pod: average(rows, "pod"), iadc: average(rows, "iadc"), cdfDpmo: average(rows, "cdf_dpmo"), sourceRows: rows.length };
    });
    if (points.length < 2) continue;
    const latest = points.at(-1), previous = points.at(-2);
    const signals = [];
    for (const [key, label, floor] of [["iadc", "IADC", 80], ["dcr", "DCR", 98], ["pod", "POD", 98]]) {
      if (latest[key] !== null && latest[key] < floor) signals.push(`${label} ${latest[key]}% (diagnostic threshold ${floor}%)`);
      if (latest[key] !== null && previous[key] !== null && latest[key] < previous[key] - 0.5) signals.push(`${label} down ${round(previous[key] - latest[key])} pp`);
    }
    if (latest.cdfDpmo !== null && previous.cdfDpmo !== null && latest.cdfDpmo > previous.cdfDpmo) signals.push("CDF DPMO increased");
    if (signals.length) driverSignals.push({ driverId, driverName: names.get(driverId) || "Unmatched driver", periods: points.length, from: previous.period, to: latest.period, latest, signals: [...new Set(signals)].slice(0, 5), sourceRows: points.reduce((sum, p) => sum + p.sourceRows, 0) });
  }
  driverSignals.sort((a, b) => b.signals.length - a.signals.length || a.driverName.localeCompare(b.driverName));

  // Only anonymous summaries may be offered to the third-party chat model.
  const context = JSON.stringify({
    source: "Verified Super Admin read-only RLS-scoped MetrixIQ aggregates; diagnostic, not official",
    site, selectedPeriods: selected, series: series.map(item => ({ period: item.period, metrics: Object.fromEntries(Object.entries(item.metrics).map(([key, value]) => [key, value.mean])), coverage: item.coverage })),
    alerts: alerts.slice(0, 8).map(({ title, evidence }) => ({ title, evidence })),
    driverRiskCount: driverSignals.length,
    driverRiskCategories: {
      iadc: driverSignals.filter(driver => driver.signals.some(signal => signal.startsWith("IADC"))).length,
      dcr: driverSignals.filter(driver => driver.signals.some(signal => signal.startsWith("DCR"))).length,
      pod: driverSignals.filter(driver => driver.signals.some(signal => signal.startsWith("POD"))).length,
    },
    limitations: "Source rows may overlap by import and period; not unique drivers. No names, TRIDs or IDs are included. Association is not causation; no predictive model is trained.",
  }).slice(0, 5000);

  return { site, periods: selected, series, alerts, driverSignals: driverSignals.slice(0, 40), driverSignalsTotal: driverSignals.length, context, truncated,
    description: "Early-warning patterns from historical source records; not a validated forecast or official Amazon score." };
}

export function sanitizeLearningNote(value) {
  const note = String(value || "").replace(/[\u0000-\u001f]/g, " ").trim().replace(/\s+/g, " ");
  if (note.length < 10 || note.length > 350) throw new Error("Write a general correction of 10–350 characters.");
  if (/@|\bUK\d{8,}\b|\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f-]{13,}\b|\b\+?\d{10,}\b/i.test(note)) throw new Error("Do not include emails, parcel numbers, phones or IDs in learning memory.");
  return note;
}
