
import { getSupabaseBrowserClient } from "./supabase/client";
import {
  mergeMetricRows,
  metricRowFromDriver,
} from "./persistence/metrics.js";
import {
  fetchExistingMetricRows,
  upsertDriverMetricRows,
} from "./persistence/driverMetrics.js";
import {
  persistFeedbackEvents,
  persistImportAudit,
  persistSiteScorecards,
} from "./persistence/evidence.js";
import {
  loadIdentityState,
  persistMentorHashAliases,
  persistResolvedNameAliases,
  saveResolvedMentorHash,
  seedIdentityRecords,
  storeUnmatched,
} from "./persistence/identity.js";
import { persistMentorDailyAnalysis } from "./persistence/mentorDaily.js";
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

  if (analysis?.importContext?.type === "mentor-daily") {
    return persistMentorDailyAnalysis({
      supabase,
      organizationId,
      analysis,
      files,
    });
  }

  const { importRows, importIdByFile } = await persistImportAudit(
    supabase,
    organizationId,
    analysis,
    files
  );

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
          site: driver.site && driver.site !== "Unknown" ? driver.site : null,
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
  const oldMap = await fetchExistingMetricRows(
    supabase,
    organizationId,
    driverIds,
    weekLabels
  );

  const mergedRows = collapsedMetricRows.map((fresh) =>
    mergeMetricRows(
      oldMap.get(`${fresh.driver_id}|${fresh.week_label}`),
      fresh
    )
  );

  const savedMetrics = await upsertDriverMetricRows(supabase, mergedRows);

  const savedScorecards = await persistSiteScorecards(
    supabase,
    organizationId,
    analysis?.siteScorecards || [],
    importIdByFile
  );

  // Reload identities after metric drivers were seeded.
  identityState = await loadIdentityState(supabase, organizationId);
  indexes = buildIdentityIndexes(identityState.drivers, identityState.aliases);

  const savedFeedback = await persistFeedbackEvents(
    supabase,
    organizationId,
    analysis?.feedbackEvents || [],
    importIdByFile,
    indexes
  );

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
