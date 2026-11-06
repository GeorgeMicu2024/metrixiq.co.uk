// AI Lab 360° only: shape and summarise explicitly authorised, read-only data.
// Never return driver IDs, names, TRIDs, tracking IDs, raw imports or customer text.

export const IQ_360_METRICS = Object.freeze([
  ["dcr", "DCR", "%"], ["pod", "POD", "%"], ["iadc", "IADC", "%"],
  ["psb", "PSB", ""], ["lor", "Lost on Road", "DPMO"], ["fico", "FICO", ""],
  ["cdf_dpmo", "CDF DPMO", "DPMO"], ["dnr_dpmo", "DNR DPMO", "DPMO"],
  ["mentor_score", "eMentor", ""],
]);

const toNumber = value => (typeof value === "number" || typeof value === "string" && value.trim()) &&
  Number.isFinite(Number(value)) ? Number(value) : null;
const round = value => Math.round(value * 100) / 100;
const SITE = /^[A-Z0-9]{3,6}$/;
const TIERS = new Set(["Fantastic Plus", "Fantastic", "Great", "Fair", "Poor", "N/A"]);
const tier = value => TIERS.has(value) ? value : null;

export function isoWeekRange(year, week) {
  if (!Number.isInteger(year) || year < 2020 || year > 2100 || !Number.isInteger(week) || week < 1 || week > 53) {
    throw new Error("Invalid reporting year or week.");
  }
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const monday = new Date(jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 86400000 + (week - 1) * 7 * 86400000);
  const end = new Date(monday.getTime() + 6 * 86400000);
  return { start: monday.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function cleanOfficialCard(card, year, week) {
  if (!card || Number(card.year) !== year || Number(card.week) !== week) return null;
  const metrics = Object.fromEntries(IQ_360_METRICS.map(([key, label, unit]) => {
    const input = card.metrics && typeof card.metrics === "object" ? card.metrics[key] : null;
    const value = toNumber(input?.value);
    return [key, { label, unit, value, standing: tier(input?.standing) }];
  }));
  return { year, week, score: toNumber(card.overall_score), standing: tier(card.standing),
    rank: Number.isInteger(card.site_rank) && card.site_rank > 0 ? card.site_rank : null,
    updatedAt: typeof card.updated_at === "string" ? card.updated_at.slice(0, 30) : null,
    metrics };
}

function summariseMetrics(rows) {
  const source = Array.isArray(rows) ? rows : [];
  const drivers = new Set(), imported = new Set(), dated = new Set();
  const lorValues = [];
  const stats = Object.fromEntries(["dcr", "pod", "iadc", "cdf_dpmo", "lor", "psb", "scorecard_score"].map(key => [key, { numericRows: 0, mean: null }]));
  for (const row of source) {
    if (typeof row?.driver_id === "string" && row.driver_id) drivers.add(row.driver_id);
    if (typeof row?.source_import_id === "string" && row.source_import_id) imported.add(row.source_import_id);
    if (typeof row?.period_end === "string" && row.period_end) dated.add(row.period_end);
  }
  for (const key of Object.keys(stats)) {
    const numbers = source.map(row => toNumber(row?.[key])).filter(value => value !== null);
    stats[key] = { numericRows: numbers.length,
      mean: numbers.length ? round(numbers.reduce((sum, value) => sum + value, 0) / numbers.length) : null };
    if (key === "lor") lorValues.push(...numbers);
  }
  return { rows: source.length, distinctDrivers: drivers.size, unassignedRows: source.length -
      source.filter(row => row?.driver_id).length, possibleRepeatedDriverRows: Math.max(0, source.filter(row => row?.driver_id).length - drivers.size),
    sourceImports: imported.size, periodEndDates: [...dated].sort().slice(0, 8),
    lor: { numericRows: lorValues.length, positiveRows: lorValues.filter(value => value > 0).length,
      zeroRows: lorValues.filter(value => value === 0).length }, stats };
}

export function buildConnected360({ site, year, week, card = null, metricRows = [], feedbackRows = [],
  concessionRows = [], lorCases = [], importRows = [], previousMetricRows = null, partial = {} }) {
  if (!SITE.test(String(site || ""))) throw new Error("Invalid authorised site.");
  const range = isoWeekRange(year, week);
  const metrics = summariseMetrics(metricRows);
  const official = cleanOfficialCard(card, year, week);
  const cases = Array.isArray(lorCases) ? lorCases : [];
  const imports = Array.isArray(importRows) ? importRows : [];
  const overlapping = imports.filter(item => item?.period_start && item?.period_end &&
    item.period_start <= range.end && item.period_end >= range.start);
  const completed = overlapping.filter(row => row.status === "complete").length;
  const lastImportAt = imports.map(row => typeof row?.created_at === "string" ? row.created_at : "").filter(Boolean)
    .sort().at(-1) || null;
  const officialLor = official?.metrics.lor.value ?? null;
  const mismatch = officialLor !== null && officialLor > 0 && metrics.lor.numericRows >= 3 &&
    metrics.lor.positiveRows === 0 && metrics.lor.zeroRows === metrics.lor.numericRows;
  const warnings = [];
  if (mismatch) warnings.push("Official Lost on Road value is positive, while all accessible weekly individual LoR values are zero. Metrics may use different denominators, versions or attribution; verify the original Amazon scorecard.");
  if (!official) warnings.push("No official DSP Scorecard record is available for this station/year/week.");
  if (!metrics.rows) warnings.push("No accessible weekly driver-metric rows were returned; missing rows do not imply perfect performance.");
  if (Object.values(partial).some(Boolean)) warnings.push("One or more sources reached their read limit; totals may be incomplete.");
  warnings.push("CHECK LOR history is all-time case history, not automatically attributable to the selected reporting week.");
  warnings.push("PSB exemption approvals are not stored in these sources; a scorecard value alone cannot confirm whether an exception was applied.");
  const summary = {
    source: "Super Admin-authorised RLS-scoped MetrixIQ read-only snapshots",
    site, year, week, period: `W${week}`, weekRange: range, official,
    driverMetrics: metrics,
    feedback: { rows: feedbackRows.length },
    concessions: { snapshotRows: concessionRows.length,
      dnrSnapshotSum: concessionRows.reduce((sum, row) => sum + (toNumber(row?.dnr) || 0), 0) },
    lorHistory: { scope: "All-time cases on selected site, not week-specific", cases: cases.length,
      confirmedLoss: cases.filter(row => row?.verdict === "confirmed-loss").length,
      returnedToStation: cases.filter(row => row?.verdict === "confirmed-return").length,
      needsReview: cases.filter(row => row?.verdict !== "confirmed-loss" && row?.verdict !== "confirmed-return").length },
    imports: { rowsAvailable: imports.length, overlappingPeriod: overlapping.length,
      completedForPeriod: completed, lastImportedAt: lastImportAt },
    previousMetricRows: Number.isSafeInteger(previousMetricRows) && previousMetricRows >= 0 ? previousMetricRows : null,
    partial: Boolean(partial.metrics || partial.feedback || partial.concessions || partial.lor || partial.imports),
    mismatch, warnings,
  };
  // Downstream AI must receive only a compact allowlisted summary, never source rows or identifiers.
  return summary;
}

export function connected360ChatContext(snapshot, doctor, briefing, previousOfficial = null) {
  if (!snapshot || !doctor || !briefing || snapshot.site !== briefing.site) throw new Error("Matching evidence is required.");
  const payload = {
    source: "Super Admin-approved Connected 360° RLS-scoped read-only source evidence",
    site: snapshot.site, year: snapshot.year, week: snapshot.week,
    official: snapshot.official ? {
      overallScore: snapshot.official.score, tier: snapshot.official.standing, rank: snapshot.official.rank,
      metrics: snapshot.official.metrics,
    } : null,
    previousOfficial: previousOfficial && Number.isInteger(previousOfficial.year) &&
      Number.isInteger(previousOfficial.week) && previousOfficial.score != null &&
      Number.isFinite(Number(previousOfficial.score))
      ? { year: previousOfficial.year, week: previousOfficial.week,
        overallScore: Number(previousOfficial.score), tier: String(previousOfficial.standing || "").slice(0, 35),
        metrics: Object.fromEntries(IQ_360_METRICS.flatMap(([key, label, unit]) => {
          const raw = previousOfficial.metrics?.[key]?.value;
          const value = toNumber(raw);
          return value == null ? [] : [[key, { label, unit, value }]];
        })) } : null,
    weeklyMetrics: Object.fromEntries(Object.entries(snapshot.driverMetrics.stats).map(([key, row]) =>
      [key, { numericRows: row.numericRows, unweightedMean: row.mean }])),
    coverage: { metricRows: snapshot.driverMetrics.rows, uniqueDrivers: snapshot.driverMetrics.distinctDrivers,
      previousMetricRows: snapshot.previousMetricRows, feedbackEvents: snapshot.feedback.rows,
      concessionSnapshotRows: snapshot.concessions.snapshotRows, lorAllTimeCases: snapshot.lorHistory.cases,
      matchingImportPeriodRecords: snapshot.imports.overlappingPeriod, partial: snapshot.partial },
    dataQuality: doctor.issues.slice(0, 8).map(issue => ({ code: issue.code, evidence: issue.evidence })),
    priorities: briefing.priorities.map(item => ({ id: item.id, title: item.title, evidence: item.evidence, next: item.next })),
    limitations: ["Official DSP metrics are not the same as unweighted driver record means.",
      "CHECK LOR history is all-time and does not establish selected-week parcel losses.",
      "PSB exception approvals are unavailable. Do not infer an approved exemption or recalculated score.",
      "No driver names, TRIDs, parcel IDs or raw customer details included."],
  };
  // Stay safely below the existing AI Lab chat limit without cutting JSON.
  while (JSON.stringify(payload).length > 5600 && payload.priorities.length > 1) payload.priorities.pop();
  return JSON.stringify(payload);
}
