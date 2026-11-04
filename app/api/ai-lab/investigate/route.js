import { createClient } from "@supabase/supabase-js";
import { normalizeBrainPeriods } from "../../../../lib/ai-lab/brain-insights.mjs";
import { evaluateDrivers, parseDriverQuestion } from "../../../../lib/ai-lab/driver-investigator.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const fail = (message, code) => Response.json({ error: message }, { status: code, headers: HEADERS });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function clientFor(request) {
  const match = (request.headers.get("authorization") || "").match(/^Bearer\s+(\S+)$/i);
  if (!match || match[1].length > 5000) return null;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: "Bearer " + match[1] } } });
  const { data: user, error: identityError } = await client.auth.getUser(match[1]);
  if (identityError || !user?.user?.id) return null;
  const { data: admin, error } = await client.rpc("is_platform_admin");
  return !error && admin === true ? client : null;
}

async function boundedRows(build) {
  const rows = [];
  for (let index = 0; index < 3; index++) {
    const { data, error } = await build().order("id", { ascending: true }).range(index * 1000, index * 1000 + 999);
    if (error) throw new Error("Authorised source unavailable");
    rows.push(...(data || []));
    if (!data || data.length < 1000) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

export async function POST(request) {
  try {
    const client = await clientFor(request);
    if (!client) return fail("Verified Super Admin access required.", 403);
    const raw = await request.text();
    if (raw.length > 2000) return fail("Investigation too large.", 413);
    let body;
    try { body = JSON.parse(raw); } catch { return fail("Invalid JSON.", 400); }
    const site = String(body?.site || "").toUpperCase();
    const organization = String(body?.organization || "");
    if (!/^[A-Z0-9]{3,6}$/.test(site) || !UUID.test(organization)) return fail("Invalid site selection.", 400);
    const periods = normalizeBrainPeriods(body?.periods);
    const query = parseDriverQuestion(body?.question);
    if (!query) return fail("Ask about drivers and an identified metric (IADC, DCR, POD, CDF or concessions).", 400);
    const { data: profile, error: profileError } = await client.from("organization_site_profiles").select("site")
      .eq("organization_id", organization).eq("site", site).eq("active", true).maybeSingle();
    if (profileError || !profile) return fail("Station access denied.", 403);

    // No use of security-definer views, service keys, user-supplied SQL or raw_data.
    const [metrics, drivers] = await Promise.all([
      boundedRows(() => client.from("driver_metrics").select("id,driver_id,week_label,dcr,pod,iadc,cdf_dpmo,concessions")
        .eq("organization_id", organization).eq("site", site).in("week_label", periods)),
      client.from("drivers").select("id,full_name,site").eq("organization_id", organization).eq("site", site).limit(500),
    ]);
    if (drivers.error) throw new Error("Authorised directory unavailable");
    const result = evaluateDrivers({ site, periods, query, metricRows: metrics.rows, directory: drivers.data || [],
      truncated: metrics.truncated || (drivers.data || []).length >= 500 });
    return Response.json({ result }, { headers: HEADERS });
  } catch (error) {
    if (/Invalid authorised scope|Invalid metric threshold|Question must|Choose 1–12|Invalid or duplicate/.test(error.message || "")) return fail(error.message, 400);
    return fail("Authorised driver investigation is temporarily unavailable.", 503);
  }
}
