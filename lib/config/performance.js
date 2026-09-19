export const TARGETS = Object.freeze({
  dcr: 99.2,
  pod: 99.6,
  iadc: 80,
  mentor: 815,
  cc: 98,
  psb: 98,
  reattempts: 95,
});

export function targetFor(metric) {
  const key = String(metric || "").toLowerCase();
  if (key === "fico" || key === "ementor" || key === "mentor_score") return TARGETS.mentor;
  return TARGETS[key] ?? null;
}

export function targetLabel(metric, { prefix = "Target ≥ " } = {}) {
  const key = String(metric || "").toLowerCase();
  const target = targetFor(key);
  if (target == null) return "";

  if (key === "mentor" || key === "fico" || key === "ementor" || key === "mentor_score") {
    return `${prefix}${target}`;
  }

  const digits = key === "iadc" || key === "reattempts" ? 0 : 2;
  return `${prefix}${Number(target).toFixed(digits)}%`;
}

export function isAtTarget(metric, value) {
  const target = targetFor(metric);
  const numeric = Number(value);
  return target == null || !Number.isFinite(numeric) ? null : numeric >= target;
}
