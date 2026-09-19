import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!cronSecret || !supabaseUrl || !serviceRoleKey) {
    return Response.json(
      { ok: false, error: "Automation scheduler environment is not configured." },
      { status: 503, headers: { "cache-control": "no-store" } }
    );
  }

  const authorization = request.headers.get("authorization") || "";
  if (authorization !== "Bearer " + cronSecret) {
    return Response.json(
      { ok: false, error: "Unauthorized." },
      { status: 401, headers: { "cache-control": "no-store" } }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { data, error } = await supabase.rpc("run_due_automations_system");

  if (error) {
    return Response.json(
      { ok: false, error: error.message },
      { status: 500, headers: { "cache-control": "no-store" } }
    );
  }

  return Response.json(
    {
      ok: true,
      scheduler: "automation-v8",
      result: data?.[0] || null,
      timestamp: new Date().toISOString(),
    },
    { status: 200, headers: { "cache-control": "no-store" } }
  );
}
