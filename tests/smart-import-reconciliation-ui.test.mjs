import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const analyzer = readFileSync(new URL("../lib/analyzer.js", import.meta.url), "utf8");
const lab = readFileSync(new URL("../components/imports/SmartImportLab.jsx", import.meta.url), "utf8");

test("analysis stamps feedback and scorecard evidence with its exact source file", () => {
  assert.match(analyzer, /feedbackEvents\.push\([\s\S]*sourceFile: event\?\.sourceFile \|\| file\.name/);
  assert.match(analyzer, /siteScorecards\.push\([\s\S]*sourceFile: output\.siteScorecard\?\.sourceFile \|\| file\.name/);
});

test("editing or reanalysing invalidates stale browser dry-run snapshots", () => {
  const rebuild = lab.slice(lab.indexOf("function rebuildResolvedResult"), lab.indexOf("function beginReviewEdit"));
  assert.match(rebuild, /clearBrowserStaging\(sessionStorage\)/);
  assert.match(rebuild, /setBrowserStage\(null\)/);

  const analyse = lab.slice(lab.indexOf("async function analyse()"));
  assert.match(analyse, /clearBrowserStaging\(sessionStorage\)/);
  assert.match(analyse, /setBrowserStage\(null\)/);
});

test("remote stage UI exposes reconciliation and stored record breakdown", () => {
  assert.match(lab, /reconciled/);
  assert.match(lab, /Stored:/);
  assert.match(lab, /driver-period/);
  assert.match(lab, /feedback/);
  assert.match(lab, /site scorecards/);
});


test("preview shows normalized record expectations and raw evidence provenance", () => {
  assert.match(lab, /normalizedPreview/);
  assert.match(lab, /normalizedDriverRecords/);
  assert.match(lab, /normalizedFeedbackRecords/);
  assert.match(lab, /normalizedScorecardRecords/);
  assert.match(lab, /normalized from/);
  assert.match(lab, /raw evidence rows/);
});
