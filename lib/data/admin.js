export async function fetchAdminAccounts(supabase) {
  const { data, error } = await supabase.rpc("admin_list_accounts");
  if (error) throw error;
  return data || [];
}

export async function setAdminWorkspacePlan(
  supabase,
  { organizationId, plan, status }
) {
  const { error } = await supabase.rpc("admin_set_workspace_plan", {
    p_organization_id: organizationId,
    p_plan: plan,
    p_status: status,
  });

  if (error) throw error;
}

export async function setAdminWorkspaceSuspension(
  supabase,
  { organizationId, suspended, reason }
) {
  const { error } = await supabase.rpc("admin_set_workspace_suspension", {
    p_organization_id: organizationId,
    p_suspended: suspended,
    p_reason: reason,
  });

  if (error) throw error;
}


export async function fetchAdminPendingInvites(supabase) {
  const { data, error } = await supabase.rpc("admin_list_pending_invites");
  if (error) throw error;
  return data || [];
}
