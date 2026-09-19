export async function fetchNotifications(supabase, organizationId, limit = 30) {
  if (!organizationId) return [];

  const { data, error } = await supabase.rpc("list_performance_alerts", {
    p_organization_id: organizationId,
    p_status: null,
    p_limit: limit,
  });

  if (error) throw error;
  return (data || []).filter((item) => item.status !== "resolved");
}

export async function acknowledgeNotification(supabase, alertId) {
  const { error } = await supabase.rpc("acknowledge_performance_alert", {
    p_alert_id: alertId,
  });

  if (error) throw error;
}
