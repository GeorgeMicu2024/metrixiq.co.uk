import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const pkg = JSON.parse(read("package.json"));

test("required scripts exist", () => {
  assert.equal(pkg.scripts.dev, "next dev");
  assert.equal(pkg.scripts.build, "next build");
  assert.equal(pkg.scripts.test, "node --test tests/*.test.mjs");
});

test("Tailwind is not a dependency", () => {
  assert.equal(pkg.dependencies?.tailwindcss, undefined);
  assert.equal(pkg.devDependencies?.tailwindcss, undefined);
});

test("global CSS contains application shell styles", () => {
  assert.ok(read("app/globals.css").includes(".app-shell"));
});

test("dashboard exposes Smart Import", () => {
  assert.ok(read("components/DashboardClient.jsx").includes("Smart Import"));
});

test("analyzer validates station codes", () => {
  const analyzer = read("lib/analyzer.js");
  assert.ok(analyzer.includes("function normalizeSiteCode"));
  assert.ok(analyzer.includes("site: normalizeSiteCode(site)"));
});

test("auth callback restricts redirects to internal paths", () => {
  const callback = read("app/auth/callback/page.jsx");
  assert.ok(callback.includes("function safeInternalPath"));
  assert.ok(callback.includes('candidate.startsWith("//")'));
});

test("billing API routes are present", () => {
  for (const path of [
    "app/api/billing/checkout/route.js",
    "app/api/billing/portal/route.js",
    "app/api/billing/webhook/route.js",
  ]) {
    assert.ok(fs.existsSync(path), `missing ${path}`);
  }
});

test("CI workflow is present", () => {
  assert.ok(fs.existsSync(".github/workflows/ci.yml"));
});

test("accidental local Downloads folder is not tracked", () => {
  assert.equal(fs.existsSync("Downloads/metrixiq-v7-professional-ops/components/ProfessionalViewsV7.jsx"), false);
});
