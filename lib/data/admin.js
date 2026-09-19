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


async function adminAuthHeaders(supabase) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data?.session?.access_token;
  if (!token) throw new Error("Authentication required.");
  return {
    authorization: "Bearer " + token,
    "content-type": "application/json",
  };
}

export async function deleteAdminAccount(supabase, userId) {
  const response = await fetch("/api/admin/accounts/delete", {
    method: "POST",
    headers: await adminAuthHeaders(supabase),
    body: JSON.stringify({ userId, confirmation: "DELETE" }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || "Could not delete the account.");
  return payload;
}
