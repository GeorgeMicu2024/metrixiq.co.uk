import { resolveIdentity } from "../identity.js";
import { numberOrNull } from "./metrics.js";

export async function persistImportAudit(
  supabase,
  organizationId,
  analysis,
  files = []
) {
  const fileMap = new Map((files || []).map((file) => [file.name, file]));

  const importRows = (analysis?.fileResults || []).map((result) => {
    const file = fileMap.get(result.name);

    return {
      organization_id: organizationId,
      file_name: result.name,
      file_type:
        result.type ||
        result.name?.split(".").pop()?.toLowerCase() ||
        null,
      file_size_bytes: file?.size ?? null,
      status:
        result.status === "error" || result.status === "unsupported"
          ? "failed"
          : "complete",
      detected_report_type: result.reportType || result.type || null,
      period_start: result.period?.periodStart || null,
      period_end: result.period?.periodEnd || null,
      error_message:
        result.error ||
        (result.status === "unsupported" ? "Unsupported file type" : null),
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
    const { data, error } = await supabase
      .from("imports")
      .insert(importRows)
      .select("id,file_name");

    if (error) throw error;

    for (const row of data || []) {
      importIdByFile.set(row.file_name, row.id);
    }
  }

  return {
    importRows,
    importIdByFile,
  };
}

export async function persistSiteScorecards(
  supabase,
  organizationId,
  scorecards = [],
  importIdByFile = new Map()
) {
  const rows = scorecards.map((scorecard) => ({
    organization_id: organizationId,
    source_import_id: scorecard.sourceFile
      ? importIdByFile.get(scorecard.sourceFile) || null
      : null,
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

  if (!rows.length) return 0;

  const { data, error } = await supabase
    .from("site_scorecards")
    .upsert(rows, {
      onConflict: "organization_id,site,year,week",
    })
    .select("id");

  if (error) throw error;
  return data?.length || 0;
}

export async function persistFeedbackEvents(
  supabase,
  organizationId,
  feedbackEvents = [],
  importIdByFile = new Map(),
  identityIndexes
) {
  const rows = feedbackEvents.map((event) => {
    const resolved = resolveIdentity({ trid: event.trid }, identityIndexes);
    const sourceImport = event.source
      ? importIdByFile.get(event.source) || null
      : null;

    const deliveryTime = event.deliveryTime
      ? event.deliveryTime.replace(" ", "T")
      : null;

    return {
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
      raw_data: {
        source_file: event.source || null,
      },
    };
  });

  if (!rows.length) return 0;

  const { data, error } = await supabase
    .from("feedback_events")
    .upsert(rows, {
      onConflict: "organization_id,tracking_id,feedback_date",
    })
    .select("id");

  if (error) throw error;
  return data?.length || 0;
}
