import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { inferSiteCode } from "../lib/analyzer/core.js";

const read = (path) =>
  fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Smart Import detects Amazon station codes from each filename", () => {
  assert.equal(inferSiteCode("UK-DCSL-DXM3-Week39-Concessions.xlsx"), "DXM3");
  assert.equal(inferSiteCode("UK-DCSL-DDN1-DWC-IADC-Report_2026-39.html"), "DDN1");
  assert.equal(inferSiteCode("UK-DCSL-DLS2-Week39-DSP-Scorecard-3.0.pdf"), "DLS2");
});

test("Import Center routes mixed-site batches per file instead of forcing the selected header site", () => {
  const view = read("components/imports/ImportCenterV2.jsx");
  const analyzer = read("lib/analyzer.js");
  const evidence = read("lib/persistence/evidence.js");
  const mentorDaily = read("lib/persistence/mentorDaily.js");

  assert.ok(view.includes("SMART SITE ROUTING"));
  assert.ok(view.includes("Auto-detect per file"));
  assert.ok(view.includes("detectedSitesForAnalysis"));
  assert.ok(view.includes("filesNeedingFallbackSite"));
  assert.ok(view.includes('normalizeSiteCode(result.site)'));
  assert.equal(view.includes("Choose the Activity Site before analysing this import."), false);
  assert.equal(view.includes("Activity Site is required. MetrixIQ will not guess"), false);

  assert.ok(analyzer.includes("const siteFromName = inferSiteCode(file.name)"));
  assert.ok(analyzer.includes("detectedSites"));
  assert.ok(analyzer.includes("siteConflict"));
  assert.ok(analyzer.includes("site: normalizeSiteCode(record?.site) || fileSite ||"));

  assert.ok(evidence.includes("const routedSite"));
  assert.ok(evidence.includes("detected_sites: detectedSites"));
  assert.ok(evidence.includes("fallback_site: fallbackSite || null"));

  const driverFirst = mentorDaily.indexOf("normalizeSiteCode(driver.site)");
  const fallbackLast = mentorDaily.indexOf("normalizeSiteCode(site)");
  assert.ok(driverFirst >= 0 && fallbackLast > driverFirst);
});
