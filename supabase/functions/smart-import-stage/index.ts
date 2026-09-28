import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import postgres from "npm:postgres@3.4.7";

const PROD_URL = "https://bbljkuwfejslsqoqqwzh.supabase.co";
const PROD_KEY = "sb_publishable_6Up4yjv_zk15xDNb0aK9ZQ_iXaDP2M0";
const MAX_BYTES = 12 * 1024 * 1024;
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

function sitesFrom(files: any[]) {
  const sites = new Set<string>();
  for (const file of files || []) {
    for (const raw of Array.isArray(file?.sites) ? file.sites : []) {
      const site = String(raw || "").trim().toUpperCase();
      if (/^D[A-Z]{1,4}\d{1,3}$/.test(site)) sites.add(site);
    }
  }
  return [...sites];
}

async function authorize(req: Request, organizationId: string, sites: string[]) {
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
    return { error: "You do not have permission to stage imports for this workspace.", status: 403 };
  }

  const scope = Array.isArray(member.site_scope)
    ? member.site_scope.map((v: unknown) => String(v || "").trim().toUpperCase()).filter(Boolean)
    : [];
  if (member.role === "manager" && scope.length) {
    const denied = sites.filter((site) => !scope.includes(site));
    if (denied.length) {
      return { error: "Your site scope does not allow staging: " + denied.join(", "), status: 403 };
    }
  }

  return { user, status: 200 };
}

Deno.serve(async (req: Request) => {
  const c = cors(req);
  if (!c.allowed) return reply(req, { error: "Origin is not allowed." }, 403);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: c.headers });
  if (req.method !== "POST") return reply(req, { error: "Method not allowed." }, 405);

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > MAX_BYTES) return reply(req, { error: "Staging payload is too large." }, 413);

  let body: any;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BYTES) return reply(req, { error: "Staging payload is too large." }, 413);
    body = JSON.parse(raw);
  } catch {
    return reply(req, { error: "Invalid JSON payload." }, 400);
  }

  if (!uuid(body?.organizationId)) return reply(req, { error: "Invalid organizationId." }, 400);
  if (body?.writesEnabled !== false) {
    return reply(req, { error: "Staging requires a validated zero-write source plan." }, 400);
  }
  if (!Array.isArray(body?.files) || body.files.length < 1 || body.files.length > 400) {
    return reply(req, { error: "Invalid staging file set." }, 400);
  }
  if (!Array.isArray(body?.records) || body.records.length > 5000) {
    return reply(req, { error: "Invalid staging record set." }, 400);
  }

  const auth = await authorize(req, body.organizationId, sitesFrom(body.files));
  if (auth.error || !auth.user) return reply(req, { error: auth.error }, auth.status || 401);

  try {
    const rows = await db`
      select smart_import_lab.stage_payload_v2(
        ${db.json(body)}::jsonb,
        ${auth.user.id}::uuid
      ) as result
    `;
    return reply(req, {
      ok: true,
      environment: "MetrixIQ Staging",
      writesToProduction: false,
      ...(rows[0]?.result || {}),
    }, 201);
  } catch (error) {
    console.error("smart-import-stage failed", error);
    const rawMessage = String(error?.message || "");
    const safeMessage = rawMessage.startsWith("Staging reconciliation failed.")
      ? rawMessage
      : "Staging database write failed.";
    return reply(req, {
      error: safeMessage,
      code: rawMessage.startsWith("Staging reconciliation failed.")
        ? "RECONCILIATION_FAILED"
        : "STAGING_WRITE_FAILED",
    }, 500);
  }
});
