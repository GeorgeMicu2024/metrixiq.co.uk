export const MENTOR_DAILY_SELECT =
  "id,driver_id,source_import_id,source_identity_key,report_date,week_label,mentor_score,raw_data,is_hidden,created_at,drivers(id,trid,full_name,site,status)";

export async function fetchMentorDailyRows(supabase, organizationId) {
  const pageSize = 1000;
  const allRows = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("mentor_daily_snapshots")
      .select(MENTOR_DAILY_SELECT)
      .eq("organization_id", organizationId)
      .not("mentor_score", "is", null)
      .order("report_date", { ascending: false })
      .order("mentor_score", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const page = data || [];
    allRows.push(...page);
    if (page.length < pageSize) break;
  }

  return allRows;
}


export async function setMentorDailyVisibility(supabase, organizationId, snapshotId, hidden) {
  const { data, error } = await supabase.rpc("set_mentor_daily_visibility", {
    p_organization_id: organizationId,
    p_snapshot_id: snapshotId,
    p_hidden: Boolean(hidden),
  });
  if (error) throw error;
  return data;
}
