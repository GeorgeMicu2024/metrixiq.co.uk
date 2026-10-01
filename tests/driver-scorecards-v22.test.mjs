import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { calculateDriverScorecard } from "../lib/scorecards/driverScoreFormula.js";

const read = (path) => fs.readFileSync(path, "utf8");

test("Driver Scorecards V2.2 matches the exact point-band formula", () => {
  const formula = read("lib/scorecards/driverScoreFormula.js");

  for (const fragment of [
    "if (fico >= 849) return 17",
    "if (fico >= 825) return 15",
    "if (fico >= 810) return 10",
    "if (fico >= 800) return 8",
    "if (fico >= 780) return 5",
    "if (dcr >= 0.999) return 17",
    "if (dcr >= 0.992) return 15",
    "if (dsc <= 550) return 17",
    "return lor === 0 ? 6 : 0",
    "if (pod >= 0.9999) return 8",
    "if (cc >= 0.999) return 8",
    "if (ce === 0) return 10",
    "if (ce <= 2) return 6",
    "if (cdf <= 2500) return 10",
    "return psb === 0 ? 7 : 0",
  ]) {
    assert.ok(formula.includes(fragment), `missing formula fragment: ${fragment}`);
  }

  assert.equal(calculateDriverScorecard({
    mentor_score: 847,
    dcr: 99.29,
    dsc_dpmo: 0,
    lor: 0,
    pod: 99.77,
    cc: 100,
    ce_dpmo: 0,
    cdf_dpmo: 2049,
    psb: 0,
    raw_data: { source_files: ["Week37-DSP-Scorecard.pdf"] },
  }).value, 95);
});

test("Driver Scorecards V2.2 persists audited FICO overrides without mutating source metrics", () => {
  const view = read("components/scorecards/DriverScorecardsV22.jsx");
  const governance = read("lib/data/governanceV2.js");

  assert.ok(view.includes("setMetricOverride"));
  assert.ok(view.includes('metricKey: "mentor_score"'));
  assert.ok(view.includes("editRow.driver_id"));
  assert.ok(view.includes("editRow.week_label"));
  assert.ok(view.includes("applyMetricOverrides"));
  assert.ok(view.includes("fetchMetricOverrides"));
  assert.equal(view.includes('.from("driver_metrics").update'), false);
  assert.ok(governance.includes('supabase.rpc("set_driver_metric_override"'));
});


test("Site Scorecard stays scorecard-first and excludes driver leaderboards", () => {
  const view = read("components/scorecards/ScorecardViews.jsx");
  const siteStart = view.indexOf("export function SiteScorecardsView");
  const driverStart = view.indexOf("function LegacyDriverScorecardsView");
  const siteView = view.slice(siteStart, driverStart);

  assert.ok(siteView.includes("DSP WEEKLY SCORECARD"));
  assert.ok(siteView.includes("sitepro-health-grid"));
  assert.ok(siteView.includes("RECOMMENDED FOCUS AREAS"));
  assert.ok(siteView.includes("Import scorecard"));
  assert.equal(siteView.includes("Top 5 performers"), false);
  assert.equal(siteView.includes("Bottom 5"), false);
  assert.equal(siteView.includes("Drivers measured"), false);
  assert.equal(siteView.includes("Below operational target"), false);
  assert.equal(siteView.includes("onOpenDriver"), false);
  assert.equal(siteView.includes("\\n        <button"), false);
});


test("DSP scorecard parser isolates the site summary page before reading site KPIs", () => {
  const parser = read("lib/analyzer/pdf.js");

  assert.ok(parser.includes("selectScorecardSummaryText"));
  assert.ok(parser.includes("const summaryText = selectScorecardSummaryText(extracted.pageTexts, extracted.text)"));
  assert.ok(parser.includes("siteScorecard: scorecardSiteSummary(file.name, summaryText, period)"));
  assert.ok(parser.includes("const SCORECARD_STANDING_PATTERN"));
  assert.equal(
    parser.includes("siteScorecard: scorecardSiteSummary(file.name, extracted.text, period)"),
    false
  );
});

test("Home site performance never replaces a malformed stored site KPI with driver medians", () => {
  const home = read("components/dashboard/HomeView.jsx");
  const sourceStart = home.indexOf("const sourceMetric=(card,key)=>");
  const sourceEnd = home.indexOf("const siteMetric=", sourceStart);
  const sourceMetric = home.slice(sourceStart, sourceEnd);

  assert.ok(sourceMetric.includes("hasSourceMetric"));
  assert.ok(sourceMetric.includes("if(hasSourceMetric)return null"));
  assert.ok(sourceMetric.indexOf("if(hasSourceMetric)return null") < sourceMetric.indexOf("const rows=scorecardRowsFor(card)"));
});


test("Driver Scorecards keeps mixed-site imports isolated and blanks at zero", () => {
  const analyzer = read("lib/analyzer.js");
  const persistence = read("lib/persistence/metrics.js");
  const view = read("components/scorecards/DriverScorecardsV22.jsx");

  assert.ok(analyzer.includes('const siteKey = normalizeSiteCode(record.site) || "UNASSIGNED"'));
  assert.ok(analyzer.includes("siteKey}::"));
  assert.ok(persistence.includes("normalizeSiteCode(driver?.site)"));
  assert.ok(view.includes("row?.site ||"));
  assert.ok(view.includes("isScorecardCohortRow"));

  const blank = calculateDriverScorecard({
    raw_data: { source_files: ["UK-DCSL-DLS2-Week39-DSP-Scorecard-3.0.pdf"] },
  });
  assert.equal(blank.value, null);

  const partial = calculateDriverScorecard({
    dcr: 100,
    raw_data: { source_files: ["UK-DCSL-DLS2-Week39-DSP-Scorecard-3.0.pdf"] },
  });
  assert.equal(partial.value, 17);
});


test("Driver Scorecards uses the latest trusted same-week concession snapshot", () => {
  const view = read("components/scorecards/DriverScorecardsV22.jsx");
  const concessions = read("lib/data/concessions.js");
  assert.ok(view.includes("fetchDriverScorecardConcessionSnapshots"));
  assert.ok(view.includes("buildDriverScorecardConcessionMap"));
  assert.ok(view.includes("sameWeekConcessions.dnr"));
  assert.ok(concessions.includes("parseTrustedConcessionsFile(row.source_file)"));
  assert.ok(concessions.includes("stamp >= currentStamp"));
});


test("Share View keeps approved coloured metrics and removes WoW and flags", () => {
  const view = read("components/scorecards/DriverScorecardsV22.jsx");
  const css = read("app/scorecards-v22.css");

  const shareStart = view.indexOf('{shareOpen && (');
  const shareEnd = view.indexOf('  </div>;', shareStart);
  const shareView = view.slice(shareStart, shareEnd);

  assert.ok(shareView.includes("<th>FICO</th>"));
  assert.ok(shareView.includes("<th>PSB</th>"));
  assert.ok(shareView.includes('metricTone("fico", fico)'));
  assert.ok(shareView.includes('metricTone("psb", row.psb)'));
  assert.equal(shareView.includes("<th>WoW</th>"), false);
  assert.equal(shareView.includes("<th>Flags</th>"), false);
  assert.equal(shareView.includes("<span>WoW</span>"), false);

  assert.ok(css.includes(".share-rank-badge.fantastic-plus"));
  assert.ok(css.includes(".share-rank-badge.fantastic"));
  assert.ok(css.includes(".share-rank-badge.great"));
  assert.ok(css.includes(".share-rank-badge.fair"));
  assert.ok(css.includes(".share-rank-badge.poor"));
  assert.ok(css.includes("print-color-adjust:exact"));
});


test("Driver Scorecards supports persisted Excel-style column resizing and density controls", () => {
  const view = read("components/scorecards/DriverScorecardsV22.jsx");
  const css = read("app/scorecards-v22.css");

  assert.ok(view.includes('{ key: "name", label: "Driver Name", width: 165'));
  assert.ok(view.includes("SCORECARD_COLUMN_STORAGE_KEY"));
  assert.ok(view.includes("startColumnResize"));
  assert.ok(view.includes('className="scorex3-column-resizer"'));
  assert.ok(view.includes("Drag to resize · double-click to reset"));
  assert.ok(view.includes("Reset columns"));
  assert.ok(view.includes("Compact"));
  assert.ok(view.includes("Comfortable"));
  assert.ok(view.includes('minWidth: "100%"'));
  assert.ok(view.includes("scorecardTableWidth"));

  assert.ok(css.includes(".scorex3-column-resizer"));
  assert.ok(css.includes("cursor:col-resize"));
  assert.ok(css.includes("var(--score-col-name)"));
  assert.ok(css.includes(".scorex3-table.density-compact"));
  assert.ok(css.includes(".scorex3-table.density-comfortable"));
});


test("Scorecard compact fit clears legacy sticky third-column gap", () => {
  const view = read("components/scorecards/DriverScorecardsV22.jsx");
  const css = read("app/scorecards-v22.css");

  assert.ok(view.includes('column-widths.v2'));
  assert.ok(view.includes('{ key: "rank", label: "Rank", width: 54'));
  assert.ok(view.includes('{ key: "name", label: "Driver Name", width: 165'));
  assert.ok(css.includes("V2.8 compact fit + sticky-column cleanup"));
  assert.ok(css.includes(".scorex3-table th:nth-child(n+3)"));
  assert.ok(css.includes("position:static!important"));
  assert.ok(css.includes("left:auto!important"));
  assert.ok(css.includes("opacity:.08!important"));
});
