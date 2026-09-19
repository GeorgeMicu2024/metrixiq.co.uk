import { calculateDriverScorecard } from "../scorecards/driverScoreFormula.js";

const SEVERITY_ORDER = Object.freeze({ critical: 0, high: 1, medium: 2, low: 3, info: 4 });

export function numberOrNull(value) {
  if (value == null || value === "" || value === "-") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizePercent(value) {
  const parsed = numberOrNull(value);
  if (parsed == null) return null;
  return parsed > 0 && parsed <= 1 ? parsed * 100 : parsed;
}

function rowOrder(row) {
  const raw = row?.period_end || row?.period_start || "";
  const parsed = raw ? new Date(`${raw}T12:00:00Z`) : null;
  if (parsed && Number.isFinite(parsed.getTime())) return parsed.getTime();
  const week = Number(String(row?.week_label || "").replace(/\D/g, ""));
  return Number.isFinite(week) ? week * 604800000 : 0;
}

export function latestRowsByDriver(rows = []) {
  const map = new Map();
  for (const row of rows || []) {
    const driverId = row?.driver_id || row?.drivers?.id;
    if (!driverId) continue;
    const current = map.get(driverId);
    if (!current || rowOrder(row) > rowOrder(current)) map.set(driverId, row);
  }
  return [...map.values()];
}

export function tierForScore(score) {
  const value = numberOrNull(score);
  if (value == null) return { label: "Unrated", cls: "unrated", rank: 5 };
  if (value < 50) return { label: "Poor", cls: "poor", rank: 4 };
  if (value < 70) return { label: "Fair", cls: "fair", rank: 3 };
  if (value < 85) return { label: "Great", cls: "great", rank: 2 };
  if (value < 93) return { label: "Fantastic", cls: "fantastic", rank: 1 };
  return { label: "Fantastic Plus", cls: "fantastic-plus", rank: 0 };
}

function identity(row) {
  return {
    driver_id: row?.driver_id || row?.drivers?.id || null,
    driver_name: row?.driver_name || row?.drivers?.full_name || "Driver",
    trid: row?.trid || row?.drivers?.trid || "",
    site: String(row?.site || row?.drivers?.site || "").trim().toUpperCase(),
  };
}

function signal(base, details = {}) {
  const driver = identity(base);
  return {
    id: details.id || `smart:${driver.driver_id || "workspace"}:${details.category || "signal"}:${base?.week_label || "latest"}`,
    source: details.source || "smart-rule",
    source_id: details.source_id || null,
    category: details.category || "performance",
    title: details.title || "Performance signal",
    detail: details.detail || "",
    severity: details.severity || "medium",
    status: details.status || "open",
    metric: details.metric || null,
    week_label: details.week_label || base?.week_label || null,
    due_at: details.due_at || null,
    created_at: details.created_at || base?.created_at || null,
    ...driver,
    metadata: details.metadata || {},
  };
}

function metricSignals(row) {
  const items = [];
  const scored = calculateDriverScorecard(row || {});
  const tier = tierForScore(scored.value);
  const fico = numberOrNull(row?.mentor_score ?? row?.ementor ?? row?.fico);
  const dcr = normalizePercent(row?.dcr);
  const pod = normalizePercent(row?.pod);
  const cc = normalizePercent(row?.cc);
  const concessions = numberOrNull(row?.concessions) || 0;

  if (fico != null && fico < 815) {
    items.push(signal(row, {
      category: "fico",
      metric: "FICO",
      severity: fico < 780 ? "critical" : fico < 800 ? "high" : "medium",
      title: "FICO below 815",
      detail: `${identity(row).driver_name} is at ${Math.round(fico)}. Safety coaching should be reviewed.`,
      metadata: { actual: fico, target: 815 },
    }));
  }

  if (scored.value != null && scored.value < 70) {
    items.push(signal(row, {
      category: "scorecard",
      metric: "Total Score",
      severity: scored.value < 50 ? "critical" : "high",
      title: `${tier.label} driver scorecard`,
      detail: `Total Score ${Math.round(scored.value)}. Review the lowest point contributors before the next week closes.`,
      metadata: { total_score: scored.value, tier: tier.label, coverage: scored.coverage },
    }));
  }

  if (concessions > 0) {
    items.push(signal(row, {
      category: "concessions",
      metric: "Concessions",
      severity: concessions >= 5 ? "critical" : concessions >= 3 ? "high" : "medium",
      title: "Concessions require review",
      detail: `${Math.round(concessions)} concession${concessions === 1 ? "" : "s"} in the current week.`,
      metadata: { actual: concessions, target: 0 },
    }));
  }

  if (dcr != null && dcr < 99.2) {
    items.push(signal(row, {
      category: "dcr",
      metric: "DCR",
      severity: dcr < 98.6 ? "high" : "medium",
      title: "DCR below target",
      detail: `DCR ${dcr.toFixed(2)}% against 99.20%.`,
      metadata: { actual: dcr, target: 99.2 },
    }));
  }

  if (pod != null && pod < 99.6) {
    items.push(signal(row, {
      category: "pod",
      metric: "POD",
      severity: pod < 99 ? "high" : "medium",
      title: "POD below target",
      detail: `POD ${pod.toFixed(2)}% against 99.60%.`,
      metadata: { actual: pod, target: 99.6 },
    }));
  }

  if (cc != null && cc < 98) {
    items.push(signal(row, {
      category: "cc",
      metric: "CC",
      severity: cc < 95 ? "high" : "medium",
      title: "CC below target",
      detail: `CC ${cc.toFixed(2)}% against 98.00%.`,
      metadata: { actual: cc, target: 98 },
    }));
  }

  if (scored.coverage < 9) {
    items.push(signal(row, {
      category: "data-quality",
      metric: "Data Quality",
      severity: scored.coverage <= 5 ? "high" : "medium",
      title: "Scorecard evidence incomplete",
      detail: `${9 - scored.coverage} of 9 point-band inputs are missing or unresolved.`,
      metadata: { coverage: scored.coverage },
    }));
  }

  return items;
}

function alertSignal(alert) {
  return signal(alert, {
    id: `alert:${alert.id}`,
    source: "performance-alert",
    source_id: alert.id,
    category: alert.alert_type || alert.metric || "performance",
    title: alert.title || "Performance alert",
    detail: alert.message || "",
    severity: alert.severity || "medium",
    status: alert.status || "open",
    metric: alert.metric || null,
    week_label: alert.period_label || null,
    created_at: alert.created_at || null,
    metadata: {
      threshold: alert.threshold ?? null,
      actual: alert.actual_value ?? null,
    },
  });
}

function coachingSignal(item) {
  const due = item?.due_at ? new Date(item.due_at) : null;
  const overdue = due && Number.isFinite(due.getTime()) && due.getTime() < Date.now() && item.status !== "closed";
  const soon = due && Number.isFinite(due.getTime()) && due.getTime() <= Date.now() + 3 * 86400000 && item.status !== "closed";
  if (!overdue && !soon) return null;

  return signal(item, {
    id: `coaching:${item.id}`,
    source: "coaching-case",
    source_id: item.id,
    category: "coaching",
    title: overdue ? "Coaching follow-up overdue" : "Coaching follow-up due soon",
    detail: item.title || item.reason || "Review the open coaching action.",
    severity: overdue ? "high" : "medium",
    status: item.status || "open",
    metric: item.metric || null,
    due_at: item.due_at || null,
    created_at: item.created_at || null,
    metadata: { assigned_to: item.assigned_to || null, case_status: item.status || null },
  });
}

function taskSignal(item) {
  return signal(item, {
    id: `task:${item.id}`,
    source: "manager-task",
    source_id: item.id,
    category: item.source_type || "task",
    title: item.title,
    detail: item.detail || "",
    severity: item.priority || "medium",
    status: item.status || "open",
    due_at: item.due_at || null,
    created_at: item.created_at || null,
    metadata: {
      assigned_to: item.assigned_to || null,
      assigned_name: item.assigned_name || null,
      source_type: item.source_type || null,
      source_id: item.source_id || null,
      ...(item.metadata || {}),
    },
  });
}

function dedupeSignals(items = []) {
  const map = new Map();
  const priority = { "manager-task": 0, "performance-alert": 1, "coaching-case": 1, "smart-rule": 2 };

  for (const item of items) {
    if (!item) continue;
    const key = [
      item.driver_id || "workspace",
      item.week_label || "current",
      item.metric || item.category || item.title,
    ].join("::").toLowerCase();
    const current = map.get(key);
    if (!current || (priority[item.source] ?? 9) < (priority[current.source] ?? 9)) {
      map.set(key, item);
    }
  }
  return [...map.values()];
}

export function buildManagerWorkQueue({
  metricRows = [],
  alerts = [],
  coachingCases = [],
  tasks = [],
  unmatchedCount = 0,
  failedImports = 0,
  siteFilter = "all",
} = {}) {
  const latest = latestRowsByDriver(metricRows);
  const smart = latest.flatMap(metricSignals);
  const alertItems = (alerts || []).filter((item) => item.status !== "resolved").map(alertSignal);
  const coachingItems = (coachingCases || []).map(coachingSignal).filter(Boolean);
  const taskItems = (tasks || []).filter((item) => !["done","dismissed"].includes(item.status)).map(taskSignal);

  const workspaceItems = [];
  if (unmatchedCount > 0) {
    workspaceItems.push(signal({}, {
      id: "workspace:unmatched",
      category: "data-quality",
      title: "Unmatched driver evidence",
      detail: `${unmatchedCount} imported record${unmatchedCount === 1 ? "" : "s"} still need identity resolution.`,
      severity: unmatchedCount >= 20 ? "high" : "medium",
      metadata: { unmatched_count: unmatchedCount },
    }));
  }
  if (failedImports > 0) {
    workspaceItems.push(signal({}, {
      id: "workspace:failed-imports",
      category: "imports",
      title: "Import failures need review",
      detail: `${failedImports} recent import${failedImports === 1 ? "" : "s"} failed or require attention.`,
      severity: "high",
      metadata: { failed_imports: failedImports },
    }));
  }

  const scoped = dedupeSignals([...taskItems, ...alertItems, ...coachingItems, ...smart, ...workspaceItems])
    .filter((item) => {
      if (siteFilter === "all") return true;
      if (!item.site) return true;
      return item.site === String(siteFilter).toUpperCase();
    })
    .sort((a, b) =>
      (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9) ||
      (a.due_at ? new Date(a.due_at).getTime() : Infinity) - (b.due_at ? new Date(b.due_at).getTime() : Infinity) ||
      String(a.driver_name || "").localeCompare(String(b.driver_name || ""))
    );

  return scoped;
}

export function summarizeManagerQueue(queue = []) {
  return {
    total: queue.length,
    critical: queue.filter((item) => item.severity === "critical").length,
    high: queue.filter((item) => item.severity === "high").length,
    overdue: queue.filter((item) => item.due_at && new Date(item.due_at).getTime() < Date.now()).length,
    unassigned: queue.filter((item) => !item.metadata?.assigned_to && item.source === "manager-task").length,
    coaching: queue.filter((item) => item.category === "coaching").length,
    dataQuality: queue.filter((item) => item.category === "data-quality").length,
  };
}
