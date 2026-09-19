export const DIRECT_OPERATIONAL_SELECT =
  "driver_id,week_label,period_start,period_end,iadc,mentor_score,ementor,fico,concessions,raw_data,risk,issue,drivers(id,trid,full_name,site,status)";

export async function fetchDirectOperationalRows(supabase, organizationId, kind) {
  const pageSize = 1000;
  const allRows = [];

  for (let from = 0; ; from += pageSize) {
    let query = supabase
      .from("driver_metrics")
      .select(DIRECT_OPERATIONAL_SELECT)
      .eq("organization_id", organizationId)
      .order("period_end", { ascending: true })
      .order("driver_id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (kind === "iadc") {
      query = query.not("iadc", "is", null);
    }

    const { data, error } = await query;
    if (error) throw error;

    const page = data || [];
    allRows.push(...page);

    if (page.length < pageSize) break;
  }

  if (kind === "mentor") {
    return allRows.filter((row) =>
      row.mentor_score != null ||
      row.ementor != null ||
      row.fico != null ||
      row.raw_data?.mentor
    );
  }

  return allRows;
}
