import { buildFleetIntelligence } from "../intelligence/fleet.js";

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function periodLabel(row) {
  return row?.week_label || row?.weekLabel || row?.period_end || row?.periodEnd || "";
}

function movement(history = []) {
  const rows = history
    .map((row) => ({
      label: periodLabel(row),
      performance: numberOrNull(row?.performance),
    }))
    .filter((row) => row.performance != null);

  const latest = rows.at(-1) || null;
  const previous = rows.at(-2) || null;

  return {
    latest,
    previous,
    delta:
      latest && previous
        ? Number((latest.performance - previous.performance).toFixed(1))
        : null,
  };
}

function topPriorityDrivers(commandCenter = {}, limit = 5) {
  return (commandCenter?.priority_drivers || []).slice(0, limit).map((item) => ({
    name: item.driver_name || "Unresolved driver",
    trid: item.trid || "",
    site: item.site || "",
    alertCount: Number(item.alert_count || 0),
    critical: Number(item.critical_count || 0),
    high: Number(item.high_count || 0),
    score: Number(item.rank_score || 0),
  }));
}

export function buildWeeklyExecutiveBrief({
  drivers = [],
  kpis = {},
  history = [],
  commandCenter = null,
} = {}) {
  const intelligence = buildFleetIntelligence(drivers, kpis, history);
  const trend = movement(history);
  const alerts = commandCenter?.alerts || {};
  const coaching = commandCenter?.coaching || {};

  return {
    generatedAt: new Date().toISOString(),
    period:
      commandCenter?.period_label ||
      trend.latest?.label ||
      drivers.find((driver) => driver.weekLabel)?.weekLabel ||
      "Latest available period",
    fleet: {
      drivers: drivers.length,
      highRisk: intelligence.highRisk,
      mediumRisk: intelligence.mediumRisk,
      unresolvedIdentities: intelligence.unresolved,
      decisionConfidence: intelligence.confidence,
      evidenceCoverage: intelligence.completeness,
    },
    performance: {
      latest: trend.latest?.performance ?? null,
      previous: trend.previous?.performance ?? null,
      latestLabel: trend.latest?.label || null,
      previousLabel: trend.previous?.label || null,
      delta: trend.delta,
      direction:
        trend.delta == null
          ? "insufficient"
          : trend.delta > 1
            ? "improving"
            : trend.delta < -1
              ? "declining"
              : "stable",
    },
    kpis: {
      dcr: numberOrNull(kpis.dcr),
      pod: numberOrNull(kpis.pod),
      iadc: numberOrNull(kpis.iadc),
      mentor: numberOrNull(kpis.mentor ?? kpis.ementor ?? kpis.fico),
      cc: numberOrNull(kpis.cc),
      concessions: numberOrNull(kpis.concessions),
    },
    alerts: {
      total: Number(alerts.total || 0),
      critical: Number(alerts.critical || 0),
      high: Number(alerts.high || 0),
      medium: Number(alerts.medium || 0),
      iadc: Number(alerts.iadc || 0),
      fico: Number(alerts.fico || 0),
      dcrDrop: Number(alerts.dcr_drop || 0),
      repeatConcessions: Number(alerts.repeat_concessions || 0),
      deteriorating: Number(alerts.deteriorating || 0),
    },
    coaching: {
      open: Number(coaching.open || 0),
      overdue: Number(coaching.overdue || 0),
      closed: Number(coaching.closed || 0),
    },
    priorities: topPriorityDrivers(commandCenter),
    headline: intelligence.headline,
    summary: intelligence.summary,
    actions: intelligence.actions.slice(0, 5).map((action) => ({
      severity: action.severity,
      title: action.title,
      detail: action.text,
      destination: action.destination,
    })),
  };
}

function fmt(value, suffix = "") {
  return value == null ? "—" : String(value) + suffix;
}

export function formatWeeklyExecutiveBrief(brief) {
  const trend =
    brief.performance.delta == null
      ? "No comparable prior period"
      : (brief.performance.delta > 0 ? "+" : "") +
        brief.performance.delta +
        " points vs " +
        (brief.performance.previousLabel || "previous period");

  const lines = [
    "METRIXIQ WEEKLY EXECUTIVE BRIEF",
    "Period: " + brief.period,
    "Generated: " + new Date(brief.generatedAt).toLocaleString("en-GB"),
    "",
    "EXECUTIVE SIGNAL",
    brief.headline,
    brief.summary,
    "",
    "FLEET HEALTH",
    "- Drivers: " + brief.fleet.drivers,
    "- High risk: " + brief.fleet.highRisk,
    "- Medium risk: " + brief.fleet.mediumRisk,
    "- Decision confidence: " + brief.fleet.decisionConfidence + "%",
    "- Evidence coverage: " + brief.fleet.evidenceCoverage + "%",
    "",
    "PERFORMANCE MOVEMENT",
    "- Current performance: " + fmt(brief.performance.latest),
    "- Weekly movement: " + trend,
    "",
    "CORE KPIs",
    "- DCR: " + fmt(brief.kpis.dcr, "%"),
    "- POD: " + fmt(brief.kpis.pod, "%"),
    "- IADC: " + fmt(brief.kpis.iadc, "%"),
    "- Mentor: " + fmt(brief.kpis.mentor),
    "- Contact Compliance: " + fmt(brief.kpis.cc, "%"),
    "- Concessions: " + fmt(brief.kpis.concessions),
    "",
    "ALERTS & COACHING",
    "- Active alerts: " + brief.alerts.total +
      " (" + brief.alerts.critical + " critical, " + brief.alerts.high + " high)",
    "- Repeat concession alerts: " + brief.alerts.repeatConcessions,
    "- Deterioration signals: " + (brief.alerts.dcrDrop + brief.alerts.deteriorating),
    "- Open coaching cases: " + brief.coaching.open,
    "- Overdue coaching: " + brief.coaching.overdue,
    "",
    "PRIORITY DRIVERS",
  ];

  if (brief.priorities.length) {
    brief.priorities.forEach((driver, index) => {
      lines.push(
        (index + 1) + ". " + driver.name +
        (driver.trid ? " (" + driver.trid + ")" : "") +
        (driver.site ? " · " + driver.site : "") +
        " — " + driver.alertCount + " alerts"
      );
    });
  } else {
    lines.push("- No server-side priority driver alert is active.");
  }

  lines.push("", "NEXT ACTIONS");

  brief.actions.forEach((action, index) => {
    lines.push(
      (index + 1) + ". " + action.title,
      "   " + action.detail
    );
  });

  return lines.join("\r\n");
}
