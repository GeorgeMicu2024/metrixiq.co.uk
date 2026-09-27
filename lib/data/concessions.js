export const TRUSTED_CONCESSIONS_PATTERN =
  /^DSP_Associates_Concessions_(D[A-Z]{1,4}\d{1,3})_(\d{4})-W(\d{2})(?:\s*\(\d+\))?\.csv$/i;

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

export async function fetchConcessionSnapshots(
  supabase,
  organizationId,
  siteFilter = "all"
) {
  if (!organizationId) return [];

  const wantedSite = String(siteFilter || "all").trim().toUpperCase();
  let query = supabase
    .from("concessions_weekly_snapshots")
    .select("id,organization_id,site,week_label,driver_id,driver_trid,driver_name,dnr,source_file,updated_at")
    .eq("organization_id", organizationId)
    .gt("dnr", 0)
    .order("week_label", { ascending: false })
    .order("dnr", { ascending: false })
    .limit(5000);

  if (wantedSite !== "ALL") query = query.eq("site", wantedSite);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export function latestFourConcessionWeeks(rows, site) {
  return [...new Set(
    (rows || [])
      .filter((row) => !site || row.site === site)
      .map((row) => row.week_label)
      .filter(Boolean)
  )]
    .sort((a, b) => Number(String(b).replace(/\D/g, "")) - Number(String(a).replace(/\D/g, "")))
    .slice(0, 4)
    .reverse();
}

export function buildFourWeekConcessionMatrix(rows, site, weeks) {
  const byDriver = new Map();

  for (const row of rows || []) {
    if (site && row.site !== site) continue;
    if (!weeks.includes(row.week_label)) continue;

    const key = String(row.driver_trid || "").toUpperCase();
    if (!key) continue;

    const current = byDriver.get(key) || {
      driver_id: row.driver_id || null,
      driver_trid: key,
      driver_name: row.driver_name || key,
      site: row.site,
      byWeek: Object.fromEntries(weeks.map((week) => [week, 0])),
      total: 0,
      affectedWeeks: 0,
    };

    const value = Number(row.dnr || 0);
    current.byWeek[row.week_label] = value;
    current.total += value;
    if (value > 0) current.affectedWeeks += 1;
    if (!current.driver_id && row.driver_id) current.driver_id = row.driver_id;
    byDriver.set(key, current);
  }

  return [...byDriver.values()].sort(
    (a, b) =>
      b.total - a.total ||
      b.affectedWeeks - a.affectedWeeks ||
      a.driver_name.localeCompare(b.driver_name)
  );
}
