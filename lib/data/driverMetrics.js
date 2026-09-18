export const DRIVER_METRIC_SELECT =
  "driver_id,week_label,period_start,period_end,performance,dcr,pod,iadc,cc,fico,ementor,mentor_score,psb,reattempts,concessions,lor,delivered,dnr_dpmo,dsc_dpmo,ce_dpmo,cdf_dpmo,scorecard_score,tier,risk,issue,data_confidence,raw_data,drivers(id,trid,full_name,site,status)";

export async function fetchAllDriverMetricRows(supabase, organizationId) {
  const pageSize = 1000;
  const rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("driver_metrics")
      .select(DRIVER_METRIC_SELECT)
      .eq("organization_id", organizationId)
      .order("period_end", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const page = data || [];
    rows.push(...page);

    if (page.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}


export const DRIVER_HISTORY_SELECT =
  "period_start,period_end,week_label,performance,dcr,pod,iadc,cc,fico,ementor,mentor_score,concessions,cdf_dpmo,risk,issue,raw_data";

export async function fetchDriverHistory(supabase, organizationId, driverId, limit = 12) {
  const { data, error } = await supabase
    .from("driver_metrics")
    .select(DRIVER_HISTORY_SELECT)
    .eq("organization_id", organizationId)
    .eq("driver_id", driverId)
    .order("period_end", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return data || [];
}
