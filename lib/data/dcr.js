export const DCR_SCORECARD_SELECT =
  "id,driver_id,week_label,period_start,period_end,dcr,delivered,scorecard_score,tier,site,raw_data,source_import_id,created_at,drivers(id,trid,full_name,site,status)";

const SITE_PATTERN = /\bD[A-Z]{1,4}\d{1,3}\b/i;

export function dcrSourceFiles(row) {
  return Array.isArray(row?.raw_data?.source_files)
    ? row.raw_data.source_files.map((value) => String(value || "")).filter(Boolean)
    : [];
}

export function isScorecardDcrRow(row) {
  if (row?.dcr == null) return false;
  const granularity = String(row?.raw_data?.metric_granularity || "").toLowerCase();
  const week = String(row?.raw_data?.calendar_week || row?.week_label || "");
  if (granularity !== "weekly" || !/^W\d+$/i.test(week)) return false;

  const files = dcrSourceFiles(row);
  const siteWorkbook = files.some((name) =>
    /^D[A-Z]{1,4}\d{1,3}(?:\s*\(\d+\))?\.xlsx$/i.test(name.trim())
  );
  return (
    row?.scorecard_score != null ||
    files.some((name) => /scorecard/i.test(name)) ||
    siteWorkbook
  );
}

export function dcrSourceSite(row) {
  const files = dcrSourceFiles(row);
  const scorecardFiles = files.filter((name) => /scorecard/i.test(name));
  const ordered = [...scorecardFiles, ...files.filter((name) => !scorecardFiles.includes(name))];

  for (const file of ordered) {
    const match = file.toUpperCase().match(SITE_PATTERN);
    if (match?.[0]) return match[0].toUpperCase();
  }

  const activity = String(row?.raw_data?.activity_site || "").trim().toUpperCase();
  if (SITE_PATTERN.test(activity)) return activity;

  const stored = String(row?.site || "").trim().toUpperCase();
  return SITE_PATTERN.test(stored) ? stored : "";
}

export function dcrSourceLabel(row) {
  const files = dcrSourceFiles(row);
  const scorecardFile = files.find((name) => /scorecard/i.test(name));
  return scorecardFile || files[0] || "DSP Scorecard";
}

export async function fetchDcrScorecardRows(
  supabase,
  organizationId,
  siteFilter = "all"
) {
  if (!organizationId) return [];

  const wantedSite = String(siteFilter || "all").trim().toUpperCase();
  const pageSize = 1000;
  const rows = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("driver_metrics")
      .select(DCR_SCORECARD_SELECT)
      .eq("organization_id", organizationId)
      .not("dcr", "is", null)
      .order("period_end", { ascending: false })
      .order("driver_id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  const filtered = rows.filter((row) => {
    if (!isScorecardDcrRow(row)) return false;
    if (wantedSite === "ALL") return true;
    return dcrSourceSite(row) === wantedSite;
  });

  // Historical imports may have been saved under the wrong Activity Site.
  // Scorecard filename/site evidence is authoritative for DCR. Collapse those
  // historical duplicates without mutating shared driver_metrics data.
  const bySourceDriver = new Map();
  for (const row of filtered) {
    const week = String(row?.raw_data?.calendar_week || row?.week_label || "").toUpperCase();
    const sourceSite = dcrSourceSite(row) || "UNKNOWN";
    const key = `${sourceSite}::${week}::${row.driver_id}`;
    const current = bySourceDriver.get(key);
    if (!current || String(row.created_at || "") > String(current.created_at || "")) {
      bySourceDriver.set(key, row);
    }
  }

  return [...bySourceDriver.values()];
}
