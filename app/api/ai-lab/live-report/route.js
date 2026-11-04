import { createClient } from "@supabase/supabase-js";
import { summarizeLiveData } from "../../../../lib/ai-lab/live-summary.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

const MAX_SOURCE_ROWS = 1000;
const NO_STORE = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const errorResponse = (error, status) => Response.json({ error }, { status, headers: NO_STORE });

async function authorisedClient(request) {
  const bearer = request.headers.get("authorization") || "";
  const match = bearer.match(/^Bearer\s+(\S+)$/i);
  if (!match || match[1].length > 5000) return null;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  // Only a user-scoped publishable client. Never use service_role or bypass RLS.
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: "Bearer " + match[1] } },
  });
  const { data: identity, error: authError } = await client.auth.getUser(match[1]);
  if (authError || !identity?.user?.id) return null;
  const { data: isAdmin, error: roleError } = await client.rpc("is_platform_admin");
  return !roleError && isAdmin === true ? client : null;
}

function authorisedSite(site, organizationId) {
  return /^[A-Z0-9]{3,6}$/.test(site) && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(organizationId);
}

async function limitedRows(query) {
  const { data, error } = await query.limit(MAX_SOURCE_ROWS);
  if (error) throw new Error("Report source unavailable");
  const rows = data || [];
  return { rows, truncated: rows.length >= MAX_SOURCE_ROWS };
}

export async function GET(request) {
  try {
    const client = await authorisedClient(request);
    if (!client) return errorResponse("Super Admin access required.", 403);
    const url = new URL(request.url);

    if (url.searchParams.get("list") === "sites") {
      const { data, error } = await client.from("organization_site_profiles")
        .select("organization_id,site,display_name")
        .eq("active", true)
        .order("site", { ascending: true })
        .limit(100);
      if (error) return errorResponse("Could not load authorised sites.", 503);
      const sites = (data || []).filter(row => authorisedSite(String(row.site || ""), String(row.organization_id || "")))
        .map(row => ({
          site: row.site,
          organizationId: row.organization_id,
          label: String(row.display_name || row.site).slice(0, 80),
        }));
      return Response.json({ sites }, { headers: NO_STORE });
    }

    const site = String(url.searchParams.get("site") || "").toUpperCase();
    const organizationId = String(url.searchParams.get("organization") || "");
    const period = String(url.searchParams.get("period") || "").toUpperCase();
    if (!authorisedSite(site, organizationId) || !/^W(?:[1-9]|[1-4][0-9]|5[0-3])(?::20\d{2}-\d{2}-\d{2})?$/.test(period)) {
      return errorResponse("Select a valid authorised site and Amazon week label, such as W44.", 400);
    }
    const { data: siteRow, error: siteError } = await client.from("organization_site_profiles")
      .select("site").eq("organization_id", organizationId).eq("site", site).eq("active", true).maybeSingle();
    if (siteError || !siteRow) return errorResponse("Site access denied.", 403);

    // Existing row-level policies constrain every source by this user's organisation/site access.
    // Fetch allowlisted metrics/categories ONLY; never select IDs, names, raw_data, or customer details.
    const [metrics, feedback, concessions] = await Promise.all([
      limitedRows(client.from("driver_metrics").select("dcr,pod,iadc,cdf_dpmo,concessions")
        .eq("organization_id", organizationId).eq("site", site).eq("week_label", period)),
      limitedRows(client.from("feedback_events").select("feedback_l0")
        .eq("organization_id", organizationId).eq("site", site).eq("week_label", period)),
      limitedRows(client.from("concessions_weekly_snapshots").select("dnr")
        .eq("organization_id", organizationId).eq("site", site).eq("week_label", period)),
    ]);

    const report = summarizeLiveData({
      site, period,
      metricRows: metrics.rows,
      feedbackRows: feedback.rows,
      concessionRows: concessions.rows,
      truncated: { metrics: metrics.truncated, feedback: feedback.truncated, concessions: concessions.truncated },
    });
    return Response.json({ report }, { headers: NO_STORE });
  } catch {
    return errorResponse("Authorised report summary is temporarily unavailable.", 503);
  }
}
