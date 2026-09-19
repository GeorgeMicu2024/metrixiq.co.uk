import {
  buildIdentityIndexes,
  isUsablePersonName,
  isValidTrid,
  normalizeName,
  normalizeTrid,
  resolveIdentity,
} from "../identity.js";
import { persistImportAudit } from "./evidence.js";
import {
  loadIdentityState,
  persistMentorHashAliases,
  persistResolvedNameAliases,
  saveResolvedMentorHash,
  seedIdentityRecords,
  storeUnmatched,
} from "./identity.js";
import { numberOrNull } from "./metrics.js";

export async function persistMentorDailyAnalysis({
  supabase,
  organizationId,
  analysis,
  files = [],
}) {
  const reportDate = String(analysis?.importContext?.reportDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) {
    throw new Error("A valid eMentor report date is required.");
  }

  const { importRows, importIdByFile } = await persistImportAudit(
    supabase,
    organizationId,
    analysis,
    files
  );

  const allSourceDrivers = (analysis?.periods || []).flatMap(
    (period) => period.drivers || []
  );
  await seedIdentityRecords(
    supabase,
    organizationId,
    analysis?.identityRecords || [],
    allSourceDrivers
  );

  let identityState = await loadIdentityState(supabase, organizationId);
  let indexes = buildIdentityIndexes(identityState.drivers, identityState.aliases);

  const savedMentorAliases = await persistMentorHashAliases(
    supabase,
    organizationId,
    analysis?.mentorAliases || [],
    indexes
  );

  if (savedMentorAliases) {
    identityState = await loadIdentityState(supabase, organizationId);
    indexes = buildIdentityIndexes(identityState.drivers, identityState.aliases);
  }

  const unmatched = [];
  const rowsByDriver = new Map();

  for (const period of analysis?.periods || []) {
    const weekLabel =
      analysis?.importContext?.weekLabel ||
      period.weekLabel ||
      period.key ||
      "Unknown";

    for (const driver of period.drivers || []) {
      const score = numberOrNull(
        driver.mentor_score ?? driver.ementor ?? driver.fico
      );
      if (score == null) continue;

      let resolved = resolveIdentity(
        {
          trid: driver.id,
          name: driver.name,
          mentorHash: driver.mentorHash,
        },
        indexes
      );

      if (!resolved.driver && isValidTrid(driver.id)) {
        await seedIdentityRecords(supabase, organizationId, [], [driver]);
        identityState = await loadIdentityState(supabase, organizationId);
        indexes = buildIdentityIndexes(identityState.drivers, identityState.aliases);
        resolved = resolveIdentity(
          { trid: driver.id, name: driver.name, mentorHash: driver.mentorHash },
          indexes
        );
      }

      const source = driver.sources?.[0] || period.sourceFiles?.[0] || null;

      if (!resolved.driver) {
        unmatched.push({
          organization_id: organizationId,
          source_import_id: source ? importIdByFile.get(source) || null : null,
          report_type: "mentor_daily",
          week_label: weekLabel,
          raw_trid: isValidTrid(driver.id) ? normalizeTrid(driver.id) : null,
          raw_name: isUsablePersonName(driver.name) ? driver.name : null,
          normalized_name: isUsablePersonName(driver.name)
            ? normalizeName(driver.name)
            : null,
          site:
            driver.site && driver.site !== "Unknown"
              ? driver.site
              : null,
          payload: {
            reportDate,
            score,
            driver,
            period: {
              weekLabel,
              periodStart: period.periodStart,
              periodEnd: period.periodEnd,
            },
          },
          status: "open",
        });
        continue;
      }

      await saveResolvedMentorHash(
        supabase,
        organizationId,
        resolved.driver.id,
        driver
      );

      if (isUsablePersonName(driver.name) && resolved.method !== "trid") {
        await persistResolvedNameAliases(supabase, {
          organizationId,
          driverId: resolved.driver.id,
          name: driver.name,
          confidence: resolved.confidence,
          source: source || "eMentor daily report",
        });
      }

      rowsByDriver.set(resolved.driver.id, {
        organization_id: organizationId,
        driver_id: resolved.driver.id,
        source_import_id: source ? importIdByFile.get(source) || null : null,
        report_date: reportDate,
        week_label: weekLabel,
        mentor_score: score,
        raw_data: {
          mentor: driver.details?.mentor || null,
          source_files: driver.sources || period.sourceFiles || [],
          report_date: reportDate,
          import_mode: "daily",
        },
      });
    }
  }

  const rows = [...rowsByDriver.values()];
  let savedDaily = 0;

  if (rows.length) {
    const { data, error } = await supabase
      .from("mentor_daily_snapshots")
      .upsert(rows, {
        onConflict: "organization_id,driver_id,report_date",
      })
      .select("id");

    if (error) throw error;
    savedDaily = data?.length || 0;
  }

  const unmatchedCount = await storeUnmatched(
    supabase,
    organizationId,
    unmatched
  );

  return {
    savedDrivers: identityState.drivers.length,
    savedDaily,
    savedMetrics: 0,
    savedImports: importRows.length,
    savedScorecards: 0,
    savedFeedback: 0,
    savedMentorAliases,
    unmatched: unmatchedCount,
    periods: analysis?.periods?.length || 0,
  };
}
