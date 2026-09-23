export const DRIVER_METRIC_MERGE_SELECT =
  "id,driver_id,site,week_label,source_import_id,period_start,period_end,performance,dcr,pod,iadc,cc,fico,ementor,mentor_score,psb,reattempts,concessions,lor,delivered,dnr_dpmo,dsc_dpmo,ce_dpmo,cdf_dpmo,scorecard_score,tier,risk,issue,data_confidence,raw_data";

export async function fetchExistingMetricRows(
  supabase,
  organizationId,
  driverIds,
  weekLabels,
  site = null
) {
  if (!driverIds.length || !weekLabels.length) return new Map();

  let query = supabase
    .from("driver_metrics")
    .select(DRIVER_METRIC_MERGE_SELECT)
    .eq("organization_id", organizationId)
    .in("driver_id", driverIds)
    .in("week_label", weekLabels);

  query = site ? query.eq("site", site) : query.is("site", null);
  const { data, error } = await query;

  if (error) throw error;

  return new Map(
    (data || []).map((row) => [
      `${row.driver_id}|${row.site || ""}|${row.week_label}`,
      row,
    ])
  );
}

export async function upsertDriverMetricRows(supabase, rows) {
  if (!rows.length) return 0;

  const { data, error } = await supabase
    .from("driver_metrics")
    .upsert(rows, {
      onConflict: "organization_id,driver_id,site,week_label",
    })
    .select("id");

  if (error) throw error;
  return data?.length || 0;
}
