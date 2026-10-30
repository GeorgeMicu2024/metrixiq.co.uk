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
  const [cards, scorecards] = await Promise.all([
    fetchSiteCards(supabase, organizationId),
    fetchWeeklyScorecardRows(supabase, organizationId),
  ]);
  return { cards, rows: scorecards.rows };
}

// Both Driver Scorecards and Driver Feedback use weekly archive rows. Apply
// that filter on the server so daily uploads never hold up the archive screen.
export async function fetchWeeklyScorecardRows(supabase, organizationId, { weekLabels = [] } = {}) {
  if (!organizationId) return { rows: [] };

  const pageSize = 1000;
  const query = (withCount = false) => {
    let request = supabase
      .from("driver_metrics")
      .select(DRIVER_SCORECARD_METRIC_SELECT, withCount ? { count: "exact" } : undefined)
      .eq("organization_id", organizationId)
      .like("week_label", "W%")
      .not("week_label", "like", "%:%");
    if (weekLabels.length) request = request.in("week_label", weekLabels);
    return request
      .order("period_end", { ascending: false })
      .order("id", { ascending: true });
  };

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

  
// Keep the existing feedback API stable; it shares the optimized weekly fetch.
export async function fetchDriverFeedbackScorecardRows(supabase, organizationId) {
  return fetchWeeklyScorecardRows(supabase, organizationId);
}

/**
 * Fast first paint for Driver Scorecards: fetch only the newest two official
 * reporting weeks. The complete archive is then loaded in the background.
 */
export async function fetchDriverScorecardStartupData(supabase, organizationId) {
  const cards = await fetchSiteCards(supabase, organizationId);
  const latestWeeks = [...cards]
    .sort((a, b) => (Number(b.year || 0) * 100 + Number(b.week || 0)) -
      (Number(a.year || 0) * 100 + Number(a.week || 0)))
    .map((card) => String(card.week_label || "W" + Number(card.week || 0)))
    .filter((week) => /^W\d{1,2}$/i.test(week));
  const recentWeeks = [...new Set(latestWeeks)].slice(0, 2);
  const scorecards = await fetchWeeklyScorecardRows(
    supabase, organizationId, recentWeeks.length ? { weekLabels: recentWeeks } : {}
  );
  return { cards, rows: scorecards.rows };
}
