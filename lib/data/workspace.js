import { fetchAllDriverMetricRows } from "./driverMetrics";
import { fetchWorkspaceAccess } from "./billing";
import { fetchCommandCenterSummary } from "./commandCenter";

function workspaceOption(membership) {
  return {
    organization_id: membership.organization_id,
    organization_name: membership.organizations?.name || "Workspace",
    plan: membership.organizations?.plan || "free",
    role: membership.role || "viewer",
    site_scope: membership.site_scope || [],
  };
}

export async function resolveWorkspace(supabase, user, preferredOrganizationId = null) {
  const { data: memberships, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id, role, site_scope, created_at, organizations(id,name,plan)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (membershipError) throw membershipError;

  if (memberships?.length) {
    const selected =
      memberships.find((item) => item.organization_id === preferredOrganizationId) ||
      memberships[0];

    return {
      organization: selected.organizations,
      role: selected.role || "manager",
      siteScope: selected.site_scope || [],
      workspaces: memberships.map(workspaceOption),
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
    .select("organization_id,role,site_scope")
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
    siteScope: createdMembership.site_scope || [],
    workspaces: [
      {
        organization_id: organization.id,
        organization_name: organization.name,
        plan: organization.plan,
        role: createdMembership.role || "manager",
        site_scope: createdMembership.site_scope || [],
      },
    ],
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

export async function loadWorkspaceContext(supabase, user, preferredOrganizationId = null) {
  await supabase.rpc("redeem_my_pending_invites");

  const [{ data: profile }, resolved] = await Promise.all([
    supabase.from("profiles").select("full_name,email").eq("id", user.id).maybeSingle(),
    resolveWorkspace(supabase, user, preferredOrganizationId),
  ]);

  const [
    { data: adminFlag, error: adminFlagError },
    access,
    brandingResult,
  ] = await Promise.all([
    supabase.rpc("is_platform_admin"),
    fetchWorkspaceAccess(supabase, resolved.organization.id),
    supabase.rpc("get_organization_branding", {
      p_organization_id: resolved.organization.id,
    }),
  ]);

  if (adminFlagError) throw adminFlagError;
  if (brandingResult.error) throw brandingResult.error;

  await supabase.rpc("touch_last_login");

  const [performance, commandCenter] = await Promise.all([
    refreshWorkspacePerformance(supabase, resolved.organization.id),
    fetchCommandCenterSummary(supabase, resolved.organization.id),
  ]);

  return {
    resolved,
    profile,
    platformAdmin: Boolean(adminFlag),
    access,
    branding: brandingResult.data || null,
    commandCenter,
    ...performance,
  };
}
