import { getSupabaseAdmin, requireBearerUser, requirePlatformAdmin, apiError } from "../../../../../lib/supabase/adminServer";
export const runtime = "nodejs";

export async function DELETE(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const targetUserId = String(body?.userId || "");
    const selfDelete = body?.self === true;
    if (!targetUserId) return Response.json({ error: "User id is required." }, { status: 400 });

    let admin;
    if (selfDelete) {
      const auth = await requireBearerUser(request);
      if (auth.user.id !== targetUserId) return Response.json({ error: "Invalid self-delete request." }, { status: 403 });
      admin = getSupabaseAdmin();
      const { error: prepareError } = await admin.rpc("prepare_my_account_deletion");
      if (prepareError) throw Object.assign(new Error(prepareError.message), { statusCode: 409 });
    } else {
      const auth = await requirePlatformAdmin(request);
      admin = auth.admin;
      const { error: prepareError } = await admin.rpc("admin_prepare_user_deletion", { p_user_id: targetUserId });
      if (prepareError) throw Object.assign(new Error(prepareError.message), { statusCode: 409 });
    }

    // Supabase Auth deletion is server-only and removes the user's Auth sessions.
    const { error } = await admin.auth.admin.deleteUser(targetUserId);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
