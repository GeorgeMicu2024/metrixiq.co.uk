// Isolated, read-only matching for AI Lab. Never infer a driver/route from order.
const FIELDS = ["route", "driver", "trid", "wave", "staging", "parking", "holding", "loading"];

function value(row, field) {
  return String(row?.[field] ?? "").trim();
}

function routeKey(input) {
  return String(input ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

function tridKeys(input) {
  return [...new Set(String(input ?? "").split(/\s*[/;,]\s*/)
    .map(part => part.trim().toUpperCase()).filter(Boolean))];
}

function addIndex(index, key, rowIndex) {
  if (!key) return;
  const positions = index.get(key) || new Set();
  positions.add(rowIndex);
  index.set(key, positions);
}

function candidates(index, keys) {
  const result = new Set();
  for (const key of keys) for (const position of index.get(key) || []) result.add(position);
  return result;
}

function isPresent(row) {
  return FIELDS.some(field => value(row, field));
}

function combined(routeRow, waveRow, matchStatus) {
  const row = {};
  for (const field of FIELDS) {
    const fromWave = ["wave", "staging", "parking", "holding", "loading"].includes(field);
    row[field] = fromWave
      ? value(waveRow, field) || value(routeRow, field)
      : value(routeRow, field) || value(waveRow, field);
  }
  return { ...row, matchStatus };
}

export function mergeRouteAndWavePlans(routeRowsInput, waveRowsInput) {
  const routeRows = (routeRowsInput || []).filter(isPresent).slice(0, 1000);
  const waveRows = (waveRowsInput || []).filter(isPresent).slice(0, 1000);
  const byRoute = new Map();
  const byTrid = new Map();
  waveRows.forEach((row, index) => {
    addIndex(byRoute, routeKey(row.route), index);
    for (const trid of tridKeys(row.trid)) addIndex(byTrid, trid, index);
  });

  const used = new Set();
  const rows = [];
  let matched = 0;
  let ambiguous = 0;
  let conflicts = 0;
  let routeOnly = 0;
  for (const routeRow of routeRows) {
    const routeId = routeKey(routeRow.route);
    const routeCandidates = candidates(byRoute, routeId ? [routeId] : []);
    const tridCandidates = candidates(byTrid, tridKeys(routeRow.trid));
    let matchIndex = -1;
    let reason = "Route only";

    // Both exact identifiers must agree when present. Duplicates are never
    // resolved by row position or by picking an arbitrary first result.
    if (routeCandidates.size && tridCandidates.size) {
      const shared = [...routeCandidates].filter(index => tridCandidates.has(index));
      if (shared.length === 1) matchIndex = shared[0];
      else if (!shared.length) { conflicts++; reason = "Review: Route / TRID conflict"; }
      else { ambiguous++; reason = "Review: ambiguous identifiers"; }
    } else if (routeCandidates.size === 1) {
      matchIndex = [...routeCandidates][0];
    } else if (routeCandidates.size > 1) {
      ambiguous++; reason = "Review: duplicate route in Wave Plan";
    } else if (tridCandidates.size === 1) {
      const candidate = [...tridCandidates][0];
      const otherRoute = routeKey(waveRows[candidate].route);
      if (routeId && otherRoute && routeId !== otherRoute) {
        conflicts++; reason = "Review: different route for same TRID";
      } else matchIndex = candidate;
    } else if (tridCandidates.size > 1) {
      ambiguous++; reason = "Review: duplicate TRID in Wave Plan";
    }

    if (matchIndex >= 0) {
      const waveRow = waveRows[matchIndex];
      const waveRoute = routeKey(waveRow.route);
      const originalTrids = tridKeys(routeRow.trid);
      const waveTrids = tridKeys(waveRow.trid);
      if ((routeId && waveRoute && routeId !== waveRoute) ||
          (originalTrids.length && waveTrids.length && !originalTrids.some(key => waveTrids.includes(key)))) {
        conflicts++;
        reason = "Review: identifiers contradict";
        matchIndex = -1;
      }
    }
    if (matchIndex >= 0 && used.has(matchIndex)) {
      ambiguous++;
      reason = "Review: Wave Plan row already matched";
      matchIndex = -1;
    }
    if (matchIndex >= 0) {
      used.add(matchIndex);
      matched++;
      rows.push(combined(routeRow, waveRows[matchIndex], "Matched"));
    } else {
      routeOnly++;
      rows.push(combined(routeRow, null, reason));
    }
  }
  let waveOnly = 0;
  waveRows.forEach((row, index) => {
    if (used.has(index)) return;
    waveOnly++;
    rows.push(combined(null, row, "Wave only"));
  });
  return { rows, matched, routeOnly, waveOnly, ambiguous, conflicts,
    routeCount: routeRows.length, waveCount: waveRows.length };
}
