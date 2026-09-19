const SCORECARD_METRICS = Object.freeze([
  ["FICO", "fico"],
  ["DCR", "dcr"],
  ["DSC", "dsc_dpmo"],
  ["LoR", "lor"],
  ["POD", "pod"],
  ["CC", "cc"],
  ["CE", "ce_dpmo"],
  ["CDF", "cdf_dpmo"],
  ["PSB", "psb"],
]);

function text(value) {
  return String(value ?? "").trim();
}

function normalizedName(value) {
  return text(value).toLowerCase().replace(/\s+/g, " ");
}

function usableName(value) {
  const name = text(value);
  if (!name || /^unresolved/i.test(name)) return false;
  return name.split(/\s+/).filter(Boolean).length >= 2;
}

function periodOrder(row) {
  const date = row?.period_end || row?.period_start;
  if (date) {
    const parsed = new Date(`${date}T12:00:00`);
    if (Number.isFinite(parsed.getTime())) return parsed.getTime();
  }
  const week = Number(String(row?.week_label || "").replace(/\D/g, ""));
  return Number.isFinite(week) ? week : -1;
}

function sourceIsScorecard(row) {
  const files = row?.raw_data?.source_files;
  return Array.isArray(files) && files.some((file) => /scorecard/i.test(String(file || "")));
}

export function missingScorecardMetrics(row) {
  const mentor = row?.mentor_score ?? row?.ementor ?? row?.fico;
  const values = {
    fico: mentor,
    dcr: row?.dcr,
    dsc_dpmo: row?.dsc_dpmo,
    lor: row?.lor,
    pod: row?.pod,
    cc: row?.cc,
    ce_dpmo: row?.ce_dpmo,
    cdf_dpmo: row?.cdf_dpmo,
    psb: row?.psb,
  };

  return SCORECARD_METRICS
    .filter(([label, key]) => {
      if ((key === "cdf_dpmo" || key === "psb") && sourceIsScorecard(row)) {
        return false;
      }
      const value = values[key];
      return value == null || value === "";
    })
    .map(([label]) => label);
}

function latestPeriod(rows) {
  const candidates = [...new Set((rows || []).map((row) => row.week_label).filter(Boolean))]
    .map((label) => ({
      label,
      order: Math.max(
        ...(rows || [])
          .filter((row) => row.week_label === label)
          .map(periodOrder)
      ),
    }))
    .sort((a, b) => b.order - a.order);
  return candidates[0]?.label || "";
}

function duplicateNameGroups(drivers = []) {
  const map = new Map();
  for (const driver of drivers) {
    if (!usableName(driver.full_name)) continue;
    const key = normalizedName(driver.full_name);
    const group = map.get(key) || [];
    group.push(driver);
    map.set(key, group);
  }
  return [...map.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => ({
      key,
      name: group[0]?.full_name || key,
      drivers: group,
      count: group.length,
      sites: [...new Set(group.map((driver) => driver.site).filter(Boolean))],
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function weekCompleteness(rows = []) {
  const map = new Map();
  for (const row of rows) {
    if (!row.week_label) continue;
    const current = map.get(row.week_label) || {
      weekLabel: row.week_label,
      rows: 0,
      full: 0,
      ficoMissing: 0,
      missingCells: 0,
      order: -1,
    };
    const missing = missingScorecardMetrics(row);
    current.rows += 1;
    current.full += missing.length === 0 ? 1 : 0;
    current.ficoMissing += missing.includes("FICO") ? 1 : 0;
    current.missingCells += missing.length;
    current.order = Math.max(current.order, periodOrder(row));
    map.set(row.week_label, current);
  }
  return [...map.values()]
    .map((item) => ({
      ...item,
      completePct: item.rows ? Math.round(item.full / item.rows * 100) : 0,
      averageCoverage: item.rows
        ? Math.round((1 - item.missingCells / (item.rows * SCORECARD_METRICS.length)) * 100)
        : 0,
    }))
    .sort((a, b) => b.order - a.order);
}

function importHealth(imports = []) {
  const recent = imports.slice(0, 30);
  if (!recent.length) return 100;
  const healthy = recent.filter((item) => item.status === "complete" && !item.error_message).length;
  return Math.round(healthy / recent.length * 100);
}

export function buildDataQualityV2({
  drivers = [],
  unmatched = [],
  aliases = [],
  metricRows = [],
  imports = [],
} = {}) {
  const unresolved = drivers.filter((driver) => !usableName(driver.full_name));
  const duplicates = duplicateNameGroups(drivers);
  const weeks = weekCompleteness(metricRows);
  const latestWeek = latestPeriod(metricRows);
  const latestRows = metricRows.filter((row) => row.week_label === latestWeek);
  const missingRows = latestRows
    .map((row) => ({
      ...row,
      missingMetrics: missingScorecardMetrics(row),
      driverName: row?.drivers?.full_name || "Driver",
      trid: row?.drivers?.trid || "",
      site: row?.drivers?.site || "",
    }))
    .filter((row) => row.missingMetrics.length);

  const identityCoverage = drivers.length
    ? Math.round((drivers.length - unresolved.length) / drivers.length * 100)
    : 100;
  const mappingHealth = drivers.length
    ? Math.max(0, Math.round(100 - unmatched.length / drivers.length * 100))
    : unmatched.length ? 0 : 100;
  const duplicateDrivers = duplicates.reduce((sum, item) => sum + item.count, 0);
  const duplicateHealth = drivers.length
    ? Math.max(0, Math.round(100 - duplicateDrivers / drivers.length * 100))
    : 100;
  const completeness = weeks[0]?.averageCoverage ?? 100;
  const importsHealth = importHealth(imports);

  const healthScore = Math.round(
    identityCoverage * 0.25 +
    mappingHealth * 0.20 +
    duplicateHealth * 0.15 +
    completeness * 0.30 +
    importsHealth * 0.10
  );

  const aliasTypes = aliases.reduce((acc, item) => {
    acc[item.alias_type] = (acc[item.alias_type] || 0) + 1;
    return acc;
  }, {});

  return {
    healthScore,
    identityCoverage,
    mappingHealth,
    duplicateHealth,
    completeness,
    importsHealth,
    unresolved,
    unmatched,
    duplicates,
    weeks,
    latestWeek,
    latestRows,
    missingRows,
    aliasTypes,
    aliasesCount: aliases.length,
    driversCount: drivers.length,
    resolvedCount: drivers.length - unresolved.length,
    openUnmatched: unmatched.length,
    importFailures: imports.filter((item) => item.status !== "complete" || item.error_message).length,
  };
}
