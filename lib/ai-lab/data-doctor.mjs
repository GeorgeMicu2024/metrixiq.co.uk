// Read-only validation of the already sanitised Connected 360° snapshot.

const priority = { high: 0, review: 1, info: 2 };
export function buildDataDoctor(snapshot) {
  if (!snapshot || !/^[A-Z0-9]{3,6}$/.test(String(snapshot.site || "")) ||
    !Number.isInteger(snapshot.week) || !Number.isInteger(snapshot.year)) throw new Error("An authorised 360° snapshot is required.");
  const issues = [];
  function add(code, severity, title, evidence, action) { issues.push({ code, severity, title, evidence, action }); }
  const metrics = snapshot.driverMetrics || {};
  if (snapshot.partial) add("partial_read", "high", "Source limit reached",
    "At least one report reached its read cap. Counts are partial.",
    "Narrow the reporting scope or reconcile against the source before acting.");
  if (!snapshot.official) add("scorecard_missing", "high", "Official Scorecard unavailable",
    `No official Scorecard was returned for ${snapshot.site} W${snapshot.week} ${snapshot.year}.`,
    "Confirm the weekly DSP Scorecard import and selected year.");
  if (!metrics.rows) add("metrics_missing", "high", "Weekly driver metrics unavailable",
    "No accessible driver-metric records match this station and week.",
    "Check site routing, report week and imported source coverage.");
  if (metrics.rows && metrics.possibleRepeatedDriverRows > 0) add("repeated_driver", "review", "Possible repeated weekly driver rows",
    `${metrics.possibleRepeatedDriverRows} additional metric rows share a matched driver within the week.`,
    "Inspect multiple imports or daily/weekly classifications before treating them as duplicates.");
  if (metrics.unassignedRows > 0) add("unassigned_driver", "review", "Unmatched driver metric records",
    `${metrics.unassignedRows} rows have no linked driver ID in the authorised weekly snapshot.`,
    "Review driver aliases and source mapping; do not guess identities.");
  if (metrics.rows > 0 && snapshot.previousMetricRows !== null && snapshot.previousMetricRows >= 10 &&
    metrics.rows < snapshot.previousMetricRows * 0.8) add("coverage_drop", "review", "Weekly coverage changed",
    `${metrics.rows} weekly metric rows versus ${snapshot.previousMetricRows} in the previous week.`,
    "Check import completeness and operational population changes before comparing averages.");
  if (metrics.rows && Object.entries(metrics.stats || {}).some(([key, stat]) =>
    ["iadc", "pod", "dcr"].includes(key) && stat.numericRows === 0)) add("metrics_null", "review", "Compliance metrics missing",
    "At least one of DCR, POD or IADC has no numeric values in the selected weekly metric records.",
    "Review which report types were imported; null is not 0% or 100%.");
  if (snapshot.mismatch) add("lor_discrepancy", "review", "DSP versus driver Lost on Road discrepancy",
    `The official LoR value is ${snapshot.official?.metrics?.lor?.value}, but all ${metrics.lor?.numericRows || 0} accessible individual LoR values are zero.`,
    "Compare Amazon source definitions, exemptions and the original driver scorecards. Do not presume an error.");
  if (!snapshot.imports?.overlappingPeriod) add("import_period_unknown", "info", "Import period coverage unconfirmed",
    "No recent import records with matching period dates were found in this bounded sample.",
    "Inspect original imports; some sources may not have stored period dates.");
  if (metrics.periodEndDates?.length > 1) add("period_end_mismatch", "review", "Mixed report end dates",
    `${metrics.periodEndDates.length} distinct period-end dates appear within one weekly label.`,
    "Check whether daily and weekly records have been mixed under the same label.");
  issues.sort((a, b) => priority[a.severity] - priority[b.severity] || a.code.localeCompare(b.code));
  return { issues, counts: { high: issues.filter(issue => issue.severity === "high").length,
    review: issues.filter(issue => issue.severity === "review").length,
    info: issues.filter(issue => issue.severity === "info").length },
    statement: issues.length ? "Review source data before treating alerts as operational conclusions."
      : "No configured data-quality check flagged an issue; this does not prove reports are complete." };
}
