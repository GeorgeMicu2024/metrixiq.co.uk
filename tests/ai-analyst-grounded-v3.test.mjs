import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fetchAnalystV3Data } from "../lib/data/analystV3.js";
import { answerExecutiveQuestion, buildAnalystOverview } from "../lib/intelligence/executiveAnalystV2.js";
import { analystAiContext, officialSiteComparison, prepareAnalystEvidence } from "../lib/intelligence/officialScorecardSignals.js";

const cards = [
  { id: "card43", site: "DZM1", year: 2026, week: 43, week_label: "W43", overall_score: "94.01",
    standing: "Fantastic Plus", site_rank: 1, metrics: {
      psb: { value: 2.7, standing: "Fantastic" }, lor: { value: "N/A", standing: null },
      cdf_dpmo: { value: 5034, standing: "Fantastic" }, mentor_score: { value: 816, standing: "Fantastic" },
      pod: { value: 99.38, standing: "Fantastic" },
    } },
  { id: "card44", site: "DZM1", year: 2026, week: 44, week_label: "W44", overall_score: "80.49",
    standing: "Great", site_rank: 5, metrics: {
      psb: { value: 11.32, standing: "Fair" }, lor: { value: 154, standing: "Poor" },
      cdf_dpmo: { value: 6595, standing: "Fair" }, mentor_score: { value: 801, standing: "Great" },
      pod: { value: 99.52, standing: "Fantastic" },
    } },
];

const metrics = [
  { driver_id: "1", site: "DZM1", week_label: "W43", period_end: "2026-10-25", drivers: { id: "1", site: "DXG1", full_name: "Driver One", trid: "T1" },
    fico: 850, dcr: 100, dsc_dpmo: 0, lor: 0, pod: 100, cc: 100, ce_dpmo: 0, cdf_dpmo: 0, psb: 0 },
  { driver_id: "1", site: "DZM1", week_label: "W44", period_end: "2026-11-01", drivers: { id: "1", site: "DXG1", full_name: "Driver One", trid: "T1" },
    fico: 790, dcr: 98.6, dsc_dpmo: 900, lor: 0, pod: 98, cc: 99, ce_dpmo: 0, cdf_dpmo: 3000, psb: 5 },
  { driver_id: "2", site: "DLS2", week_label: "W44", period_end: "2026-11-01", drivers: { id: "2", site: "DZM1", full_name: "Driver Two", trid: "T2" },
    fico: 850, dcr: 100, dsc_dpmo: 0, lor: 0, pod: 100, cc: 100, ce_dpmo: 0, cdf_dpmo: 0, psb: 0 },
];

const dataset = { metricRows: metrics, scorecards: cards, incidents: [], coaching: [], feedback: [], tasks: [], imports: [], unmatched: [] };

test("official site movements distinguish worsening metrics from N/A and improvements", () => {
  const result = officialSiteComparison(dataset, "DZM1", "W44");
  assert.equal(result.delta, -13.52);
  assert.equal(result.rankDelta, 4);
  assert.equal(result.attention.find((item) => item.key === "lor").trend, "new");
  assert.equal(result.attention.find((item) => item.key === "psb").delta, 8.62);
  assert.equal(result.improving.find((item) => item.key === "pod").trend, "better");
});

test("DZM1 driver cohort uses Activity Site, not historical driver profile site", () => {
  const prepared = prepareAnalystEvidence(dataset);
  assert.equal(prepared.metricRows[0].drivers.site, "DZM1");
  assert.equal(prepared.metricRows[2].drivers.site, "DLS2");
  assert.equal(dataset.metricRows[0].drivers.site, "DXG1", "source data remains unchanged");
  const overview = buildAnalystOverview(dataset, { site: "DZM1", weekLabel: "W44" });
  assert.equal(overview.pack.fleet.drivers, 1);
  assert.equal(overview.pack.movement[0].driver_name, "Driver One");
});

test("only the imported scorecard cohort contributes to weekly driver analysis when source files identify it", () => {
  const official = { ...metrics[1], raw_data: { source_files: ["UK-DCSL-DZM1-Week44-Driver-Scorecard.xlsx"] } };
  const otherReport = { ...metrics[1], driver_id: "3", drivers: { site: "DZM1", full_name: "Extra Driver" },
    raw_data: { source_files: ["DZM1-W44-IADC.csv"] } };
  const prepared = prepareAnalystEvidence({ ...dataset, metricRows: [metrics[0], official, otherReport] });
  assert.equal(prepared.metricRows.length, 2);
  const overview = buildAnalystOverview({ ...dataset, metricRows: [metrics[0], official, otherReport] },
    { site: "DZM1", weekLabel: "W44" });
  assert.equal(overview.pack.fleet.drivers, 1);
  assert.equal(overview.pack.movement[0].driver_name, "Driver One");
});

test("dedicated Analyst fetches all pages of latest Activity Site metrics without using stale first 1,000 rows", async () => {
  const records = Array.from({ length: 620 }, (_, index) => ({
    ...metrics[1], driver_id: String(index + 1),
    drivers: { id: String(index + 1), site: "DLS2", full_name: "Driver " + index },
  }));
  const queries = [];
  const tableData = { site_scorecards: cards, driver_metrics: records };
  const fakeSupabase = {
    from(table) {
      const filters = [], query = { table, filters, start: 0, end: Number.MAX_SAFE_INTEGER };
      const chain = {
        select() { return this; }, order() { return this; }, limit(count) { query.end = count - 1; return this; },
        eq(field, value) { filters.push([field, value]); return this; },
        in(field, values) { filters.push([field, values]); return this; },
        range(start, end) { query.start = start; query.end = end; return this; },
        then(onSuccess, onFailure) {
          queries.push(query);
          const rows = (tableData[table] || []).filter((item) => filters.every(([field, value]) =>
            field === "organization_id" || (Array.isArray(value) ? value.includes(item[field]) : item[field] === value)))
            .slice(query.start, query.end + 1);
          return Promise.resolve({ data: rows, error: null }).then(onSuccess, onFailure);
        },
      };
      return chain;
    },
    rpc() { return Promise.resolve({ data: [], error: null }); },
  };
  const loaded = await fetchAnalystV3Data(fakeSupabase, "org", "DZM1");
  assert.equal(loaded.metricRows.length, 620);
  assert.equal(loaded.scorecards.length, 2);
  assert.deepEqual(queries.filter((query) => query.table === "driver_metrics").map((query) => query.start), [0, 500]);
  assert.ok(queries.some((query) => query.table === "driver_metrics" &&
    query.filters.some(([key, value]) => key === "site" && value === "DZM1")));
});

test("why the score dropped includes verified score, rank and metrics without false point attribution", () => {
  const answer = answerExecutiveQuestion(dataset, "Why did our score drop in W44?", { site: "DZM1", weekLabel: "W44" });
  assert.equal(answer.intent, "why_drop");
  assert.match(answer.answer, /94\.01.*80\.49/);
  assert.match(answer.answer, /#1 to #5/);
  assert.match(answer.answer, /PSB/);
  assert.ok(answer.facts.some((line) => /LoR.*previous period N\/A/.test(line)));
  assert.ok(answer.evidence.some((item) => item.kind === "site_scorecard"));
  assert.ok(answer.limitations.some((line) => /not a verified weighted decomposition/.test(line)));
});

test("Romanian questions, operational actions and driver reviews use the same stored evidence", () => {
  const why = answerExecutiveQuestion(dataset, "De ce a scăzut scorul în W44?", { site: "DZM1", weekLabel: "W44" });
  const pickup = answerExecutiveQuestion(dataset, "Explain PSB this week", { site: "DZM1", weekLabel: "W44" });
  const drivers = answerExecutiveQuestion(dataset, "Which drivers need a review?", { site: "DZM1", weekLabel: "W44" });
  const actions = answerExecutiveQuestion(dataset, "What should we check next?", { site: "DZM1", weekLabel: "W44" });
  assert.equal(why.intent, "why_drop");
  assert.equal(pickup.intent, "metric_focus");
  assert.match(pickup.answer, /yellow-sticker/);
  assert.equal(drivers.intent, "driver_priorities");
  assert.ok(drivers.facts.some((fact) => fact.includes("Driver One")));
  assert.ok(drivers.facts.every((fact) => !fact.includes("Driver Two")));
  assert.equal(actions.intent, "action_plan");
  assert.ok(actions.actions.some((action) => action.destination === "check-lor"));
});

test("Analyst redesign keeps readable typography and is isolated from Report Builder", () => {
  const css = readFileSync("app/analyst-v3.css", "utf8");
  const component = readFileSync("components/intelligence/ExecutiveAnalystV2.jsx", "utf8");
  assert.ok(css.includes(".analystx-workspace"));
  assert.ok(css.includes("font-size:15px"));
  assert.ok(!css.includes(".reportv5-"));
  assert.ok(component.includes("READY FOR YOUR QUESTION"));
  assert.ok(component.includes("QUESTION ANALYSED ✓"));
  assert.ok(component.includes("YOU ASKED"));
  assert.ok(component.includes("setAnalysing(true)"));
  assert.ok(component.includes("setAnalysisError("));
  assert.ok(!component.includes("initialAnswer"), "do not show an identical answer before the first click");
  assert.ok(component.includes("OFFICIAL SITE SCORE"));
  assert.ok(component.includes("What this does not prove"));
  assert.ok(component.includes("AI_ANALYSIS_FOCUS[result?.intent]"));
  assert.ok(!component.includes("const prompt = (question.trim()"));
});

test("optional AI context includes verified aggregates but no driver identifiers", () => {
  const overview = buildAnalystOverview(dataset, { site: "DZM1", weekLabel: "W44" });
  const context = analystAiContext(overview);
  const parsed = JSON.parse(context);
  assert.equal(parsed.officialSiteScorecard.current.score, 80.49);
  assert.equal(parsed.officialSiteScorecard.metricComparisons.find((item) => item.metric === "LoR").trend, "new");
  assert.equal(parsed.driverSummaryUnweighted.count, 1);
  assert.ok(!context.includes("Driver One"));
  assert.ok(!context.includes("T1"));
  assert.ok(!context.includes("driver_id"));
  assert.ok(context.length < 6000);
});

test("unsupported operational questions state the evidence gap instead of returning a random summary", () => {
  const answer = answerExecutiveQuestion(dataset, "Did locker CR123 have a jammed door?", { site: "DZM1", weekLabel: "W44" });
  assert.equal(answer.intent, "unverified_question");
  assert.match(answer.answer, /cannot verify that exact question/);
  assert.ok(answer.limitations.some((item) => /Parcel-level/.test(item)));
});
