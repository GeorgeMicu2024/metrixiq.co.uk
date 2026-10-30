export const SITE_SCORECARD_METRIC_SELECT =
  "driver_id,site,week_label,period_end,performance,dcr,pod,iadc,cc,mentor_score,ementor,fico,concessions,delivered,dnr_dpmo,dsc_dpmo,ce_dpmo,cdf_dpmo,psb,lor,risk,issue,data_confidence,drivers(id,trid,full_name,site,status)";

export const DRIVER_SCORECARD_METRIC_SELECT =
  "driver_id,site,week_label,period_start,period_end,performance,scorecard_score,tier,dcr,pod,iadc,cc,mentor_score,ementor,fico,concessions,delivered,dnr_dpmo,dsc_dpmo,ce_dpmo,cdf_dpmo,psb,lor,risk,issue,data_confidence,raw_data,drivers(id,trid,full_name,site,status)";

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

export async function fetchSiteCards(supabase, organizationId) {
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

export function isWeeklyScorecardMetric(row) {
  const granularity = String(row?.raw_data?.metric_granularity || "").trim().toLowerCase();
  const weekLabel = String(row?.week_label || "").trim();

  if (granularity === "daily") return false;
  // Daily persistence uses Wxx:YYYY-MM-DD. Keep this guard for legacy rows
  // that predate metric_granularity.
  if (/^W\d{1,2}:\d{4}-\d{2}-\d{2}$/i.test(weekLabel)) return false;
  if (granularity === "weekly") return true;

  // Legacy weekly scorecard rows did not always store granularity.
  return /^W\d{1,2}$/i.test(weekLabel);
}

export async function fetchDriverScorecardData(supabase, organizationId) {
  const [cards, allRows] = await Promise.all([
    fetchSiteCards(supabase, organizationId),
    fetchMetricPages(supabase, organizationId, DRIVER_SCORECARD_METRIC_SELECT),
  ]);

  const rows = allRows.filter(isWeeklyScorecardMetric);
  return { cards, rows };
}


// Driver Feedback only needs weekly rows; daily uploads and site scorecard
// summaries make the shared scorecard fetch unnecessarily expensive on mobile.
// Keep the shared fetch unchanged for other scorecard screens.
export async function fetchDriverFeedbackScorecardRows(supabase, organizationId) {
  if (!organizationId) return { rows: [] };

  const pageSize = 1000;
  const query = (withCount = false) =>
    supabase
      .from("driver_metrics")
      .select(DRIVER_SCORECARD_METRIC_SELECT, withCount ? { count: "exact" } : undefined)
      .eq("organization_id", organizationId)
      .like("week_label", "W%")
      .not("week_label", "like", "%:%")
      .order("period_end", { ascending: false });

  const first = await query(true).range(0, pageSize - 1);
  if (first.error) throw first.error;
  const rows = first.data || [];

  // Parallel pages remove the long chain of sequential requests. Bound the
  // concurrency so even larger organizations do not flood the API.
  const total = first.count;
  if (typeof total === "number") {
    const starts = [];
    for (let from = pageSize; from < total; from += pageSize) starts.push(from);
    for (let i = 0; i < starts.length; i += 4) {
      const batch = await Promise.all(starts.slice(i, i + 4).map((from) =>
        query().range(from, from + pageSize - 1)
      ));
      for (const result of batch) {
        if (result.error) throw result.error;
        rows.push(...(result.data || []));
      }
    }
  } else {
    // Some Supabase backends do not return an exact count.
    let from = pageSize;
    while (rows.length >= from) {
      const next = await query().range(from, from + pageSize - 1);
      if (next.error) throw next.error;
      const page = next.data || [];
      rows.push(...page);
      if (page.length < pageSize) break;
      from += pageSize;
    }
  }

  return { rows: rows.filter(isWeeklyScorecardMetric) };
}
