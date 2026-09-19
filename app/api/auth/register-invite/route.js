import { getSupabaseAdmin } from "../../../../lib/billing/stripeServer";

export const runtime = "nodejs";

function cleanEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export async function POST(request) {
  let createdUserId = null;
  try {
    const body = await request.json();
    const token = String(body?.token || "").trim();
    const email = cleanEmail(body?.email);
    const password = String(body?.password || "");
    const fullName = String(body?.fullName || "").trim();

    if (!/^[0-9a-f-]{36}$/i.test(token)) {
      return Response.json({ error: "This invitation link is invalid." }, { status: 400 });
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return Response.json({ error: "Enter the invited email address." }, { status: 400 });
    }
    if (password.length < 8) {
      return Response.json({ error: "Password must contain at least 8 characters." }, { status: 400 });
    }
    if (!fullName) {
      return Response.json({ error: "Enter your full name." }, { status: 400 });
    }

    const admin = getSupabaseAdmin();

    const { data: inviteRows, error: inviteError } = await admin.rpc("get_team_invite_signup_context", {
      p_token: token,
      p_email: email,
    });
    if (inviteError) throw inviteError;

    const invite = inviteRows?.[0] || null;
    if (!invite) {
      return Response.json({ error: "This invitation is invalid, expired or does not match this email." }, { status: 410 });
    }

    const { data: existingProfiles, error: profileError } = await admin
      .from("profiles")
      .select("id,email")
      .ilike("email", email)
      .limit(1);
    if (profileError) throw profileError;

    if (existingProfiles?.length) {
      return Response.json(
        { error: "An account already exists for this email. Sign in instead of registering again." },
        { status: 409 }
      );
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        invited_workspace_id: invite.organization_id,
        invited_role: invite.invited_role,
      },
    });
    if (createError) throw createError;

    createdUserId = created?.user?.id || null;
    if (!createdUserId) throw new Error("Supabase did not return the created account.");

    const { data: completed, error: completeError } = await admin.rpc("complete_team_invite_signup", {
      p_token: token,
      p_user_id: createdUserId,
      p_email: email,
    });
    if (completeError || completed !== true) {
      if (createdUserId) await admin.auth.admin.deleteUser(createdUserId).catch(() => null);
      throw completeError || new Error("Could not attach the invited account to the workspace.");
    }

    return Response.json(
      {
        ok: true,
        email,
        organization_id: invite.organization_id,
        organization_name: invite.organization_name,
        role: invite.invited_role,
      },
      { status: 201, headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    if (createdUserId) {
      try {
        await getSupabaseAdmin().auth.admin.deleteUser(createdUserId);
      } catch {}
    }

    const message = error?.message || "Could not complete invited registration.";
    const status =
      message.toLowerCase().includes("already") ? 409 :
      Number(error?.statusCode) || 500;

    return Response.json(
      { error: message },
      { status, headers: { "cache-control": "no-store" } }
    );
  }
}
