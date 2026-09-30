import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const component = readFileSync(new URL("../components/imports/SmartImportLab.jsx", import.meta.url), "utf8");
const importCenter = readFileSync(new URL("../components/imports/ImportCenterV2.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/manager-intelligence-v3.css", import.meta.url), "utf8");

test("Smart Import detection rows expose mobile labels", () => {
  for (const label of ["File", "Report", "Site", "Period", "Confidence", "Status"]) {
    assert.match(component, new RegExp(`data-label=["']${label}["']`));
  }
  assert.match(component, /smartlab-detection-table/);
});

test("Smart Import mobile CSS converts detection table into cards", () => {
  assert.match(css, /Smart Import Lab mobile hardening/);
  assert.match(css, /\.smartlab-detection-table thead\{display:none\}/);
  assert.match(css, /\.smartlab-detection-table tr\{display:block/);
  assert.match(css, /content:attr\(data-label\)/);
});

test("Import Center does not render escaped newline text between tabs", () => {
  assert.doesNotMatch(importCenter, /SmartImportLab sites=\{sites\}\/>\}\\n\\n/);
});

test("mobile Smart Import advances from detection to isolated staging automatically", () => {
  assert.match(component, /autoAnalyseKey/);
  assert.match(component, /autoStageKey/);
  assert.match(component, /stageToTestDb\(\)/);
  assert.match(component, /AUTOMATED VALIDATION/);
  assert.doesNotMatch(component, />Stage to Test DB<\/button>/);
});


test("unavailable files remain reviewable without clearing the whole batch", () => {
  assert.match(component, /0 B \/ unavailable on this device/);
  assert.match(component, /REVIEW CENTER/);
  assert.match(component, /Remove from batch/);
  assert.match(css, /Smart Import unavailable file state/);
});


test("Review Center exposes edit and remove actions on mobile", () => {
  assert.match(component, /REVIEW CENTER/);
  assert.match(component, /Edit detection/);
  assert.match(component, /Remove from batch/);
  assert.match(component, /Save correction/);
  assert.match(component, /2026-W39 or 2026-09-22/);
  assert.match(css, /Smart Import Review Center/);
  assert.match(css, /\.smartlab-review-editor/);
});

test("automatic staging stays safety-gated until review is resolved", () => {
  assert.match(component, /!result\?\.staging\?\.blockedFiles/);
  assert.match(component, /!result\?\.staging\?\.logicalConflictGroups/);
  assert.match(component, /!plan\?\.review/);
  assert.match(component, /if \(!canStageRemote \|\| !result\?\.staging\) return/);
});


test("combined approval and safety gate stays mobile-friendly and production-safe", () => {
  assert.match(component, /smartlab-approval-card/);
  assert.match(component, /Approve & validate/);
  assert.match(component, /PRODUCTION LOCKED/);
  assert.match(component, /await runProductionPreflight\(approved\.batchId\)/);
  assert.match(css, /Smart Import approval gate/);
  assert.match(css, /\.smartlab-approval-card/);
  assert.match(css, /@media\(max-width:680px\)[\s\S]*\.smartlab-approval-card/);
});


test("Production import unlocks only after the automatic approved preflight gate", () => {
  assert.match(component, /smartlab-production-preflight/);
  assert.match(component, /Import to Production/);
  assert.match(component, /commitToProduction/);
  assert.match(component, /expectedFingerprint: productionPreflight\.batchFingerprint/);
  assert.match(component, /disabled=\{!productionPreflight\.ready \|\| commitBusy \|\| productionCommit\?\.committed\}/);
  assert.match(component, /TRANSACTION \+ FINGERPRINT PROTECTION READY/);
  assert.match(component, /smartlab-success-modal/);
  assert.match(component, /commitSiteBreakdown/);
  assert.match(css, /Smart Import Production preflight/);
  assert.match(css, /\.smartlab-production-grid/);
  assert.match(css, /\.smartlab-success-modal/);
});
