import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) =>
  fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("production SEO release gate checks newly launched public surfaces", () => {
  const workflow = read(".github/workflows/production-seo-release.yml");

  assert.ok(workflow.includes('name: Production SEO Release Gate'));
  assert.ok(workflow.includes('workflow_dispatch:'));
  assert.ok(workflow.includes('$base/pricing'));
  assert.ok(workflow.includes('$base/llms.txt'));
  assert.ok(workflow.includes('$base/.well-known/security.txt'));
  assert.ok(workflow.includes('$base/ef82465f539835b58ac06a883439c0c0.txt'));
  assert.ok(workflow.includes('node scripts/seo-live-audit.mjs'));
  assert.ok(workflow.includes('node scripts/indexnow-submit.mjs'));
});

test("IndexNow submission is impossible until the release checks pass", () => {
  const workflow = read(".github/workflows/production-seo-release.yml");

  const surfaceCheck = workflow.indexOf("Verify production SEO surface");
  const liveAudit = workflow.indexOf("Run full live SEO audit");
  const readiness = workflow.indexOf("Verify IndexNow production readiness");
  const submit = workflow.indexOf("Submit canonical URLs to IndexNow");

  assert.ok(surfaceCheck > -1);
  assert.ok(liveAudit > surfaceCheck);
  assert.ok(readiness > liveAudit);
  assert.ok(submit > readiness);
  assert.ok(workflow.includes('if: ${{ inputs.submit_indexnow }}'));
});

test("production release gate defaults to verification-only mode", () => {
  const workflow = read(".github/workflows/production-seo-release.yml");

  assert.ok(workflow.includes('submit_indexnow:'));
  assert.ok(workflow.includes('default: false'));
  assert.ok(workflow.includes('default: "https://www.metrixiq.co.uk"'));
});


test("production SEO release gate enforces public performance budgets before IndexNow", () => {
  const workflow = read(".github/workflows/production-seo-release.yml");

  const liveAudit = workflow.indexOf("Run full live SEO audit");
  const performance = workflow.indexOf("Enforce public performance budgets");
  const readiness = workflow.indexOf("Verify IndexNow production readiness");

  assert.ok(performance > liveAudit);
  assert.ok(readiness > performance);
  assert.ok(workflow.includes("node scripts/public-performance-budget.mjs"));
  assert.ok(workflow.includes("PERF_AUDIT_BASE_URL"));
});
