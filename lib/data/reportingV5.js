import { applyMetricOverrides, fetchMetricOverrides } from "./governanceV2.js";

function ok(result, fallback = []) {
  if (!result || result.error) return fallback;
  return result.data ?? fallback;
}

export async function fetchReportingV5Data(supabase, organizationId) {
  const [
    metricsResult,
    scorecardsResult,
    overrides,
    incidentsResult,
    coachingResult,
    feedbackResult,
    tasksResult,
    importsResult,
    unmatchedResult,
    snapshotsResult,
  ] = await Promise.all([
    supabase
      .from("driver_metrics")
      .select("*,drivers!inner(id,trid,full_name,site,status)")
      .eq("organization_id", organizationId)
      .order("period_end", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("site_scorecards")
      .select("*")
      .eq("organization_id", organizationId)
      .order("year", { ascending: true })
      .order("week", { ascending: true }),
    fetchMetricOverrides(supabase, organizationId, "active"),
    supabase.rpc("list_operational_incidents", {
      p_organization_id: organizationId,
      p_status: null,
      p_limit: 2500,
    }),
    supabase
      .from("coaching_cases")
      .select("*,drivers!inner(id,trid,full_name,site)")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(2000),
    supabase
      .from("feedback_events")
      .select("id,driver_id,site,week_label,tracking_id,feedback_l0,feedback_l1,feedback_l2,feedback_date,contact_compliance,scanned_over_25m,dnr_concession,drivers(id,trid,full_name,site)")
      .eq("organization_id", organizationId)
      .order("feedback_date", { ascending: false })
      .limit(3000),
    supabase.rpc("list_manager_tasks", {
      p_organization_id: organizationId,
      p_status: null,
      p_limit: 2000,
    }),
    supabase
      .from("imports")
      .select("id,site,file_name,status,error_message,detected_report_type,period_start,period_end,metadata,created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("unmatched_driver_records")
      .select("id,site,week_label,status,raw_trid,raw_name,report_type,created_at")
      .eq("organization_id", organizationId)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(2000),
    supabase.rpc("list_report_snapshots", {
      p_organization_id: organizationId,
      p_limit: 200,
    }),
  ]);

  if (metricsResult.error) throw metricsResult.error;
  if (scorecardsResult.error) throw scorecardsResult.error;

  return {
    metricRows: applyMetricOverrides(metricsResult.data || [], overrides || []),
    scorecards: scorecardsResult.data || [],
    incidents: ok(incidentsResult),
    coaching: ok(coachingResult),
    feedback: ok(feedbackResult),
    tasks: ok(tasksResult),
    imports: ok(importsResult),
    unmatched: ok(unmatchedResult),
    snapshots: ok(snapshotsResult),
    optionalErrors: [
      incidentsResult.error?.message,
      coachingResult.error?.message,
      feedbackResult.error?.message,
      tasksResult.error?.message,
      importsResult.error?.message,
      unmatchedResult.error?.message,
      snapshotsResult.error?.message,
    ].filter(Boolean),
  };
}

export async function saveReportSnapshot(supabase, payload) {
  const { data, error } = await supabase.rpc("save_report_snapshot", {
    p_organization_id: payload.organizationId,
    p_report_type: payload.reportType,
    p_title: payload.title,
    p_site: payload.site || null,
    p_week_label: payload.weekLabel || null,
    p_filters: payload.filters || {},
    p_sections: payload.sections || [],
    p_summary: payload.summary || {},
    p_payload: payload.payload || {},
  });
  if (error) throw error;
  return data;
}
