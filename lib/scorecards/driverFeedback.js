import { calculateDriverScorecard, scorecardRatio } from "./driverScoreFormula.js";

const number = (value) => {
  if (value == null || String(value).trim() === "" || ["-", "—", "N/A"].includes(String(value).trim().toUpperCase())) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
};

const format = (value, digits = 2) =>
  number(value) == null ? "—" : Number(value).toFixed(digits).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");

const percentage = (value) => {
  const ratio = scorecardRatio(value);
  return ratio == null ? "—" : (ratio * 100).toFixed(2) + "%";
};

export function scorecardActivitySite(row) {
  return String(row?.site || row?.raw_data?.activity_site || row?.drivers?.site || "").trim().toUpperCase() || "UNASSIGNED";
}

export function scorecardYear(row) {
  const match = String(row?.period_end || row?.period_start || "").match(/^(20\d{2})/);
  return match ? Number(match[1]) : null;
}

// Keep the same site-evidence cohort rule as Driver Scorecards. Other weekly
// uploads may have metrics but are not part of the official DSP scorecard.
export function isDriverScorecardCohortRow(row) {
  const files = Array.isArray(row?.raw_data?.source_files) ? row.raw_data.source_files : [];
  const site = scorecardActivitySite(row);
  const scorecardFiles = files.filter((file) => /score\s*card/i.test(String(file || "")));
  if (scorecardFiles.length) {
    return scorecardFiles.some((file) => site === "UNASSIGNED" || String(file || "").toUpperCase().includes(site));
  }
  if (files.length) return false;
  const metrics = [row?.dcr, row?.dsc_dpmo, row?.lor, row?.pod, row?.cc, row?.ce_dpmo, row?.cdf_dpmo, row?.psb]
    .filter((value) => number(value) != null).length;
  return number(row?.scorecard_score ?? row?.raw_data?.scorecard_score) != null ||
    (number(row?.delivered) != null && metrics >= 5);
}

export function collectFeedbackPeriods(rows, siteFilter = "all", allowedSites = []) {
  const groups = new Map();
  const allowed = new Set((allowedSites || []).map((site) => String(site).trim().toUpperCase()).filter(Boolean));
  const selectedSite = String(siteFilter || "all").trim().toUpperCase();
  for (const row of rows || []) {
    if (!row?.week_label || !isDriverScorecardCohortRow(row)) continue;
    const site = scorecardActivitySite(row);
    if (selectedSite !== "ALL" && site !== selectedSite) continue;
    if (allowed.size && !allowed.has(site)) continue;
    const id = String(row.driver_id || row.drivers?.id || row.drivers?.trid || "").trim();
    if (!id) continue;
    const year = scorecardYear(row);
    const key = String(year || "unknown") + "::" + row.week_label + "::" + site;
    if (!groups.has(key)) {
      groups.set(key, { key, site, weekLabel: row.week_label, year, rowsByDriver: new Map() });
    }
    const period = groups.get(key);
    const prior = period.rowsByDriver.get(id);
    const coverage = calculateDriverScorecard(row).coverage || 0;
    const previousCoverage = prior ? calculateDriverScorecard(prior).coverage || 0 : -1;
    if (!prior || coverage > previousCoverage ||
      (coverage === previousCoverage && String(row.period_end || "") > String(prior.period_end || ""))) {
      period.rowsByDriver.set(id, row);
    }
  }
  return [...groups.values()].map((period) => ({
    key: period.key,
    site: period.site,
    year: period.year,
    weekLabel: period.weekLabel,
    rows: [...period.rowsByDriver.values()],
  })).sort((a, b) => {
    if (a.year !== b.year) return Number(b.year || 0) - Number(a.year || 0);
    const weekA = Number(String(a.weekLabel).replace(/\D/g, "")) || 0;
    const weekB = Number(String(b.weekLabel).replace(/\D/g, "")) || 0;
    return weekB - weekA || a.site.localeCompare(b.site);
  });
}

export function scorecardTier(score) {
  if (number(score) == null) return { label: "No score", cls: "unrated" };
  if (score < 50) return { label: "Poor", cls: "poor" };
  if (score < 70) return { label: "Fair", cls: "fair" };
  if (score < 85) return { label: "Great", cls: "great" };
  if (score < 93) return { label: "Fantastic", cls: "fantastic" };
  return { label: "Fantastic Plus", cls: "fantastic-plus" };
}

const METRIC_GUIDANCE = Object.freeze({
  fico: {
    label: "FICO",
    threshold: 849,
    advice: "drive smoothly, follow speed limits and avoid harsh braking or phone handling while driving",
  },
  dcr: {
    label: "DCR",
    threshold: 99.9,
    advice: "complete all possible reattempts and use the correct delivery status for each parcel",
  },
  dsc_dpmo: {
    label: "DSC",
    threshold: 550,
    advice: "check delivery instructions and make sure every parcel meets the correct delivery conditions",
  },
  lor: {
    label: "LoR",
    threshold: 0,
    advice: "double-check the delivery location and safe handover; never mark an undelivered parcel as delivered",
  },
  pod: {
    label: "POD",
    threshold: 99.99,
    advice: "take clear photos of the parcel and its location, retake unclear pictures and avoid bypassing photos",
  },
  cc: {
    label: "Contact Compliance",
    threshold: 99.9,
    advice: "follow the contact workflow, use the correct NOA option and call or text customers when required",
  },
  ce_dpmo: {
    label: "Customer Escalations",
    threshold: 0,
    advice: "review customer instructions, communicate professionally and follow the required delivery process",
  },
  cdf_dpmo: {
    label: "Customer Feedback",
    threshold: 2500,
    advice: "follow customer instructions closely and choose a suitable, safe delivery location",
  },
  psb: {
    label: "Pickup Success Behaviours",
    threshold: 0,
    advice: "follow the pickup workflow, scan available parcels and report missing or not-ready parcels correctly",
  },
});

function metricDisplay(key, value) {
  return ["dcr", "pod", "cc"].includes(key) ? percentage(value) : format(value, 0);
}

function fullScoreTarget(key) {
  const guide = METRIC_GUIDANCE[key];
  if (!guide) return "";
  if (["dcr", "pod", "cc"].includes(key)) return guide.threshold.toFixed(2) + "%";
  return String(guide.threshold);
}

export function driverFeedbackIssues(row) {
  const scorecard = calculateDriverScorecard(row);
  const issues = scorecard.components
    .filter((component) => component.eligibleMaxPoints > 0 &&
      !component.missing && component.points < component.eligibleMaxPoints)
    .map((component) => {
      const guide = METRIC_GUIDANCE[component.key];
      if (!guide) return null;
      const lost = component.eligibleMaxPoints - component.points;
      return {
        key: component.key,
        label: guide.label,
        value: metricDisplay(component.key, component.value),
        lost,
        summary: guide.label + " " + metricDisplay(component.key, component.value) +
          " (full points: " + fullScoreTarget(component.key) + ")",
        action: guide.advice,
      };
    }).filter(Boolean);
  const concessions = number(row?.concessions);
  if (concessions != null && concessions > 0) {
    issues.push({
      key: "concessions",
      label: "Concessions",
      value: format(concessions, 0),
      lost: 0,
      summary: format(concessions, 0) + " recorded concession(s) — review the individual cases; they do not automatically prove driver fault",
      action: "check handover evidence, follow customer instructions and discuss any disputed cases with the manager",
    });
  }
  return issues.sort((a, b) => b.lost - a.lost || a.label.localeCompare(b.label));
}

// Operational urgency is separate from losing points in the scorecard.
// A metric can be below its full-points band while still meeting the minimum.
export function classifyDriverFeedback(row) {
  const score = calculateDriverScorecard(row).value;
  if (score == null) return "unknown";
  const fico = number(row?.mentor_score ?? row?.ementor ?? row?.fico);
  const dcr = scorecardRatio(row?.dcr);
  const pod = scorecardRatio(row?.pod);
  const cc = scorecardRatio(row?.cc);
  const dsc = number(row?.dsc_dpmo);
  const lor = number(row?.lor);
  const ce = number(row?.ce_dpmo);
  const cdf = number(row?.cdf_dpmo);
  const psb = number(row?.psb);
  const concessions = number(row?.concessions);
  const belowMinimum =
    (fico != null && fico < 815) ||
    (dcr != null && dcr < 0.992) ||
    (pod != null && pod < 0.996) ||
    (cc != null && cc < 0.98) ||
    (dsc != null && dsc > 650) ||
    (lor != null && lor > 0) ||
    (ce != null && ce > 0) ||
    (cdf != null && cdf > 4420) ||
    (psb != null && psb > 0) ||
    (concessions != null && concessions >= 3);
  if (score < 70 || belowMinimum) return "priority";
  return driverFeedbackIssues(row).length ? "improve" : "on-track";
}

export function buildDriverFeedback(row, options = {}) {
  const firstName = String(row?.drivers?.full_name || "").trim().split(/\s+/)[0] || "there";
  const week = String(options.weekLabel || row?.week_label || "this week");
  const site = String(options.site || scorecardActivitySite(row));
  const detail = options.detail === "detailed" ? "detailed" : "short";
  const tone = options.tone === "firm" ? "firm" : "professional";
  const scored = calculateDriverScorecard(row);
  const tier = scorecardTier(scored.value);
  const issues = driverFeedbackIssues(row);
  const lines = ["Hi " + firstName + ",", ""];
  if (scored.value == null) {
    lines.push("We cannot calculate a reliable driver scorecard for " + week + " at " + site + " because the report has insufficient data.");
    lines.push("Please check the missing report information with the manager. We will review the result once it is available.");
    return { message: lines.join("\n"), issues: [], score: null, tier, hasIssues: false };
  }
  lines.push("Your " + week + " scorecard at " + site + ": " + format(scored.value) + "/100 (" + tier.label + ").");
  lines.push("");
  if (!issues.length) {
    lines.push("Good work — your available scorecard metrics are in their full-points bands.");
    lines.push("Keep following delivery instructions, taking clear POD photos and driving safely.");
  } else {
    lines.push(tone === "firm" ? "These areas need to improve:" : "Please focus on these areas:");
    const selected = detail === "detailed" ? issues : issues.slice(0, 4);
    selected.forEach((issue) => {
      lines.push("• " + issue.summary + ".");
      lines.push("  Action: " + issue.action + ".");
    });
    if (issues.length > selected.length) {
      lines.push("• " + (issues.length - selected.length) + " more area(s) to review in the full scorecard.");
    }
    lines.push("");
    lines.push(tone === "firm"
      ? "Please take these points seriously and show improvement on the next scorecard."
      : "Let's work on these points and aim for a stronger result next week. Thank you.");
  }
  return { message: lines.join("\n"), issues, score: scored.value, tier, hasIssues: issues.length > 0 };
}
