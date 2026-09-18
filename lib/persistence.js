
import { getSupabaseBrowserClient } from "./supabase/client";
import {
  mergeMetricRows,
  metricRowFromDriver,
  numberOrNull,
} from "./persistence/metrics.js";
import {
  loadIdentityState,
  persistMentorHashAliases,
  persistResolvedNameAliases,
  saveResolvedMentorHash,
  seedIdentityRecords,
  storeUnmatched,
} from "./persistence/identity.js";
import {
  buildIdentityIndexes,
  isUsablePersonName,
  isValidTrid,
  normalizeName,
  normalizeTrid,
  resolveIdentity,
} from "./identity";

export async function persistAnalysis({ organizationId, analysis, files = [] }) {
  if (!organizationId) throw new Error("Workspace organisation is missing.");
  const supabase = getSupabaseBrowserClient();

  const fileMap = new Map((files || []).map((file) => [file.name, file]));
  const importRows = (analysis?.fileResults || []).map((result) => {
    const file = fileMap.get(result.name);
    return {
      organization_id: organizationId,
      file_name: result.name,
      file_type: result.type || result.name?.split(".").pop()?.toLowerCase() || null,
      file_size_bytes: file?.size ?? null,
      status: result.status === "error" || result.status === "unsupported" ? "failed" : "complete",
      detected_report_type: result.reportType || result.type || null,
      period_start: result.period?.periodStart || null,
      period_end: result.period?.periodEnd || null,
      error_message: result.error || (result.status === "unsupported" ? "Unsupported file type" : null),
      metadata: {
        recognised: !!result.recognized,
        rows: result.rows || 0,
        period_key: result.period?.key || null,
        week_label: result.period?.weekLabel || null,
      },
      completed_at: new Date().toISOString(),
    };
  });

  const importIdByFile = new Map();
  if (importRows.length) {
    const { data, error } = await supabase.from("imports").insert(importRows).select("id,file_name");
    if (error) throw error;
    for (const row of data || []) importIdByFile.set(row.file_name, row.id);
  }

  const allSourceDrivers = (analysis?.periods || []).flatMap((period) => period.drivers || []);
  await seedIdentityRecords(supabase, organizationId, analysis?.identityRecords || [], allSourceDrivers);

  let identityState = await loadIdentityState(supabase, organizationId);
  let indexes = buildIdentityIndexes(identityState.drivers, identityState.aliases);

  const savedMentorAliases = await persistMentorHashAliases(supabase, organizationId, analysis?.mentorAliases || [], indexes);
  if (savedMentorAliases) {
    identityState = await loadIdentityState(supabase, organizationId);
    indexes = buildIdentityIndexes(identityState.drivers, identityState.aliases);
  }

  const unmatched = [];
  const resolvedMetricRows = [];

  for (const period of analysis?.periods || []) {
    for (const driver of period.drivers || []) {
      let resolved = resolveIdentity({ trid: driver.id, name: driver.name, mentorHash: driver.mentorHash }, indexes);

      if (!resolved.driver && isValidTrid(driver.id)) {
        // A TRID always gets its own driver row; it remains visibly unresolved until a trusted name arrives.
        await seedIdentityRecords(supabase, organizationId, [], [driver]);
        identityState = await loadIdentityState(supabase, organizationId);
        indexes = buildIdentityIndexes(identityState.drivers, identityState.aliases);
        resolved = resolveIdentity({ trid: driver.id, name: driver.name }, indexes);
      }

      if (!resolved.driver) {
        const source = driver.sources?.[0] || period.sourceFiles?.[0] || null;
        unmatched.push({
          organization_id: organizationId,
          source_import_id: source ? importIdByFile.get(source) || null : null,
          report_type: "driver_metric",
          week_label: period.weekLabel,
          raw_trid: isValidTrid(driver.id) ? normalizeTrid(driver.id) : null,
          raw_name: isUsablePersonName(driver.name) ? driver.name : null,
          normalized_name: isUsablePersonName(driver.name) ? normalizeName(driver.name) : null,
          payload: { driver, period: { weekLabel: period.weekLabel, periodStart: period.periodStart, periodEnd: period.periodEnd } },
          status: "open",
        });
        continue;
      }

      // Remember the encrypted Mentor identity key after a successful match so future
      // VRM/eMentor reports can be imported without re-uploading the alias master.
      await saveResolvedMentorHash(supabase, organizationId, resolved.driver.id, driver);

      // Preserve high-confidence name variants such as Mentor display names for future imports.
      if (isUsablePersonName(driver.name) && resolved.method !== "trid") {
        await persistResolvedNameAliases(supabase, {
          organizationId,
          driverId: resolved.driver.id,
          name: driver.name,
          confidence: resolved.confidence,
          source: driver.sources?.[0] || "resolved import",
        });
      }

      resolvedMetricRows.push(metricRowFromDriver(driver, organizationId, resolved.driver.id, period, importIdByFile));
    }
  }

  // Multiple source files can contribute to the same driver/week (for example Scorecard +
  // Mentor + POD). Collapse them before the database upsert so Postgres never receives
  // duplicate conflict keys in one statement.
  const freshMap = new Map();
  for (const row of resolvedMetricRows) {
    const key = `${row.driver_id}|${row.week_label}`;
    const current = freshMap.get(key);
    freshMap.set(key, current ? mergeMetricRows(current, row) : row);
  }
  const collapsedMetricRows = [...freshMap.values()];

  const driverIds = [...new Set(collapsedMetricRows.map((row) => row.driver_id))];
  const weekLabels = [...new Set(collapsedMetricRows.map((row) => row.week_label))];
  const oldMap = new Map();

  if (driverIds.length && weekLabels.length) {
    const { data, error } = await supabase
      .from("driver_metrics")
      .select("id,driver_id,week_label,source_import_id,period_start,period_end,performance,dcr,pod,iadc,cc,fico,ementor,mentor_score,psb,reattempts,concessions,lor,delivered,dnr_dpmo,dsc_dpmo,ce_dpmo,cdf_dpmo,scorecard_score,tier,risk,issue,data_confidence,raw_data")
      .eq("organization_id", organizationId)
      .in("driver_id", driverIds)
      .in("week_label", weekLabels);
    if (error) throw error;
    for (const row of data || []) oldMap.set(`${row.driver_id}|${row.week_label}`, row);
  }

  const mergedRows = collapsedMetricRows.map((fresh) => mergeMetricRows(oldMap.get(`${fresh.driver_id}|${fresh.week_label}`), fresh));
  let savedMetrics = 0;
  if (mergedRows.length) {
    const { data, error } = await supabase
      .from("driver_metrics")
      .upsert(mergedRows, { onConflict: "organization_id,driver_id,week_label" })
      .select("id");
    if (error) throw error;
    savedMetrics = data?.length || 0;
  }

  // Persist site-level weekly scorecards.
  const siteRows = (analysis?.siteScorecards || []).map((scorecard) => ({
    organization_id: organizationId,
    source_import_id: scorecard.sourceFile ? importIdByFile.get(scorecard.sourceFile) || null : null,
    site: scorecard.site || "Unknown",
    year: scorecard.year,
    week: scorecard.week,
    week_label: scorecard.weekLabel,
    overall_score: numberOrNull(scorecard.overallScore),
    standing: scorecard.standing || null,
    site_rank: scorecard.siteRank ?? null,
    rank_delta: scorecard.rankDelta ?? null,
    safety_standing: scorecard.safetyStanding || null,
    delivery_quality_standing: scorecard.deliveryQualityStanding || null,
    capacity_standing: scorecard.capacityStanding || null,
    pickup_quality_standing: scorecard.pickupQualityStanding || null,
    metrics: scorecard.metrics || {},
    focus_areas: scorecard.focusAreas || [],
    source_file: scorecard.sourceFile || null,
    updated_at: new Date().toISOString(),
  }));

  let savedScorecards = 0;
  if (siteRows.length) {
    const { data, error } = await supabase
      .from("site_scorecards")
      .upsert(siteRows, { onConflict: "organization_id,site,year,week" })
      .select("id");
    if (error) throw error;
    savedScorecards = data?.length || 0;
  }

  // Reload identities after metric drivers were seeded.
  identityState = await loadIdentityState(supabase, organizationId);
  indexes = buildIdentityIndexes(identityState.drivers, identityState.aliases);

  const feedbackRows = [];
  for (const event of analysis?.feedbackEvents || []) {
    const resolved = resolveIdentity({ trid: event.trid }, indexes);
    const sourceImport = event.source ? importIdByFile.get(event.source) || null : null;
    const deliveryTime = event.deliveryTime
      ? event.deliveryTime.replace(" ", "T")
      : null;
    feedbackRows.push({
      organization_id: organizationId,
      driver_id: resolved.driver?.id || null,
      source_import_id: sourceImport,
      site: event.site || null,
      year: event.period?.year ?? null,
      week: event.period?.week ?? null,
      week_label: event.period?.weekLabel ?? null,
      tracking_id: event.trackingId,
      trid_raw: event.trid || null,
      feedback_l0: event.feedbackL0 || null,
      feedback_l1: event.feedbackL1 || null,
      feedback_l2: event.feedbackL2 || null,
      feedback_date: event.feedbackDate || null,
      delivery_time: deliveryTime,
      city: event.city || null,
      postal_code: event.postalCode || null,
      contact_compliance: event.contactCompliance || null,
      phr_compliance: event.phrCompliance || null,
      phr_safe_place: event.phrSafePlace || null,
      phr_delivery_location: event.phrDeliveryLocation || null,
      scanned_over_25m: !!event.scannedOver25m,
      dnr_concession: !!event.dnrConcession,
      raw_data: { source_file: event.source || null },
    });
  }

  let savedFeedback = 0;
  if (feedbackRows.length) {
    const { data, error } = await supabase
      .from("feedback_events")
      .upsert(feedbackRows, { onConflict: "organization_id,tracking_id,feedback_date" })
      .select("id");
    if (error) throw error;
    savedFeedback = data?.length || 0;
  }

  const unmatchedCount = await storeUnmatched(supabase, organizationId, unmatched);

  return {
    savedDrivers: identityState.drivers.length,
    savedMetrics,
    savedImports: importRows.length,
    savedScorecards,
    savedFeedback,
    savedMentorAliases,
    unmatched: unmatchedCount,
    periods: analysis?.periods?.length || 0,
  };
}
