// Privacy-preserving, descriptive read-only aggregates for user-authorised AI Lab reports.
// Never pass driver identifiers, raw rows, or customer feedback text to the model.
export const LIVE_METRICS = Object.freeze([
  ["dcr", "DCR", "percent"],
  ["pod", "POD", "percent"],
  ["iadc", "IADC", "percent"],
  ["cdf_dpmo", "CDF DPMO", "DPMO"],
  ["concessions", "Concessions (metric record)", "count"],
]);

function numeric(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) <= 10000000 ? number : null;
}

function countMetrics(rows, field, label, unit) {
  const values = rows.map(row => numeric(row?.[field])).filter(value => value !== null);
  if (!values.length) return { metric: label, unit, numericRecords: 0, unavailableRecords: rows.length };
  return {
    metric: label,
    unit,
    numericRecords: values.length,
    unavailableRecords: rows.length - values.length,
    min: Math.min(...values),
    max: Math.max(...values),
    unweightedRecordMean: Math.round(values.reduce((a, b) => a + b, 0) / values.length * 100) / 100,
  };
}

export function summarizeLiveData({ site, period, metricRows = [], feedbackRows = [], concessionRows = [], truncated = {} }) {
  if (!/^[A-Z0-9]{3,6}$/.test(site) || !/^W(?:[1-9]|[1-4][0-9]|5[0-3])(?::20\d{2}-\d{2}-\d{2})?$/.test(period)) {
    throw new Error("Choose a valid site and Amazon week label.");
  }
  if (![metricRows, feedbackRows, concessionRows].every(Array.isArray)) throw new Error("Invalid report rows.");
  const counters = new Map();
  for (const row of feedbackRows) {
    const category = String(row?.feedback_l0 || "Unspecified").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 55) || "Unspecified";
    counters.set(category, (counters.get(category) || 0) + 1);
  }
  const dnrValues = concessionRows.map(row => numeric(row?.dnr)).filter(value => value !== null);
  return {
    source: "Authenticated Supabase read-only query; existing row-level security applied",
    site,
    period,
    coverage: {
      metricRecords: metricRows.length,
      feedbackEvents: feedbackRows.length,
      concessionSnapshotRecords: concessionRows.length,
      truncated: Boolean(truncated.metrics || truncated.feedback || truncated.concessions),
    },
    metricSummaries: LIVE_METRICS.map(([field, label, unit]) => countMetrics(metricRows, field, label, unit)),
    customerFeedback: {
      records: feedbackRows.length,
      categories: [...counters].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([category, records]) => ({ category, records })),
      categoriesMayBeIncomplete: counters.size > 8,
    },
    concessions: {
      numericSnapshotRecords: dnrValues.length,
      totalDnrAcrossReturnedSnapshotRows: dnrValues.reduce((a, b) => a + b, 0),
    },
    limitations: [
      "This is a filtered, descriptive report preview, not an official site score or a live operational decision.",
      "Driver-metric source records can overlap across imports and daily/weekly periods; rows are not necessarily unique drivers.",
      "DCR, POD, IADC and CDF means are unweighted record means, never site-wide official percentages or DPMO.",
      "CDF events and DNR snapshot rows represent the available source records, not confirmed fault or final concessions.",
      "A zero source-row count means no accessible matching records; it does not prove zero incidents.",
      "When truncated is true, all counts and aggregates are partial and should not be used as totals.",
      "No driver names, Transporter IDs, parcel IDs, customer details, or raw rows were sent.",
    ],
  };
}
