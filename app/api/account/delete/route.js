import { createClient } from "@supabase/supabase-js";
import { deleteMetrixAccount } from "../../../../lib/accounts/deleteAccountServer";

export const runtime = "nodejs";

function authClient(request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  if (!url || !key) throw new Error("Supabase public credentials are not configured.");
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

export async function POST(request) {
  try {
    const body = await request.json();
    if (String(body?.confirmation || "") !== "DELETE") {
      return Response.json({ error: "Type DELETE to confirm account deletion." }, { status: 400 });
    }

    const { token, client } = authClient(request);
    const { data, error } = await client.auth.getUser(token);
    if (error || !data?.user) {
      return Response.json({ error: "Your session is invalid or expired." }, { status: 401 });
    }

    const result = await deleteMetrixAccount(data.user.id);
    return Response.json({ ok: true, ...result }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json(
      { error: error?.message || "Could not delete the account." },
      { status: Number(error?.statusCode) || 500, headers: { "cache-control": "no-store" } }
    );
  }
}
