import { createClient } from "@supabase/supabase-js";
import { buildConnected360 } from "../../../../lib/ai-lab/connected-360.mjs";
import { buildDataDoctor } from "../../../../lib/ai-lab/data-doctor.mjs";
import { buildMorningBriefing } from "../../../../lib/ai-lab/morning-briefing.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const errorResponse = (message, status) => Response.json({ error: message }, { status, headers: HEADERS });
const SITE = /^[A-Z0-9]{3,6}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function verifiedAdmin(request) {
  const match = (request.headers.get("authorization") || "").match(/^Bearer\s+(\S+)$/i);
  if (!match || match[1].length > 5000) return null;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  // User JWT + publishable client only; RLS is never bypassed.
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: "Bearer " + match[1] } } });
  const { data: identity, error: authError } = await client.auth.getUser(match[1]);
  if (authError || !identity?.user?.id) return null;
  const { data: admin, error: roleError } = await client.rpc("is_platform_admin");
  return !roleError && admin === true ? client : null;
}

async function bounded(query, limit = 1200) {
  const safeLimit = Math.min(1000, limit);
  const { data, error } = await query.limit(safeLimit);
  if (error) throw new Error("Authorised report source unavailable");
  return { rows: data || [], partial: (data || []).length >= safeLimit };
}

export async function GET(request) {
  try {
    const client = await verifiedAdmin(request);
    if (!client) return errorResponse("Verified Super Admin access required.", 403);
    const params = new URL(request.url).searchParams;
    const organization = params.get("organization") || "";
    const site = (params.get("site") || "").toUpperCase();
    if (!UUID.test(organization) || !SITE.test(site)) return errorResponse("Choose an authorised station.", 400);
    const { data: profile, error: siteError } = await client.from("organization_site_profiles")
      .select("site").eq("organization_id", organization).eq("site", site).eq("active", true).maybeSingle();
    if (siteError || !profile) return errorResponse("Site access denied.", 403);

    if (params.get("list") === "weeks") {
      const { data, error } = await client.from("site_scorecards")
        .select("year,week,week_label").eq("organization_id", organization).eq("site", site)
        .order("year", { ascending: false }).order("week", { ascending: false }).limit(30);
      if (error) return errorResponse("Official reporting periods unavailable.", 503);
      const periods = (data || []).filter(row => Number.isInteger(row.year) && Number.isInteger(row.week) && row.week >= 1 && row.week <= 53)
        .map(row => ({ year: row.year, week: row.week, label: "W" + row.week }));
      return Response.json({ periods }, { headers: HEADERS });
    }

    const year = Number(params.get("year"));
    const week = Number(params.get("week"));
    if (!Number.isInteger(year) || year < 2020 || year > 2100 || !Number.isInteger(week) || week < 1 || week > 53) {
      return errorResponse("Choose a valid reporting year and week.", 400);
    }
    const scope = (table, fields) => client.from(table).select(fields).eq("organization_id", organization).eq("site", site);
    const label = "W" + week;
    const [card, metrics, feedback, concessions, lor, imports, previous] = await Promise.all([
      scope("site_scorecards", "year,week,overall_score,standing,site_rank,updated_at,metrics")
        .eq("year", year).eq("week", week).maybeSingle(),
      bounded(scope("driver_metrics", "driver_id,source_import_id,period_end,dcr,pod,iadc,cdf_dpmo,lor,psb,scorecard_score")
        .eq("week_label", label).order("period_end", { ascending: false }), 2500),
      bounded(scope("feedback_events", "id").eq("week_label", label), 1200),
      bounded(scope("concessions_weekly_snapshots", "dnr").eq("week_label", label), 1200),
      bounded(scope("lor_investigations", "verdict").order("updated_at", { ascending: false }), 800),
      bounded(scope("imports", "period_start,period_end,status,created_at")
        .order("created_at", { ascending: false }), 500),
      week > 1 ? client.from("driver_metrics").select("id", { head: true, count: "exact" })
        .eq("organization_id", organization).eq("site", site).eq("week_label", "W" + (week - 1))
        : Promise.resolve({ count: null, error: null }),
    ]);
    if (card.error || previous.error) throw new Error("Authorised Scorecard or comparison unavailable");
    const snapshot = buildConnected360({ site, year, week, card: card.data,
      metricRows: metrics.rows, feedbackRows: feedback.rows, concessionRows: concessions.rows,
      lorCases: lor.rows, importRows: imports.rows, previousMetricRows: previous.count,
      partial: { metrics: metrics.partial, feedback: feedback.partial, concessions: concessions.partial,
        lor: lor.partial, imports: imports.partial } });
    return Response.json({ snapshot, doctor: buildDataDoctor(snapshot), briefing: buildMorningBriefing(snapshot) }, { headers: HEADERS });
  } catch {
    return errorResponse("Private Connected 360° report is temporarily unavailable.", 503);
  }
}
