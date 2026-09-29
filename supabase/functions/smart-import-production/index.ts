import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import postgres from "npm:postgres@3.4.7";

const PROD_URL = "https://bbljkuwfejslsqoqqwzh.supabase.co";
const PROD_KEY = "sb_publishable_6Up4yjv_zk15xDNb0aK9ZQ_iXaDP2M0";
const STAGING_EXPORT_URL = "https://hsbxqiuvciwalxogqceb.supabase.co/functions/v1/smart-import-export";
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

Deno.serve(async (req: Request) => {
  const c = cors(req);
  if (!c.allowed) return reply(req, { error: "Origin is not allowed." }, 403);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: c.headers });
  if (req.method !== "POST") return reply(req, { error: "Method not allowed." }, 405);

  let body: any;
  try { body = await req.json(); }
  catch { return reply(req, { error: "Invalid JSON payload." }, 400); }

  if (!uuid(body?.batchId) || !uuid(body?.organizationId)) {
    return reply(req, { error: "Invalid batch or organization identifier." }, 400);
  }

  const action = body?.action || "preflight";
  if (!["preflight", "commit"].includes(action)) {
    return reply(req, { error: "Unsupported Production action." }, 400);
  }
  if (action === "commit" && body?.confirmation !== "COMMIT_APPROVED_BATCH") {
    return reply(req, { error: "Explicit Production commit confirmation is required." }, 409);
  }

  const header = req.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) return reply(req, { error: "Authentication required." }, 401);
  const token = header.slice(7).trim();

  const prod = createClient(PROD_URL, PROD_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: header } },
  });

  const { data: userData, error: userError } = await prod.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) return reply(req, { error: "Invalid or expired MetrixIQ session." }, 401);

  const { data: member, error: memberError } = await prod
    .from("organization_members")
    .select("role, site_scope")
    .eq("organization_id", body.organizationId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (memberError || !member || !ALLOWED_ROLES.has(String(member.role || ""))) {
    return reply(req, { error: "You do not have permission to preflight imports for this workspace." }, 403);
  }

  try {
    const stagingResponse = await fetch(STAGING_EXPORT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: header,
      },
      body: JSON.stringify({
        batchId: body.batchId,
        organizationId: body.organizationId,
      }),
    });

    const staging = await stagingResponse.json().catch(() => ({}));
    if (!stagingResponse.ok) {
      return reply(req, {
        error: staging?.error || "Approved staging batch could not be exported.",
        source: "staging",
      }, stagingResponse.status);
    }

    const stagingPayload = {
      ...staging,
      organizationId: staging?.organizationId || staging?.organization_id || body.organizationId,
      batch: {
        ...(staging?.batch || {}),
        id: staging?.batch?.id || staging?.batch_id || body.batchId,
        batchFingerprint:
          staging?.batch?.batchFingerprint ||
          staging?.batch?.batch_fingerprint ||
          staging?.batch?.metadata?.batchFingerprint ||
          staging?.batchFingerprint ||
          null,
      },
    };

    if (!stagingPayload.organizationId || !stagingPayload.batch?.id || !stagingPayload.batch?.batchFingerprint) {
      return reply(req, {
        error: "Approved staging export is incomplete.",
        source: "staging",
      }, 409);
    }

    if (
      action === "commit" &&
      body?.expectedFingerprint &&
      body.expectedFingerprint !== stagingPayload.batch.batchFingerprint
    ) {
      return reply(req, {
        error: "The approved batch changed after preflight. Run Production preflight again.",
        code: "PREFLIGHT_FINGERPRINT_MISMATCH",
      }, 409);
    }

    const preflightRows = await db`
      select private.smart_import_preflight(
        ${db.json(stagingPayload)}::jsonb,
        ${user.id}::uuid
      ) as result
    `;
    const preflight = preflightRows[0]?.result || {};

    if (action === "preflight") {
      return reply(req, {
        ok: true,
        environment: "MetrixIQ Production",
        action: "preflight",
        writesToProduction: false,
        ...preflight,
      }, 200);
    }

    if (!preflight?.ready) {
      if (preflight?.alreadyCommitted) {
        return reply(req, {
          ok: true,
          environment: "MetrixIQ Production",
          action: "commit",
          writesToProduction: false,
          committed: true,
          alreadyCommitted: true,
          ...preflight,
        }, 200);
      }
      return reply(req, {
        error: "Production preflight is no longer ready. Run preflight again.",
        code: "PREFLIGHT_NOT_READY",
        preflight,
      }, 409);
    }

    const commitRows = await db`
      select private.smart_import_commit(
        ${db.json(stagingPayload)}::jsonb,
        ${user.id}::uuid
      ) as result
    `;
    const result = commitRows[0]?.result || {};

    return reply(req, {
      ok: true,
      environment: "MetrixIQ Production",
      action: "commit",
      writesToProduction: true,
      ...result,
    }, 200);
  } catch (error) {
    console.error("smart-import-production action failed", action, error);
    return reply(req, {
      error: action === "commit" ? "Production commit failed." : "Production preflight failed.",
      code: action === "commit" ? "PRODUCTION_COMMIT_FAILED" : "PRODUCTION_PREFLIGHT_FAILED",
    }, 500);
  }
});
