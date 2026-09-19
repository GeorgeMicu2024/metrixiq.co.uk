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

export async function createTeamInvite(supabase, { organizationId, email, role, siteScope }) {
  const { data, error } = await supabase.rpc("create_team_invite", {
    p_organization_id: organizationId,
    p_email: email,
    p_role: role,
    p_site_scope: siteScope,
  });

  if (error) throw error;
  return Array.isArray(data) ? data[0] || null : data || null;
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


export async function getInviteSignupContext(supabase, { token, email }) {
  const { data, error } = await supabase.rpc("get_team_invite_signup_context", { p_token: token, p_email: email });
  if (error) throw error;
  return Array.isArray(data) ? data[0] || null : data || null;
}

export async function redeemPendingInvites(supabase) {
  const { data, error } = await supabase.rpc("redeem_my_pending_invites");
  if (error) throw error;
  return Number(data || 0);
}
