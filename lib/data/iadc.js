export const IADC_WORKSPACE_SELECT =
  "id,driver_id,week_label,period_start,period_end,iadc,site,raw_data,created_at,drivers(id,trid,full_name,site,status)";

export async function fetchIadcWorkspaceRows(
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
      .select(IADC_WORKSPACE_SELECT)
      .eq("organization_id", organizationId)
      .not("iadc", "is", null)
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

  return rows;
}
