import { requirePlatformAdmin, apiError } from "../../../../../lib/supabase/adminServer";
export const runtime = "nodejs";
export async function POST(request) {
  try {
    const { userId } = await request.json();
    if (!userId) return Response.json({ error: "User id is required." }, { status: 400 });
    const { admin } = await requirePlatformAdmin(request);
    const { data, error } = await admin.rpc("admin_reset_user_access", { p_user_id: userId });
    if (error) throw Object.assign(new Error(error.message), { statusCode: 409 });
    return Response.json({ ok: true, membershipsUpdated: Number(data || 0) });
  } catch (error) { return apiError(error); }
}
