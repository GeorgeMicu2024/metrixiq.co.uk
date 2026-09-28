import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";

import { parseMentorMatrix, parseScorecardMatrix } from "../lib/analyzer/spreadsheet.js";
import {
  buildSmartFileDetection,
  buildSmartImportPlan,
  detectMentorGranularity,
} from "../lib/analyzer/smartDetection.js";
import { expandImportFiles } from "../lib/imports/archive.js";
import { deduplicateFilesByContent } from "../lib/imports/contentFingerprint.js";
import { classifyImportFile } from "../lib/imports/preflight.js";

function mentorRecord(trips, site = "DDN1") {
  return {
    site,
    details: { mentor: { totalTrips: trips, station: site } },
  };
}

test("Smart Import detects eMentor daily from trip distribution", () => {
  const detection = detectMentorGranularity([
    mentorRecord(1), mentorRecord(1), mentorRecord(1), mentorRecord(2),
  ]);
  assert.equal(detection.granularity, "daily");
  assert.ok(detection.confidence >= 95);
  assert.equal(detection.evidence.medianTrips, 1);
});

test("Smart Import detects eMentor weekly even when filename only contains a date", () => {
  const smart = buildSmartFileDetection([
    {
      reportType: "mentor",
      label: "Driver Report (VRM)",
      rows: 5,
      records: [
        mentorRecord(3), mentorRecord(4), mentorRecord(5), mentorRecord(6), mentorRecord(4),
      ],
    },
  ], "Driver Report_2026-09-20.xlsx", { granularity: "daily", key: "2026-09-20" });

  assert.equal(smart.site, "DDN1");
  assert.equal(smart.granularity, "weekly");
  assert.deepEqual(smart.reportTypes, ["EMENTOR"]);
  assert.ok(smart.confidence >= 90);
});

test("Content site wins over filename and conflict is never silently accepted", () => {
  const smart = buildSmartFileDetection([
    {
      reportType: "mentor",
      label: "Driver Report (VRM)",
      rows: 4,
      records: [
        mentorRecord(1, "DDN1"),
        mentorRecord(1, "DDN1"),
        mentorRecord(1, "DDN1"),
        mentorRecord(1, "DDN1"),
      ],
    },
  ], "UK-DCSL-DLS2-Driver-Report_2026-09-27.xlsx", { granularity: "daily" });

  assert.equal(smart.site, "DDN1");
  assert.equal(smart.filenameSite, "DLS2");
  assert.equal(smart.requiresReview, true);
  assert.ok(smart.warnings.some((warning) => warning.code === "SITE_CONFLICT"));
});

test("Smart Import plan supports mixed sites without manual site selection", () => {
  const fileResults = [
    {
      name: "a.pdf",
      smart: {
        site: "DLS2",
        contentSites: ["DLS2"],
        reportTypes: ["POD_QUALITY"],
        granularity: "weekly",
        confidence: 99,
        requiresReview: false,
        warnings: [],
        segments: [],
      },
    },
    {
      name: "b.html",
      smart: {
        site: "DDN1",
        contentSites: ["DDN1"],
        reportTypes: ["DWC_IADC"],
        granularity: "weekly",
        confidence: 98,
        requiresReview: false,
        warnings: [],
        segments: [],
      },
    },
  ];

  const plan = buildSmartImportPlan(fileResults, ["DLS2", "DDN1"]);
  assert.equal(plan.ready, 2);
  assert.equal(plan.review, 0);
  assert.deepEqual(plan.siteCounts, { DDN1: 1, DLS2: 1 });
});

test("SHA-256 dedupe catches same bytes even when filenames differ", async () => {
  const a = new File(["same report bytes"], "POD.pdf", { lastModified: 1 });
  const b = new File(["same report bytes"], "POD - Copy.pdf", { lastModified: 2 });
  const c = new File(["different bytes"], "POD-v2.pdf", { lastModified: 3 });

  const result = await deduplicateFilesByContent([a, b, c]);
  assert.equal(result.uniqueFiles.length, 2);
  assert.equal(result.duplicates.length, 1);
  assert.equal(result.duplicates[0].file.name, "POD - Copy.pdf");
  assert.equal(result.duplicates[0].duplicateOf.name, "POD.pdf");
});

test("ZIP is accepted and expanded in memory without persistence", async () => {
  assert.equal(classifyImportFile({ name: "reports.zip", size: 100 }).status, "blocked");

  const zip = new JSZip();
  zip.file("DDN1/report.csv", "Station,Transporter ID,DCR\nDDN1,A123456789,99.5%");
  zip.file("DLS2/report.csv", "Station,Transporter ID,DCR\nDLS2,A987654321,99.1%");
  const bytes = await zip.generateAsync({ type: "uint8array" });
  const file = new File([bytes], "mixed-sites.zip", { lastModified: 1 });

  const expanded = await expandImportFiles([file]);
  assert.equal(expanded.archives.length, 1);
  assert.equal(expanded.files.length, 2);
  assert.deepEqual(expanded.files.map((item) => item.name).sort(), ["DDN1/report.csv", "DLS2/report.csv"]);
});

test("eMentor parser evidence feeds Smart Import daily classification", () => {
  const matrix = [
    ["First Name","Last Name","FICO Safe Driving Score","Acceleration Rating","Braking Rating","Cornering Rating","Distraction Rating","Speeding Rating","Station","Total Driver Trips"],
    ["Ana","Popescu",830,"Low Risk","Low Risk","Low Risk","Low Risk","Low Risk","DDN1",1],
    ["Ben","Smith",820,"Low Risk","Low Risk","Low Risk","Low Risk","Low Risk","DDN1",1],
    ["Cara","Jones",810,"Low Risk","Low Risk","Low Risk","Low Risk","Low Risk","DDN1",1],
    ["Dan","Miller",800,"Low Risk","Low Risk","Low Risk","Low Risk","Low Risk","DDN1",2],
  ];
  const parsed = parseMentorMatrix(matrix, "Driver Report_2026-09-27.xlsx", "Driver Report (VRM)");
  const smart = buildSmartFileDetection([parsed], "Driver Report_2026-09-27.xlsx", { granularity: "daily" });

  assert.equal(parsed.records.length, 4);
  assert.equal(smart.site, "DDN1");
  assert.equal(smart.granularity, "daily");
  assert.deepEqual(smart.reportTypes, ["EMENTOR"]);
});

test("eMentor parser evidence overrides date filename for weekly classification", () => {
  const matrix = [
    ["First Name","Last Name","FICO Safe Driving Score","Acceleration Rating","Braking Rating","Cornering Rating","Distraction Rating","Speeding Rating","Station","Total Driver Trips"],
    ["Ana","Popescu",830,"Low Risk","Low Risk","Low Risk","Low Risk","Low Risk","DDN1",4],
    ["Ben","Smith",820,"Low Risk","Low Risk","Low Risk","Low Risk","Low Risk","DDN1",5],
    ["Cara","Jones",810,"Low Risk","Low Risk","Low Risk","Low Risk","Low Risk","DDN1",3],
    ["Dan","Miller",800,"Low Risk","Low Risk","Low Risk","Low Risk","Low Risk","DDN1",6],
  ];
  const parsed = parseMentorMatrix(matrix, "Driver Report_2026-09-20.xlsx", "Driver Report (VRM)");
  const smart = buildSmartFileDetection([parsed], "Driver Report_2026-09-20.xlsx", { granularity: "daily" });

  assert.equal(smart.granularity, "weekly");
  assert.ok(smart.confidence >= 90);
});


test("overview CSV families are canonical Smart Import reports", () => {
  const dsp = buildSmartFileDetection(
    [{ reportType: "spreadsheet", label: "Sheet1", rows: 20, records: [] }],
    "DSP_Overview_Dashboard_DCSL_DLS2_2026-W38.csv",
    { key: "2026-W38", granularity: "weekly", year: 2026, week: 38 }
  );
  const quality = buildSmartFileDetection(
    [{ reportType: "spreadsheet", label: "Sheet1", rows: 20, records: [] }],
    "Quality_Overview_DCSL_DLS2_2026-09-27.csv",
    { key: "2026-09-27", granularity: "daily" }
  );
  const delivery = buildSmartFileDetection(
    [{ reportType: "spreadsheet", label: "Sheet1", rows: 20, records: [] }],
    "DSP_Delivery_Overview_DCSL_DLS2_2026-W40.csv",
    { key: "2026-W40", granularity: "weekly", year: 2026, week: 40 }
  );

  assert.deepEqual(dsp.reportTypes, ["DSP_OVERVIEW"]);
  assert.equal(dsp.site, "DLS2");
  assert.deepEqual(quality.reportTypes, ["QUALITY_OVERVIEW"]);
  assert.equal(quality.granularity, "daily");
  assert.deepEqual(delivery.reportTypes, ["DSP_DELIVERY_OVERVIEW"]);
});

test("undated known reports never persist the current-week fallback silently", () => {
  const smart = buildSmartFileDetection(
    [],
    "Prime_Report_UK-DCSL-DLS2.pdf",
    { key: "2026-W40", granularity: "weekly", year: 2026, week: 40 }
  );

  assert.deepEqual(smart.reportTypes, ["PRIME_REPORT"]);
  assert.equal(smart.site, "DLS2");
  assert.equal(smart.requiresReview, true);
  assert.ok(smart.warnings.some((warning) => warning.code === "PERIOD_NOT_VERIFIED"));
});

test("composite scorecard parser reads site from sheet and week from title", () => {
  const parsed = parseScorecardMatrix(
    [
      ["WEEK 31 - FANTASTIC - 88.20%"],
      ["Transporter ID", "RANK", "Name", "Concessions", "TOTAL SCORE", "Fico", "Delivered", "DCR", "DSC DPMO", "LoR DPMO", "POD", "CC", "CE", "CDF DPMO", "PSB"],
      ["A123456789", "Fantastic", "Valid Person", 0, 90, 830, 100, "99.5%", 0, 0, "100%", "100%", 0, 0, 0],
    ],
    "DA score card 2026.xlsx",
    "DDN1 MYDCSL"
  );

  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.records[0].site, "DDN1");
  assert.equal(parsed.period.key, "2026-W31");
  assert.equal(parsed.periodSource, "content_title");
});

test("same site report and period with changed bytes becomes a logical conflict", () => {
  const baseSmart = {
    site: "DDN1",
    contentSites: ["DDN1"],
    reportTypes: ["POD_QUALITY"],
    granularity: "weekly",
    period: { key: "2026-W27", granularity: "weekly" },
    confidence: 99,
    requiresReview: false,
    warnings: [],
    segments: [],
  };
  const plan = buildSmartImportPlan([
    { name: "POD-v1.pdf", contentHash: "aaa", smart: baseSmart },
    { name: "POD-v2.pdf", contentHash: "bbb", smart: baseSmart },
  ], ["DDN1"]);

  assert.equal(plan.logicalDuplicateGroups.length, 1);
  assert.equal(plan.review, 2);
  assert.ok(plan.files.every((file) => file.smart.warnings.some((warning) => warning.code === "LOGICAL_REPORT_CONFLICT")));
});

test("ZIP support stays isolated from the legacy Import Queue", () => {
  assert.equal(classifyImportFile({ name: "reports.zip", size: 100 }).status, "blocked");
});


test("DWC IADC weekly file with daily detail remains Ready, not Warning", () => {
  const smart = buildSmartFileDetection([
    {
      reportType: "iadc-weekly",
      label: "Weekly",
      rows: 10,
      site: "DDN1",
      period: { key: "2026-W39", granularity: "weekly", year: 2026, week: 39 },
      records: [],
    },
    {
      reportType: "iadc-daily",
      label: "2026-09-21",
      rows: 10,
      site: "DDN1",
      period: { key: "2026-09-21", granularity: "daily" },
      records: [],
    },
  ], "UK-DCSL-DDN1-DWC-IADC-Report_2026-39.html", {
    key: "2026-W39",
    granularity: "weekly",
    year: 2026,
    week: 39,
  });

  assert.equal(smart.granularity, "weekly_with_daily_detail");
  assert.equal(smart.requiresReview, false);
  assert.ok(smart.warnings.some((warning) => warning.code === "DAILY_DETAIL_INCLUDED" && warning.severity === "info"));

  const plan = buildSmartImportPlan([{ name: "iadc.html", smart }], ["DDN1"]);
  assert.equal(plan.ready, 1);
  assert.equal(plan.warnings, 0);
  assert.equal(plan.review, 0);
});
