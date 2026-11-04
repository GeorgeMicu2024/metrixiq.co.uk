// AI Lab only: transparent per-driver diagnostics from RLS-authorised snapshots.
// Never include personal identifiers in a model-facing context.
const METRICS = {
  dcr: { aliases: ["dcr", "delivery completion"], min: 98, higherBetter: true, unit: "%" },
  pod: { aliases: ["pod", "photo on delivery"], min: 98, higherBetter: true, unit: "%" },
  iadc: { aliases: ["iadc", "in app", "in-app"], min: 80, higherBetter: true, unit: "%" },
  cdf_dpmo: { aliases: ["cdf", "customer feedback", "feedback"], min: 0, higherBetter: false, unit: " DPMO" },
  concessions: { aliases: ["concesii", "concession", "dnr"], min: 0, higherBetter: false, unit: "" },
};
const numeric = value => value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
const round = x => Math.round(x * 100) / 100;
const uuid = id => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id));

export function parseDriverQuestion(question) {
  const q = String(question || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  if (q.length < 5 || q.length > 500) throw new Error("Question must have 5–500 characters.");
  if (!/(cine|sofer|driver|who|which|below|under|sub\s+\d|peste\s+\d|above)/.test(q)) return null;
  const metric = Object.keys(METRICS).find(key => METRICS[key].aliases.some(alias => q.includes(alias)));
  if (!metric) return null;
  const config = METRICS[metric];
  const comparison = /(peste|mai mare|above|over|greater)/.test(q) ? "above" : "below";
  const matched = q.match(/(?:sub|below|under|peste|above|over|greater\s+than)\s*(\d{1,6}(?:\.\d{1,2})?)\s*%?/);
  const threshold = matched ? Number(matched[1]) : config.min;
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > (config.unit === "%" ? 100 : 100000)) throw new Error("Invalid metric threshold.");
  return { metric, threshold, comparison, unit: config.unit, isDefaultThreshold: !matched };
}

export function evaluateDrivers({ site, periods, metricRows = [], directory = [], query, truncated = false }) {
  if (!/^[A-Z0-9]{3,6}$/.test(site) || !Array.isArray(periods) || !periods.length || periods.length > 12) throw new Error("Invalid authorised scope.");
  const spec = typeof query === "string" ? parseDriverQuestion(query) : query;
  if (!spec || !Object.hasOwn(METRICS, spec.metric)) throw new Error("Ask a driver question naming DCR, POD, IADC, CDF or concessions.");
  const named = new Map(directory.filter(item => uuid(item.id) && item.site === site).map(item => [item.id, String(item.full_name || "Unmatched").slice(0, 90)]));
  const groups = new Map();
  for (const row of metricRows) {
    if (!uuid(row.driver_id) || !named.has(row.driver_id) || !periods.includes(row.week_label)) continue;
    const value = numeric(row[spec.metric]);
    if (value === null) continue;
    const key = row.driver_id + "|" + row.week_label;
    if (!groups.has(key)) groups.set(key, { driverId: row.driver_id, period: row.week_label, values: [] });
    groups.get(key).values.push(value);
  }
  const snapshots = [...groups.values()].map(entry => ({
    driverId: entry.driverId, period: entry.period,
    mean: round(entry.values.reduce((sum, x) => sum + x, 0) / entry.values.length),
    numericRows: entry.values.length,
  }));
  const byDriver = new Map();
  for (const row of snapshots) {
    if (!byDriver.has(row.driverId)) byDriver.set(row.driverId, []);
    byDriver.get(row.driverId).push(row);
  }
  const hits = [];
  for (const [driverId, history] of byDriver) {
    history.sort((a, b) => periods.indexOf(a.period) - periods.indexOf(b.period));
    const latest = history.at(-1), previous = history.at(-2);
    const passes = spec.comparison === "above" ? latest.mean > spec.threshold : latest.mean < spec.threshold;
    if (!passes) continue;
    hits.push({ driverName: named.get(driverId), driverId, period: latest.period,
      mean: latest.mean, previous: previous ? previous.mean : null,
      numericRows: latest.numericRows, periodsCovered: history.length });
  }
  hits.sort((a, b) => spec.comparison === "above" ? b.mean - a.mean : a.mean - b.mean);
  const context = JSON.stringify({ source: "RLS-scoped authorised driver_metrics record means", site, periods,
    metric: spec.metric, comparator: spec.comparison, threshold: spec.threshold,
    matchingDriverCount: hits.length, analysedDriverCount: byDriver.size, truncated,
    limitations: "Driver metric rows may overlap across imports; unweighted record means, not official scorecards. Names and IDs excluded; no automatic disciplinary judgment." });
  return { site, periods, criterion: spec, matches: hits.slice(0, 100), totalMatches: hits.length,
    analysedDrivers: byDriver.size, truncated, context,
    limitations: "Only drivers visible through RLS and with numeric values are included. Missing values are not zeros; overlapping imports may distort averages. This is a diagnostic screen, not a validated roster of violations." };
}
