import { getSupabaseBrowserClient } from "./supabase/client";

const TRID_RE = /^A[A-Z0-9]{8,}$/;
const METRIC_FIELDS = ["dcr","pod","iadc","cc","fico","ementor","psb","reattempts","concessions","lor"];

function cleanTrid(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}
function cleanName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
function numberOrNull(value) {
  return value == null || value === "" || Number.isNaN(Number(value)) ? null : Number(value);
}
function metricValue(driver, key) {
  const raw = driver?.rawMetrics || {};
  return numberOrNull(raw[key]);
}
function confidenceFor(driver) {
  const sourceCount = Array.isArray(driver?.sources) ? driver.sources.length : 0;
  const metricCount = Object.keys(driver?.rawMetrics || {}).length;
  return Math.min(100, 55 + sourceCount * 10 + metricCount * 3);
}
function unionSources(a, b) {
  return [...new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])])];
}
function performanceFrom(row) {
  const parts = [];
  if (row.dcr != null) parts.push(Math.min(105, row.dcr / 99.2 * 100));
  if (row.pod != null) parts.push(Math.min(105, row.pod / 99.6 * 100));
  if (row.iadc != null) parts.push(Math.min(105, row.iadc / 80 * 100));
  const mentor = row.ementor ?? row.fico;
  if (mentor != null) parts.push(Math.min(105, mentor / 815 * 100));
  if (!parts.length) return null;
  return Math.round(parts.reduce((a,b)=>a+b,0)/parts.length);
}
function riskFrom(row) {
  let points = 0;
  if (row.dcr != null && row.dcr < 99.2) points += 2;
  if (row.pod != null && row.pod < 99.6) points += 2;
  if (row.iadc != null && row.iadc < 80) points += 2;
  const mentor = row.ementor ?? row.fico;
  if (mentor != null && mentor < 815) points += 1;
  if (row.concessions != null && row.concessions >= 3) points += 2;
  return points >= 4 ? "High" : points >= 2 ? "Medium" : "Low";
}
function issueFrom(row) {
  if (row.dcr != null && row.dcr < 99.2) return "DCR below 99.20% target";
  if (row.pod != null && row.pod < 99.6) return "POD below 99.60% target";
  if (row.iadc != null && row.iadc < 80) return "IADC below 80% target";
  const mentor = row.ementor ?? row.fico;
  if (mentor != null && mentor < 815) return "Mentor driving score below 815";
  if (row.concessions != null && row.concessions >= 3) return "Repeated concessions require review";
  return "No active concern";
}

export async function persistAnalysis({ organizationId, analysis, files = [] }) {
  if (!organizationId) throw new Error("Workspace organisation is missing.");
  const supabase = getSupabaseBrowserClient();

  const fileMap = new Map((files || []).map((file) => [file.name, file]));
  const importRows = (analysis?.fileResults || []).map((result) => {
    const file = fileMap.get(result.name);
    return {
      organization_id: organizationId,
      file_name: result.name,
      file_type: result.type || result.name?.split(".").pop()?.toLowerCase() || null,
      file_size_bytes: file?.size ?? null,
      status: result.status === "error" || result.status === "unsupported" ? "failed" : "complete",
      detected_report_type: result.reportType || result.type || null,
      period_start: result.period?.periodStart || null,
      period_end: result.period?.periodEnd || null,
      error_message: result.error || (result.status === "unsupported" ? "Unsupported file type" : null),
      metadata: {
        recognised: !!result.recognized,
        rows: result.rows || 0,
        period_key: result.period?.key || null,
        week_label: result.period?.weekLabel || null,
      },
      completed_at: new Date().toISOString(),
    };
  });

  const importIdByFile = new Map();
  if (importRows.length) {
    const { data, error } = await supabase.from("imports").insert(importRows).select("id,file_name");
    if (error) throw error;
    for (const row of data || []) importIdByFile.set(row.file_name, row.id);
  }

  // Existing drivers are also used to match Mentor files that contain names but no TRID.
  const { data: existingDriverRows, error: existingDriverError } = await supabase
    .from("drivers")
    .select("id,trid,full_name,site")
    .eq("organization_id", organizationId);
  if (existingDriverError) throw existingDriverError;

  const existingByTrid = new Map();
  const existingByName = new Map();
  for (const row of existingDriverRows || []) {
    existingByTrid.set(cleanTrid(row.trid), row);
    if (row.full_name) existingByName.set(cleanName(row.full_name), row);
  }

  const allDrivers = new Map();
  const sourceDrivers = analysis?.periods?.length
    ? analysis.periods.flatMap((period) => period.drivers || [])
    : (analysis?.drivers || []);

  for (const driver of sourceDrivers) {
    const trid = cleanTrid(driver.id);
    if (!TRID_RE.test(trid)) continue;
    const existing = existingByTrid.get(trid);
    const candidateName = driver.name && cleanName(driver.name) !== cleanName(driver.id) ? driver.name : null;
    const existingEntry = allDrivers.get(trid) || {};
    allDrivers.set(trid, {
      organization_id: organizationId,
      trid,
      full_name: candidateName || existing?.full_name || existingEntry.full_name || trid,
      site: driver.site && driver.site !== "Unknown" ? driver.site : existing?.site || existingEntry.site || null,
      status: "active",
    });
  }

  let savedDrivers = 0;
  if (allDrivers.size) {
    const { data, error } = await supabase
      .from("drivers")
      .upsert([...allDrivers.values()], { onConflict: "organization_id,trid" })
      .select("id,trid,full_name,site");
    if (error) throw error;
    savedDrivers = data?.length || 0;
    for (const row of data || []) {
      existingByTrid.set(cleanTrid(row.trid), row);
      if (row.full_name) existingByName.set(cleanName(row.full_name), row);
    }
  }

  const periods = analysis?.periods?.length ? analysis.periods : [{
    key: analysis?.period?.key || null,
    weekLabel: analysis?.period?.weekLabel || `Imported ${new Date().toISOString().slice(0, 10)}`,
    periodStart: analysis?.period?.periodStart || null,
    periodEnd: analysis?.period?.periodEnd || null,
    sourceFiles: analysis?.sourceFiles || [],
    drivers: analysis?.drivers || [],
  }];

  const newMetricRows = [];
  for (const period of periods) {
    for (const driver of period.drivers || []) {
      const trid = cleanTrid(driver.id);
      const dbDriver = TRID_RE.test(trid) ? existingByTrid.get(trid) : existingByName.get(cleanName(driver.name));
      if (!dbDriver?.id) continue;

      const sources = Array.isArray(driver.sources) ? driver.sources : period.sourceFiles || [];
      const firstImportId = sources.map((name) => importIdByFile.get(name)).find(Boolean) || null;
      const raw = driver.rawMetrics || {};

      newMetricRows.push({
        organization_id: organizationId,
        driver_id: dbDriver.id,
        source_import_id: firstImportId,
        period_start: period.periodStart || null,
        period_end: period.periodEnd || null,
        week_label: period.weekLabel || period.key || `Imported ${new Date().toISOString().slice(0, 10)}`,
        performance: driver.performance ?? null,
        dcr: metricValue(driver, "dcr"),
        pod: metricValue(driver, "pod"),
        iadc: metricValue(driver, "iadc"),
        cc: metricValue(driver, "cc"),
        fico: metricValue(driver, "fico"),
        ementor: metricValue(driver, "ementor"),
        psb: metricValue(driver, "psb"),
        reattempts: metricValue(driver, "reattempts"),
        concessions: metricValue(driver, "concessions"),
        lor: metricValue(driver, "lor"),
        risk: driver.risk || null,
        issue: driver.issue || null,
        data_confidence: confidenceFor(driver),
        raw_data: {
          ...raw,
          phr: raw.phr ?? driver.phr ?? null,
          dwc: raw.dwc ?? driver.dwc ?? null,
          rts: raw.rts ?? driver.rts ?? null,
          dnr: raw.dnr ?? driver.dnr ?? null,
          podFails: raw.podFails ?? driver.podFails ?? null,
          ccFails: raw.ccFails ?? driver.ccFails ?? null,
          delivered: raw.delivered ?? driver.delivered ?? null,
          dsc: raw.dsc ?? driver.dsc ?? null,
          ce: raw.ce ?? driver.ce ?? null,
          cdf: raw.cdf ?? driver.cdf ?? null,
          mentor: driver.mentor || raw.mentor || null,
          source_files: sources,
          analysis_version: "top-tier-v2",
        },
      });
    }
  }

  const driverIds = [...new Set(newMetricRows.map((row) => row.driver_id))];
  const weekLabels = [...new Set(newMetricRows.map((row) => row.week_label))];
  const existingMetricMap = new Map();

  if (driverIds.length && weekLabels.length) {
    const { data, error } = await supabase
      .from("driver_metrics")
      .select("id,driver_id,week_label,source_import_id,period_start,period_end,performance,dcr,pod,iadc,cc,fico,ementor,psb,reattempts,concessions,lor,risk,issue,data_confidence,raw_data")
      .eq("organization_id", organizationId)
      .in("driver_id", driverIds)
      .in("week_label", weekLabels);
    if (error) throw error;
    for (const row of data || []) existingMetricMap.set(`${row.driver_id}|${row.week_label}`, row);
  }

  // Merge rather than wiping existing metrics with null when another file for the same week is imported.
  const mergedRows = newMetricRows.map((fresh) => {
    const old = existingMetricMap.get(`${fresh.driver_id}|${fresh.week_label}`) || {};
    const merged = {
      ...fresh,
      source_import_id: fresh.source_import_id || old.source_import_id || null,
      period_start: fresh.period_start || old.period_start || null,
      period_end: fresh.period_end || old.period_end || null,
      data_confidence: Math.max(numberOrNull(fresh.data_confidence) || 0, numberOrNull(old.data_confidence) || 0) || null,
    };
    for (const field of METRIC_FIELDS) merged[field] = fresh[field] != null ? fresh[field] : (old[field] ?? null);

    const oldRaw = old.raw_data || {};
    const freshRaw = fresh.raw_data || {};
    merged.raw_data = {
      ...oldRaw,
      ...freshRaw,
      mentor: freshRaw.mentor || oldRaw.mentor || null,
      source_files: unionSources(oldRaw.source_files, freshRaw.source_files),
      analysis_version: "top-tier-v2",
    };
    merged.performance = performanceFrom(merged);
    merged.risk = riskFrom(merged);
    merged.issue = issueFrom(merged);
    return merged;
  });

  let savedMetrics = 0;
  if (mergedRows.length) {
    const { data, error } = await supabase
      .from("driver_metrics")
      .upsert(mergedRows, { onConflict: "organization_id,driver_id,week_label" })
      .select("id");
    if (error) throw error;
    savedMetrics = data?.length || 0;
  }

  return {
    savedDrivers,
    savedMetrics,
    savedImports: importRows.length,
    periods: periods.length,
  };
}
