export const DCR_SCORECARD_SELECT =
  "id,driver_id,week_label,period_start,period_end,dcr,delivered,scorecard_score,tier,site,raw_data,source_import_id,created_at,drivers(id,trid,full_name,site,status)";

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
    let query = supabase
      .from("driver_metrics")
      .select(DCR_SCORECARD_SELECT)
      .eq("organization_id", organizationId)
      .not("dcr", "is", null)
      .order("period_end", { ascending: false })
      .order("driver_id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (wantedSite !== "ALL") {
      query = query.eq("site", wantedSite);
    }

    const { data, error } = await query;
    if (error) throw error;

    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  // DCR is a scorecard metric in this workspace. Never mix generic rows or
  // operational daily records into the ranked weekly scorecard view.
  return rows.filter((row) => {
    const granularity = String(row?.raw_data?.metric_granularity || "").toLowerCase();
    const week = String(row?.raw_data?.calendar_week || row?.week_label || "");
    return granularity === "weekly" && /^W\d+$/i.test(week);
  });
}
