export const TRUSTED_CONCESSIONS_PATTERN =
  /^DSP_Associates_Concessions_(D[A-Z]{1,4}\d{1,3})_(\d{4})-W(\d{2})(?:\s*\(\d+\))?\.csv$/i;

export const CONCESSIONS_SELECT =
  "id,driver_id,week_label,period_start,period_end,concessions,site,raw_data,created_at,drivers(id,trid,full_name,site,status)";

export function parseTrustedConcessionsFile(fileName) {
  const name = String(fileName || "").trim();
  const match = name.match(TRUSTED_CONCESSIONS_PATTERN);
  if (!match) return null;
  return {
    fileName: name,
    site: String(match[1]).toUpperCase(),
    year: Number(match[2]),
    week: `W${match[3]}`,
  };
}

function rowSourceFiles(row) {
  return Array.isArray(row?.raw_data?.source_files)
    ? row.raw_data.source_files.map((value) => String(value || "")).filter(Boolean)
    : [];
}

function trustedSourceForRow(row, wantedSite = "") {
  const rowWeek = String(row?.raw_data?.calendar_week || row?.week_label || "").toUpperCase();
  const candidates = rowSourceFiles(row)
    .map(parseTrustedConcessionsFile)
    .filter(Boolean)
    .filter((source) => source.week === rowWeek);

  if (!candidates.length) return null;
  if (wantedSite && wantedSite !== "ALL") {
    return candidates.find((source) => source.site === wantedSite) || null;
  }
  return candidates[0];
}

function latestTrustedImports(imports) {
  const latest = new Map();

  for (const item of imports || []) {
    const source = parseTrustedConcessionsFile(item.file_name);
    const type = String(item.detected_report_type || "").toLowerCase();
    if (!source || !type.includes("concession")) continue;

    const key = `${source.site}::${source.week}`;
    const current = latest.get(key);
    if (!current || String(item.created_at || "") > String(current.created_at || "")) {
      latest.set(key, { ...item, ...source });
    }
  }

  return latest;
}

export async function fetchTrustedConcessions(
  supabase,
  organizationId,
  siteFilter = "all"
) {
  if (!organizationId) {
    return { rows: [], reports: [], rejectedRows: 0 };
  }

  const wantedSite = String(siteFilter || "all").trim().toUpperCase();
  const pageSize = 1000;
  const metricRows = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("driver_metrics")
      .select(CONCESSIONS_SELECT)
      .eq("organization_id", organizationId)
      .not("concessions", "is", null)
      .order("period_end", { ascending: false })
      .order("driver_id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    const page = data || [];
    metricRows.push(...page);
    if (page.length < pageSize) break;
  }

  const { data: importRows, error: importError } = await supabase
    .from("imports")
    .select("id,file_name,detected_report_type,created_at,period_start,period_end,metadata")
    .eq("organization_id", organizationId)
    .ilike("file_name", "DSP_Associates_Concessions_%")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (importError) throw importError;

  const trustedImports = latestTrustedImports(importRows || []);
  const grouped = new Map();
  let rejectedRows = 0;

  for (const row of metricRows) {
    const source = trustedSourceForRow(row, wantedSite);
    if (!source) {
      rejectedRows += 1;
      continue;
    }

    const reportKey = `${source.site}::${source.week}`;
    const report = trustedImports.get(reportKey);
    if (!report) {
      rejectedRows += 1;
      continue;
    }

    const driverKey = String(row.driver_id || "");
    if (!driverKey) {
      rejectedRows += 1;
      continue;
    }

    const key = `${reportKey}::${driverKey}`;
    const existing = grouped.get(key);
    const storedSiteMatches = String(row.site || "").toUpperCase() === source.site;
    const existingStoredSiteMatches =
      existing && String(existing.site || "").toUpperCase() === source.site;

    if (
      !existing ||
      (storedSiteMatches && !existingStoredSiteMatches) ||
      (storedSiteMatches === existingStoredSiteMatches &&
        String(row.created_at || "") > String(existing.created_at || ""))
    ) {
      grouped.set(key, {
        ...row,
        source_site: source.site,
        source_week: source.week,
        source_file: source.fileName,
      });
    }
  }

  const rowsByReport = new Map();
  for (const row of grouped.values()) {
    const key = `${row.source_site}::${row.source_week}`;
    if (!rowsByReport.has(key)) rowsByReport.set(key, []);
    rowsByReport.get(key).push(row);
  }

  const reports = [...trustedImports.entries()]
    .filter(([key]) => wantedSite === "ALL" || key.startsWith(`${wantedSite}::`))
    .map(([key, report]) => {
      const rows = rowsByReport.get(key) || [];
      const expectedRows = Number(report?.metadata?.rows || 0);
      const coverage = expectedRows > 0 ? rows.length / expectedRows : 0;
      const duplicateValues = new Map();
      let conflicts = 0;

      for (const row of rows) {
        const driverKey = String(row.driver_id || "");
        const value = Number(row.concessions || 0);
        const current = duplicateValues.get(driverKey);
        if (current != null && current !== value) conflicts += 1;
        duplicateValues.set(driverKey, value);
      }

      // A partial canonical import is more dangerous than no data: hide it.
      // 85% leaves room for unresolved identities while rejecting the W38-style
      // case where only a handful of rows survived persistence.
      const trusted = expectedRows > 0 && coverage >= 0.85 && conflicts === 0;

      return {
        key,
        site: report.site,
        week: report.week,
        fileName: report.fileName,
        importedAt: report.created_at,
        expectedRows,
        rowCount: rows.length,
        coverage,
        conflicts,
        trusted,
      };
    })
    .sort((a, b) => {
      const wa = Number(String(a.week).replace(/\D/g, "")) || 0;
      const wb = Number(String(b.week).replace(/\D/g, "")) || 0;
      return b.site.localeCompare(a.site) || wb - wa;
    });

  const trustedKeys = new Set(reports.filter((report) => report.trusted).map((report) => report.key));
  const rows = [...grouped.values()].filter((row) =>
    trustedKeys.has(`${row.source_site}::${row.source_week}`)
  );

  return { rows, reports, rejectedRows };
}
