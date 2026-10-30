import test from "node:test";
import assert from "node:assert/strict";
import {
  fetchDriverScorecardData,
  fetchDriverFeedbackScorecardRows,
} from "../lib/data/scorecardData.js";

function createScorecardClient() {
  const metrics = [
    ...Array.from({ length: 2105 }, (_, i) => ({
      id: String(i).padStart(5, "0"),
      week_label: "W43",
      raw_data: { metric_granularity: "weekly" },
      period_end: "2026-10-25",
    })),
    ...Array.from({ length: 1500 }, (_, i) => ({
      id: "daily-" + i,
      week_label: "W43:2026-10-25",
      raw_data: { metric_granularity: "daily" },
      period_end: "2026-10-25",
    })),
  ];
  const metricPages = [];
  const client = {
    from(table) {
      const filters = [];
      let includeCount = false;
      const builder = {
        select(_columns, options) { includeCount = options?.count === "exact"; return this; },
        eq(column, value) { filters.push(["eq", column, value]); return this; },
        like(column, value) { filters.push(["like", column, value]); return this; },
        not(column, operator, value) { filters.push(["not", column, operator, value]); return this; },
        order() { return this; },
        range(from, to) {
          const matching = metrics.filter((row) => filters.every((f) => {
            if (f[0] === "eq") return f[1] !== "organization_id" || f[2] === "org-test";
            if (f[0] === "like") return row[f[1]].startsWith("W");
            if (f[0] === "not") return !row[f[1]].includes(":");
            return true;
          }));
          metricPages.push([from, to]);
          return Promise.resolve({
            data: matching.slice(from, to + 1),
            count: includeCount ? matching.length : null,
            error: null,
          });
        },
        then(resolve, reject) {
          const cards = table === "site_scorecards"
            ? [{ site: "DZM1", week_label: "W43", year: 2026 }]
            : [];
          return Promise.resolve({ data: cards, error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
  return { client, metricPages };
}

test("Driver Scorecards loads the full weekly archive without daily imports", async () => {
  const { client, metricPages } = createScorecardClient();
  const result = await fetchDriverScorecardData(client, "org-test");
  assert.equal(result.cards.length, 1);
  assert.equal(result.rows.length, 2105);
  assert.equal(new Set(result.rows.map((row) => row.id)).size, 2105);
  assert.equal(result.rows.some((row) => row.week_label.includes(":")), false);
  assert.deepEqual(metricPages.sort((a, b) => a[0] - b[0]), [
    [0, 999], [1000, 1999], [2000, 2999],
  ]);
});

test("Driver Feedback retains the same weekly data path", async () => {
  const { client } = createScorecardClient();
  const result = await fetchDriverFeedbackScorecardRows(client, "org-test");
  assert.equal(result.rows.length, 2105);
});
