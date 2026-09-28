import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import postgres from "npm:postgres@3.4.7";

const PROD_URL = "https://bbljkuwfejslsqoqqwzh.supabase.co";
const PROD_KEY = "sb_publishable_6Up4yjv_zk15xDNb0aK9ZQ_iXaDP2M0";
const ALLOWED_ROLES = new Set(["owner", "manager"]);
const db = postgres(Deno.env.get("SUPABASE_DB_URL") || "", { prepare: false, max: 1 });

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed =
    !origin ||
    origin === "https://metrixiq.co.uk" ||
    origin === "https://www.metrixiq.co.uk" ||
    /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);

  return {
    allowed,
    headers: {
      "Access-Control-Allow-Origin": origin && allowed ? origin : "https://metrixiq.co.uk",
      "Access-Control-Allow-Headers": "authorization, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
      "Content-Type": "application/json",
    },
  };
}

function reply(req: Request, payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: cors(req).headers });
}

function uuid(value: unknown) {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function authenticate(req: Request, organizationId: string) {
  const header = req.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) return { error: "Authentication required.", status: 401 };
  const token = header.slice(7).trim();
  if (!token) return { error: "Authentication required.", status: 401 };

  const prod = createClient(PROD_URL, PROD_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: header } },
  });

  const { data: userData, error: userError } = await prod.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) return { error: "Invalid or expired MetrixIQ session.", status: 401 };

  const { data: member, error: memberError } = await prod
    .from("organization_members")
    .select("role, site_scope")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (memberError || !member || !ALLOWED_ROLES.has(String(member.role || ""))) {
    return { error: "You do not have permission to approve imports for this workspace.", status: 403 };
  }

  return { user, member, status: 200 };
}

Deno.serve(async (req: Request) => {
  const c = cors(req);
  if (!c.allowed) return reply(req, { error: "Origin is not allowed." }, 403);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: c.headers });
  if (req.method !== "POST") return reply(req, { error: "Method not allowed." }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return reply(req, { error: "Invalid JSON payload." }, 400);
  }

  if (!uuid(body?.batchId) || !uuid(body?.organizationId)) {
    return reply(req, { error: "Invalid batch or organization identifier." }, 400);
  }

  const auth = await authenticate(req, body.organizationId);
  if (auth.error || !auth.user || !auth.member) {
    return reply(req, { error: auth.error }, auth.status || 401);
  }

  try {
    const batchRows = await db.unsafe(
      "select b.id, b.status, coalesce(array_agg(distinct site) filter (where site is not null), '{}') as sites from smart_import_lab.batches b left join smart_import_lab.files f on f.batch_id=b.id left join lateral unnest(f.sites) site on true where b.id=$1::uuid and b.organization_id=$2::uuid group by b.id,b.status limit 1",
      [body.batchId, body.organizationId]
    );

    const batch = batchRows[0];
    if (!batch) return reply(req, { error: "Batch not found for this workspace." }, 404);

    const scope = Array.isArray(auth.member.site_scope)
      ? auth.member.site_scope.map((value: unknown) => String(value || "").trim().toUpperCase()).filter(Boolean)
      : [];
    const batchSites = Array.isArray(batch.sites)
      ? batch.sites.map((value: unknown) => String(value || "").trim().toUpperCase()).filter(Boolean)
      : [];

    if (auth.member.role === "manager" && scope.length) {
      const denied = batchSites.filter((site: string) => !scope.includes(site));
      if (denied.length) {
        return reply(req, { error: "Your site scope does not allow approval for: " + denied.join(", ") }, 403);
      }
    }

    const rows = await db.unsafe(
      "select smart_import_lab.approve_batch($1::uuid,$2::uuid,$3::uuid) as result",
      [body.batchId, body.organizationId, auth.user.id]
    );

    return reply(req, {
      ok: true,
      environment: "MetrixIQ Staging",
      writesToProduction: false,
      ...(rows[0]?.result || {}),
    }, 200);
  } catch (error) {
    console.error("smart-import-approve failed", error);
    const message = String(error?.message || "");
    const safe =
      message.startsWith("Only reconciled staging batches") ||
      message.startsWith("Batch reconciliation") ||
      message.startsWith("Batch still contains") ||
      message.startsWith("Ready file count changed") ||
      message.startsWith("Blocking conflicts") ||
      message.startsWith("Stored evidence changed") ||
      message.startsWith("Batch fingerprint")
        ? message
        : "Batch approval failed.";
    return reply(req, { error: safe, code: "APPROVAL_FAILED" }, 409);
  }
});
