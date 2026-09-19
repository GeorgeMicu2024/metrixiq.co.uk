import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "../../../../lib/billing/stripeServer";

export const runtime = "nodejs";

function publicVerifier(request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase public credentials are not configured.");

  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) {
    const error = new Error("Authentication required.");
    error.statusCode = 401;
    throw error;
  }

  return {
    token,
    client: createClient(url, key, {
      global: { headers: { Authorization: "Bearer " + token } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }),
  };
}

function cleanSites(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((x) => String(x || "").trim().toUpperCase()).filter(Boolean))];
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = String(body?.organizationId || "");
    const email = String(body?.email || "").trim().toLowerCase();
    const role = String(body?.role || "viewer");
    const siteScope = cleanSites(body?.siteScope);

    if (!organizationId) {
      return Response.json({ error: "Workspace is required." }, { status: 400 });
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return Response.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    if (!["manager", "dispatcher", "viewer"].includes(role)) {
      return Response.json({ error: "Invalid team role." }, { status: 400 });
    }

    const { token, client } = publicVerifier(request);
    const { data: userData, error: userError } = await client.auth.getUser(token);
    if (userError || !userData?.user) {
      return Response.json({ error: "Your session is invalid or expired." }, { status: 401 });
    }

    const { data: inviteResult, error: inviteError } = await client.rpc("create_team_invite", {
      p_organization_id: organizationId,
      p_email: email,
      p_role: role,
      p_site_scope: siteScope,
    });
    if (inviteError) throw inviteError;

    const result = Array.isArray(inviteResult) ? inviteResult[0] || null : inviteResult || null;
    if (result?.status === "accepted") {
      return Response.json({
        status: "accepted",
        member_user_id: result.member_user_id || null,
        message: "The existing MetrixIQ account was added to the workspace.",
      }, { headers: { "cache-control": "no-store" } });
    }

    const admin = getSupabaseAdmin();
    const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    const redirectTo = origin.replace(/\/$/, "") + "/auth/callback?next=/app";

    const { data: authInvite, error: authInviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: {
        invited_workspace_id: organizationId,
        invited_role: role,
      },
    });

    if (authInviteError) {
      // Keep the database invite pending so the manager can retry or the user
      // can still register manually with the exact invited email.
      return Response.json({
        status: "pending",
        token: result?.token || null,
        email_sent: false,
        message: "Workspace invite created, but the invitation email could not be sent.",
        delivery_error: authInviteError.message,
      }, { status: 502, headers: { "cache-control": "no-store" } });
    }

    return Response.json({
      status: "pending",
      token: result?.token || null,
      email_sent: true,
      auth_user_id: authInvite?.user?.id || null,
      message: "Invitation email sent. Access will activate after the invited email is verified.",
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const status = Number(error?.statusCode) || (error?.code === "42501" ? 403 : 500);
    return Response.json(
      { error: error?.message || "Could not create the team invite." },
      { status, headers: { "cache-control": "no-store" } }
    );
  }
}
