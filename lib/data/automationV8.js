import { buildOutcomeMonitor } from "../intelligence/decisionEngine.js";
export async function fetchAutomationRules(supabase, organizationId) {
  const { data, error } = await supabase.rpc("list_automation_rules", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
  return data || [];
}

export async function saveAutomationRule(supabase, payload) {
  const { data, error } = await supabase.rpc("upsert_automation_rule", {
    p_organization_id: payload.organizationId,
    p_rule_id: payload.id || null,
    p_name: payload.name,
    p_description: payload.description || null,
    p_enabled: payload.enabled ?? false,
    p_site: payload.site || null,
    p_trigger_type: payload.triggerType,
    p_condition_config: payload.conditionConfig || {},
    p_action_type: payload.actionType,
    p_action_config: payload.actionConfig || {},
    p_schedule_mode: payload.scheduleMode || "event",
    p_schedule_day: payload.scheduleDay ?? null,
    p_schedule_hour: payload.scheduleHour ?? null,
  });
  if (error) throw error;
  return data;
}

export async function setAutomationRuleEnabled(supabase, ruleId, enabled) {
  const { error } = await supabase.rpc("set_automation_rule_enabled", {
    p_rule_id: ruleId,
    p_enabled: enabled,
  });
  if (error) throw error;
}

export async function runAutomationRule(supabase, ruleId, force = true) {
  const { data, error } = await supabase.rpc("run_automation_rule", {
    p_rule_id: ruleId,
    p_force: force,
  });
  if (error) throw error;
  return data;
}

export async function runAutomationEngine(supabase, organizationId, force = false, source = "manual") {
  const { data, error } = await supabase.rpc("run_automation_engine", {
    p_organization_id: organizationId,
    p_force: force,
    p_source: source,
  });
  if (error) throw error;
  return data?.[0] || { rules_run: 0, matched_count: 0, action_count: 0, failed_count: 0 };
}

export async function fetchAutomationRuns(supabase, organizationId, limit = 200) {
  const { data, error } = await supabase.rpc("list_automation_runs", {
    p_organization_id: organizationId,
    p_limit: limit,
  });
  if (error) throw error;
  return data || [];
}

export async function fetchWorkflowPlaybooks(supabase, organizationId) {
  const { data, error } = await supabase.rpc("list_workflow_playbooks", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
  return data || [];
}

export async function startPlaybookWorkflow(supabase, payload) {
  const { data, error } = await supabase.rpc("start_playbook_workflow", {
    p_organization_id: payload.organizationId,
    p_playbook_key: payload.playbookKey,
    p_driver_id: payload.driverId || null,
    p_site: payload.site || null,
    p_week_label: payload.weekLabel || null,
    p_title: payload.title || null,
    p_source_type: payload.sourceType || "manual",
    p_source_id: payload.sourceId || null,
    p_dedupe_key: payload.dedupeKey || null,
    p_assigned_to: payload.assignedTo || null,
    p_metadata: payload.metadata || {},
  });
  if (error) throw error;
  return data;
}

export async function fetchWorkflowInstances(supabase, organizationId, status = null, limit = 500) {
  const { data, error } = await supabase.rpc("list_workflow_instances", {
    p_organization_id: organizationId,
    p_status: status,
    p_limit: limit,
  });
  if (error) throw error;
  return data || [];
}

export async function completeWorkflowStep(supabase, stepId, notes = "") {
  const { error } = await supabase.rpc("complete_workflow_step", {
    p_step_id: stepId,
    p_notes: notes || null,
  });
  if (error) throw error;
}

export async function fetchApprovalRequests(supabase, organizationId, status = null, limit = 500) {
  const { data, error } = await supabase.rpc("list_approval_requests", {
    p_organization_id: organizationId,
    p_status: status,
    p_limit: limit,
  });
  if (error) throw error;
  return data || [];
}

export async function decideApprovalRequest(supabase, approvalId, decision, note = "") {
  const { error } = await supabase.rpc("decide_approval_request", {
    p_approval_id: approvalId,
    p_decision: decision,
    p_note: note || null,
  });
  if (error) throw error;
}

export async function fetchSlaPolicies(supabase, organizationId) {
  const { data, error } = await supabase.rpc("list_workflow_sla_policies", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
  return data || [];
}

export async function saveSlaPolicy(supabase, payload) {
  const { data, error } = await supabase.rpc("upsert_workflow_sla_policy", {
    p_organization_id: payload.organizationId,
    p_site: payload.site || null,
    p_entity_type: payload.entityType,
    p_priority: payload.priority || "any",
    p_acknowledgement_hours: Number(payload.acknowledgementHours),
    p_resolution_hours: Number(payload.resolutionHours),
    p_escalation_hours: Number(payload.escalationHours),
    p_enabled: payload.enabled ?? true,
  });
  if (error) throw error;
  return data;
}

export async function fetchNotificationRoutes(supabase, organizationId) {
  const { data, error } = await supabase.rpc("list_notification_routes", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
  return data || [];
}

export async function saveNotificationRoute(supabase, payload) {
  const { data, error } = await supabase.rpc("upsert_notification_route", {
    p_organization_id: payload.organizationId,
    p_category: payload.category,
    p_minimum_severity: payload.minimumSeverity,
    p_channel: payload.channel,
    p_recipient_role: payload.recipientRole,
    p_enabled: payload.enabled ?? true,
  });
  if (error) throw error;
  return data;
}

export async function fetchDeliveryQueue(supabase, organizationId, limit = 250) {
  const { data, error } = await supabase
    .from("workflow_delivery_queue")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function fetchActionCenterV2(supabase, organizationId, site = null, limit = 1000) {
  const { data, error } = await supabase.rpc("list_action_center_v2", {
    p_organization_id: organizationId,
    p_site: site && site !== "all" ? site : null,
    p_limit: limit,
  });
  if (error) throw error;
  return data || [];
}

export async function claimActionCenterItem(supabase, entityType, entityId) {
  const { error } = await supabase.rpc("claim_action_center_item", {
    p_entity_type: entityType,
    p_entity_id: entityId,
  });
  if (error) throw error;
}

export async function requestActionCloseApproval(supabase, entityType, entityId, note = "") {
  const { data, error } = await supabase.rpc("request_action_close_approval", {
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_note: note || null,
  });
  if (error) throw error;
  return data;
}

export async function refreshSlaEscalations(supabase, organizationId) {
  const { data, error } = await supabase.rpc("refresh_sla_escalations", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
  return Number(data || 0);
}

export async function fetchAutomationWorkspaceData(supabase, organizationId) {
  const [rules, runs, playbooks, workflows, approvals, slaPolicies, routes, deliveryQueue] = await Promise.all([
    fetchAutomationRules(supabase, organizationId),
    fetchAutomationRuns(supabase, organizationId, 200),
    fetchWorkflowPlaybooks(supabase, organizationId),
    fetchWorkflowInstances(supabase, organizationId, null, 500),
    fetchApprovalRequests(supabase, organizationId, null, 500),
    fetchSlaPolicies(supabase, organizationId),
    fetchNotificationRoutes(supabase, organizationId),
    fetchDeliveryQueue(supabase, organizationId, 250),
  ]);

  return { rules, runs, playbooks, workflows, approvals, slaPolicies, routes, deliveryQueue };
}

export async function createAiInterventionTask(supabase,payload){
  const {data,error}=await supabase.rpc("create_ai_intervention_task",{
    p_organization_id:payload.organizationId,p_driver_id:payload.driverId||null,p_site:payload.site||null,
    p_signal_key:payload.signalKey,p_title:payload.title,p_detail:payload.detail||null,p_priority:payload.priority||"medium",
    p_due_hours:payload.dueHours||24,p_metadata:payload.metadata||{},
  });
  if(error)throw error; return data;
}

export async function autoReassessAiInterventions(supabase,{organizationId,history=[]}={}){
  if(!organizationId)return {evaluated:0,followUps:0,outcomes:[]};
  const tasks=await fetchActionCenterV2(supabase,organizationId,null,1500);
  const openAi=tasks.filter(x=>(x.source==="ai_intervention"||x.source_type==="ai_intervention"||x.metadata?.ai_generated)&&!["done","closed","dismissed"].includes(x.status));
  const monitor=buildOutcomeMonitor(openAi,history);
  let followUps=0;
  for(const outcome of monitor.outcomes){
    if(!["close","escalate"].includes(outcome.recommendation))continue;
    const close=outcome.recommendation==="close";
    await createAiInterventionTask(supabase,{
      organizationId,driverId:outcome.driver_id||null,site:outcome.site||null,
      signalKey:`outcome_${close?"closure_review":"escalation"}_${outcome.entity_id||outcome.id||outcome.driver_id}`,
      title:close?`AI outcome · review closure · ${outcome.driver_name||"Driver"}`:`AI outcome · escalation review · ${outcome.driver_name||"Driver"}`,
      detail:`${outcome.reason} Recommended decision: ${close?"Close after manager review":"Escalate after manager review"}.`,
      priority:close?"medium":"high",dueHours:close?24:8,
      metadata:{ai_outcome:true,parent_intervention_id:outcome.entity_id||outcome.id||null,outcome:outcome.outcome,recommendation:outcome.recommendation,delta:outcome.delta,confidence:outcome.confidence,human_approval_required:true}
    });
    followUps++;
  }
  return {evaluated:monitor.outcomes.length,followUps,outcomes:monitor.outcomes};
}

export async function autoReassessAiInterventions(supabase,organizationId){
  const {data,error}=await supabase.rpc("auto_reassess_ai_interventions",{p_organization_id:organizationId});
  if(error)throw error;
  return data?.[0]||{evaluated_count:0,followup_count:0,escalation_count:0,approval_count:0};
}
