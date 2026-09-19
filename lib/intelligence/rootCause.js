import { calculateDriverScorecard, DRIVER_SCORECARD_FORMULA } from "../scorecards/driverScoreFormula.js";

const LABELS = Object.freeze({
  fico: "FICO",
  dcr: "DCR",
  dsc_dpmo: "DSC DPMO",
  lor: "LoR DPMO",
  pod: "POD",
  cc: "CC",
  ce_dpmo: "CE",
  cdf_dpmo: "CDF DPMO",
  psb: "PSB",
});

const PRIORITY = Object.freeze({
  fico: 1,
  dcr: 2,
  dsc_dpmo: 3,
  pod: 4,
  cc: 5,
  cdf_dpmo: 6,
  ce_dpmo: 7,
  lor: 8,
  psb: 9,
});

function numberOrNull(value) {
  if (value == null || value === "" || value === "-") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function ratioPercent(value) {
  const n = numberOrNull(value);
  if (n == null) return null;
  return n > 1 ? n : n * 100;
}

function nextBand(key, value, points) {
  const n = numberOrNull(value);
  if (key === "fico") {
    if (points >= 17) return null;
    if (n == null || n < 780) return { target: 780, label: "Reach 780 FICO", gain: 5 - points };
    if (n < 800) return { target: 800, label: "Reach 800 FICO", gain: 8 - points };
    if (n < 810) return { target: 810, label: "Reach 810 FICO", gain: 10 - points };
    if (n < 825) return { target: 825, label: "Reach 825 FICO", gain: 15 - points };
    return { target: 849, label: "Reach 849 FICO", gain: 17 - points };
  }
  if (key === "dcr") {
    const p = ratioPercent(value);
    if (points >= 17) return null;
    if (p == null || p < 98.6) return { target: 98.6, label: "Reach 98.60% DCR", gain: 5 - points };
    if (p < 98.85) return { target: 98.85, label: "Reach 98.85% DCR", gain: 10 - points };
    if (p < 99.2) return { target: 99.2, label: "Reach 99.20% DCR", gain: 15 - points };
    return { target: 99.9, label: "Reach 99.90% DCR", gain: 17 - points };
  }
  if (key === "dsc_dpmo") {
    if (points >= 17) return null;
    if (n == null || n > 965) return { target: 965, label: "Reduce DSC to ≤965", gain: 5 - points };
    if (n > 650) return { target: 650, label: "Reduce DSC to ≤650", gain: 10 - points };
    if (n > 550) return { target: 550, label: "Reduce DSC to ≤550", gain: 15 - points };
    return { target: 0, label: "Reduce DSC to 0", gain: 17 - points };
  }
  if (key === "lor") {
    if (points >= 6) return null;
    return { target: 0, label: "Reduce LoR to 0", gain: 6 - points };
  }
  if (key === "pod") {
    const p = ratioPercent(value);
    if (points >= 8) return null;
    if (p == null || p < 97) return { target: 97, label: "Reach 97.00% POD", gain: 3 - points };
    if (p < 98.5) return { target: 98.5, label: "Reach 98.50% POD", gain: 5 - points };
    if (p < 99) return { target: 99, label: "Reach 99.00% POD", gain: 7 - points };
    return { target: 99.99, label: "Reach 99.99% POD", gain: 8 - points };
  }
  if (key === "cc") {
    const p = ratioPercent(value);
    if (points >= 8) return null;
    if (p == null || p < 95) return { target: 95, label: "Reach 95.00% CC", gain: 1 - points };
    if (p < 96) return { target: 96, label: "Reach 96.00% CC", gain: 5 - points };
    if (p < 99) return { target: 99, label: "Reach 99.00% CC", gain: 7 - points };
    return { target: 99.9, label: "Reach 99.90% CC", gain: 8 - points };
  }
  if (key === "ce_dpmo") {
    if (points >= 10) return null;
    return { target: 0, label: "Reduce CE to 0", gain: 10 - points };
  }
  if (key === "cdf_dpmo") {
    if (points >= 10) return null;
    if (n == null) return { target: 6420, label: "Restore CDF evidence / ≤6420", gain: 3 - points };
    if (n > 6420) return { target: 6420, label: "Reduce CDF to ≤6420", gain: 3 - points };
    if (n > 5420) return { target: 5420, label: "Reduce CDF to ≤5420", gain: 5 - points };
    return { target: 4420, label: "Reduce CDF to ≤4420", gain: 10 - points };
  }
  if (key === "psb") {
    if (points >= 7) return null;
    return { target: 0, label: "Reduce PSB to 0", gain: 7 - points };
  }
  return null;
}

function tier(score) {
  if (score == null) return "Unrated";
  if (score < 50) return "Poor";
  if (score < 70) return "Fair";
  if (score < 85) return "Great";
  if (score < 93) return "Fantastic";
  return "Fantastic Plus";
}

export function rootCauseForRow(row = {}) {
  const scored = calculateDriverScorecard(row);
  if (scored.value == null) {
    return {
      score: null,
      tier: "Unrated",
      maxScore: 100,
      pointsLost: 100,
      components: [],
      opportunities: [],
      primary: null,
      coverage: 0,
    };
  }

  const components = scored.components.map((component) => {
    const lost = Math.max(0, component.maxPoints - component.points);
    const next = nextBand(component.key, component.value, component.points);
    return {
      ...component,
      label: LABELS[component.key] || component.label,
      lostPoints: lost,
      recoverableNext: Math.max(0, next?.gain || 0),
      nextTarget: next,
      priority: PRIORITY[component.key] || 99,
      status: component.missing ? "missing" : lost === 0 ? "max" : component.points === 0 ? "critical" : "opportunity",
    };
  });

  const opportunities = components
    .filter((item) => item.lostPoints > 0)
    .sort((a, b) =>
      b.recoverableNext - a.recoverableNext ||
      b.lostPoints - a.lostPoints ||
      a.priority - b.priority
    );

  return {
    score: scored.value,
    tier: tier(scored.value),
    maxScore: DRIVER_SCORECARD_FORMULA.reduce((sum, item) => sum + item.maxPoints, 0),
    pointsLost: components.reduce((sum, item) => sum + item.lostPoints, 0),
    components,
    opportunities,
    primary: opportunities[0] || null,
    coverage: scored.coverage,
  };
}

export function rootCauseTrend(rows = []) {
  return [...(rows || [])]
    .sort((a, b) => String(a.period_end || a.period_start || "").localeCompare(String(b.period_end || b.period_start || "")))
    .map((row) => {
      const result = rootCauseForRow(row);
      return {
        weekLabel: row.week_label || row.period_end || row.period_start || "Period",
        periodEnd: row.period_end || null,
        score: result.score,
        tier: result.tier,
        pointsLost: result.pointsLost,
        primary: result.primary?.label || null,
      };
    });
}

export function aggregateRootCauses(rows = []) {
  const totals = new Map();
  let scoreSum = 0;
  let scoredCount = 0;

  for (const row of rows || []) {
    const result = rootCauseForRow(row);
    if (result.score != null) {
      scoreSum += result.score;
      scoredCount += 1;
    }
    for (const component of result.components) {
      const current = totals.get(component.key) || {
        key: component.key,
        label: component.label,
        maxPoints: component.maxPoints,
        pointsLost: 0,
        recoverableNext: 0,
        affectedDrivers: 0,
        missingDrivers: 0,
      };
      current.pointsLost += component.lostPoints;
      current.recoverableNext += component.recoverableNext;
      current.affectedDrivers += component.lostPoints > 0 ? 1 : 0;
      current.missingDrivers += component.missing ? 1 : 0;
      totals.set(component.key, current);
    }
  }

  const causes = [...totals.values()].sort((a, b) =>
    b.pointsLost - a.pointsLost ||
    b.affectedDrivers - a.affectedDrivers ||
    (PRIORITY[a.key] || 99) - (PRIORITY[b.key] || 99)
  );

  return {
    drivers: rows.length,
    averageScore: scoredCount ? scoreSum / scoredCount : null,
    totalLostPoints: causes.reduce((sum, item) => sum + item.pointsLost, 0),
    causes,
    primary: causes[0] || null,
  };
}

export function recoveryPlan(row = {}, limit = 3) {
  const result = rootCauseForRow(row);
  return result.opportunities.slice(0, limit).map((item, index) => ({
    rank: index + 1,
    metric: item.label,
    currentPoints: item.points,
    maxPoints: item.maxPoints,
    lostPoints: item.lostPoints,
    recoverableNext: item.recoverableNext,
    action: item.nextTarget?.label || "Restore valid metric evidence",
    missing: item.missing,
  }));
}
