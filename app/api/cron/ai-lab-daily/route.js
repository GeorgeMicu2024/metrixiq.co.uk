import { createClient } from "@supabase/supabase-js";
import { buildConnected360 } from "../../../../lib/ai-lab/connected-360.mjs";
import { buildMorningBriefing } from "../../../../lib/ai-lab/morning-briefing.mjs";
import { isoWeekRange } from "../../../../lib/ai-lab/connected-360.mjs";
import { londonMorningWindow, safeDailyPriorities } from "../../../../lib/ai-lab/daily-schedule.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== "Bearer " + secret) {
    return Response.json({ ok: false, error: "Unauthorised scheduler." }, { status: 401, headers: HEADERS });
  }
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return Response.json({ ok: false, error: "Scheduler not configured." }, { status: 503, headers: HEADERS });
  const local = londonMorningWindow();
  if (!local.due) return Response.json({ ok: true, skipped: "Outside UK morning window." }, { headers: HEADERS });

  // Only this server-side, secret-protected scheduled task uses the configured
  // service key. It reads aggregates and writes to the isolated AI Lab cache.
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const { data: profiles, error: siteError } = await client.from("organization_site_profiles")
      .select("organization_id,site").eq("active", true).order("site").limit(25);
    if (siteError) throw siteError;
    let saved = 0, skipped = 0;
    for (const profile of profiles || []) {
      if (!/^[A-Z0-9]{3,6}$/.test(profile.site || "")) { skipped++;continue; }
      const scope = (table, fields) => client.from(table).select(fields)
        .eq("organization_id", profile.organization_id).eq("site", profile.site);
      const { data: cards, error: cardError } = await scope("site_scorecards", "year,week,overall_score,standing,metrics,site_rank,updated_at")
        .order("year", { ascending: false }).order("week", { ascending: false }).limit(1);
      if (cardError || !cards?.[0]) { skipped++;continue; }
      const card = cards[0];
      const range = isoWeekRange(card.year, card.week);
      const { data: metricRows, error: metricError } = await scope("driver_metrics", "period_end,iadc,dcr,pod,lor")
        .eq("week_label", "W" + card.week).gte("period_end", range.start).lte("period_end", range.end).limit(1000);
      if (metricError) { skipped++;continue; }
      const snapshot = buildConnected360({ site: profile.site, year: card.year, week: card.week,
        card, metricRows: metricRows || [], partial: { metrics: (metricRows || []).length >= 1000 } });
      const morning = buildMorningBriefing(snapshot);
      const { error: saveError } = await client.from("ai_lab_daily_briefings").upsert({
        organization_id: profile.organization_id, site: profile.site, briefing_date: local.date,
        scorecard_year: card.year, scorecard_week: card.week, official_score: snapshot.official?.score,
        official_tier: snapshot.official?.standing,
        priorities: safeDailyPriorities(morning.priorities), generated_at: new Date().toISOString(),
      }, { onConflict: "organization_id,site,briefing_date" });
      if (saveError) { skipped++;continue; }
      saved++;
    }
    return Response.json({ ok: true, localDate: local.date, sitesUpdated: saved, sitesSkipped: skipped,
      policy: "Only the isolated AI Lab briefing cache was written." }, { headers: HEADERS });
  } catch {
    return Response.json({ ok: false, error: "Daily briefing update unavailable." }, { status: 503, headers: HEADERS });
  }
}
