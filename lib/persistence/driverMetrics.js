export const DRIVER_METRIC_MERGE_SELECT =
  "id,driver_id,site,week_label,source_import_id,period_start,period_end,performance,dcr,pod,iadc,cc,fico,ementor,mentor_score,psb,reattempts,concessions,lor,delivered,dnr_dpmo,dsc_dpmo,ce_dpmo,cdf_dpmo,scorecard_score,tier,risk,issue,data_confidence,raw_data";

export async function fetchExistingMetricRows(
  supabase,
  organizationId,
  driverIds,
  weekLabels,
  site = null,
  sites = []
) {
  if (!driverIds.length || !weekLabels.length) return new Map();

  const result = new Map();
  const scopedSites = site ? [site] : [...new Set((sites || []).filter(Boolean)), null];
  for (const selectedSite of scopedSites) {
    for (const week of weekLabels) {
      for (let i=0;i<driverIds.length;i+=100) {
        let query=supabase.from("driver_metrics").select(DRIVER_METRIC_MERGE_SELECT)
          .eq("organization_id",organizationId).in("driver_id",driverIds.slice(i,i+100)).eq("week_label",week);
        query=selectedSite?query.eq("site",selectedSite):query.is("site",null);
        const {data,error}=await query;
        if(error)throw error;
        for(const row of data||[])result.set([row.driver_id,row.site||"",row.week_label].join("|"),row);
      }
    }
  }
  return result;
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
