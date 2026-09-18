import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { findIadcHeader } from "../lib/parsers/iadc.js";

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
  assert.ok(read("components/dashboard/navigation.js").includes("Smart Import"));
  assert.ok(read("components/dashboard/DashboardViews.jsx").includes("Smart Import"));
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

test("versioned professional view files are removed", () => {
  assert.equal(fs.existsSync("components/ProfessionalViewsV7.jsx"), false);
  assert.equal(fs.existsSync("components/ProfessionalViewsV9.jsx"), false);
  assert.equal(fs.existsSync("components/ProfessionalViewsV10.jsx"), false);
  assert.ok(fs.existsSync("components/ProfessionalViews.jsx"));
  assert.ok(fs.existsSync("components/DirectOperationalViews.jsx"));
});

test("central KPI target configuration is used", () => {
  const config = read("lib/config/performance.js");
  assert.ok(config.includes("dcr: 99.2"));
  assert.ok(config.includes("pod: 99.6"));
  assert.ok(config.includes("iadc: 80"));
  assert.ok(config.includes("mentor: 815"));

  const dashboard = read("components/DashboardClient.jsx");
  assert.equal(dashboard.includes('"98.8%"'), false);
  assert.equal(dashboard.includes('"98.0%"'), false);
});

test("DashboardClient is orchestration-focused", () => {
  const dashboard = read("components/DashboardClient.jsx");
  assert.ok(dashboard.includes('./dashboard/DashboardViews'));
  assert.ok(dashboard.includes('./dashboard/navigation'));
  assert.ok(dashboard.includes('../lib/data/workspace'));
  assert.ok(dashboard.includes('../lib/data/scorecards'));
  assert.ok(dashboard.includes('../lib/data/driverMetrics'));
  assert.equal(dashboard.includes('.from("driver_metrics")'), false);
  assert.equal(dashboard.includes('setFleetHistory'), false);
  assert.equal(dashboard.includes('async function resolveWorkspace'), false);
  assert.equal(dashboard.includes('function mapScorecard'), false);
  assert.ok(read("lib/data/workspace.js").includes("export async function loadWorkspaceContext"));
  assert.ok(read("lib/data/workspace.js").includes("export async function refreshWorkspacePerformance"));
  assert.ok(read("lib/data/driverMetrics.js").includes("export async function fetchDriverHistory"));
  assert.ok(read("components/dashboard/DashboardViews.jsx").includes("export function DashboardView"));
});

test("scorecard views live in the scorecards product module", () => {
  const operational = read("components/OperationalViews.jsx");
  const scorecards = read("components/scorecards/ScorecardViews.jsx");
  const dashboard = read("components/DashboardClient.jsx");

  assert.ok(scorecards.includes("export function SiteScorecardsView"));
  assert.ok(scorecards.includes("export function DriverScorecardsView"));
  assert.equal(operational.includes("export function SiteScorecardsView"), false);
  assert.equal(operational.includes("export function DriverScorecardsView"), false);
  assert.ok(operational.includes('from "./scorecards/ScorecardViews"'));
  assert.ok(dashboard.includes('./scorecards/ScorecardViews'));
});

test("product views are split by responsibility", () => {
  const professional = read("components/ProfessionalViews.jsx");
  const performance = read("components/performance/PerformanceView.jsx");
  const drivers = read("components/drivers/DriverDirectoryView.jsx");
  const dashboard = read("components/DashboardClient.jsx");

  assert.ok(professional.includes('from "./performance/PerformanceView"'));
  assert.ok(performance.includes("export default function PerformanceView"));
  assert.ok(drivers.includes("export default function DriverDirectoryView"));
  assert.ok(dashboard.includes('./performance/PerformanceView'));
  assert.ok(dashboard.includes('./drivers/DriverDirectoryView'));
  assert.equal(performance.includes("export function ProConcessionsView"), false);
  assert.equal(performance.includes("export function ProMentorView"), false);
});


test("real DWC/IADC report headers are detected", () => {
  const matrix = [
    ["", "Delivery Misses - DNR Risk", "In-app Delivery Workflow (IADC)"],
    ["Contact Miss", "Not Compliant with Unattended"],
    ["Transporter ID", "DWC %", "IADC %", "Total"],
    ["A123456789", "98.67%", "73.64%", "4"],
  ];

  assert.deepEqual(findIadcHeader(matrix), {
    rowIndex: 2,
    idIndex: 0,
    dwcIndex: 1,
    iadcIndex: 2,
  });
});

test("IADC parser does not invent a DLS2 site fallback", () => {
  const analyzer = read("lib/analyzer.js");
  assert.equal(analyzer.includes('|| "DLS2"'), false);
  assert.ok(analyzer.includes("inferSiteCode(fileName"));
});
