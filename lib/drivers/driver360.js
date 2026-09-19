import { TARGETS } from "../config/performance.js";

const METRICS = Object.freeze([
  { key: "dcr", label: "DCR", target: TARGETS.dcr, higherBetter: true },
  { key: "pod", label: "POD", target: TARGETS.pod, higherBetter: true },
  { key: "iadc", label: "IADC", target: TARGETS.iadc, higherBetter: true },
  { key: "cc", label: "CC", target: TARGETS.cc, higherBetter: true },
  { key: "mentor", label: "Mentor", target: TARGETS.mentor, higherBetter: true },
  { key: "concessions", label: "Concessions", target: null, higherBetter: false },
]);

export function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mentorValue(row) {
  return numberOrNull(row?.mentor_score ?? row?.ementor ?? row?.fico);
}

export function driverMetricValue(row, key) {
  if (key === "mentor") return mentorValue(row);
  return numberOrNull(row?.[key]);
}

function deltaTone(delta, higherBetter) {
  if (delta == null || delta === 0) return "neutral";
  const improved = higherBetter ? delta > 0 : delta < 0;
  return improved ? "good" : "bad";
}

function riskLevel(value) {
  const risk = String(value || "").toLowerCase();
  if (risk === "high") return 3;
  if (risk === "medium") return 2;
  if (risk === "low") return 1;
  return 0;
}

export function buildDriver360Snapshot(driver = {}, history = []) {
  const periods = Array.isArray(history) ? history.filter(Boolean) : [];
  const latest = periods.at(-1) || {};
  const previous = periods.at(-2) || null;

  const current = {
    ...driver,
    ...latest,
    mentor_score:
      latest.mentor_score ??
      latest.ementor ??
      latest.fico ??
      driver.mentor_score ??
      driver.ementor ??
      driver.fico,
  };

  const metricDeltas = METRICS.map((metric) => {
    const currentValue = driverMetricValue(current, metric.key);
    const previousValue = previous ? driverMetricValue(previous, metric.key) : null;
    const delta =
      currentValue != null && previousValue != null
        ? Number((currentValue - previousValue).toFixed(2))
        : null;

    return {
      ...metric,
      current: currentValue,
      previous: previousValue,
      delta,
      tone: deltaTone(delta, metric.higherBetter),
      targetMet:
        metric.target == null || currentValue == null
          ? null
          : currentValue >= metric.target,
    };
  });

  const measured = metricDeltas.filter((metric) => metric.current != null).length;
  const coverage = Math.round((measured / METRICS.length) * 100);

  const currentPerformance =
    numberOrNull(current.performance) ??
    numberOrNull(driver.performance);
  const previousPerformance = previous ? numberOrNull(previous.performance) : null;
  const performanceDelta =
    currentPerformance != null && previousPerformance != null
      ? Number((currentPerformance - previousPerformance).toFixed(1))
      : null;

  const recent = periods.slice(-4);
  const concessionValues = recent
    .map((period) => numberOrNull(period.concessions))
    .filter((value) => value != null);

  const fourWeekConcessions = concessionValues.reduce((sum, value) => sum + value, 0);
  const concessionWeeks = concessionValues.filter((value) => value > 0).length;

  const latestRisk = String(current.risk || driver.risk || "Low");
  const previousRisk = previous?.risk ? String(previous.risk) : null;
  const riskDelta =
    previousRisk == null
      ? null
      : riskLevel(latestRisk) - riskLevel(previousRisk);

  return {
    periods,
    latest,
    previous,
    current,
    metricDeltas,
    coverage,
    currentPerformance,
    previousPerformance,
    performanceDelta,
    performanceTone: deltaTone(performanceDelta, true),
    fourWeekConcessions,
    concessionWeeks,
    latestRisk,
    previousRisk,
    riskDelta,
    latestLabel:
      latest.week_label ||
      latest.period_end ||
      driver.weekLabel ||
      "Latest period",
    previousLabel:
      previous?.week_label ||
      previous?.period_end ||
      null,
    confidence:
      numberOrNull(latest.data_confidence) ??
      numberOrNull(driver.dataConfidence),
  };
}

export function formatDriverDelta(delta, suffix = "") {
  if (delta == null) return "No comparison";
  if (delta === 0) return "No change";
  return `${delta > 0 ? "+" : ""}${delta}${suffix}`;
}
