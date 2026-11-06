import { isDriverScorecardCohortRow } from "../scorecards/driverFeedback.js";

// The Analyst uses the Activity Site recorded on the weekly metric, rather
// than the driver's current profile site (which can change between stations).
export function prepareAnalystEvidence(data = {}) {
  const rows = data.metricRows || [];
  const periodKey = (row) => String(row?.site || row?.raw_data?.activity_site || row?.drivers?.site || "").toUpperCase() +
    "::" + String(row?.week_label || "");
  const officialPeriods = new Set(rows.filter((row) =>
    (Array.isArray(row?.raw_data?.source_files) ? row.raw_data.source_files : [])
      .some((file) => {
        const rowSite = String(row?.site || row?.raw_data?.activity_site || "").trim().toUpperCase();
        return rowSite && /score\s*card/i.test(String(file || "")) &&
          String(file || "").toUpperCase().includes(rowSite);
      })
  ).map(periodKey));
  return {
    ...data,
    metricRows: rows.filter((row) => !officialPeriods.has(periodKey(row)) || isDriverScorecardCohortRow(row)).map((row) => {
      const activitySite = String(row?.site || row?.raw_data?.activity_site || row?.drivers?.site || "")
        .trim().toUpperCase();
      return { ...row, drivers: { ...(row.drivers || {}), site: activitySite } };
    }),
  };
}

export const OFFICIAL_METRICS = Object.freeze({
  lor: { label: "Lost on Road", short: "LoR", unit: "DPMO", better: "lower", destination: "check-lor",
    action: "Reconcile the DSP LoR result with CHECK LOR and individual scorecards. Investigate mismatches before assigning driver responsibility." },
  psb: { label: "Pickup Success Behaviours", short: "PSB", unit: "", better: "lower", destination: "site-scorecards",
    action: "Check locker and customer-return pickups, including empty lockers and yellow-sticker issues. Verify any requested PSB exception." },
  cdf_dpmo: { label: "Customer Delivery Feedback", short: "CDF", unit: "DPMO", better: "lower", destination: "cdf",
    action: "Review CDF reasons and the delivery evidence; coach the recurring issues without assuming every complaint is driver fault." },
  mentor_score: { label: "eMentor FICO", short: "FICO", unit: "", better: "higher", destination: "mentor",
    action: "Review drivers with FICO below 815 and coach safe driving. Check missing trips before interpreting a zero score." },
  dcr: { label: "Delivery Completion Rate", short: "DCR", unit: "%", better: "higher", destination: "dcr",
    action: "Review legitimate delivery failures and complete all possible residential reattempts; investigate reported access restrictions." },
  cc: { label: "Contact Compliance", short: "CC", unit: "%", better: "higher", destination: "cc",
    action: "Follow the app's contact flow at the address, including required NOA, call/text steps, notes and photos." },
  pod: { label: "Photo on Delivery", short: "POD", unit: "%", better: "higher", destination: "pod",
    action: "Take clear POD pictures at the delivery location, retake blurred photos and avoid bypassing required images." },
  dsc_dpmo: { label: "Delivery Success Conditions", short: "DSC", unit: "DPMO", better: "lower", destination: "driver-scorecards",
    action: "Review delivery conditions, handover and safe-place instructions; check the affected driver scorecards." },
  dnr_dpmo: { label: "Delivered Not Received", short: "DNR", unit: "DPMO", better: "lower", destination: "concessions",
    action: "Inspect concession evidence and dispute unsupported DNR cases. Do not presume driver fault from the site total." },
  speeding_event_rate: { label: "Speeding Event Rate", short: "Speeding", unit: "", better: "lower", destination: "mentor",
    action: "Review safe driving and speeding alerts using verified driver-level records." },
  mentor_adoption_rate: { label: "eMentor Adoption", short: "Adoption", unit: "%", better: "higher", destination: "mentor",
    action: "Check that every required driver starts and records a valid eMentor trip." },
  capacity_reliability: { label: "Capacity Reliability", short: "Capacity", unit: "%", better: "higher", destination: "site-scorecards",
    action: "Review the capacity reliability source and station-level exemptions before concluding a root cause." },
});

const STANDING_SEVERITY = Object.freeze({ Poor: 4, Fair: 3, Great: 2, Fantastic: 1, "Fantastic Plus": 0 });

function numeric(value) {
  if (value == null || typeof value === "boolean" || String(value).trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function cardOrder(card) {
  return (Number(card?.year) || 0) * 100 + (Number(card?.week) || Number(String(card?.week_label || "").replace(/\D/g, "")) || 0);
}

function cell(card, key) {
  const raw = card?.metrics?.[key];
  const value = raw && typeof raw === "object" ? raw.value : raw;
  const standing = raw && typeof raw === "object" && typeof raw.standing === "string" ? raw.standing : null;
  return { value: numeric(value), standing, available: numeric(value) != null };
}

export function metricText(value, unit = "") {
  return value == null ? "N/A" : Number(value).toLocaleString("en-GB", { maximumFractionDigits: 2 }) + unit;
}

export function officialSiteComparison(data = {}, site = "all", weekLabel = null, previousWeekLabel = null) {
  if (!site || String(site).toLowerCase() === "all") return null;
  const station = String(site).trim().toUpperCase();
  const cards = (data.scorecards || [])
    .filter((card) => String(card.site || "").toUpperCase() === station)
    .slice().sort((a, b) => cardOrder(a) - cardOrder(b));
  if (!cards.length) return null;
  const index = weekLabel ? cards.findLastIndex((card) => card.week_label === weekLabel) : cards.length - 1;
  if (index < 0) return null;
  const current = cards[index];
  const priorIndex = previousWeekLabel
    ? cards.findLastIndex((card, candidate) => candidate < index && card.week_label === previousWeekLabel)
    : index - 1;
  const previous = priorIndex >= 0 ? cards[priorIndex] : null;
  const changes = Object.entries(OFFICIAL_METRICS).map(([key, guide]) => {
    const now = cell(current, key);
    const before = cell(previous, key);
    if (!now.available && !before.available) return null;
    const delta = now.value != null && before.value != null ? Number((now.value - before.value).toFixed(4)) : null;
    let trend = "unavailable";
    if (now.available && !before.available) trend = "new";
    else if (delta != null && delta !== 0) {
      trend = (guide.better === "lower" ? delta > 0 : delta < 0) ? "worse" : "better";
    } else if (delta === 0) trend = "stable";
    const severity = STANDING_SEVERITY[now.standing] ?? 0;
    return { key, ...guide, before: before.value, current: now.value, beforeStanding: before.standing,
      standing: now.standing, delta, trend, severity,
      source: "Official DSP site scorecard" };
  }).filter(Boolean);
  const order = (a, b) => b.severity - a.severity ||
    (a.trend === "new" ? -1 : 0) - (b.trend === "new" ? -1 : 0) || a.label.localeCompare(b.label);
  const attention = changes.filter((item) => item.current != null &&
    (item.trend === "worse" || item.trend === "new") && item.severity >= 2).sort(order);
  const improving = changes.filter((item) => item.trend === "better").sort((a, b) => a.label.localeCompare(b.label));
  const score = numeric(current.overall_score);
  const previousScore = numeric(previous?.overall_score);
  const rank = numeric(current.site_rank);
  const previousRank = numeric(previous?.site_rank);
  return {
    site: station, current, previous, score, previousScore, rank, previousRank,
    delta: score != null && previousScore != null ? Number((score - previousScore).toFixed(2)) : null,
    rankDelta: rank != null && previousRank != null ? rank - previousRank : null,
    changes, attention, improving,
  };
}

export function officialMetricFact(metric) {
  if (!metric) return "";
  const previous = metricText(metric.before, metric.unit);
  const current = metricText(metric.current, metric.unit);
  const status = metric.standing && metric.standing !== "N/A" ? " · " + metric.standing : "";
  const evidenceLimit = metric.trend === "new" ? " (previous period N/A; no comparable baseline)" : "";
  return metric.short + ": " + previous + " → " + current + status + evidenceLimit;
}

// Explicit allowlist for the optional external AI explanation. Never send raw
// driver metrics, names, TRIDs, parcel IDs, feedback or incident text.
export function analystAiContext(overview = {}) {
  const official = overview.official;
  const fleet = overview.pack?.fleet || {};
  const safeCard = (card) => card ? {
    week: String(card.week_label || ""),
    score: numeric(card.overall_score),
    standing: String(card.standing || ""),
    rank: numeric(card.site_rank),
  } : null;
  return JSON.stringify({
    source: "User-selected, RLS-scoped MetrixIQ browser summary. Only officialSiteScorecard fields are imported DSP site results.",
    station: official?.site || String(overview.pack?.scope?.site || "all"),
    selectedWeek: official?.current?.week_label || String(overview.pack?.scope?.weekLabel || ""),
    officialSiteScorecard: official ? {
      current: safeCard(official.current),
      previous: safeCard(official.previous),
      scoreDelta: official.delta,
      metricComparisons: official.changes.slice(0, 15).map((metric) => ({
        metric: metric.short, previous: metric.before, current: metric.current,
        standing: metric.standing, trend: metric.trend, unit: metric.unit,
      })),
    } : null,
    driverSummaryUnweighted: {
      count: Number(fleet.drivers) || 0,
      average: numeric(fleet.averageScore),
      fairPoor: Number(fleet.fairPoor) || 0,
      ficoBelow815: Number(fleet.ficoFails) || 0,
    },
    limits: "KPI movement is not proof of weighted score contribution or driver fault. N/A is not zero. No driver-level identities or case records are shared.",
  });
}
