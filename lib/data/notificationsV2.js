export async function refreshNotificationsV2(supabase, organizationId) {
  const { error } = await supabase.rpc("refresh_notification_events", {
    p_organization_id: organizationId,
  });
  if (error) throw error;

  const { error: cleanupError } = await supabase.rpc("cleanup_stale_notification_events", {
    p_organization_id: organizationId,
  });
  if (cleanupError) throw cleanupError;
}

export async function syncPersonalChatNotifications(supabase, organizationId) {
  if (!organizationId) return;
  const { error } = await supabase.rpc("sync_personal_chat_notifications", { p_organization_id: organizationId });
  if (error) throw error;
}

export async function fetchNotificationsV2(supabase, organizationId, limit = 100, status = null) {
  if (!organizationId) return [];
  await syncPersonalChatNotifications(supabase, organizationId);
  const { data, error } = await supabase.rpc("list_notification_events", {
    p_organization_id: organizationId,
    p_status: status,
    p_limit: limit,
  });
  if (error) throw error;
  return data || [];
}

export async function setNotificationStatus(supabase, notificationId, status) {
  const { error } = await supabase.rpc("update_notification_status", {
    p_notification_id: notificationId,
    p_status: status,
  });
  if (error) throw error;
}

export async function markAllNotificationsRead(supabase, organizationId) {
  const { error } = await supabase.rpc("mark_all_notifications_read", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
}
