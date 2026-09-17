
import { getSupabaseBrowserClient } from "./supabase/client";
import {
  buildIdentityIndexes,
  isUsablePersonName,
  isValidTrid,
  nameSignature,
  normalizeName,
  normalizeTrid,
  resolveIdentity,
} from "./identity";

const METRIC_FIELDS = [
  "dcr", "pod", "iadc", "cc", "fico", "ementor", "mentor_score", "psb", "reattempts",
  "concessions", "lor", "delivered", "dnr_dpmo", "dsc_dpmo", "ce_dpmo", "cdf_dpmo",
  "scorecard_score", "tier",
];

function numberOrNull(value) {
  return value == null || value === "" || Number.isNaN(Number(value)) ? null : Number(value);
}

function unionSources(a, b) {
  return [...new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])])];
}

function confidenceFor(driver) {
  const sourceCount = Array.isArray(driver?.sources) ? driver.sources.length : 0;
  const metricCount = Object.keys(driver?.rawMetrics || {}).length;
  const identityBonus = isUsablePersonName(driver?.name) ? 10 : 0;
  return Math.min(100, 55 + sourceCount * 8 + metricCount * 3 + identityBonus);
}

function performanceFrom(row) {
  const parts = [];
  if (row.dcr != null) parts.push(Math.min(105, Number(row.dcr) / 99.2 * 100));
  if (row.pod != null) parts.push(Math.min(105, Number(row.pod) / 99.6 * 100));
  if (row.iadc != null) parts.push(Math.min(105, Number(row.iadc) / 80 * 100));
  const mentor = row.mentor_score ?? row.ementor ?? row.fico;
  if (mentor != null) parts.push(Math.min(105, Number(mentor) / 815 * 100));
  return parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : null;
}

function riskFrom(row) {
  let points = 0;
  if (row.dcr != null && Number(row.dcr) < 99.2) points += 2;
  if (row.pod != null && Number(row.pod) < 99.6) points += 2;
  if (row.iadc != null && Number(row.iadc) < 80) points += 2;
  const mentor = row.mentor_score ?? row.ementor ?? row.fico;
  if (mentor != null && Number(mentor) < 815) points += 1;
  if (row.cc != null && Number(row.cc) < 99) points += 1;
  if (row.concessions != null && Number(row.concessions) >= 3) points += 2;
  return points >= 4 ? "High" : points >= 2 ? "Medium" : "Low";
}

function issueFrom(row) {
  if (row.dcr != null && Number(row.dcr) < 99.2) return "DCR below 99.20% target";
  if (row.pod != null && Number(row.pod) < 99.6) return "POD below 99.60% target";
  if (row.iadc != null && Number(row.iadc) < 80) return "IADC below 80% target";
  const mentor = row.mentor_score ?? row.ementor ?? row.fico;
  if (mentor != null && Number(mentor) < 815) return "Mentor score below 815";
  if (row.cc != null && Number(row.cc) < 99) return "Contact Compliance below 99%";
  if (row.concessions != null && Number(row.concessions) >= 3) return "Repeated concessions";
  return "No active concern";
}

function metricRowFromDriver(driver, organizationId, driverId, period, importIdByFile) {
  const raw = driver.rawMetrics || {};
  const sources = Array.isArray(driver.sources) ? driver.sources : period.sourceFiles || [];
  const firstImportId = sources.map((name) => importIdByFile.get(name)).find(Boolean) || null;
  const mentor = numberOrNull(raw.mentor_score ?? driver.mentor_score ?? driver.ementor ?? driver.fico);

  const row = {
    organization_id: organizationId,
    driver_id: driverId,
    source_import_id: firstImportId,
    period_start: period.periodStart || null,
    period_end: period.periodEnd || null,
    week_label: period.weekLabel || period.key,
    dcr: numberOrNull(raw.dcr),
    pod: numberOrNull(raw.pod),
    iadc: numberOrNull(raw.iadc),
    cc: numberOrNull(raw.cc),
    fico: mentor,
    ementor: mentor,
    mentor_score: mentor,
    psb: numberOrNull(raw.psb),
    reattempts: numberOrNull(raw.reattempts),
    concessions: numberOrNull(raw.concessions),
    lor: numberOrNull(raw.lor),
    delivered: numberOrNull(raw.delivered),
    dnr_dpmo: numberOrNull(raw.dnr_dpmo),
    dsc_dpmo: numberOrNull(raw.dsc_dpmo),
    ce_dpmo: numberOrNull(raw.ce_dpmo),
    cdf_dpmo: numberOrNull(raw.cdf_dpmo),
    scorecard_score: numberOrNull(raw.scorecard_score),
    tier: raw.tier || null,
    data_confidence: confidenceFor(driver),
    raw_data: {
      ...raw,
      dwc: raw.dwc ?? driver.dwc ?? null,
      phr: raw.phr ?? driver.phr ?? null,
      dnr: raw.dnr ?? null,
      rts: raw.rts ?? null,
      podFails: raw.podFails ?? null,
      ccFails: raw.ccFails ?? null,
      mentor: driver.details?.mentor || null,
      pod_detail: driver.details?.pod || null,
      cdf_feedback_count: driver.details?.cdfFeedbackCount ?? null,
      customer_escalation_incidents: driver.details?.customerEscalationIncidents ?? null,
      source_files: sources,
      analysis_version: "professional-v4",
    },
  };
  row.performance = performanceFrom(row);
  row.risk = riskFrom(row);
  row.issue = issueFrom(row);
  return row;
}

function mergeMetricRows(oldRow, freshRow) {
  const merged = {
    ...freshRow,
    source_import_id: freshRow.source_import_id || oldRow?.source_import_id || null,
    period_start: freshRow.period_start || oldRow?.period_start || null,
    period_end: freshRow.period_end || oldRow?.period_end || null,
    data_confidence: Math.max(numberOrNull(freshRow.data_confidence) || 0, numberOrNull(oldRow?.data_confidence) || 0) || null,
  };

  for (const field of METRIC_FIELDS) {
    if (freshRow[field] == null) merged[field] = oldRow?.[field] ?? null;
  }

  const oldRaw = oldRow?.raw_data || {};
  const freshRaw = freshRow.raw_data || {};
  merged.raw_data = {
    ...oldRaw,
    ...freshRaw,
    mentor: freshRaw.mentor || oldRaw.mentor || null,
    pod_detail: freshRaw.pod_detail || oldRaw.pod_detail || null,
    source_files: unionSources(oldRaw.source_files, freshRaw.source_files),
    analysis_version: "professional-v4",
  };
  merged.performance = performanceFrom(merged);
  merged.risk = riskFrom(merged);
  merged.issue = issueFrom(merged);
  return merged;
}

async function loadIdentityState(supabase, organizationId) {
  const [{ data: drivers, error: driverError }, { data: aliases, error: aliasError }] = await Promise.all([
    supabase.from("drivers").select("id,organization_id,trid,full_name,site,status").eq("organization_id", organizationId),
    supabase.from("driver_aliases").select("id,driver_id,alias_type,alias_value,alias_normalized,confidence,source").eq("organization_id", organizationId),
  ]);
  if (driverError) throw driverError;
  if (aliasError) throw aliasError;
  return { drivers: drivers || [], aliases: aliases || [] };
}

async function seedIdentityRecords(supabase, organizationId, identityRecords = [], sourceRecords = []) {
  const candidates = new Map();

  for (const identity of identityRecords) {
    const trid = normalizeTrid(identity.trid);
    if (!isValidTrid(trid) || !isUsablePersonName(identity.name)) continue;
    const previous = candidates.get(trid);
    if (!previous || (identity.confidence ?? 0) >= (previous.confidence ?? 0)) {
      candidates.set(trid, {
        organization_id: organizationId,
        trid,
        full_name: String(identity.name).trim(),
        site: identity.site || previous?.site || null,
        status: "active",
        source: identity.source || "identity import",
      });
    }
  }

  for (const record of sourceRecords) {
    const trid = normalizeTrid(record.id ?? record.trid);
    if (!isValidTrid(trid)) continue;
    const current = candidates.get(trid);
    if (!current) {
      candidates.set(trid, {
        organization_id: organizationId,
        trid,
        full_name: isUsablePersonName(record.name) ? record.name : "Unresolved driver",
        site: record.site && record.site !== "Unknown" ? record.site : null,
        status: "active",
        source: "metric source",
      });
    } else if ((!current.site || current.site === "Unknown") && record.site && record.site !== "Unknown") {
      current.site = record.site;
    }
  }

  if (!candidates.size) return;

  const rows = [...candidates.values()].map(({ source, ...row }) => row);
  const { data: saved, error } = await supabase
    .from("drivers")
    .upsert(rows, { onConflict: "organization_id,trid" })
    .select("id,trid,full_name,site");
  if (error) throw error;

  const identityByTrid = new Map(identityRecords.filter((r) => isValidTrid(r.trid) && isUsablePersonName(r.name)).map((r) => [normalizeTrid(r.trid), r]));
  const nameCounts = new Map();
  for (const identity of identityByTrid.values()) {
    const normalized = normalizeName(identity.name);
    const signature = nameSignature(identity.name);
    nameCounts.set(`N:${normalized}`, (nameCounts.get(`N:${normalized}`) || 0) + 1);
    nameCounts.set(`S:${signature}`, (nameCounts.get(`S:${signature}`) || 0) + 1);
  }

  const aliasRows = [];
  for (const driver of saved || []) {
    const identity = identityByTrid.get(normalizeTrid(driver.trid));
    aliasRows.push({
      organization_id: organizationId,
      driver_id: driver.id,
      alias_type: "trid",
      alias_value: driver.trid,
      alias_normalized: normalizeTrid(driver.trid),
      confidence: 1,
      source: identity?.source || "driver record",
    });

    if (identity && isUsablePersonName(identity.name)) {
      const normalized = normalizeName(identity.name);
      const signature = nameSignature(identity.name);
      if (nameCounts.get(`N:${normalized}`) === 1) {
        aliasRows.push({
          organization_id: organizationId,
          driver_id: driver.id,
          alias_type: "name",
          alias_value: identity.name,
          alias_normalized: normalized,
          confidence: 1,
          source: identity.source || "identity master",
        });
      }
      if (nameCounts.get(`S:${signature}`) === 1) {
        aliasRows.push({
          organization_id: organizationId,
          driver_id: driver.id,
          alias_type: "mentor_name",
          alias_value: identity.name,
          alias_normalized: signature,
          confidence: 0.99,
          source: identity.source || "identity master",
        });
      }
    }
  }

  if (aliasRows.length) {
    const { error: aliasError } = await supabase
      .from("driver_aliases")
      .upsert(aliasRows, { onConflict: "organization_id,alias_type,alias_normalized" });
    if (aliasError) throw aliasError;
  }
}

async function storeUnmatched(supabase, organizationId, rows) {
  if (!rows.length) return 0;
  const { data, error } = await supabase.from("unmatched_driver_records").insert(rows).select("id");
  if (error) throw error;
  return data?.length || 0;
}

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

  const unmatched = [];
  const resolvedMetricRows = [];

  for (const period of analysis?.periods || []) {
    for (const driver of period.drivers || []) {
      let resolved = resolveIdentity({ trid: driver.id, name: driver.name }, indexes);

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

      // Preserve high-confidence name variants such as Mentor display names for future imports.
      if (isUsablePersonName(driver.name) && resolved.method !== "trid") {
        const aliases = [
          {
            organization_id: organizationId,
            driver_id: resolved.driver.id,
            alias_type: "name",
            alias_value: driver.name,
            alias_normalized: normalizeName(driver.name),
            confidence: resolved.confidence,
            source: driver.sources?.[0] || "resolved import",
          },
          {
            organization_id: organizationId,
            driver_id: resolved.driver.id,
            alias_type: "mentor_name",
            alias_value: driver.name,
            alias_normalized: nameSignature(driver.name),
            confidence: resolved.confidence,
            source: driver.sources?.[0] || "resolved import",
          },
        ];
        const { error } = await supabase.from("driver_aliases").upsert(aliases, { onConflict: "organization_id,alias_type,alias_normalized" });
        if (error) throw error;
      }

      resolvedMetricRows.push(metricRowFromDriver(driver, organizationId, resolved.driver.id, period, importIdByFile));
    }
  }

  const driverIds = [...new Set(resolvedMetricRows.map((row) => row.driver_id))];
  const weekLabels = [...new Set(resolvedMetricRows.map((row) => row.week_label))];
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

  const mergedRows = resolvedMetricRows.map((fresh) => mergeMetricRows(oldMap.get(`${fresh.driver_id}|${fresh.week_label}`), fresh));
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
    unmatched: unmatchedCount,
    periods: analysis?.periods?.length || 0,
  };
}
