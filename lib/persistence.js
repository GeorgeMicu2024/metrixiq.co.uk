import { getSupabaseBrowserClient } from "./supabase/client";

const TRID_RE = /^A[A-Z0-9]{8,}$/;

function cleanTrid(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

function metricValue(driver, key) {
  const raw = driver?.rawMetrics || {};
  const value = raw[key];
  return value == null || value === "" || Number.isNaN(Number(value)) ? null : Number(value);
}

function confidenceFor(driver) {
  const sourceCount = Array.isArray(driver?.sources) ? driver.sources.length : 0;
  const metricCount = Object.keys(driver?.rawMetrics || {}).length;
  return Math.min(100, 55 + sourceCount * 10 + metricCount * 3);
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
      status: result.status === "error" ? "failed" : "complete",
      detected_report_type: result.reportType || result.type || null,
      period_start: result.period?.periodStart || null,
      period_end: result.period?.periodEnd || null,
      error_message: result.error || null,
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

  const allDrivers = new Map();
  for (const period of analysis?.periods || []) {
    for (const driver of period.drivers || []) {
      const trid = cleanTrid(driver.id);
      if (!TRID_RE.test(trid)) continue;
      const existing = allDrivers.get(trid) || {};
      allDrivers.set(trid, {
        organization_id: organizationId,
        trid,
        full_name: driver.name || existing.full_name || trid,
        site: driver.site && driver.site !== "Unknown" ? driver.site : existing.site || null,
        status: "active",
      });
    }
  }

  // Fall back to the aggregate driver list when a report had no detectable period.
  if (!allDrivers.size) {
    for (const driver of analysis?.drivers || []) {
      const trid = cleanTrid(driver.id);
      if (!TRID_RE.test(trid)) continue;
      allDrivers.set(trid, {
        organization_id: organizationId,
        trid,
        full_name: driver.name || trid,
        site: driver.site && driver.site !== "Unknown" ? driver.site : null,
        status: "active",
      });
    }
  }

  let savedDrivers = 0;
  const driverIdByTrid = new Map();
  if (allDrivers.size) {
    const { data, error } = await supabase
      .from("drivers")
      .upsert([...allDrivers.values()], { onConflict: "organization_id,trid" })
      .select("id,trid");
    if (error) throw error;
    savedDrivers = data?.length || 0;
    for (const row of data || []) driverIdByTrid.set(cleanTrid(row.trid), row.id);
  }

  const periods = analysis?.periods?.length ? analysis.periods : [{
    key: analysis?.period?.key || null,
    weekLabel: analysis?.period?.weekLabel || `Imported ${new Date().toISOString().slice(0, 10)}`,
    periodStart: analysis?.period?.periodStart || null,
    periodEnd: analysis?.period?.periodEnd || null,
    sourceFiles: analysis?.sourceFiles || [],
    drivers: analysis?.drivers || [],
  }];

  const metricRows = [];
  for (const period of periods) {
    for (const driver of period.drivers || []) {
      const trid = cleanTrid(driver.id);
      const driverId = driverIdByTrid.get(trid);
      if (!driverId) continue;

      const sources = Array.isArray(driver.sources) ? driver.sources : period.sourceFiles || [];
      const firstImportId = sources.map((name) => importIdByFile.get(name)).find(Boolean) || null;
      const raw = driver.rawMetrics || {};

      metricRows.push({
        organization_id: organizationId,
        driver_id: driverId,
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
          source_files: sources,
          analysis_version: "history-v1",
        },
      });
    }
  }

  let savedMetrics = 0;
  if (metricRows.length) {
    const { data, error } = await supabase
      .from("driver_metrics")
      .upsert(metricRows, { onConflict: "organization_id,driver_id,week_label" })
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
