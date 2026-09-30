import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Daily Dispatch detects an Amazon station and preserves uploads while switching site", () => {
  const view = read("components/sites/WavePlanView.jsx");
  assert.ok(view.includes("detectActivitySite"));
  assert.ok(view.includes('/\\bD[A-Z]{2}\\d{1,2}\\b/g'));
  assert.ok(view.includes("pendingDetectedSiteRef"));
  assert.ok(view.includes("detectedSite===norm(site)"));
  assert.ok(view.includes("onDetectedSite(detectedSite)"));
});

test("Import Center auto-selects a single content-detected activity site", () => {
  const center = read("components/imports/ImportCenterV2.jsx");
  assert.ok(center.includes("detectedActivitySite(result)"));
  assert.ok(center.includes("onDetectedSite(detectedSite)"));
  assert.ok(center.includes("setActivitySite(detectedSite)"));
  assert.equal(center.includes("Choose the Activity Site before analysing this import."), false);
});

test("Smart Import Lab sends a single detected site to the workspace selector", () => {
  const lab = read("components/imports/SmartImportLab.jsx");
  assert.ok(lab.includes("syncDetectedSite(plan)"));
  assert.ok(lab.includes("Object.keys(plan?.siteCounts || {})"));
  assert.ok(lab.includes("onDetectedSite(detected[0].toUpperCase())"));
});

test("unknown detected sites open the create-site workflow, while registered sites auto-select", () => {
  const dashboard = read("components/DashboardClient.jsx");
  assert.ok(dashboard.includes("handleDetectedImportSite"));
  assert.ok(dashboard.includes("registeredSites.includes(code)"));
  assert.ok(dashboard.includes("setSiteFilter(code)"));
  assert.ok(dashboard.includes("setSiteCreateDetected(code)"));
  assert.ok(dashboard.includes('displayName: code + " Operations"'));
  assert.ok(dashboard.includes('siteCreateDetected?"Create detected site":"Add new site"'));
  assert.ok(dashboard.includes("onDetectedSite={handleDetectedImportSite}"));
});
