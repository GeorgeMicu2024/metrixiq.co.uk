import { calculateDriverScorecard, DRIVER_SCORECARD_FORMULA } from "../scorecards/driverScoreFormula.js";

export const SIMULATOR_FIELDS = Object.freeze([
  { key: "mentor_score", formulaKey: "fico", label: "FICO", unit: "", step: 1, min: 0, max: 850 },
  { key: "dcr", formulaKey: "dcr", label: "DCR", unit: "%", step: 0.01, min: 0, max: 100 },
  { key: "dsc_dpmo", formulaKey: "dsc_dpmo", label: "DSC DPMO", unit: "", step: 1, min: 0 },
  { key: "lor", formulaKey: "lor", label: "LoR DPMO", unit: "", step: 1, min: 0 },
  { key: "pod", formulaKey: "pod", label: "POD", unit: "%", step: 0.01, min: 0, max: 100 },
  { key: "cc", formulaKey: "cc", label: "CC", unit: "%", step: 0.01, min: 0, max: 100 },
  { key: "ce_dpmo", formulaKey: "ce_dpmo", label: "CE", unit: "", step: 1, min: 0 },
  { key: "cdf_dpmo", formulaKey: "cdf_dpmo", label: "CDF DPMO", unit: "", step: 1, min: 0 },
  { key: "psb", formulaKey: "psb", label: "PSB", unit: "", step: 1, min: 0 },
]);

export function simulatorTier(score) {
  if (score == null) return { label: "Unrated", cls: "unrated", next: null };
  if (score < 50) return { label: "Poor", cls: "poor", next: 50 };
  if (score < 70) return { label: "Fair", cls: "fair", next: 70 };
  if (score < 85) return { label: "Great", cls: "great", next: 85 };
  if (score < 93) return { label: "Fantastic", cls: "fantastic", next: 93 };
  return { label: "Fantastic Plus", cls: "fantastic-plus", next: null };
}

function normalizeEditableRow(row = {}) {
  return {
    ...row,
    mentor_score: row?.mentor_score ?? row?.ementor ?? row?.fico ?? null,
  };
}

export function createScenario(row = {}) {
  const source = normalizeEditableRow(row);
  return Object.fromEntries(SIMULATOR_FIELDS.map((field) => [field.key, source[field.key] ?? ""]));
}

export function applyScenario(row = {}, scenario = {}) {
  const next = { ...row };
  for (const field of SIMULATOR_FIELDS) {
    const value = scenario[field.key];
    if (value === "" || value == null) next[field.key] = null;
    else next[field.key] = Number(value);
  }
  next.fico = next.mentor_score;
  next.ementor = next.mentor_score;
  return next;
}

export function simulateDriver(row = {}, scenario = {}) {
  const baselineRow = normalizeEditableRow(row);
  const projectedRow = applyScenario(baselineRow, scenario);
  const baseline = calculateDriverScorecard(baselineRow);
  const projected = calculateDriverScorecard(projectedRow);
  const before = new Map((baseline.components || []).map((item) => [item.key, item]));

  const components = (projected.components || []).map((item) => {
    const prior = before.get(item.key);
    return {
      ...item,
      previousPoints: prior?.points ?? 0,
      deltaPoints: item.points - (prior?.points ?? 0),
    };
  });

  const baselineTier = simulatorTier(baseline.value);
  const projectedTier = simulatorTier(projected.value);
  return {
    baselineRow,
    projectedRow,
    baseline,
    projected: { ...projected, components },
    baselineTier,
    projectedTier,
    scoreDelta:
      baseline.value != null && projected.value != null
        ? projected.value - baseline.value
        : null,
    pointsToNextTier:
      projectedTier.next != null && projected.value != null
        ? Math.max(0, projectedTier.next - projected.value)
        : null,
  };
}

export function applyTargetPreset(scenario = {}, preset = "core-targets") {
  const next = { ...scenario };
  if (preset === "core-targets") {
    next.mentor_score = Math.max(Number(next.mentor_score) || 0, 815);
    next.dcr = Math.max(Number(next.dcr) || 0, 99.2);
    next.pod = Math.max(Number(next.pod) || 0, 99.6);
    next.cc = Math.max(Number(next.cc) || 0, 98);
  } else if (preset === "max-safe") {
    next.mentor_score = 849;
    next.dcr = 99.9;
    next.dsc_dpmo = 0;
    next.lor = 0;
    next.pod = 99.99;
    next.cc = 99.9;
    next.ce_dpmo = 0;
    next.cdf_dpmo = 4420;
    next.psb = 0;
  }
  return next;
}

export function teamImpact(driverDelta, driverCount) {
  const delta = Number(driverDelta);
  const count = Number(driverCount);
  if (!Number.isFinite(delta) || !Number.isFinite(count) || count <= 0) return null;
  return delta / count;
}

export function formulaMaximum() {
  return DRIVER_SCORECARD_FORMULA.reduce((sum, item) => sum + item.maxPoints, 0);
}
