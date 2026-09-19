import { getSupabaseAdmin } from "../billing/stripeServer";

export async function inspectDeletableAccount(userId) {
  const admin = getSupabaseAdmin();

  const [{ data: userData, error: userError }, { data: memberships, error: membershipError }, { data: ownedOrgs, error: orgError }, { data: platformAdminRow, error: platformError }] = await Promise.all([
    admin.auth.admin.getUserById(userId),
    admin.from("organization_members").select("organization_id,role,organizations(id,name,created_by,stripe_subscription_id)").eq("user_id", userId),
    admin.from("organizations").select("id,name,created_by,stripe_subscription_id").eq("created_by", userId),
    admin.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle(),
  ]);

  if (userError) throw userError;
  if (membershipError) throw membershipError;
  if (orgError) throw orgError;
  if (platformError) throw platformError;

  const user = userData?.user || null;
  if (!user) {
    const error = new Error("Account not found.");
    error.statusCode = 404;
    throw error;
  }

  let platformAdminCount = 0;
  if (platformAdminRow) {
    const { count, error } = await admin.from("platform_admins").select("user_id", { count: "exact", head: true });
    if (error) throw error;
    platformAdminCount = count || 0;
  }

  const owned = [];
  for (const org of ownedOrgs || []) {
    const [
      { count: memberCount, error: memberCountError },
      { count: driverCount, error: driverCountError },
      { count: importCount, error: importCountError },
      { count: metricCount, error: metricCountError },
      { count: reportCount, error: reportCountError },
      { count: coachingCount, error: coachingCountError },
      { count: incidentCount, error: incidentCountError },
    ] = await Promise.all([
      admin.from("organization_members").select("user_id", { count: "exact", head: true }).eq("organization_id", org.id),
      admin.from("drivers").select("id", { count: "exact", head: true }).eq("organization_id", org.id),
      admin.from("imports").select("id", { count: "exact", head: true }).eq("organization_id", org.id),
      admin.from("driver_metrics").select("id", { count: "exact", head: true }).eq("organization_id", org.id),
      admin.from("report_snapshots").select("id", { count: "exact", head: true }).eq("organization_id", org.id),
      admin.from("coaching_cases").select("id", { count: "exact", head: true }).eq("organization_id", org.id),
      admin.from("operational_incidents").select("id", { count: "exact", head: true }).eq("organization_id", org.id),
    ]);
    for (const err of [memberCountError,driverCountError,importCountError,metricCountError,reportCountError,coachingCountError,incidentCountError]) {
      if (err) throw err;
    }
    owned.push({
      ...org,
      member_count: memberCount || 0,
      data_count: Number(driverCount || 0)+Number(importCount || 0)+Number(metricCount || 0)+Number(reportCount || 0)+Number(coachingCount || 0)+Number(incidentCount || 0),
    });
  }

  const blockers = [];
  if (platformAdminRow && platformAdminCount <= 1) blockers.push("The last Platform Admin account cannot be deleted.");
  for (const org of owned) {
    if ((org.member_count || 0) > 1) blockers.push(`Transfer ownership of ${org.name} before deleting this account.`);
    if ((org.data_count || 0) > 0) blockers.push(`Delete or transfer the operational data in ${org.name} before deleting this account.`);
    if (org.stripe_subscription_id) blockers.push(`Cancel the active subscription for ${org.name} before deleting this account.`);
  }

  return {
    admin,
    user,
    memberships: memberships || [],
    ownedOrganizations: owned,
    isPlatformAdmin: Boolean(platformAdminRow),
    blockers,
  };
}

export async function deleteMetrixAccount(userId) {
  const inspection = await inspectDeletableAccount(userId);
  if (inspection.blockers.length) {
    const error = new Error(inspection.blockers.join(" "));
    error.statusCode = 409;
    throw error;
  }

  const { admin, user, ownedOrganizations } = inspection;

  for (const org of ownedOrganizations) {
    const { error } = await admin.from("organizations").delete().eq("id", org.id);
    if (error) throw error;
  }

  await admin.from("workspace_invites").delete().eq("invited_by", userId);
  if (user.email) await admin.from("workspace_invites").delete().ilike("email", user.email);
  await admin.from("organization_members").delete().eq("user_id", userId);

  if (inspection.isPlatformAdmin) {
    const { error } = await admin.from("platform_admins").delete().eq("user_id", userId);
    if (error) throw error;
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) throw deleteError;

  return {
    deleted_user_id: userId,
    deleted_email: user.email || null,
    deleted_owned_workspaces: ownedOrganizations.map((org) => ({ id: org.id, name: org.name })),
  };
}
