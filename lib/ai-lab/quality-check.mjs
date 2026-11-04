// Pure, read-only validation for the experimental AI Lab. No station writes.
export const QUALITY_PROFILES = [
  { id: "standard", label: "General · no station-specific timing" },
  { id: "DZM1", label: "DZM1 · Parking +10m Holding +15m Loading" },
];

const SEVERITIES = new Set(["high", "medium", "info"]);

function clean(value) {
  return String(value ?? "").trim();
}

function key(value) {
  return clean(value).toUpperCase().replace(/\s+/g, "");
}

function splitTrids(value) {
  return [...new Set(clean(value).toUpperCase().split(/\s*[/;,]\s*/).filter(Boolean))];
}

export function parsePlanTime(input) {
  const value = clean(input).toUpperCase();
  const match = value.match(/^(\d{1,2})[:.](\d{2})(?::\d{2})?\s*(AM|PM)?$/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (minute > 59 || hour > 23 || (match[3] && (hour < 1 || hour > 12))) return null;
  if (match[3]) hour = hour % 12 + (match[3] === "PM" ? 12 : 0);
  return hour * 60 + minute;
}

function interval(from, to) {
  return (to - from + 1440) % 1440;
}

function duplicateRouteInfo(rows) {
  const seen = new Map();
  for (const row of rows) {
    const route = key(row.route);
    if (route) seen.set(route, (seen.get(route) || 0) + 1);
  }
  return [...seen].filter(([, count]) => count > 1).map(([route]) => route);
}

function reusedTransporterCount(rows) {
  const entries = new Map();
  for (const row of rows) {
    const route = key(row.route);
    for (const trid of splitTrids(row.trid)) {
      const routes = entries.get(trid) || new Set();
      routes.add(route || "unknown-route");
      entries.set(trid, routes);
    }
  }
  return [...entries.values()].filter(routes => routes.size > 1).length;
}

export function evaluateWavePlanQuality({ routeRows = [], waveRows = [], joined = null, profile = "standard", routeMapping = {}, waveMapping = {} } = {}) {
  const findings = [];
  const routePlan = Array.isArray(routeRows) ? routeRows : [];
  const wavePlan = Array.isArray(waveRows) ? waveRows : [];
  const matchedRows = (joined?.rows || []).filter(row => row.matchStatus === "Matched");
  const usedProfile = profile === "DZM1" ? "DZM1" : "standard";

  function add(code, severity, title, count, description, examples = []) {
    if (!SEVERITIES.has(severity) || !count) return;
    findings.push({ code, severity, title, count, description, examples: examples.slice(0, 5) });
  }

  if (!routePlan.length) add("missing_route_rows", "high", "Route Plan has no usable rows", 1, "Check the selected header and Route Plan column mapping.");
  if (!wavePlan.length) add("missing_wave_rows", "high", "Wave Plan has no usable rows", 1, "Check the selected header and Wave Plan column mapping.");
  if (!Number.isInteger(routeMapping.route) && !Number.isInteger(routeMapping.trid)) {
    add("route_identity_unmapped", "high", "Route Plan needs Route ID or TRID", 1, "Map at least one reliable identifier; never match by row order.");
  }
  if (!Number.isInteger(waveMapping.route) && !Number.isInteger(waveMapping.trid)) {
    add("wave_identity_unmapped", "high", "Wave Plan needs Route ID or TRID", 1, "Map at least one reliable identifier; never match by row order.");
  }
  if (joined) {
    add("unmatched_route", "high", "Routes missing from Wave Plan", joined.routeOnly, "Review Route Plan rows without a safe match.",
      joined.rows.filter(row => row.matchStatus !== "Matched" && row.matchStatus !== "Wave only").map(row => key(row.route)).filter(Boolean));
    add("unmatched_wave", "high", "Wave rows missing from Route Plan", joined.waveOnly, "Review Wave Plan rows without a safe match.",
      joined.rows.filter(row => row.matchStatus === "Wave only").map(row => key(row.route)).filter(Boolean));
    add("conflicting_ids", "high", "Conflicting identifiers", joined.conflicts, "Route and TRID point to different assignments. Verify manually.");
    add("ambiguous_ids", "high", "Ambiguous identifiers", joined.ambiguous, "Duplicate identifiers prevent a unique safe match.");
  }

  for (const [source, rows] of [["Route Plan", routePlan], ["Wave Plan", wavePlan]]) {
    const dupRoutes = duplicateRouteInfo(rows);
    add(source === "Route Plan" ? "duplicate_route_plan" : "duplicate_wave_plan", "medium",
      "Duplicate Route IDs in " + source, dupRoutes.length, "Repeated routes may be legitimate, but must be verified.", dupRoutes);
    const reused = reusedTransporterCount(rows);
    add(source === "Route Plan" ? "trid_reused_route" : "trid_reused_wave", "medium",
      "TRIDs assigned to multiple routes in " + source, reused, "Verify whether these are planned split or rescue assignments.");
  }

  const fields = [
    ["wave", "Wave", "high"],
    ["staging", "Staging", "medium"],
    ["loading", "Loading time", "high"],
  ];
  for (const [field, title, severity] of fields) {
    if (!Number.isInteger(waveMapping[field])) {
      add("unmapped_" + field, usedProfile === "DZM1" ? "high" : "info", title + " column not mapped", 1,
        "This check is incomplete. Map the column if the source report provides it.");
      continue;
    }
    const missing = matchedRows.filter(row => !clean(row[field]));
    add("missing_" + field, severity, "Matched routes without " + title, missing.length,
      "Review blank values before relying on this plan.", missing.map(row => key(row.route)).filter(Boolean));
  }

  const badTimes = [];
  const chronology = [];
  const parkingHolding = [];
  const holdingLoading = [];
  for (const row of matchedRows) {
    const times = {};
    for (const field of ["parking", "holding", "loading"]) {
      const original = clean(row[field]);
      if (!original) continue;
      times[field] = parsePlanTime(original);
      if (times[field] === null) badTimes.push(key(row.route));
    }
    if (times.parking != null && times.holding != null) {
      const minutes = interval(times.parking, times.holding);
      if (minutes > 180 || minutes === 0) chronology.push(key(row.route));
      if (usedProfile === "DZM1" && Math.abs(minutes - 10) > 1) parkingHolding.push(key(row.route));
    }
    if (times.holding != null && times.loading != null) {
      const minutes = interval(times.holding, times.loading);
      if (minutes > 180 || minutes === 0) chronology.push(key(row.route));
      if (usedProfile === "DZM1" && Math.abs(minutes - 15) > 1) holdingLoading.push(key(row.route));
    }
  }
  add("unreadable_time", "medium", "Times that cannot be read", badTimes.length,
    "Check the original time format and mapping.", badTimes.filter(Boolean));
  add("invalid_order", "high", "Implausible parking / holding / loading order", [...new Set(chronology)].length,
    "One of the intervals is zero or longer than 3 hours; verify the sequence.", [...new Set(chronology)].filter(Boolean));
  if (usedProfile === "DZM1") {
    for (const field of ["parking", "holding", "loading"]) {
      if (!Number.isInteger(waveMapping[field])) {
        add("dzm1_unmapped_" + field, "high", "Cannot verify DZM1 " + field + " time", 1,
          "Map the time column or confirm the report supplies it.");
      }
    }
    add("dzm1_parking_holding", "high", "DZM1 Parking → Holding differs from 10 minutes", parkingHolding.length,
      "DZM1 expected interval: 10 minutes (±1 minute tolerance).", parkingHolding.filter(Boolean));
    add("dzm1_holding_loading", "high", "DZM1 Holding → Loading differs from 15 minutes", holdingLoading.length,
      "DZM1 expected interval: 15 minutes (±1 minute tolerance).", holdingLoading.filter(Boolean));
  }

  const counts = {
    routeRows: routePlan.length, waveRows: wavePlan.length, matched: matchedRows.length,
    unmatchedRoute: joined?.routeOnly ?? 0, unmatchedWave: joined?.waveOnly ?? 0,
    high: findings.filter(item => item.severity === "high").length,
    medium: findings.filter(item => item.severity === "medium").length,
    info: findings.filter(item => item.severity === "info").length,
  };
  const risk = counts.high ? "High-priority review" : counts.medium ? "Review recommended" : "No problems flagged by selected checks";
  const aiSummary = {
    source: "Browser-side AI Lab quality checks, not an official dispatch score",
    profile: usedProfile, risk, counts,
    findings: findings.slice(0, 18).map(({ code, severity, count }) => ({ code, severity, count })),
    limitations: "Source dates and sites are not independently verified; no dispatch edits. Uploaded files remain in browser.",
  };
  return { profile: usedProfile, risk, counts, findings, aiSummary };
}
