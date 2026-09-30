import test from "node:test";
import assert from "node:assert/strict";

import {
  STORAGE_KEY,
  clearBrowserStaging,
  createBrowserStagingSnapshot,
  loadBrowserStaging,
  saveBrowserStaging,
} from "../lib/imports/browserStaging.js";

function storageMock() {
  const data = new Map();
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); },
  };
}

const plan = {
  writesEnabled: false,
  totalFiles: 2,
  readyFiles: 1,
  blockedFiles: 1,
  exactDuplicatesSkipped: 3,
  logicalConflictGroups: 0,
  sourceRows: 20,
  feedbackRows: 0,
  scorecardRows: 1,
  destinations: { imports: 1, driver_metrics: 1 },
  files: [{
    fileName: "scorecard.pdf",
    contentHash: "abc",
    reportTypes: ["DSP_SCORECARD"],
    sites: ["DLS2"],
    periodKey: "2026-W38",
    granularity: "weekly",
    confidence: 99,
    targets: ["imports", "driver_metrics", "site_scorecards"],
    rows: 20,
  }],
  blocked: [{
    fileName: "encrypted.pdf",
    reportTypes: ["INCENTIVE_REWARDS"],
    sites: ["DLS2"],
    periodKey: "2026-W38",
    reasons: [{ code: "ENCRYPTED_PDF", message: "Encrypted." }],
  }],
};

test("browser staging snapshot stores metadata only and remains explicitly zero-write", () => {
  const snapshot = createBrowserStagingSnapshot(plan);
  assert.equal(snapshot.mode, "browser_dry_run");
  assert.equal(snapshot.writesEnabled, false);
  assert.equal(snapshot.summary.readyFiles, 1);
  assert.equal(snapshot.files[0].fileName, "scorecard.pdf");
  assert.equal(snapshot.files[0].targets.includes("driver_metrics"), true);
  assert.equal("rawFile" in snapshot.files[0], false);
});

test("browser staging can save load and discard from injected session storage", () => {
  const storage = storageMock();
  const saved = saveBrowserStaging(storage, plan);
  assert.ok(storage.getItem(STORAGE_KEY));
  assert.equal(loadBrowserStaging(storage).createdAt, saved.createdAt);
  clearBrowserStaging(storage);
  assert.equal(loadBrowserStaging(storage), null);
});

test("browser staging refuses any plan that is not explicitly zero-write", () => {
  assert.throws(
    () => createBrowserStagingSnapshot({ ...plan, writesEnabled: true }),
    /Only zero-write staging plans/
  );
});
