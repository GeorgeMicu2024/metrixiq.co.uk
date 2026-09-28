import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";

import { analyseFiles } from "../lib/analyzer.js";
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
  assert.equal(classifyImportFile({ name: "reports.zip", size: 100 }).status, "ready");

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

test("End-to-end analyzer classifies real eMentor CSV shape as daily", async () => {
  const csv = [
    "First Name,Last Name,FICO Safe Driving Score,Acceleration Rating,Braking Rating,Cornering Rating,Distraction Rating,Speeding Rating,Station,Total Driver Trips",
    "Ana,Driver,830,Low Risk,Low Risk,Low Risk,Low Risk,Low Risk,DDN1,1",
    "Ben,Driver,820,Low Risk,Low Risk,Low Risk,Low Risk,Low Risk,DDN1,1",
    "Cara,Driver,810,Low Risk,Low Risk,Low Risk,Low Risk,Low Risk,DDN1,1",
    "Dan,Driver,800,Low Risk,Low Risk,Low Risk,Low Risk,Low Risk,DDN1,2",
  ].join("\n");

  const result = await analyseFiles([
    new File([csv], "Driver Report_2026-09-27.csv", { type: "text/csv", lastModified: 1 }),
  ]);

  assert.equal(result.recognizedFiles, 1);
  assert.equal(result.fileResults[0].smart.site, "DDN1");
  assert.equal(result.fileResults[0].smart.granularity, "daily");
  assert.deepEqual(result.fileResults[0].smart.reportTypes, ["EMENTOR"]);
});

test("End-to-end analyzer overrides date filename when eMentor data is weekly", async () => {
  const csv = [
    "First Name,Last Name,FICO Safe Driving Score,Acceleration Rating,Braking Rating,Cornering Rating,Distraction Rating,Speeding Rating,Station,Total Driver Trips",
    "Ana,Driver,830,Low Risk,Low Risk,Low Risk,Low Risk,Low Risk,DDN1,4",
    "Ben,Driver,820,Low Risk,Low Risk,Low Risk,Low Risk,Low Risk,DDN1,5",
    "Cara,Driver,810,Low Risk,Low Risk,Low Risk,Low Risk,Low Risk,DDN1,3",
    "Dan,Driver,800,Low Risk,Low Risk,Low Risk,Low Risk,Low Risk,DDN1,6",
  ].join("\n");

  const result = await analyseFiles([
    new File([csv], "Driver Report_2026-09-20.csv", { type: "text/csv", lastModified: 1 }),
  ]);

  assert.equal(result.fileResults[0].period.granularity, "daily");
  assert.equal(result.fileResults[0].smart.granularity, "weekly");
});
