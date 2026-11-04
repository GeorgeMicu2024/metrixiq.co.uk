import { createClient } from "@supabase/supabase-js";
import { analyseBrain, normalizeBrainPeriods } from "../../../../lib/ai-lab/brain-insights.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const fail = (message, status) => Response.json({ error: message }, { status, headers: HEADERS });
const SITE = /^[A-Z0-9]{3,6}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function verifiedClient(request) {
  const bearer = request.headers.get("authorization") || "";
  const match = bearer.match(/^Bearer\s+(\S+)$/i);
  if (!match || match[1].length > 5000) return null;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  // User's JWT and publishable key only: existing RLS remains in force.
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: "Bearer " + match[1] } },
  });
  const { data: identity, error: authError } = await client.auth.getUser(match[1]);
  if (authError || !identity?.user?.id) return null;
  const { data: allowed, error: roleError } = await client.rpc("is_platform_admin");
  return !roleError && allowed === true ? client : null;
}

// Bound each source at 3,000 rows. This is a diagnostic sample, never a full export.
async function readBounded(buildQuery) {
  const rows = [];
  let truncated = false;
  for (let page = 0; page < 3; page++) {
    const { data, error } = await buildQuery().order("id", { ascending: true }).range(page * 1000, page * 1000 + 999);
    if (error) throw new Error("Authorised source unavailable");
    rows.push(...(data || []));
    if (!data || data.length < 1000) return { rows, truncated };
    if (page === 2) truncated = true;
  }
  return { rows, truncated };
}

export async function GET(request) {
  try {
    const client = await verifiedClient(request);
    if (!client) return fail("Verified Super Admin access required.", 403);
    const params = new URL(request.url).searchParams;
    const organization = params.get("organization") || "";
    const site = (params.get("site") || "").toUpperCase();
    if (!UUID.test(organization) || !SITE.test(site)) return fail("Choose a valid station.", 400);
    const { data: station, error: siteError } = await client.from("organization_site_profiles")
      .select("site").eq("organization_id", organization).eq("site", site).eq("active", true).maybeSingle();
    if (siteError || !station) return fail("Station access denied.", 403);

    if (params.get("list") === "weeks") {
      const { data, error } = await client.from("driver_metrics").select("week_label")
        .eq("organization_id", organization).eq("site", site)
        .order("period_start", { ascending: false }).limit(1000);
      if (error) return fail("Available periods could not be read.", 503);
      const periods = [...new Set((data || []).map(row => row.week_label).filter(value => /^W(?:[1-9]|[1-4][0-9]|5[0-3])$/.test(value)))].slice(0, 20);
      return Response.json({ periods, partialDiscovery: (data || []).length >= 1000 }, { headers: HEADERS });
    }

    const periods = normalizeBrainPeriods((params.get("periods") || "").split(","));
    const scoped = (table, columns) => client.from(table).select(columns).eq("organization_id", organization).eq("site", site).in("week_label", periods);
    const [metrics, feedback, concessions, knownDrivers] = await Promise.all([
      readBounded(() => scoped("driver_metrics", "id,driver_id,week_label,dcr,pod,iadc,cdf_dpmo,concessions")),
      readBounded(() => scoped("feedback_events", "id,week_label,feedback_l0")),
      readBounded(() => scoped("concessions_weekly_snapshots", "id,week_label,dnr")),
      client.from("drivers").select("id,full_name,site").eq("organization_id", organization).eq("site", site).limit(500),
    ]);
    if (knownDrivers.error) throw new Error("Authorised driver directory unavailable");
    const analysis = analyseBrain({ site, periods, metricRows: metrics.rows, feedbackRows: feedback.rows,
      concessionRows: concessions.rows, drivers: knownDrivers.data || [],
      truncated: metrics.truncated || feedback.truncated || concessions.truncated || (knownDrivers.data || []).length >= 500 });
    return Response.json({ analysis }, { headers: HEADERS });
  } catch (cause) {
    if (/Choose 1–12|Invalid or duplicate/.test(cause.message || "")) return fail(cause.message, 400);
    return fail("Authorised AI Brain analysis is temporarily unavailable.", 503);
  }
}
