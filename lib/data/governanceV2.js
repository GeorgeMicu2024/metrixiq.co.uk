import { buildDataQualityV2 } from "../governance/dataQualityV2.js";
import { effectivePermissions } from "../governance/permissions.js";

const OVERRIDE_FIELDS = new Set([
  "mentor_score","dcr","dsc_dpmo","lor","pod","cc","ce_dpmo","cdf_dpmo","psb",
  "delivered","concessions"
]);

export async function fetchDataQualityV2(supabase, organizationId) {
  const [drivers, unmatched, aliases, metrics, imports] = await Promise.all([
    supabase.from("drivers")
      .select("id,trid,full_name,site,status,created_at,updated_at")
      .eq("organization_id", organizationId)
      .order("full_name"),
    supabase.from("unmatched_driver_records")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase.from("driver_aliases")
      .select("id,driver_id,alias_type,alias_value,alias_normalized,confidence,source,created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(3000),
    supabase.from("driver_metrics")
      .select("id,driver_id,week_label,period_start,period_end,mentor_score,ementor,fico,dcr,dsc_dpmo,lor,pod,cc,ce_dpmo,cdf_dpmo,psb,raw_data,drivers(id,trid,full_name,site,status)")
      .eq("organization_id", organizationId)
      .order("period_end", { ascending: false })
      .limit(5000),
    supabase.from("imports")
      .select("id,file_name,detected_report_type,status,error_message,period_start,period_end,created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  for (const result of [drivers, unmatched, aliases, metrics, imports]) {
    if (result.error) throw result.error;
  }

  const raw = {
    drivers: drivers.data || [],
    unmatched: unmatched.data || [],
    aliases: aliases.data || [],
    metricRows: metrics.data || [],
    imports: imports.data || [],
  };

  return {
    ...raw,
    quality: buildDataQualityV2(raw),
  };
}

export async function fetchAuditEvents(supabase, organizationId, limit = 500) {
  const { data, error } = await supabase.rpc("list_audit_events", {
    p_organization_id: organizationId,
    p_limit: limit,
  });
  if (error) throw error;
  return data || [];
}

export async function fetchMetricOverrides(supabase, organizationId, status = null) {
  const { data, error } = await supabase.rpc("list_metric_overrides", {
    p_organization_id: organizationId,
    p_status: status,
  });
  if (error) throw error;
  return data || [];
}

export async function resetMetricOverride(supabase, overrideId, reason = "") {
  const { error } = await supabase.rpc("reset_driver_metric_override", {
    p_override_id: overrideId,
    p_reason: reason || null,
  });
  if (error) throw error;
}

export async function setMetricOverride(supabase, payload) {
  if (!OVERRIDE_FIELDS.has(payload.metricKey)) throw new Error("Unsupported metric override.");
  const { data, error } = await supabase.rpc("set_driver_metric_override", {
    p_organization_id: payload.organizationId,
    p_driver_id: payload.driverId,
    p_week_label: payload.weekLabel,
    p_metric_key: payload.metricKey,
    p_override_value: payload.value,
    p_reason: payload.reason || null,
  });
  if (error) throw error;
  return data || null;
}

export async function fetchPermissionWorkspace(supabase, organizationId) {
  const [{ data: members, error }, { data: mine, error: mineError }] = await Promise.all([
    supabase.rpc("list_workspace_permissions", { p_organization_id: organizationId }),
    supabase.rpc("get_my_effective_permissions", { p_organization_id: organizationId }),
  ]);
  if (error) throw error;
  if (mineError) throw mineError;

  return {
    members: (members || []).map((item) => ({
      ...item,
      effective_permissions: item.effective_permissions || effectivePermissions(item.role, item.permission_overrides || {}),
    })),
    mine: mine || {},
  };
}

export async function updatePermissionOverrides(supabase, organizationId, userId, overrides) {
  const { error } = await supabase.rpc("update_member_permission_overrides", {
    p_organization_id: organizationId,
    p_user_id: userId,
    p_permissions: overrides || {},
  });
  if (error) throw error;
}

export async function fetchSavedViews(supabase, organizationId, viewType = "driver-scorecards") {
  const { data, error } = await supabase
    .from("saved_views")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("view_type", viewType)
    .order("is_default", { ascending: false })
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function saveView(supabase, payload) {
  const row = {
    organization_id: payload.organizationId,
    name: payload.name,
    view_type: payload.viewType || "driver-scorecards",
    filters: payload.filters || {},
    columns: payload.columns || [],
    sort_config: payload.sortConfig || {},
    is_default: Boolean(payload.isDefault),
    shared: Boolean(payload.shared),
  };

  let query;
  if (payload.id) query = supabase.from("saved_views").update(row).eq("id", payload.id).select("*").single();
  else query = supabase.from("saved_views").insert(row).select("*").single();

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function deleteView(supabase, id) {
  const { error } = await supabase.from("saved_views").delete().eq("id", id);
  if (error) throw error;
}

export async function setDefaultView(supabase, organizationId, id, viewType = "driver-scorecards") {
  const { error: clearError } = await supabase
    .from("saved_views")
    .update({ is_default: false })
    .eq("organization_id", organizationId)
    .eq("view_type", viewType);
  if (clearError) throw clearError;

  const { error } = await supabase.from("saved_views").update({ is_default: true }).eq("id", id);
  if (error) throw error;
}

export async function bulkOpenCoachingCases(supabase, payload) {
  const { data, error } = await supabase.rpc("bulk_open_coaching_cases", {
    p_organization_id: payload.organizationId,
    p_driver_ids: payload.driverIds,
    p_title: payload.title || "Bulk coaching action",
    p_reason: payload.reason || null,
    p_metric: payload.metric || null,
    p_priority: payload.priority || "medium",
    p_week_label: payload.weekLabel || null,
  });
  if (error) throw error;
  return Number(data || 0);
}

export async function bulkMarkReviewed(supabase, payload) {
  const { data, error } = await supabase.rpc("bulk_mark_drivers_reviewed", {
    p_organization_id: payload.organizationId,
    p_driver_ids: payload.driverIds,
    p_week_label: payload.weekLabel || null,
    p_note: payload.note || null,
  });
  if (error) throw error;
  return Number(data || 0);
}

export function applyMetricOverrides(rows = [], overrides = []) {
  const active = new Map();
  for (const item of overrides || []) {
    if (item.status !== "active") continue;
    active.set(`${item.driver_id}::${item.week_label}::${item.metric_key}`, item);
  }

  return rows.map((row) => {
    const next = { ...row };
    for (const metric of OVERRIDE_FIELDS) {
      const match = active.get(`${row.driver_id}::${row.week_label}::${metric}`);
      if (match) next[metric] = match.override_value;
    }
    return next;
  });
}
