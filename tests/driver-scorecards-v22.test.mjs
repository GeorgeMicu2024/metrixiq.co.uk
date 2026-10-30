import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { calculateDriverScorecard } from "../lib/scorecards/driverScoreFormula.js";
import { compareDriverScorecardRank, splitScorecardPhotoPages } from "../lib/scorecards/driverRanking.js";

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

test("Driver Scorecards matches all 14 independently verified MyDCSL W43 scores", () => {
  // [name, FICO, DCR%, POD%, CC%, CDF DPMO, verified MyDCSL score].
  const snapshots = [
    [
        "Aronita Voka",
        850,
        100,
        100,
        100,
        null,
        100
    ],
    [
        "Liam Harry Manning",
        828,
        100,
        100,
        100,
        null,
        98
    ],
    [
        "Vasile Catalin Condurache",
        832,
        100,
        100,
        100,
        null,
        98
    ],
    [
        "Vlad Aurel Padure",
        837,
        99.57,
        100,
        100,
        null,
        96
    ],
    [
        "Videl-Alin Goras",
        839,
        99.74,
        100,
        100,
        2611,
        93
    ],
    [
        "Chigozie Samuel Okafor",
        814,
        99.73,
        99.47,
        100,
        2717,
        87
    ],
    [
        "Gordon Cairnes",
        null,
        100,
        96.77,
        null,
        3185,
        85.33
    ],
    [
        "Subhaan Nadeem",
        751,
        100,
        100,
        100,
        null,
        83
    ],
    [
        "Sonia Valentina Balaban",
        815,
        98.67,
        100,
        100,
        130,
        81
    ],
    [
        "Emanuel Daniel Hotin",
        841,
        99.18,
        98.91,
        100,
        8299,
        80
    ],
    [
        "CRISTI MADALIN PADURE",
        763,
        100,
        100,
        100,
        42105,
        73
    ],
    [
        "Dalton James Halliday",
        null,
        97.5,
        97.7,
        null,
        null,
        70.67
    ],
    [
        "Adam James Watson",
        772,
        99.46,
        98.33,
        100,
        5450,
        70
    ],
    [
        "Benjamin Lionel Pepler",
        780,
        98.08,
        100,
        100,
        19608,
        61
    ]
];
  for (const [name, fico, dcr, pod, cc, cdf, expected] of snapshots) {
    const row = {
      mentor_score: fico,
      dcr,
      dsc_dpmo: 0,
      lor: 0,
      pod,
      cc,
      ce_dpmo: 0,
      cdf_dpmo: cdf,
      psb: 0,
    };
    assert.equal(calculateDriverScorecard(row).value, expected, name);
  }

  const gordon = calculateDriverScorecard({
    mentor_score: null, dcr: 100, dsc_dpmo: 0, lor: 0,
    pod: 96.77, cc: null, ce_dpmo: 0, cdf_dpmo: 3185, psb: 0,
  });
  assert.equal(gordon.awarded, 64);
  assert.equal(gordon.maximum, 75);
  assert.equal(gordon.coverage, 9);
});

test("Explicit N/A metrics normalize correctly without inflating sparse imports", () => {
  const complete = calculateDriverScorecard({
    mentor_score: "—", dcr: 100, dsc_dpmo: 0, lor: 0,
    pod: 100, cc: "N/A", ce_dpmo: 0, cdf_dpmo: "-", psb: 0,
  });
  assert.equal(complete.value, 100);
  assert.equal(complete.maximum, 75);

  const sparse = calculateDriverScorecard({ dcr: 100 });
  assert.equal(sparse.value, 17);
  assert.equal(sparse.components.find((component) => component.key === "cdf_dpmo").points, 0);
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

  const shareStart = view.indexOf('{shareOpen && typeof document !== "undefined" && createPortal(');
  assert.ok(shareStart >= 0, "Share portal not found");
  const shareView = view.slice(shareStart);

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


test("Driver Scorecards persists font sizing and keeps all metric headers sticky", () => {
  const view = read("components/scorecards/DriverScorecardsV22.jsx");
  const css = read("app/scorecards-v22.css");

  assert.ok(view.includes("SCORECARD_FONT_STORAGE_KEY"));
  assert.ok(view.includes('useState("medium")'));
  assert.ok(view.includes("A−"));
  assert.ok(view.includes("A+"));
  assert.ok(view.includes("font-${tableFontSize}"));

  assert.ok(css.includes("V2.9 font controls + sticky metric header"));
  assert.ok(css.includes(".scorex3-table thead th:nth-child(n)"));
  assert.ok(css.includes("position:sticky!important"));
  assert.ok(css.includes("top:0!important"));
  assert.ok(css.includes(".scorex3-table .scorex3-tier-row td"));
  assert.ok(css.includes("top:var(--score-header-height)!important"));
  assert.ok(css.includes(".scorex3-table.font-large"));
  assert.ok(css.includes("border-right:1px solid #b7c6d0!important"));
});


test("Driver Scorecards focus mode maximises viewport and PDF export prints every row", () => {
  const view = read("components/scorecards/DriverScorecardsV22.jsx");
  const css = read("app/scorecards-v22.css");

  assert.ok(view.includes('useState(false)'));
  assert.ok(view.includes("scorex3-focus-mode"));
  assert.ok(view.includes("Focus table"));
  assert.ok(view.includes("Exit focus"));
  assert.ok(view.includes("exportSharePdf"));
  assert.ok(view.includes("window.print()"));

  assert.ok(css.includes("V3.0 focus mode + complete multi-page PDF export"));
  assert.ok(css.includes(".scorex3-focus-mode>.scorex3-header"));
  assert.ok(css.includes("height:calc(100vh - 155px)!important"));
  assert.ok(css.includes("@page"));
  assert.ok(css.includes("size:A4 landscape"));
  assert.ok(css.includes(".scorex3-share-table thead"));
  assert.ok(css.includes("display:table-header-group!important"));
  assert.ok(css.includes("max-height:none!important"));
  assert.ok(css.includes("overflow:visible!important"));
  assert.ok(css.includes("page-break-inside:avoid!important"));
});


test("Driver Scorecards counts only drivers backed by the selected site's DSP scorecard", () => {
  const view = read("components/scorecards/DriverScorecardsV22.jsx");

  assert.ok(view.includes("const scorecardFiles = files.filter"));
  assert.ok(view.includes('sourceName.includes(rowSite)'));
  assert.ok(view.includes("if (files.length) return false"));
  assert.ok(view.includes("must never inflate the driver count"));
});

test("Driver Scorecards complete PDF is isolated from dashboard and includes all metrics", () => {
  const view = read("components/scorecards/DriverScorecardsV22.jsx");
  const css = read("app/scorecards-v22.css");

  assert.ok(view.includes('import { createPortal } from "react-dom"'));
  assert.ok(view.includes("document.body"));
  assert.ok(view.includes("printAllDrivers"));
  assert.ok(view.includes("printShareRows.map"));
  assert.ok(view.includes("Export selection PDF"));
  assert.ok(view.includes("Export entire scorecard PDF"));
  for (const metric of ["<th>Delivered</th>", "<th>DSC</th>", "<th>LoR</th>", "<th>CE</th>", "<th>CDF</th>"]) {
    assert.ok(view.includes(metric), `Missing PDF metric: ${metric}`);
  }

  assert.ok(css.includes("html.scorex3-printing-share body > :not(.scorex3-share-overlay)"));
  assert.ok(css.includes("size:A3 landscape"));
  assert.ok(css.includes("scorex3-share-table thead"));
});

test("Driver ranking breaks equal total scores by verified FICO, without changing totals", () => {
  const sample = [
    { displayScore: 98, mentor_score: 825, drivers: { full_name: "Tibi Gangal", trid: "A1HAE5PVBICEXX" } },
    { displayScore: 97.83, mentor_score: 825, drivers: { full_name: "Nicolae Badarau" } },
    { displayScore: 98, mentor_score: 847, drivers: { full_name: "Eugen Borto", trid: "A1SSU3R959AIDW" } },
    { displayScore: 100, mentor_score: 850, drivers: { full_name: "Aronita Voka" } },
    { displayScore: 98, mentor_score: 836, drivers: { full_name: "Septimiu Gabriel Ionescu" } },
  ];
  const ordered = [...sample].sort(compareDriverScorecardRank);
  assert.deepEqual(ordered.map((row) => row.drivers.full_name), [
    "Aronita Voka", "Eugen Borto", "Septimiu Gabriel Ionescu",
    "Tibi Gangal", "Nicolae Badarau",
  ]);
  assert.deepEqual(sample.map((row) => row.displayScore), [98, 97.83, 98, 100, 98]);
});

test("Driver rank ties are deterministic and missing FICO ranks after known FICO", () => {
  const records = [
    { displayScore: 98, mentor_score: null, drivers: { full_name: "Zed" } },
    { displayScore: 98, mentor_score: 825, drivers: { full_name: "Tibi" } },
    { displayScore: 98, mentor_score: 825, drivers: { full_name: "Alan" } },
    { displayScore: null, mentor_score: 850, drivers: { full_name: "Missing Score" } },
  ];
  assert.deepEqual(records.sort(compareDriverScorecardRank).map((row) => row.drivers.full_name), [
    "Alan", "Tibi", "Zed", "Missing Score",
  ]);
  const view = read("components/scorecards/DriverScorecardsV22.jsx");
  assert.ok(view.includes('import { compareDriverScorecardRank }'));
  assert.equal((view.match(/\\.sort\\(compareDriverScorecardRank\\)/g) || []).length, 2);
  assert.equal((view.match(/compareDriverScorecardRank/g) || []).length, 5);
});


test("Full-team WhatsApp export splits 61 drivers into exactly 3 balanced images", () => {
  const rows = Array.from({ length: 61 }, (_, index) => ({ currentRank: index + 1 }));
  const pages = splitScorecardPhotoPages(rows);
  assert.equal(pages.length, 3);
  assert.deepEqual(pages.map((part) => part.rows.length), [21, 20, 20]);
  assert.deepEqual(pages.map((part) => [part.start, part.end]), [[1, 21], [22, 41], [42, 61]]);
  assert.deepEqual(pages.flatMap((part) => part.rows), rows);
  assert.equal(new Set(pages.flatMap((part) => part.rows)).size, 61);
});

test("WhatsApp photo pages never exceed 25 drivers or include empty filler pages", () => {
  for (const count of [0, 1, 2, 3, 25, 60, 65, 75, 76, 150]) {
    const rows = Array.from({ length: count }, (_, i) => i);
    const pages = splitScorecardPhotoPages(rows);
    assert.equal(pages.flatMap((part) => part.rows).length, count);
    assert.deepEqual(pages.flatMap((part) => part.rows), rows);
    assert.equal(pages.some((part) => part.rows.length === 0), false);
    assert.ok(pages.every((part) => part.rows.length <= 25));
    if (count >= 3 && count <= 75) assert.equal(pages.length, 3);
  }
  assert.deepEqual(splitScorecardPhotoPages(Array.from({ length: 65 }, (_, i) => i))
    .map((part) => part.rows.length), [22, 22, 21]);
});

test("Full-team WhatsApp PNG prioritizes readable scores without changing source data", () => {
  const view = read("components/scorecards/DriverScorecardsV22.jsx");
  const css = read("app/scorecards-v22.css");
  assert.ok(view.includes("drawFullScorecardPhotoPng"));
  assert.ok(view.includes("splitScorecardPhotoPages(rankedPhotoRows, { preferredPages: fullPhotoCount })"));
  assert.ok(view.includes("const [fullPhotoCount, setFullPhotoCount] = useState(4)"));
  assert.ok(view.includes("<option value={3}>3 photos"));
  assert.ok(view.includes("<option value={4}>4 photos"));
  assert.ok(view.includes("<option value={5}>5 photos"));
  assert.ok(view.includes("const pixelRatio = Math.min(2, Math.sqrt(15000000 / (width * height)))"));
  assert.ok(view.includes("download full team") || view.includes("Download full team"));
  assert.ok(view.includes("Preview / Share photo"));
  assert.ok(view.includes("exportFullScorecardPhotosZip"));
  assert.ok(view.includes("shareAllFullScorecardPhotos"));
  assert.ok(view.includes("Share all {fullPhotoPages.length} photos"));
  assert.ok(view.includes("WhatsApp scorecard · Clear HD photos"));
  assert.ok(view.includes('kind: "full-scorecard"'));
  assert.ok(view.includes('return canvas.toDataURL("image/png")'));
  const photoDraw = view.slice(view.indexOf("function drawFullScorecardPhotoPng"), view.indexOf("// Minimal uncompressed ZIP writer"));
  assert.ok(photoDraw.includes("rounded(palette.score, 788"));
  assert.ok(photoDraw.includes("palette.ink"));
  for (const tier of ["fantastic-plus", "fantastic", "great", "fair", "poor"]) {
    assert.ok(photoDraw.includes(tier + ":") || photoDraw.includes('"' + tier + '":'));
  }
  for (const colour of ["#175aa8", "#7accf4", "#218452", "#f5a735", "#c5374d"]) {
    assert.ok(photoDraw.includes(colour), "Missing tier colour " + colour);
  }
  assert.ok(photoDraw.includes("const cardHeight = 194"));
  assert.ok(photoDraw.includes("const headerHeight = 430"));
  assert.ok(photoDraw.includes('rectangle("#102d4c", 0, 0, width, 374)'));
  assert.ok(photoDraw.includes("rounded(palette.metric, chipX"));
  for (const color of ["#dceafd", "#d9f0ff", "#daf0e3", "#ffedcb", "#ffe0e5"]) {
    assert.ok(photoDraw.includes(color), "Missing stronger tier background " + color);
  }
  assert.ok(photoDraw.includes("rounded(\"#c5d5e2\", 14"));
  assert.ok(photoDraw.includes("rectangle(\"#91aabe\", 24"));
  assert.ok(photoDraw.includes("10px gap"));
  assert.ok(photoDraw.includes('draw(row.score, 864'));
  for (const label of ["CON", "DCR", "POD", "CC", "DSC", "LoR", "SCORE", "FICO", "DEL"]) {
    assert.ok(photoDraw.includes('"' + label + '"'), "Missing WhatsApp label " + label);
  }
  for (const label of ["CE", "CDF", "PSB"]) {
    assert.equal(photoDraw.includes('["' + label + '",'), false, "Advanced metric should be omitted from WhatsApp view: " + label);
  }
  assert.ok(view.includes("Larger images for WhatsApp"));
  assert.ok(view.includes("Full details stay in PDF."));
  assert.ok(css.includes(".scorex3-full-photo-tools"));
  assert.ok(css.includes("html.scorex3-printing-share .scorex3-full-photo-tools"));
});


test("WhatsApp export offers 3, 4 and 5 image sizes without missing a driver", () => {
  const drivers = Array.from({ length: 61 }, (_, index) => ({ currentRank: index + 1 }));
  for (const [preferredPages, expected] of [[3, [21, 20, 20]], [4, [16, 15, 15, 15]], [5, [13, 12, 12, 12, 12]]]) {
    const pages = splitScorecardPhotoPages(drivers, { preferredPages });
    assert.deepEqual(pages.map((item) => item.rows.length), expected);
    assert.deepEqual(pages.flatMap((item) => item.rows), drivers);
    assert.deepEqual(pages.map((item) => item.start), expected.map((_, i) => 1 + expected.slice(0, i).reduce((sum, n) => sum + n, 0)));
    assert.equal(pages.at(-1).end, 61);
  }
});
