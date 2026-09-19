import { createClient } from "@supabase/supabase-js";

export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server credentials are not configured.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function getSupabaseVerifier() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase public credentials are not configured.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function requireBearerUser(request) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) throw Object.assign(new Error("Authentication required."), { statusCode: 401 });
  const verifier = getSupabaseVerifier();
  const { data, error } = await verifier.auth.getUser(token);
  if (error || !data?.user) throw Object.assign(new Error("Your session is invalid or expired."), { statusCode: 401 });
  return { user: data.user, token };
}

export async function requirePlatformAdmin(request) {
  const { user } = await requireBearerUser(request);
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error("Platform administrator access required."), { statusCode: 403 });
  return { user, admin };
}

export function apiError(error) {
  return Response.json({ error: error?.message || "Unexpected server error." }, { status: Number(error?.statusCode) || 500 });
}
