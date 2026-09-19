import { aggregateRootCauses, rootCauseForRow } from "../intelligence/rootCause.js";

const TIER_ORDER = Object.freeze(["Fantastic Plus","Fantastic","Great","Fair","Poor","Unrated"]);

function n(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pct(value) {
  const parsed = n(value);
  if (parsed == null) return null;
  return parsed > 0 && parsed <= 1 ? parsed * 100 : parsed;
}

function weekNumber(label) {
  const match = String(label || "").match(/W\s*(\d{1,2})/i);
  return match ? Number(match[1]) : null;
}

function rowOrder(row) {
  const date = row?.period_end || row?.period_start;
  if (date) {
    const parsed = new Date(date + "T12:00:00Z");
    if (Number.isFinite(parsed.getTime())) return parsed.getTime();
  }
  return (weekNumber(row?.week_label) || 0) * 604800000;
}

export function availableWeeks(data = {}, site = "all") {
  const labels = new Set();
  for (const row of data.metricRows || []) {
    const rowSite = String(row?.drivers?.site || "").toUpperCase();
    if (site !== "all" && rowSite !== String(site).toUpperCase()) continue;
    if (row.week_label) labels.add(row.week_label);
  }
  for (const row of data.scorecards || []) {
    if (site !== "all" && String(row.site || "").toUpperCase() !== String(site).toUpperCase()) continue;
    if (row.week_label) labels.add(row.week_label);
  }
  return [...labels].sort((a, b) => (weekNumber(a) || 0) - (weekNumber(b) || 0));
}

function scopedMetricRows(data, site, weekLabel) {
  return (data.metricRows || []).filter((row) => {
    const rowSite = String(row?.drivers?.site || "").toUpperCase();
    if (site !== "all" && rowSite !== String(site).toUpperCase()) return false;
    if (weekLabel && row.week_label !== weekLabel) return false;
    return true;
  });
}

function latestPerDriver(rows = []) {
  const map = new Map();
  for (const row of rows) {
    const current = map.get(row.driver_id);
    if (!current || rowOrder(row) > rowOrder(current)) map.set(row.driver_id, row);
  }
  return [...map.values()];
}

function previousForDriver(allRows, row) {
  return allRows
    .filter((item) => item.driver_id === row.driver_id && rowOrder(item) < rowOrder(row))
    .sort((a, b) => rowOrder(b) - rowOrder(a))[0] || null;
}

function movementRows(allRows, currentRows) {
  return currentRows.map((row) => {
    const current = rootCauseForRow(row);
    const previousRow = previousForDriver(allRows, row);
    const previous = previousRow ? rootCauseForRow(previousRow) : null;
    const delta = current.score != null && previous?.score != null ? current.score - previous.score : null;
    return {
      driver_id: row.driver_id,
      driver_name: row.drivers?.full_name || "Driver",
      trid: row.drivers?.trid || "",
      site: row.drivers?.site || "",
      week_label: row.week_label,
      score: current.score,
      tier: current.tier,
      previous_week: previousRow?.week_label || null,
      previous_score: previous?.score ?? null,
      delta,
      points_lost: current.pointsLost,
      primary_cause: current.primary?.label || null,
      fico: n(row.mentor_score ?? row.ementor ?? row.fico),
      dcr: pct(row.dcr),
      pod: pct(row.pod),
      cc: pct(row.cc),
      concessions: n(row.concessions) || 0,
    };
  });
}

function filterSite(items, site) {
  if (site === "all") return items || [];
  return (items || []).filter((item) =>
    !item.site || String(item.site).toUpperCase() === String(site).toUpperCase()
  );
}

function filterWeek(items, weekLabel) {
  if (!weekLabel) return items || [];
  return (items || []).filter((item) => !item.week_label || item.week_label === weekLabel);
}

function siteCard(data, site, weekLabel) {
  const cards = (data.scorecards || []).filter((card) => {
    if (site !== "all" && String(card.site || "").toUpperCase() !== String(site).toUpperCase()) return false;
    if (weekLabel && card.week_label !== weekLabel) return false;
    return true;
  });
  if (site === "all") return null;
  return cards.sort((a,b)=>(a.year*100+a.week)-(b.year*100+b.week)).at(-1) || null;
}

function previousSiteCard(data, current) {
  if (!current) return null;
  return (data.scorecards || [])
    .filter((card) => card.site === current.site && (card.year*100+card.week) < (current.year*100+current.week))
    .sort((a,b)=>(b.year*100+b.week)-(a.year*100+a.week))[0] || null;
}

function tierDistribution(movement) {
  const result = Object.fromEntries(TIER_ORDER.map((tier) => [tier, 0]));
  for (const row of movement) result[row.tier] = (result[row.tier] || 0) + 1;
  return result;
}

function average(values) {
  const valid = values.map(n).filter((value) => value != null);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

function actionPlan({ rootCauses, ficoFails, fairPoor, incidents, coaching, unmatched, failedImports }) {
  const actions = [];
  if (rootCauses.primary?.affectedDrivers) {
    actions.push({
      severity: rootCauses.primary.affectedDrivers >= 10 ? "high" : "medium",
      title: "Recover " + rootCauses.primary.label + " scorecard points",
      detail: rootCauses.primary.affectedDrivers + " driver" + (rootCauses.primary.affectedDrivers === 1 ? "" : "s") + " are losing points on " + rootCauses.primary.label + ".",
      destination: "driver-scorecards",
    });
  }
  if (ficoFails.length) actions.push({
    severity: ficoFails.length >= 5 ? "high" : "medium",
    title: "Review FICO below 815",
    detail: ficoFails.length + " driver" + (ficoFails.length === 1 ? "" : "s") + " are below the 815 management threshold.",
    destination: "coaching",
  });
  if (fairPoor.length) actions.push({
    severity: fairPoor.some((row) => row.tier === "Poor") ? "high" : "medium",
    title: "Prioritise Fair / Poor scorecards",
    detail: fairPoor.length + " driver" + (fairPoor.length === 1 ? "" : "s") + " require scorecard recovery review.",
    destination: "manager-control",
  });
  if (incidents.some((item) => ["critical","high"].includes(item.severity) && !["resolved","closed"].includes(item.status))) actions.push({
    severity: "high", title: "Resolve high-severity incidents",
    detail: incidents.filter((item) => ["critical","high"].includes(item.severity) && !["resolved","closed"].includes(item.status)).length + " high / critical operational investigations remain open.",
    destination: "evidence",
  });
  if (coaching.some((item) => item.status !== "closed" && item.due_at && new Date(item.due_at) < new Date())) actions.push({
    severity: "high", title: "Clear overdue coaching",
    detail: coaching.filter((item) => item.status !== "closed" && item.due_at && new Date(item.due_at) < new Date()).length + " coaching cases are overdue.",
    destination: "coaching",
  });
  if (unmatched.length) actions.push({
    severity: unmatched.length >= 10 ? "high" : "medium", title: "Resolve unmatched evidence",
    detail: unmatched.length + " imported record" + (unmatched.length === 1 ? "" : "s") + " still lack a trusted driver identity.",
    destination: "data-quality",
  });
  if (failedImports.length) actions.push({
    severity: "high", title: "Review failed imports",
    detail: failedImports.length + " recent import" + (failedImports.length === 1 ? "" : "s") + " failed or contain an error.",
    destination: "imports",
  });
  return actions.slice(0, 8);
}

export function buildExecutivePack(data = {}, {
  site = "all",
  weekLabel = null,
  driverIds = null,
  sections = null,
} = {}) {
  const allScopedRows = scopedMetricRows(data, site, null);
  const currentRaw = scopedMetricRows(data, site, weekLabel);
  let currentRows = latestPerDriver(currentRaw);
  if (Array.isArray(driverIds)) currentRows = currentRows.filter((row) => driverIds.includes(row.driver_id));

  const movement = movementRows(allScopedRows, currentRows);
  const rootCauses = aggregateRootCauses(currentRows);
  const tiers = tierDistribution(movement);
  const currentCard = siteCard(data, site, weekLabel);
  const previousCard = previousSiteCard(data, currentCard);
  const siteScoreDelta = currentCard?.overall_score != null && previousCard?.overall_score != null
    ? Number(currentCard.overall_score) - Number(previousCard.overall_score)
    : null;

  const incidents = filterWeek(filterSite(data.incidents || [], site), weekLabel);
  const coaching = filterSite(data.coaching || [], site);
  const feedback = filterWeek(filterSite(data.feedback || [], site), weekLabel);
  const tasks = filterWeek(filterSite(data.tasks || [], site), weekLabel);
  const unmatched = filterWeek(filterSite(data.unmatched || [], site), weekLabel);
  const failedImports = (data.imports || []).filter((item) => item.status === "failed" || item.error_message);

  const ficoFails = movement.filter((row) => row.fico != null && row.fico < 815);
  const fairPoor = movement.filter((row) => row.tier === "Fair" || row.tier === "Poor");
  const concessions = movement.filter((row) => row.concessions > 0).sort((a,b)=>b.concessions-a.concessions);
  const improved = movement.filter((row) => row.delta != null && row.delta > 0).sort((a,b)=>b.delta-a.delta);
  const declined = movement.filter((row) => row.delta != null && row.delta < 0).sort((a,b)=>a.delta-b.delta);

  const averages = {
    score: average(movement.map((row) => row.score)),
    fico: average(movement.map((row) => row.fico)),
    dcr: average(movement.map((row) => row.dcr)),
    pod: average(movement.map((row) => row.pod)),
    cc: average(movement.map((row) => row.cc)),
    concessions: movement.reduce((sum,row)=>sum+(row.concessions||0),0),
  };

  const actions = actionPlan({ rootCauses, ficoFails, fairPoor, incidents, coaching, unmatched, failedImports });

  const headline = currentCard
    ? currentCard.site + " " + currentCard.week_label + ": " + (currentCard.standing || "site scorecard") + (siteScoreDelta == null ? "" : " · " + (siteScoreDelta > 0 ? "+" : "") + siteScoreDelta.toFixed(2) + " WoW")
    : (site === "all" ? "Workspace" : site) + " " + (weekLabel || "latest") + ": " + movement.length + " drivers in scorecard scope";

  const summaryParts = [
    averages.score == null ? null : "Average driver score " + averages.score.toFixed(1) + "/100.",
    fairPoor.length ? fairPoor.length + " Fair/Poor driver" + (fairPoor.length === 1 ? "" : "s") + "." : "No Fair/Poor drivers in scope.",
    ficoFails.length ? ficoFails.length + " FICO result" + (ficoFails.length === 1 ? "" : "s") + " below 815." : "No FICO results below 815.",
    rootCauses.primary ? rootCauses.primary.label + " is the largest aggregated point-loss component." : null,
  ].filter(Boolean);

  return {
    generatedAt: new Date().toISOString(),
    scope: {
      site,
      weekLabel: weekLabel || movement[0]?.week_label || "Latest",
      driverIds: driverIds || [],
      sections: sections || [],
    },
    headline,
    summary: summaryParts.join(" "),
    siteScorecard: currentCard ? {
      site: currentCard.site,
      weekLabel: currentCard.week_label,
      overallScore: n(currentCard.overall_score),
      standing: currentCard.standing,
      rank: currentCard.site_rank,
      previousWeek: previousCard?.week_label || null,
      previousScore: n(previousCard?.overall_score),
      delta: siteScoreDelta,
      focusAreas: currentCard.focus_areas || [],
    } : null,
    fleet: {
      drivers: movement.length,
      averageScore: averages.score,
      tierDistribution: tiers,
      fairPoor: fairPoor.length,
      ficoFails: ficoFails.length,
      concessions: averages.concessions,
      improved: improved.length,
      declined: declined.length,
    },
    averages,
    rootCauses,
    movement,
    improved: improved.slice(0, 10),
    declined: declined.slice(0, 10),
    ficoFails: ficoFails.sort((a,b)=>(a.fico??999)-(b.fico??999)),
    concessions: concessions.slice(0, 20),
    incidents: {
      all: incidents,
      open: incidents.filter((item) => !["resolved","closed"].includes(item.status)),
      high: incidents.filter((item) => ["high","critical"].includes(item.severity) && !["resolved","closed"].includes(item.status)),
    },
    coaching: {
      all: coaching,
      open: coaching.filter((item) => item.status !== "closed"),
      overdue: coaching.filter((item) => item.status !== "closed" && item.due_at && new Date(item.due_at) < new Date()),
    },
    evidence: {
      feedbackCount: feedback.length,
      dnrCount: feedback.filter((item) => item.dnr_concession).length,
      scanOver25m: feedback.filter((item) => item.scanned_over_25m).length,
      unresolved: unmatched.length,
    },
    operations: {
      openTasks: tasks.filter((item) => !["done","dismissed"].includes(item.status)),
      failedImports,
    },
    actions,
  };
}

function lineValue(value, suffix = "") {
  return value == null ? "—" : (Number.isFinite(Number(value)) ? Number(value).toFixed(2).replace(/\.00$/,"") : value) + suffix;
}

export function formatExecutivePackWhatsApp(pack) {
  const lines = [
    "*METRIXIQ WEEKLY EXECUTIVE PACK*",
    "*" + pack.scope.site.toUpperCase() + " · " + pack.scope.weekLabel + "*",
    "",
    pack.headline,
    pack.summary,
    "",
    "*SCORECARD*",
    "Drivers: " + pack.fleet.drivers,
    "Average score: " + lineValue(pack.fleet.averageScore) + "/100",
    "Fair/Poor: " + pack.fleet.fairPoor,
    "FICO <815: " + pack.fleet.ficoFails,
    "Concessions: " + pack.fleet.concessions,
    "",
    "*ROOT CAUSES*",
  ];

  (pack.rootCauses.causes || []).slice(0, 4).forEach((item, index) => {
    lines.push((index + 1) + ". " + item.label + " — " + item.pointsLost.toFixed(1) + " pts lost · " + item.affectedDrivers + " drivers");
  });

  lines.push("", "*OPERATIONS*",
    "Open incidents: " + pack.incidents.open.length,
    "High/Critical incidents: " + pack.incidents.high.length,
    "Open coaching: " + pack.coaching.open.length,
    "Overdue coaching: " + pack.coaching.overdue.length,
    "Unmatched evidence: " + pack.evidence.unresolved,
    "",
    "*NEXT ACTIONS*"
  );

  pack.actions.slice(0, 5).forEach((action, index) => {
    lines.push((index + 1) + ". " + action.title + " — " + action.detail);
  });

  return lines.join("\n");
}

export function executivePackCsvRows(pack) {
  const rows = [];
  for (const row of pack.movement) {
    rows.push({
      section: "driver_scorecard",
      site: row.site,
      week: row.week_label,
      trid: row.trid,
      driver: row.driver_name,
      total_score: row.score,
      tier: row.tier,
      wow_delta: row.delta,
      fico: row.fico,
      dcr: row.dcr,
      pod: row.pod,
      cc: row.cc,
      concessions: row.concessions,
      points_lost: row.points_lost,
      primary_cause: row.primary_cause,
    });
  }
  for (const item of pack.rootCauses.causes || []) {
    rows.push({
      section: "root_cause",
      site: pack.scope.site,
      week: pack.scope.weekLabel,
      metric: item.label,
      points_lost: item.pointsLost,
      affected_drivers: item.affectedDrivers,
      missing_drivers: item.missingDrivers,
    });
  }
  return rows;
}
