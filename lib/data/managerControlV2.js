import { fetchAllDriverMetricRows } from "./driverMetrics.js";
import { fetchCoachingOverview, refreshPerformanceAlerts } from "./coaching.js";
import { buildManagerWorkQueue, summarizeManagerQueue } from "../management/controlCenterV2.js";

export async function refreshManagerIntelligence(supabase, organizationId) {
  if (!organizationId) return;
  await refreshPerformanceAlerts(supabase, organizationId);

  const [tasksResult, notificationsResult] = await Promise.all([
    supabase.rpc("refresh_manager_tasks", { p_organization_id: organizationId }),
    supabase.rpc("refresh_notification_events", { p_organization_id: organizationId }),
  ]);

  if (tasksResult.error) throw tasksResult.error;
  if (notificationsResult.error) throw notificationsResult.error;
}

export async function fetchManagerTasks(supabase, organizationId, status = null, limit = 500) {
  const { data, error } = await supabase.rpc("list_manager_tasks", {
    p_organization_id: organizationId,
    p_status: status,
    p_limit: limit,
  });
  if (error) throw error;
  return data || [];
}

export async function fetchManagerControlData(supabase, organizationId, siteFilter = "all") {
  await refreshManagerIntelligence(supabase, organizationId);

  const [metricRows, coaching, tasksResult, unmatchedResult, importsResult, membersResult] = await Promise.all([
    fetchAllDriverMetricRows(supabase, organizationId),
    fetchCoachingOverview(supabase, organizationId),
    fetchManagerTasks(supabase, organizationId, null, 500),
    supabase
      .from("unmatched_driver_records")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "open"),
    supabase
      .from("imports")
      .select("id,file_name,status,error_message,created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.rpc("list_coaching_assignees", { p_organization_id: organizationId }),
  ]);

  if (unmatchedResult.error) throw unmatchedResult.error;
  if (importsResult.error) throw importsResult.error;
  if (membersResult.error) throw membersResult.error;

  const imports = importsResult.data || [];
  const failedImports = imports.filter((item) => item.status === "failed" || item.error_message).length;
  const queue = buildManagerWorkQueue({
    metricRows,
    alerts: coaching.alerts,
    coachingCases: coaching.cases,
    tasks: tasksResult,
    unmatchedCount: unmatchedResult.count || 0,
    failedImports,
    siteFilter,
  });

  return {
    metricRows,
    alerts: coaching.alerts,
    coachingCases: coaching.cases,
    tasks: tasksResult,
    queue,
    summary: summarizeManagerQueue(queue),
    unmatchedCount: unmatchedResult.count || 0,
    failedImports,
    recentImports: imports,
    assignees: membersResult.data || [],
  };
}

export async function ensureManagerTask(supabase, organizationId, item) {
  if (item.source === "manager-task" && item.source_id) return item.source_id;
  const { data, error } = await supabase.rpc("create_manager_task_from_signal", {
    p_organization_id: organizationId,
    p_driver_id: item.driver_id || null,
    p_site: item.site || null,
    p_source_type: item.source || item.category || "signal",
    p_source_id: item.source_id ? String(item.source_id) : null,
    p_dedupe_key: item.id || null,
    p_title: item.title,
    p_detail: item.detail || null,
    p_priority: item.severity || "medium",
    p_due_at: item.due_at || null,
    p_metadata: item.metadata || {},
  });
  if (error) throw error;
  return data;
}

export async function updateManagerTask(supabase, taskId, patch = {}) {
  const { error } = await supabase.rpc("update_manager_task", {
    p_task_id: taskId,
    p_status: patch.status || null,
    p_assigned_to: patch.assignedTo || null,
    p_due_at: patch.dueAt || null,
    p_detail: patch.detail || null,
  });
  if (error) throw error;
}

export async function reviewManagerItem(supabase, organizationId, item, note = "") {
  const { error } = await supabase.rpc("review_manager_signal", {
    p_organization_id: organizationId,
    p_driver_id: item.driver_id || null,
    p_site: item.site || null,
    p_week_label: item.week_label || null,
    p_signal_key: item.id,
    p_title: item.title,
    p_note: note || null,
  });
  if (error) throw error;
}

export async function openCoachingFromManagerItem(supabase, organizationId, item, templateId = null) {
  const { data, error } = await supabase.rpc("open_coaching_case_direct", {
    p_organization_id: organizationId,
    p_driver_id: item.driver_id,
    p_title: item.title ? `Coaching: ${item.title}` : "Performance coaching",
    p_reason: item.detail || item.title || "Performance signal",
    p_metric: item.metric || null,
    p_priority: item.severity || "medium",
    p_period_label: item.week_label || null,
    p_signal_key: item.id || null,
    p_template_id: templateId || null,
    p_metadata: {
      source: "manager-control-v2",
      category: item.category || null,
      ...(item.metadata || {}),
    },
  });
  if (error) throw error;
  return data || "";
}
