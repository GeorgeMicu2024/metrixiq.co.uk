export async function fetchTeamWorkspace(supabase, organizationId) {
  const [{ data: userData, error: userError }, membersResult, invitesResult] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc("list_team_members", { p_organization_id: organizationId }),
    supabase.rpc("list_team_invites", { p_organization_id: organizationId }),
  ]);

  if (userError) throw userError;
  if (membersResult.error) throw membersResult.error;
  if (invitesResult.error) throw invitesResult.error;

  return {
    currentUserId: userData?.user?.id || "",
    members: (membersResult.data || []).map((member) => ({
      ...member,
      edit_role: member.role,
      edit_sites: (member.site_scope || []).join(", "),
    })),
    invites: invitesResult.data || [],
  };
}

async function teamAuthHeaders(supabase) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data?.session?.access_token;
  if (!token) throw new Error("Authentication required.");
  return {
    authorization: "Bearer " + token,
    "content-type": "application/json",
  };
}

export async function createTeamInvite(supabase, { organizationId, email, role, siteScope }) {
  const response = await fetch("/api/team/invite", {
    method: "POST",
    headers: await teamAuthHeaders(supabase),
    body: JSON.stringify({
      organizationId,
      email,
      role,
      siteScope,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.delivery_error || payload?.error || payload?.message || "Could not create the invite.");
    error.deliveryPending = payload?.status === "pending";
    throw error;
  }
  return payload;
}

export async function updateTeamMember(supabase, { organizationId, userId, role, siteScope }) {
  const { error } = await supabase.rpc("update_team_member", {
    p_organization_id: organizationId,
    p_user_id: userId,
    p_role: role,
    p_site_scope: siteScope,
  });

  if (error) throw error;
}

export async function removeTeamMember(supabase, { organizationId, userId }) {
  const { error } = await supabase.rpc("remove_team_member", {
    p_organization_id: organizationId,
    p_user_id: userId,
  });

  if (error) throw error;
}

export async function cancelTeamInvite(supabase, { organizationId, token }) {
  const { error } = await supabase.rpc("cancel_team_invite", {
    p_organization_id: organizationId,
    p_token: token,
  });

  if (error) throw error;
}

export async function transferWorkspaceOwnership(supabase, { organizationId, userId }) {
  const { error } = await supabase.rpc("transfer_workspace_ownership", { p_organization_id: organizationId, p_new_owner_id: userId });
  if (error) throw error;
}
export async function setMemberPermissionOverrides(supabase, { organizationId, userId, permissions }) {
  const { error } = await supabase.rpc("set_member_permission_overrides", { p_organization_id: organizationId, p_user_id: userId, p_permissions: permissions });
  if (error) throw error;
}
export async function fetchMemberPermissionOverrides(supabase, organizationId) {
  const { data, error } = await supabase.rpc("list_member_permission_overrides", { p_organization_id: organizationId });
  if (error) throw error;
  return data || [];
}
export async function fetchWorkspaceAuditEvents(supabase, organizationId, limit = 30) {
  const { data, error } = await supabase.rpc("list_workspace_audit_events", { p_organization_id: organizationId, p_limit: limit });
  if (error) throw error;
  return data || [];
}
