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


export const POLICY_METRICS = Object.freeze([
  { key: "dcr", label: "DCR", defaultTarget: TARGETS.dcr, direction: "gte", unit: "percent" },
  { key: "pod", label: "POD", defaultTarget: TARGETS.pod, direction: "gte", unit: "percent" },
  { key: "iadc", label: "IADC", defaultTarget: TARGETS.iadc, direction: "gte", unit: "percent" },
  { key: "mentor", label: "FICO / eMentor", defaultTarget: TARGETS.mentor, direction: "gte", unit: "score" },
  { key: "cc", label: "Contact Compliance", defaultTarget: TARGETS.cc, direction: "gte", unit: "percent" },
  { key: "psb", label: "PSB", defaultTarget: TARGETS.psb, direction: "gte", unit: "percent" },
  { key: "reattempts", label: "Reattempts", defaultTarget: TARGETS.reattempts, direction: "gte", unit: "percent" },
  { key: "dsc_dpmo", label: "DSC DPMO", defaultTarget: 650, direction: "lte", unit: "dpmo" },
  { key: "lor", label: "LoR DPMO", defaultTarget: 0, direction: "lte", unit: "dpmo" },
  { key: "ce_dpmo", label: "CE DPMO", defaultTarget: 0, direction: "lte", unit: "dpmo" },
  { key: "cdf_dpmo", label: "CDF DPMO", defaultTarget: 4420, direction: "lte", unit: "dpmo" },
  { key: "concessions", label: "Concessions", defaultTarget: 0, direction: "lte", unit: "count" },
  { key: "total_score", label: "Total Score", defaultTarget: 85, direction: "gte", unit: "score" },
]);

function normalizePolicyMetric(metric) {
  const key = String(metric || "").toLowerCase();
  if (key === "fico" || key === "ementor" || key === "mentor_score") return "mentor";
  return key;
}

export function resolvePerformancePolicy(metric, policies = [], site = null) {
  const key = normalizePolicyMetric(metric);
  const normalizedSite = String(site || "").trim().toUpperCase();

  const sitePolicy = normalizedSite
    ? policies.find((item) =>
        item.enabled !== false &&
        normalizePolicyMetric(item.metric) === key &&
        String(item.site || "").trim().toUpperCase() === normalizedSite
      )
    : null;

  const orgPolicy = policies.find((item) =>
    item.enabled !== false &&
    normalizePolicyMetric(item.metric) === key &&
    !item.site
  );

  const configured = sitePolicy || orgPolicy;
  if (configured) {
    return {
      metric: key,
      target: Number(configured.target),
      direction: configured.direction || "gte",
      warningMargin: Number(configured.warning_margin || 0),
      unit: configured.unit || "percent",
      scope: sitePolicy ? normalizedSite : "organization",
      source: "custom",
    };
  }

  const definition = POLICY_METRICS.find((item) => item.key === key);
  if (definition) {
    return {
      metric: key,
      target: definition.defaultTarget,
      direction: definition.direction,
      warningMargin: 0,
      unit: definition.unit,
      scope: "default",
      source: "default",
    };
  }

  const fallback = targetFor(key);
  return fallback == null ? null : {
    metric: key,
    target: fallback,
    direction: "gte",
    warningMargin: 0,
    unit: "percent",
    scope: "default",
    source: "default",
  };
}

export function evaluatePerformancePolicy(metric, value, policies = [], site = null) {
  const policy = resolvePerformancePolicy(metric, policies, site);
  const numeric = Number(value);
  if (!policy || !Number.isFinite(numeric)) return { policy, status: "unknown", pass: null };

  const target = Number(policy.target);
  const warning = Math.max(0, Number(policy.warningMargin || 0));

  if (policy.direction === "lte") {
    if (numeric <= target) return { policy, status: "pass", pass: true };
    if (warning > 0 && numeric <= target + warning) return { policy, status: "warning", pass: false };
    return { policy, status: "fail", pass: false };
  }

  if (numeric >= target) return { policy, status: "pass", pass: true };
  if (warning > 0 && numeric >= target - warning) return { policy, status: "warning", pass: false };
  return { policy, status: "fail", pass: false };
}
