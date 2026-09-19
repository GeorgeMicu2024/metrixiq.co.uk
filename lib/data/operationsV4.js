import { applyMetricOverrides, fetchMetricOverrides } from "./governanceV2.js";
import { aggregateRootCauses, rootCauseForRow } from "../intelligence/rootCause.js";

export async function fetchDriver360V2Data(supabase, organizationId, driverId) {
  const [
    metricsResult,
    overrideRows,
    feedbackResult,
    alertsResult,
    coachingResult,
    incidentsResult,
    notesResult,
    auditResult,
  ] = await Promise.all([
    supabase
      .from("driver_metrics")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("driver_id", driverId)
      .order("period_end", { ascending: true })
      .order("created_at", { ascending: true }),
    fetchMetricOverrides(supabase, organizationId, null),
    supabase
      .from("feedback_events")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("driver_id", driverId)
      .order("feedback_date", { ascending: false })
      .limit(200),
    supabase
      .from("performance_alerts")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("driver_id", driverId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("coaching_cases")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("driver_id", driverId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("operational_incidents")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("driver_id", driverId)
      .order("occurred_at", { ascending: false })
      .limit(200),
    supabase
      .from("driver_notes")
      .select("id,driver_id,note,note_type,created_at,created_by,profiles:created_by(full_name,email)")
      .eq("organization_id", organizationId)
      .eq("driver_id", driverId)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.rpc("list_audit_events", { p_organization_id: organizationId, p_limit: 1000 }),
  ]);

  for (const result of [metricsResult, feedbackResult, alertsResult, coachingResult, incidentsResult, notesResult, auditResult]) {
    if (result.error) throw result.error;
  }

  const driverOverrides = (overrideRows || []).filter((item) => item.driver_id === driverId);
  const metrics = applyMetricOverrides(metricsResult.data || [], driverOverrides);
  const audit = (auditResult.data || []).filter((item) => item.driver_id === driverId);

  return {
    metrics,
    feedback: feedbackResult.data || [],
    alerts: alertsResult.data || [],
    coaching: coachingResult.data || [],
    incidents: incidentsResult.data || [],
    notes: notesResult.data || [],
    audit,
    overrides: driverOverrides,
  };
}

export async function addDriverNote(supabase, payload) {
  const { data, error } = await supabase.rpc("add_driver_note", {
    p_organization_id: payload.organizationId,
    p_driver_id: payload.driverId,
    p_note: payload.note,
    p_note_type: payload.noteType || "manager",
  });
  if (error) throw error;
  return data;
}

export async function fetchIncidentCenterData(supabase, organizationId) {
  const [incidents, feedback, assignees] = await Promise.all([
    supabase.rpc("list_operational_incidents", {
      p_organization_id: organizationId,
      p_status: null,
      p_limit: 1500,
    }),
    supabase
      .from("feedback_events")
      .select("id,driver_id,site,week_label,tracking_id,trid_raw,feedback_l0,feedback_l1,feedback_l2,feedback_date,contact_compliance,phr_compliance,phr_safe_place,phr_delivery_location,scanned_over_25m,dnr_concession,raw_data,created_at,drivers(id,trid,full_name,site)")
      .eq("organization_id", organizationId)
      .order("feedback_date", { ascending: false })
      .limit(2000),
    supabase.rpc("list_coaching_assignees", { p_organization_id: organizationId }),
  ]);

  if (incidents.error) throw incidents.error;
  if (feedback.error) throw feedback.error;
  if (assignees.error) throw assignees.error;

  return {
    incidents: incidents.data || [],
    feedback: feedback.data || [],
    assignees: assignees.data || [],
  };
}

export async function createOperationalIncident(supabase, payload) {
  const { data, error } = await supabase.rpc("create_operational_incident", {
    p_organization_id: payload.organizationId,
    p_driver_id: payload.driverId || null,
    p_site: payload.site || null,
    p_week_label: payload.weekLabel || null,
    p_tracking_id: payload.trackingId || null,
    p_incident_type: payload.incidentType || "other",
    p_severity: payload.severity || "medium",
    p_title: payload.title,
    p_description: payload.description || null,
    p_source_type: payload.sourceType || "manual",
    p_source_id: payload.sourceId || null,
    p_occurred_at: payload.occurredAt || null,
    p_metadata: payload.metadata || {},
  });
  if (error) throw error;
  return data;
}

export async function updateOperationalIncident(supabase, incidentId, patch) {
  const { error } = await supabase.rpc("update_operational_incident", {
    p_incident_id: incidentId,
    p_status: patch.status || null,
    p_severity: patch.severity || null,
    p_assigned_to: patch.assignedTo || null,
    p_due_at: patch.dueAt || null,
    p_root_cause: patch.rootCause || null,
    p_outcome: patch.outcome || null,
    p_description: patch.description || null,
  });
  if (error) throw error;
}

export async function addIncidentNote(supabase, incidentId, note) {
  const { error } = await supabase.rpc("add_incident_note", {
    p_incident_id: incidentId,
    p_note: note,
  });
  if (error) throw error;
}

export async function fetchIncidentNotes(supabase, incidentId) {
  const { data, error } = await supabase.rpc("list_incident_notes", {
    p_incident_id: incidentId,
  });
  if (error) throw error;
  return data || [];
}

export async function promoteFeedbackToIncident(supabase, organizationId, feedbackId) {
  const { data, error } = await supabase.rpc("create_incident_from_feedback", {
    p_organization_id: organizationId,
    p_feedback_id: feedbackId,
  });
  if (error) throw error;
  return data;
}

function newestPerDriver(rows = []) {
  const map = new Map();
  for (const row of rows) {
    const current = map.get(row.driver_id);
    const order = String(row.period_end || row.period_start || "");
    const currentOrder = String(current?.period_end || current?.period_start || "");
    if (!current || order > currentOrder) map.set(row.driver_id, row);
  }
  return [...map.values()];
}

export async function fetchSiteOperationsData(supabase, organizationId, site) {
  const [
    cardsResult,
    metricsResult,
    overrides,
    incidentsResult,
    coachingResult,
    tasksResult,
    unmatchedResult,
    importsResult,
  ] = await Promise.all([
    supabase
      .from("site_scorecards")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("site", site)
      .order("year", { ascending: false })
      .order("week", { ascending: false })
      .limit(20),
    supabase
      .from("driver_metrics")
      .select("*,drivers(id,trid,full_name,site,status)")
      .eq("organization_id", organizationId)
      .eq("drivers.site", site)
      .order("period_end", { ascending: false })
      .limit(5000),
    fetchMetricOverrides(supabase, organizationId, "active"),
    supabase.rpc("list_operational_incidents", {
      p_organization_id: organizationId,
      p_status: null,
      p_limit: 1000,
    }),
    supabase
      .from("coaching_cases")
      .select("*,drivers(id,trid,full_name,site)")
      .eq("organization_id", organizationId)
      .eq("drivers.site", site)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.rpc("list_manager_tasks", {
      p_organization_id: organizationId,
      p_status: null,
      p_limit: 1000,
    }),
    supabase
      .from("unmatched_driver_records")
      .select("id,site,status")
      .eq("organization_id", organizationId)
      .eq("site", site)
      .eq("status", "open"),
    supabase
      .from("imports")
      .select("id,file_name,status,error_message,detected_report_type,period_start,period_end,created_at,metadata")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  for (const result of [cardsResult, metricsResult, incidentsResult, coachingResult, tasksResult, unmatchedResult, importsResult]) {
    if (result.error) throw result.error;
  }

  const siteIncidents = (incidentsResult.data || []).filter((item) => String(item.site || "").toUpperCase() === String(site).toUpperCase());
  const siteTasks = (tasksResult.data || []).filter((item) => !item.site || String(item.site).toUpperCase() === String(site).toUpperCase());
  const appliedRows = applyMetricOverrides(
    metricsResult.data || [],
    (overrides || []).filter((item) => (metricsResult.data || []).some((row) => row.driver_id === item.driver_id))
  );
  const latestRows = newestPerDriver(appliedRows);

  return {
    cards: cardsResult.data || [],
    metricRows: appliedRows,
    latestRows,
    rootCauses: aggregateRootCauses(latestRows),
    incidents: siteIncidents,
    coaching: coachingResult.data || [],
    tasks: siteTasks,
    unmatched: unmatchedResult.data || [],
    imports: importsResult.data || [],
  };
}

export function driverOperationalSnapshot(row = {}) {
  const rootCause = rootCauseForRow(row);
  return {
    rootCause,
    score: rootCause.score,
    tier: rootCause.tier,
    lostPoints: rootCause.pointsLost,
    primaryCause: rootCause.primary?.label || null,
  };
}
