export async function fetchIntegrationHealth(supabase, organizationId) {
  if (!organizationId) return [];
  const { data, error } = await supabase.rpc("list_integration_health", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
  return data || [];
}

export async function updateIntegrationConfig(supabase, organizationId, sourceKey, patch = {}) {
  const { error } = await supabase.rpc("update_integration_config", {
    p_organization_id: organizationId,
    p_source_key: sourceKey,
    p_enabled: patch.enabled ?? null,
    p_expected_frequency_hours: patch.expectedFrequencyHours ?? null,
    p_criticality: patch.criticality ?? null,
  });
  if (error) throw error;
}

export async function fetchReliabilitySnapshot(supabase, organizationId) {
  const { data, error } = await supabase.rpc("get_reliability_snapshot", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
  return data || {};
}

export async function saveReliabilityCheck(supabase, organizationId, overallStatus, snapshot) {
  const { data, error } = await supabase.rpc("save_reliability_check", {
    p_organization_id: organizationId,
    p_overall_status: overallStatus,
    p_snapshot: snapshot || {},
  });
  if (error) throw error;
  return data;
}

export async function fetchReliabilityChecks(supabase, organizationId, limit = 50) {
  const { data, error } = await supabase.rpc("list_reliability_checks", {
    p_organization_id: organizationId,
    p_limit: limit,
  });
  if (error) throw error;
  return data || [];
}

export async function fetchPlatformV6Data(supabase, organizationId) {
  const [integrations, reliability, checks] = await Promise.all([
    fetchIntegrationHealth(supabase, organizationId),
    fetchReliabilitySnapshot(supabase, organizationId),
    fetchReliabilityChecks(supabase, organizationId, 30),
  ]);
  return { integrations, reliability, checks };
}

export async function fetchMobileManagerData(supabase, organizationId) {
  const [tasks, notifications, integrations] = await Promise.all([
    supabase.rpc("list_manager_tasks", {
      p_organization_id: organizationId,
      p_status: null,
      p_limit: 200,
    }),
    supabase.rpc("list_notification_events", {
      p_organization_id: organizationId,
      p_status: null,
      p_limit: 100,
    }),
    fetchIntegrationHealth(supabase, organizationId),
  ]);

  if (tasks.error) throw tasks.error;
  if (notifications.error) throw notifications.error;

  return {
    tasks: tasks.data || [],
    notifications: notifications.data || [],
    integrations,
  };
}

export async function fetchApiHealth() {
  const response = await fetch("/api/health", {
    method: "GET",
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error("Application health endpoint returned " + response.status);
  }
  return response.json();
}
