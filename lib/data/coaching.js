export async function fetchCoachingOverview(supabase, organizationId) {
  const [alertsResult, casesResult] = await Promise.all([
    supabase.rpc("list_performance_alerts", {
      p_organization_id: organizationId,
      p_status: null,
      p_limit: 500,
    }),
    supabase.rpc("list_coaching_cases", {
      p_organization_id: organizationId,
      p_status: null,
      p_limit: 500,
    }),
  ]);

  if (alertsResult.error) throw alertsResult.error;
  if (casesResult.error) throw casesResult.error;

  return {
    alerts: alertsResult.data || [],
    cases: casesResult.data || [],
  };
}

export async function fetchCoachingCaseNotes(supabase, caseId) {
  const { data, error } = await supabase.rpc("list_coaching_case_notes", {
    p_case_id: caseId,
  });
  if (error) throw error;
  return data || [];
}

export async function acknowledgePerformanceAlert(supabase, alertId) {
  const { error } = await supabase.rpc("acknowledge_performance_alert", {
    p_alert_id: alertId,
  });
  if (error) throw error;
}

export async function resolvePerformanceAlert(supabase, alertId) {
  const { error } = await supabase.rpc("resolve_performance_alert", {
    p_alert_id: alertId,
  });
  if (error) throw error;
}

export async function openCoachingCaseFromAlert(supabase, alertId) {
  const { data, error } = await supabase.rpc("open_coaching_case_from_alert", {
    p_alert_id: alertId,
  });
  if (error) throw error;
  return data || "";
}

export async function refreshPerformanceAlerts(supabase, organizationId) {
  const { error } = await supabase.rpc("refresh_performance_alerts", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
}

export async function updateCoachingCase(supabase, coachingCase, status, outcome) {
  const { error } = await supabase.rpc("update_coaching_case", {
    p_case_id: coachingCase.id,
    p_status: status || null,
    p_priority: coachingCase.priority || null,
    p_assigned_to: coachingCase.assigned_to || null,
    p_due_at: coachingCase.due_at || null,
    p_follow_up_at: coachingCase.follow_up_at || null,
    p_outcome: outcome.trim() || null,
  });
  if (error) throw error;
}

export async function addCoachingCaseNote(supabase, caseId, note) {
  const { error } = await supabase.rpc("add_coaching_case_note", {
    p_case_id: caseId,
    p_note: note.trim(),
    p_note_type: "note",
  });
  if (error) throw error;
}
