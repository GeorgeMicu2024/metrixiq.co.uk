import { applyMetricOverrides, fetchMetricOverrides } from "./governanceV2.js";

// The Analyst has a dedicated, recent-first read path. The shared report
// builder loader deliberately remains unchanged. Supabase projects commonly
// enforce a 1,000-row API response ceiling, so every driver metric page must
// be requested explicitly rather than silently dropping the newest periods.
const PAGE_SIZE = 500;
const MAX_METRIC_ROWS = 12000;

function optional(result, errors, label) {
  if (result?.error) {
    errors.push(label + ": " + result.error.message);
    return [];
  }
  return result?.data || [];
}

export async function fetchAnalystV3Data(supabase, organizationId, site = "all") {
  const station = site && site !== "all" ? String(site).toUpperCase() : null;
  let scorecardQuery = supabase.from("site_scorecards").select("*")
    .eq("organization_id", organizationId)
    .order("year", { ascending: false })
    .order("week", { ascending: false })
    .limit(400);
  if (station) scorecardQuery = scorecardQuery.eq("site", station);

  const [scorecardsResult, overridesResult, incidentsResult, coachingResult, feedbackResult,
    tasksResult, importsResult, unmatchedResult] = await Promise.all([
    scorecardQuery,
    fetchMetricOverrides(supabase, organizationId, "active"),
    supabase.rpc("list_operational_incidents", {
      p_organization_id: organizationId, p_status: null, p_limit: 1500,
    }),
    supabase.from("coaching_cases").select("*,drivers!inner(id,trid,full_name,site)")
      .eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(1000),
    supabase.from("feedback_events")
      .select("id,driver_id,site,week_label,tracking_id,feedback_l0,feedback_l1,feedback_l2,feedback_date,contact_compliance,scanned_over_25m,dnr_concession,drivers(id,trid,full_name,site)")
      .eq("organization_id", organizationId).order("feedback_date", { ascending: false }).limit(1500),
    supabase.rpc("list_manager_tasks", {
      p_organization_id: organizationId, p_status: null, p_limit: 1000,
    }),
    supabase.from("imports")
      .select("id,site,file_name,status,error_message,detected_report_type,period_start,period_end,metadata,created_at")
      .eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(250),
    supabase.from("unmatched_driver_records")
      .select("id,site,week_label,status,raw_trid,raw_name,report_type,created_at")
      .eq("organization_id", organizationId).eq("status", "open")
      .order("created_at", { ascending: false }).limit(1000),
  ]);
  if (scorecardsResult.error) throw scorecardsResult.error;
  const scorecards = scorecardsResult.data || [];
  const recentWeeks = [...new Set(scorecards.map((row) => row.week_label).filter(Boolean))].slice(0, 12);

  const metricRows = [];
  let capped = false;
  for (let offset = 0; offset < MAX_METRIC_ROWS; offset += PAGE_SIZE) {
    let query = supabase.from("driver_metrics")
      .select("*,drivers!inner(id,trid,full_name,site,status)")
      .eq("organization_id", organizationId)
      .order("period_end", { ascending: false })
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    // Filter by the recorded Activity Site, not the driver's movable profile.
    if (station) query = query.eq("site", station);
    if (recentWeeks.length) query = query.in("week_label", recentWeeks);
    const result = await query;
    if (result.error) throw result.error;
    metricRows.push(...(result.data || []));
    if ((result.data || []).length < PAGE_SIZE) break;
    if (offset + PAGE_SIZE >= MAX_METRIC_ROWS) capped = true;
  }

  const optionalErrors = [];
  const overrides = optional(Array.isArray(overridesResult)
    ? { data: overridesResult } : overridesResult, optionalErrors, "Metric overrides");
  const imported = optional(importsResult, optionalErrors, "Imports");
  return {
    metricRows: applyMetricOverrides(metricRows, overrides),
    scorecards,
    incidents: optional(incidentsResult, optionalErrors, "Incidents"),
    coaching: optional(coachingResult, optionalErrors, "Coaching"),
    feedback: optional(feedbackResult, optionalErrors, "Customer feedback"),
    tasks: optional(tasksResult, optionalErrors, "Manager tasks"),
    imports: station ? imported.filter((item) => !item.site || String(item.site).toUpperCase() === station) : imported,
    unmatched: optional(unmatchedResult, optionalErrors, "Unmatched drivers"),
    optionalErrors: [...optionalErrors, ...(capped ? ["Metric history reached the Analyst's 12,000-row safety limit; some older records may be excluded."] : [])],
  };
}
