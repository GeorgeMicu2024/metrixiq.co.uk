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
    return { error: "You do not have permission to export approved imports for this workspace.", status: 403 };
  }
  return { user, member, status: 200 };
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

  const auth = await authenticate(req, body.organizationId);
  if (auth.error || !auth.user || !auth.member) {
    return reply(req, { error: auth.error }, auth.status || 401);
  }

  try {
    const batches = await db.unsafe(
      "select id,organization_id,status,mode,parser_version,batch_fingerprint,approved_at,metadata,ready_file_count,blocked_file_count,logical_conflict_count from smart_import_lab.batches where id=$1::uuid and organization_id=$2::uuid limit 1",
      [body.batchId, body.organizationId]
    );
    const batch = batches[0];
    if (!batch) return reply(req, { error: "Batch not found." }, 404);

    if (
      batch.status !== "approved" ||
      batch.mode !== "approved" ||
      batch.metadata?.reconciliationStatus !== "passed" ||
      batch.metadata?.approvalStatus !== "passed" ||
      Number(batch.blocked_file_count || 0) !== 0 ||
      Number(batch.logical_conflict_count || 0) !== 0
    ) {
      return reply(req, { error: "Batch is not an approved, reconciled staging batch." }, 409);
    }

    const files = await db.unsafe(
      "select id,file_name,content_hash,byte_size,mime_type,report_types,sites,period_key,granularity,confidence,state,row_count,targets,warnings,detection_evidence,metadata from smart_import_lab.files where batch_id=$1::uuid and state in ('ready','warning') order by created_at,id",
      [body.batchId]
    );

    const sites = [...new Set(files.flatMap((file: any) => Array.isArray(file.sites) ? file.sites : []).map((v: any) => String(v || "").trim().toUpperCase()).filter(Boolean))];
    const scope = Array.isArray(auth.member.site_scope)
      ? auth.member.site_scope.map((v: any) => String(v || "").trim().toUpperCase()).filter(Boolean)
      : [];
    if (auth.member.role === "manager" && scope.length) {
      const denied = sites.filter((site: string) => !scope.includes(site));
      if (denied.length) return reply(req, { error: "Your site scope does not allow export for: " + denied.join(", ") }, 403);
    }

    const records = await db.unsafe(
      "select r.id,r.file_id,f.file_name as source_file_name,r.site,r.report_type,r.period_key,r.record_key,r.entity_level,r.entity_key,r.metric_key,r.metric_value,r.metric_text,r.payload,r.source_priority from smart_import_lab.records r join smart_import_lab.files f on f.id=r.file_id where r.batch_id=$1::uuid order by r.report_type,r.record_key",
      [body.batchId]
    );

    const invalidDrivers = records.filter((record: any) =>
      record.report_type === "DRIVER_PERIOD" &&
      !/^A[A-Z0-9]{8,}$/i.test(String(record.entity_key || ""))
    );
    if (invalidDrivers.length) {
      return reply(req, {
        error: "Approved batch contains invalid driver identities and must be reanalysed.",
        invalidDriverRecords: invalidDrivers.length,
      }, 409);
    }

    const expected =
      Number(batch.metadata?.driverRecords || 0) +
      Number(batch.metadata?.feedbackRecords || 0) +
      Number(batch.metadata?.scorecardRecords || 0);
    if (expected !== records.length) {
      return reply(req, { error: "Approved batch record count changed after approval." }, 409);
    }

    return reply(req, {
      ok: true,
      environment: "MetrixIQ Staging",
      exportVersion: "smart-import-export-v1",
      organizationId: body.organizationId,
      batch: {
        id: batch.id,
        status: batch.status,
        parserVersion: batch.parser_version,
        batchFingerprint: batch.batch_fingerprint,
        approvedAt: batch.approved_at,
        metadata: batch.metadata,
        sites,
      },
      files,
      records,
    });
  } catch (error) {
    console.error("smart-import-export failed", error);
    return reply(req, { error: "Could not export the approved staging batch." }, 500);
  }
});
