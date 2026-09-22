export const DIRECT_OPERATIONAL_SELECT =
  "driver_id,week_label,period_start,period_end,dcr,pod,cc,iadc,mentor_score,ementor,fico,concessions,raw_data,risk,issue,drivers(id,trid,full_name,site,status)";

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

    if (["pod", "dcr", "cc"].includes(kind)) {
      query = query.not(kind, "is", null);
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

  // IADC and DWC share one workspace. Keep genuine IADC rows plus
  // DWC-only rows, but exclude unrelated metrics so newer weeks cannot
  // steal the selected period and make Daily appear empty.
  if (kind === "iadc") {
    return allRows.filter((row) =>
      row.iadc != null ||
      row.raw_data?.dwc != null
    );
  }

  return allRows;
}
