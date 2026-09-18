import { buildFleetIntelligence } from "../intelligence/fleet.js";

function value(value) {
  return value == null || value === "" ? "" : value;
}

function csvEscape(input) {
  let text = String(value(input));

  // Prevent spreadsheet formula injection when a CSV is opened in Excel/Sheets.
  if (/^[=+\-@]/.test(text)) text = `'${text}`;

  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(rows = []) {
  if (!rows.length) return "";

  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ];

  return `\uFEFF${lines.join("\r\n")}`;
}

export function buildDriverPerformanceRows(drivers = []) {
  return drivers.map((driver) => ({
    trid: driver.id || "",
    name: driver.name || "",
    site: driver.site || "",
    status: driver.status || "",
    performance: value(driver.performance),
    dcr: value(driver.dcr),
    pod: value(driver.pod),
    iadc: value(driver.iadc),
    mentor: value(driver.ementor ?? driver.fico ?? driver.mentor_score),
    cc: value(driver.cc),
    concessions: value(driver.concessions),
    risk: driver.risk || "",
    issue: driver.issue || "",
    data_confidence: value(driver.dataConfidence),
    period: driver.weekLabel || "",
  }));
}

export function buildRiskRows(drivers = []) {
  return drivers
    .filter((driver) => String(driver.risk || "").toLowerCase() !== "low")
    .map((driver) => ({
      priority: String(driver.risk || "Medium"),
      trid: driver.id || "",
      name: driver.name || "",
      site: driver.site || "",
      issue: driver.issue || "",
      performance: value(driver.performance),
      dcr: value(driver.dcr),
      pod: value(driver.pod),
      iadc: value(driver.iadc),
      mentor: value(driver.ementor ?? driver.fico ?? driver.mentor_score),
      concessions: value(driver.concessions),
      data_confidence: value(driver.dataConfidence),
    }));
}

export function buildHistoryRows(history = []) {
  return history.map((row) => ({
    period: row.week_label || row.weekLabel || row.period_end || row.periodEnd || "",
    performance: value(row.performance),
    dcr: value(row.dcr),
    pod: value(row.pod),
    iadc: value(row.iadc),
    mentor: value(row.mentor_score ?? row.ementor ?? row.fico),
    cc: value(row.cc),
    concessions: value(row.concessions),
  }));
}

export function buildExecutiveSummary(drivers = [], kpis = {}, history = []) {
  const intelligence = buildFleetIntelligence(drivers, kpis, history);

  return {
    generatedAt: new Date().toISOString(),
    fleet: {
      drivers: drivers.length,
      highRisk: intelligence.highRisk,
      mediumRisk: intelligence.mediumRisk,
      unresolvedIdentities: intelligence.unresolved,
      decisionConfidence: intelligence.confidence,
      coreKpiCoverage: intelligence.completeness,
    },
    kpis,
    headline: intelligence.headline,
    summary: intelligence.summary,
    actions: intelligence.actions.map((action) => ({
      severity: action.severity,
      title: action.title,
      detail: action.text,
    })),
  };
}
