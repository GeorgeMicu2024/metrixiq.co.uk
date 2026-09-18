import { fetchAllDriverMetricRows } from "./driverMetrics";

export async function resolveWorkspace(supabase, user) {
  const { data: membership, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id, role, organizations(id,name,plan)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (membershipError) throw membershipError;

  if (membership?.organizations) {
    return {
      organization: membership.organizations,
      role: membership.role || "manager",
    };
  }

  const name =
    user.user_metadata?.organization_name?.trim() ||
    `${user.user_metadata?.full_name || user.email?.split("@")[0] || "My"} Fleet`;

  const { data: organization, error: createError } = await supabase
    .from("organizations")
    .insert({ name, created_by: user.id })
    .select("id,name,plan")
    .single();

  if (createError) throw createError;

  const { data: createdMembership, error: createdMembershipError } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organization.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (createdMembershipError) throw createdMembershipError;

  if (!createdMembership) {
    throw new Error("Workspace membership was not created. Please sign out and try again.");
  }

  return {
    organization,
    role: createdMembership.role || "manager",
  };
}

export async function refreshWorkspacePerformance(supabase, organizationId) {
  const [{ data: scorecards, error: scorecardError }, metricRows] = await Promise.all([
    supabase
      .from("driver_scorecards")
      .select("*")
      .eq("organization_id", organizationId)
      .order("full_name"),
    fetchAllDriverMetricRows(supabase, organizationId),
  ]);

  if (scorecardError) throw scorecardError;

  return {
    scorecards: scorecards || [],
    metricRows: metricRows || [],
  };
}

export async function loadWorkspaceContext(supabase, user) {
  await supabase.rpc("redeem_my_pending_invites");

  const [{ data: profile }, resolved] = await Promise.all([
    supabase.from("profiles").select("full_name,email").eq("id", user.id).maybeSingle(),
    resolveWorkspace(supabase, user),
  ]);

  const [{ data: adminFlag, error: adminFlagError }, { data: accessRows, error: accessError }] =
    await Promise.all([
      supabase.rpc("is_platform_admin"),
      supabase.rpc("get_workspace_access", { p_organization_id: resolved.organization.id }),
    ]);

  if (adminFlagError) throw adminFlagError;
  if (accessError) throw accessError;

  await supabase.rpc("touch_last_login");

  const performance = await refreshWorkspacePerformance(supabase, resolved.organization.id);
  const access = Array.isArray(accessRows) ? accessRows[0] || null : accessRows;

  return {
    resolved,
    profile,
    platformAdmin: Boolean(adminFlag),
    access,
    ...performance,
  };
}
