import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) =>
  fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("live SEO audit validates canonical host, public pages, sitemap, robots and noindex", () => {
  const script = read("scripts/seo-live-audit.mjs");

  assert.ok(script.includes('EXPECTED_CANONICAL_HOST = "www.metrixiq.co.uk"'));
  assert.ok(script.includes("checkApexRedirect"));
  assert.ok(script.includes("checkPriorityPage"));
  assert.ok(script.includes("checkRobots"));
  assert.ok(script.includes("checkSitemap"));
  assert.ok(script.includes("checkPrivateNoindex"));
  assert.ok(script.includes("check404"));
  assert.ok(script.includes("process.exitCode = 1"));
});

test("scheduled live SEO workflow can run manually or daily", () => {
  const workflow = read(".github/workflows/seo-live.yml");
  const pkg = JSON.parse(read("package.json"));

  assert.ok(workflow.includes("workflow_dispatch:"));
  assert.ok(workflow.includes("schedule:"));
  assert.ok(workflow.includes('cron: "17 6 * * *"'));
  assert.ok(workflow.includes("node scripts/seo-live-audit.mjs"));
  assert.equal(pkg.scripts["seo:audit:live"], "node scripts/seo-live-audit.mjs");
});

test("live SEO audit covers the highest-priority landing pages", () => {
  const script = read("scripts/seo-live-audit.mjs");

  for (const path of [
    "/",
    "/solutions",
    "/fleet-performance-management",
    "/driver-performance-scorecards",
    "/fleet-compliance-monitoring",
    "/delivery-operations-software",
    "/driver-coaching-software",
    "/fleet-data-analytics",
    "/use-cases",
    "/use-cases/fleet-performance-dashboard",
    "/use-cases/multi-site-delivery-performance",
    "/compare/spreadsheets-vs-fleet-performance-software",
    "/resources",
  ]) {
    assert.ok(script.includes('"' + path + '"'), path);
  }
});
