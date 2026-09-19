import {
  addCoachingCaseNote,
  fetchCoachingCaseNotes,
  fetchCoachingOverview,
  refreshPerformanceAlerts,
  updateCoachingCase,
} from "./coaching.js";

export { addCoachingCaseNote, fetchCoachingCaseNotes, updateCoachingCase };

export async function fetchCoachingV3(supabase, organizationId) {
  await refreshPerformanceAlerts(supabase, organizationId);
  const [overview, assignees] = await Promise.all([
    fetchCoachingOverview(supabase, organizationId),
    supabase.rpc("list_coaching_assignees", { p_organization_id: organizationId }),
  ]);
  if (assignees.error) throw assignees.error;
  return {
    ...overview,
    assignees: assignees.data || [],
  };
}

export async function openCoachingCaseDirect(supabase, payload) {
  const { data, error } = await supabase.rpc("open_coaching_case_direct", {
    p_organization_id: payload.organizationId,
    p_driver_id: payload.driverId,
    p_title: payload.title,
    p_reason: payload.reason || null,
    p_metric: payload.metric || null,
    p_priority: payload.priority || "medium",
    p_period_label: payload.periodLabel || null,
    p_signal_key: payload.signalKey || null,
    p_template_id: payload.templateId || null,
    p_metadata: payload.metadata || {},
  });
  if (error) throw error;
  return data || "";
}

export async function updateCoachingCaseV3(supabase, coachingCase, patch) {
  const { error } = await supabase.rpc("update_coaching_case", {
    p_case_id: coachingCase.id,
    p_status: patch.status || null,
    p_priority: patch.priority || coachingCase.priority || null,
    p_assigned_to: patch.assignedTo || coachingCase.assigned_to || null,
    p_due_at: patch.dueAt || coachingCase.due_at || null,
    p_follow_up_at: patch.followUpAt || coachingCase.follow_up_at || null,
    p_outcome: patch.outcome?.trim() || null,
  });
  if (error) throw error;
}

export async function evaluateCoachingImprovement(supabase, caseId) {
  const { data, error } = await supabase.rpc("evaluate_coaching_case_improvement", {
    p_case_id: caseId,
  });
  if (error) throw error;
  return data || {};
}

export async function addTemplateChecklistNote(supabase, caseId, template) {
  const checklist = (template?.checklist || []).map((item, index) => `${index + 1}. ${item}`).join("\n");
  if (!checklist) return;
  const { error } = await supabase.rpc("add_coaching_case_note", {
    p_case_id: caseId,
    p_note: `${template.label} coaching checklist\n${checklist}`,
    p_note_type: "template",
  });
  if (error) throw error;
}
