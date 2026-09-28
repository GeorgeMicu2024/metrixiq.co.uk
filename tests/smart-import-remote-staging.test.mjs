import test from "node:test";
import assert from "node:assert/strict";

import { buildRemoteStagingPayload } from "../lib/imports/stagingPayload.js";

function smartFile(name, hash, type, site, periodKey, rows = 1) {
  return {
    name,
    contentHash: hash,
    byteSize: 1234,
    mimeType: "application/octet-stream",
    rows,
    recognized: true,
    reportType: type,
    smartState: "ready",
    smart: {
      fileName: name,
      site,
      contentSites: [site],
      reportTypes: [type],
      granularity: "weekly",
      period: { key: periodKey, granularity: "weekly" },
      confidence: 99,
      requiresReview: false,
      warnings: [],
      segments: [],
    },
  };
}

test("remote staging payload preserves files, hashes and normalized evidence", () => {
  const scorecard = smartFile(
    "UK-DCSL-DDN1-Week38-DSP-Scorecard-3.0.pdf",
    "a".repeat(64),
    "DSP_SCORECARD",
    "DDN1",
    "2026-W38",
    2
  );

  const analysis = {
    periods: [{
      key: "2026-W38",
      weekLabel: "W38",
      periodStart: "2026-09-14",
      periodEnd: "2026-09-20",
      granularity: "weekly",
      sourceFiles: [scorecard.name],
      drivers: [
        {
          id: "A123456789",
          name: "Test Driver",
          site: "DDN1",
          sources: [scorecard.name],
          rawMetrics: { dcr: 99.5, pod: 100 },
        },
      ],
    }],
    siteScorecards: [{
      site: "DDN1",
      weekLabel: "W38",
      sourceFile: scorecard.name,
      overallScore: 90,
    }],
    feedbackEvents: [],
  };

  const plan = {
    files: [scorecard],
    logicalDuplicateGroups: [],
  };

  const staging = {
    writesEnabled: false,
    totalFiles: 1,
    readyFiles: 1,
    blockedFiles: 0,
    exactDuplicatesSkipped: 0,
    logicalConflictGroups: 0,
    sourceRows: 1,
    feedbackRows: 0,
    scorecardRows: 1,
    destinations: {
      imports: 1,
      driver_metrics: 1,
      site_scorecards: 1,
    },
    files: [{
      fileName: scorecard.name,
      targets: ["imports", "driver_metrics", "site_scorecards"],
    }],
  };

  const payload = buildRemoteStagingPayload({
    organizationId: "11111111-1111-4111-8111-111111111111",
    analysis,
    plan,
    staging,
    exactDuplicates: [],
  });

  assert.equal(payload.writesEnabled, false);
  assert.equal(payload.files.length, 1);
  assert.equal(payload.files[0].contentHash, "a".repeat(64));
  assert.equal(payload.files[0].byteSize, 1234);
  assert.equal(payload.files[0].sites[0], "DDN1");
  assert.equal(payload.records.length, 2);
  assert.ok(payload.records.some((row) => row.reportType === "DRIVER_PERIOD"));
  assert.ok(payload.records.some((row) => row.reportType === "SITE_SCORECARD"));
});

test("remote staging payload carries exact duplicates as duplicate state", () => {
  const original = smartFile(
    "POD.pdf",
    "b".repeat(64),
    "POD_QUALITY",
    "DLS2",
    "2026-W38"
  );
  const duplicateFile = {
    name: "POD - Copy.pdf",
    size: 999,
    type: "application/pdf",
  };

  const payload = buildRemoteStagingPayload({
    organizationId: "11111111-1111-4111-8111-111111111111",
    analysis: { periods: [], siteScorecards: [], feedbackEvents: [] },
    plan: { files: [original], logicalDuplicateGroups: [] },
    staging: {
      writesEnabled: false,
      totalFiles: 1,
      readyFiles: 1,
      blockedFiles: 0,
      exactDuplicatesSkipped: 1,
      logicalConflictGroups: 0,
      sourceRows: 0,
      feedbackRows: 0,
      scorecardRows: 0,
      destinations: { imports: 1, driver_metrics: 1 },
      files: [{ fileName: original.name, targets: ["imports", "driver_metrics"] }],
    },
    exactDuplicates: [{
      file: duplicateFile,
      duplicateOf: { name: original.name },
      hash: "b".repeat(64),
    }],
  });

  assert.equal(payload.summary.sourceCount, 2);
  assert.equal(payload.files.length, 2);
  const duplicate = payload.files.find((file) => file.state === "duplicate");
  assert.equal(duplicate.fileName, "POD - Copy.pdf");
  assert.equal(duplicate.metadata.duplicateOfName, "POD.pdf");
});

test("remote staging refuses a write-enabled source plan", () => {
  assert.throws(() => buildRemoteStagingPayload({
    organizationId: "11111111-1111-4111-8111-111111111111",
    analysis: {},
    plan: {},
    staging: { writesEnabled: true },
  }), /validated zero-write staging plan/);
});
