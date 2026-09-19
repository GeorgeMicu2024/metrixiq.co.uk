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

async function authorizedJson(supabase, url, options = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("Authentication required.");
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Administrative action failed.");
  return payload;
}

export function resetAdminUserAccess(supabase, userId) {
  return authorizedJson(supabase, "/api/admin/users/reset-access", { method: "POST", body: JSON.stringify({ userId }) });
}

export function deleteAdminUser(supabase, userId) {
  return authorizedJson(supabase, "/api/admin/users/delete", { method: "DELETE", body: JSON.stringify({ userId }) });
}
