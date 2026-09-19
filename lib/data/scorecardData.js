export const SITE_SCORECARD_METRIC_SELECT =
  "driver_id,week_label,period_end,performance,dcr,pod,iadc,cc,mentor_score,ementor,fico,concessions,delivered,dnr_dpmo,dsc_dpmo,ce_dpmo,cdf_dpmo,psb,lor,risk,issue,data_confidence,drivers(id,trid,full_name,site,status)";

export const DRIVER_SCORECARD_METRIC_SELECT =
  "driver_id,week_label,period_start,period_end,performance,scorecard_score,tier,dcr,pod,iadc,cc,mentor_score,ementor,fico,concessions,delivered,dnr_dpmo,dsc_dpmo,ce_dpmo,cdf_dpmo,psb,lor,risk,issue,data_confidence,raw_data,drivers(id,trid,full_name,site,status)";

async function fetchMetricPages(supabase, organizationId, select) {
  const rows = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("driver_metrics")
      .select(select)
      .eq("organization_id", organizationId)
      .order("period_end", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const page = data || [];
    rows.push(...page);

    if (page.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function fetchSiteCards(supabase, organizationId) {
  const { data, error } = await supabase
    .from("site_scorecards")
    .select("*")
    .eq("organization_id", organizationId)
    .order("year", { ascending: false })
    .order("week", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function fetchSiteScorecardData(supabase, organizationId) {
  const [cards, rows] = await Promise.all([
    fetchSiteCards(supabase, organizationId),
    fetchMetricPages(supabase, organizationId, SITE_SCORECARD_METRIC_SELECT),
  ]);

  return { cards, rows };
}

export async function fetchDriverScorecardData(supabase, organizationId) {
  const [cards, rows] = await Promise.all([
    fetchSiteCards(supabase, organizationId),
    fetchMetricPages(supabase, organizationId, DRIVER_SCORECARD_METRIC_SELECT),
  ]);

  return { cards, rows };
}
