import { TARGETS } from "../config/performance.js";
import { isUsablePersonName } from "../identity.js";

const METRICS = Object.freeze([
  { key: "dcr", label: "DCR", target: TARGETS.dcr, weight: 2 },
  { key: "pod", label: "POD", target: TARGETS.pod, weight: 2 },
  { key: "iadc", label: "IADC", target: TARGETS.iadc, weight: 2 },
  { key: "mentor", label: "Mentor", target: TARGETS.mentor, weight: 1 },
  { key: "cc", label: "Contact Compliance", target: TARGETS.cc, weight: 1 },
]);

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mentorScore(driver) {
  return number(driver?.mentor_score ?? driver?.ementor ?? driver?.fico);
}

function metricValue(driver, key) {
  if (key === "mentor") return mentorScore(driver);
  return number(driver?.[key]);
}

function riskWeight(risk) {
  const value = String(risk || "").toLowerCase();
  if (value === "high") return 4;
  if (value === "medium") return 2;
  return 0;
}

function driverPriority(driver) {
  let score = riskWeight(driver?.risk);
  const reasons = [];

  for (const metric of METRICS) {
    const value = metricValue(driver, metric.key);
    if (value != null && value < metric.target) {
      score += metric.weight;
      reasons.push(`${metric.label} below target`);
    }
  }

  const concessions = number(driver?.concessions);
  if (concessions != null && concessions >= 3) {
    score += 2;
    reasons.push("Repeated concessions");
  }

  if (!isUsablePersonName(driver?.name)) {
    score += 2;
    reasons.push("Identity unresolved");
  }

  const confidence = number(driver?.dataConfidence);
  if (confidence != null && confidence < 70) {
    score += 1;
    reasons.push("Low data confidence");
  }

  return { score, reasons };
}

function trendSignal(history = []) {
  const values = history
    .map((row) => ({
      label: row?.week_label || row?.weekLabel || row?.period_end || row?.periodEnd || "",
      value: number(row?.performance),
    }))
    .filter((row) => row.value != null);

  if (values.length < 2) {
    return { direction: "insufficient", delta: null, latest: values.at(-1)?.value ?? null };
  }

  const latest = values.at(-1).value;
  const previous = values.at(-2).value;
  const delta = Number((latest - previous).toFixed(1));

  return {
    direction: delta < -1 ? "down" : delta > 1 ? "up" : "flat",
    delta,
    latest,
    previous,
  };
}

export function buildFleetIntelligence(drivers = [], kpis = {}, history = []) {
  const highRisk = drivers.filter((driver) => String(driver?.risk || "").toLowerCase() === "high").length;
  const mediumRisk = drivers.filter((driver) => String(driver?.risk || "").toLowerCase() === "medium").length;
  const unresolved = drivers.filter((driver) => !isUsablePersonName(driver?.name)).length;
  const lowConfidence = drivers.filter((driver) => {
    const confidence = number(driver?.dataConfidence);
    return confidence != null && confidence < 70;
  }).length;

  const evidence = METRICS.map((metric) => {
    const below = drivers.filter((driver) => {
      const value = metricValue(driver, metric.key);
      return value != null && value < metric.target;
    }).length;

    const measured = drivers.filter((driver) => metricValue(driver, metric.key) != null).length;

    return {
      ...metric,
      below,
      measured,
      coverage: drivers.length ? Math.round((measured / drivers.length) * 100) : 0,
    };
  });

  const populatedCells = evidence.reduce((sum, metric) => sum + metric.measured, 0);
  const possibleCells = Math.max(1, drivers.length * METRICS.length);
  const completeness = Math.round((populatedCells / possibleCells) * 100);

  const priorityDrivers = drivers
    .map((driver) => {
      const priority = driverPriority(driver);
      return { driver, ...priority };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) =>
      b.score - a.score ||
      Number(b.driver?.concessions || 0) - Number(a.driver?.concessions || 0) ||
      String(a.driver?.name || "").localeCompare(String(b.driver?.name || ""))
    );

  const trend = trendSignal(history);
  const actions = [];

  if (highRisk > 0) {
    actions.push({
      id: "coaching",
      severity: "high",
      destination: "coaching",
      title: `Coach ${highRisk} high-risk driver${highRisk === 1 ? "" : "s"}`,
      text: "Prioritise repeated KPI failures and concessions before the next reporting cycle.",
    });
  }

  if (unresolved > 0) {
    actions.push({
      id: "identity",
      severity: "medium",
      destination: "data-quality",
      title: `Resolve ${unresolved} driver identit${unresolved === 1 ? "y" : "ies"}`,
      text: "Trusted identity mapping improves scorecards, history and coaching accuracy.",
    });
  }

  if (completeness < 75) {
    actions.push({
      id: "evidence",
      severity: "medium",
      destination: "imports",
      title: "Complete missing operational evidence",
      text: `Current core KPI coverage is ${completeness}%. Import missing weekly reports to improve decision confidence.`,
    });
  }

  if (trend.direction === "down") {
    actions.push({
      id: "trend",
      severity: "medium",
      destination: "performance",
      title: "Review fleet performance deterioration",
      text: `Latest fleet performance moved ${Math.abs(trend.delta)} points below the previous period.`,
    });
  }

  if (!actions.length) {
    actions.push({
      id: "monitor",
      severity: "low",
      destination: "performance",
      title: "Maintain current performance",
      text: "No critical operational signal is active. Continue monitoring the next reporting cycle.",
    });
  }

  const strongestMetric = [...evidence]
    .filter((metric) => metric.below > 0)
    .sort((a, b) => b.below - a.below || b.weight - a.weight)[0] || null;

  let headline = "Fleet evidence is stable.";
  let summary = "No critical deterioration is currently visible in the available evidence.";

  if (highRisk > 0) {
    headline = `${highRisk} high-risk driver${highRisk === 1 ? "" : "s"} need management attention.`;
    summary = strongestMetric
      ? `${strongestMetric.label} is the strongest current KPI pressure, with ${strongestMetric.below} driver${strongestMetric.below === 1 ? "" : "s"} below target.`
      : "Risk is being driven by repeated operational quality signals.";
  } else if (strongestMetric) {
    headline = `${strongestMetric.label} is the main fleet pressure.`;
    summary = `${strongestMetric.below} measured driver${strongestMetric.below === 1 ? "" : "s"} are below the current target.`;
  } else if (completeness < 75) {
    headline = "More evidence is required for a confident fleet assessment.";
    summary = `Core KPI coverage is currently ${completeness}%.`;
  }

  const confidence = Math.round(
    Math.max(
      0,
      Math.min(
        100,
        completeness * 0.7 +
          (drivers.length ? ((drivers.length - unresolved) / drivers.length) * 20 : 0) +
          (lowConfidence === 0 ? 10 : Math.max(0, 10 - lowConfidence))
      )
    )
  );

  return {
    headline,
    summary,
    confidence,
    completeness,
    highRisk,
    mediumRisk,
    unresolved,
    lowConfidence,
    evidence,
    priorityDrivers,
    actions,
    trend,
  };
}
