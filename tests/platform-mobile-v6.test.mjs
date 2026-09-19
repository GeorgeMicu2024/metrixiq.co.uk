import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { ROLE_DEFAULTS } from "../lib/governance/permissions.js";
import { canAccessNav } from "../lib/permissions/navigation.js";

test("V6 permission defaults keep platform telemetry manager scoped", () => {
  assert.equal(ROLE_DEFAULTS.manager.view_integrations, true);
  assert.equal(ROLE_DEFAULTS.manager.view_reliability, true);
  assert.equal(ROLE_DEFAULTS.manager.manage_integrations, true);
  assert.equal(ROLE_DEFAULTS.manager.run_reliability_checks, true);

  assert.equal(ROLE_DEFAULTS.dispatcher.view_integrations, false);
  assert.equal(ROLE_DEFAULTS.dispatcher.view_reliability, false);
  assert.equal(ROLE_DEFAULTS.viewer.view_integrations, false);
  assert.equal(ROLE_DEFAULTS.viewer.view_reliability, false);
});

test("V6 navigation gates mobile and platform controls by plan and permission", () => {
  assert.equal(
    canAccessNav("mobile-manager", { effective_plan: "pro" }, false, "manager", ROLE_DEFAULTS.manager),
    true
  );
  assert.equal(
    canAccessNav("mobile-manager", { effective_plan: "pro" }, false, "viewer", ROLE_DEFAULTS.viewer),
    false
  );
  assert.equal(
    canAccessNav("integrations", { effective_plan: "business" }, false, "manager", ROLE_DEFAULTS.manager),
    true
  );
  assert.equal(
    canAccessNav("reliability", { effective_plan: "business" }, false, "manager", ROLE_DEFAULTS.manager),
    true
  );
  assert.equal(
    canAccessNav("integrations", { effective_plan: "pro" }, false, "manager", ROLE_DEFAULTS.manager),
    false
  );
});

test("V6 migration creates integration freshness and reliability audit layers", () => {
  const sql = fs.readFileSync("supabase/migrations/20260919_platform_mobile_v6.sql", "utf8").toLowerCase();

  for (const fragment of [
    "create table if not exists public.integration_configs",
    "create table if not exists public.reliability_checks",
    "alter table public.integration_configs enable row level security",
    "alter table public.reliability_checks enable row level security",
    "create or replace function public.list_integration_health",
    "create or replace function public.update_integration_config",
    "create or replace function public.get_reliability_snapshot",
    "create or replace function public.save_reliability_check",
    "create or replace function public.list_reliability_checks",
    "'scorecard','dsp scorecard'",
    "'mentor','ementor / fico'",
    "'iadc','iadc'",
    "'cdf','cdf'",
    "'concessions','concessions'",
    "'driver_master','driver master'",
    "'reliability_check'",
  ]) {
    assert.ok(sql.includes(fragment), "missing " + fragment);
  }
});

test("Data Freshness Monitor uses report periods and explicit cadence states", () => {
  const sql = fs.readFileSync("supabase/migrations/20260919_platform_mobile_v6.sql", "utf8").toLowerCase();
  const monitor = fs.readFileSync("components/platform/DataFreshnessMonitor.jsx", "utf8");

  assert.ok(sql.includes("max(i.period_end) as last_period_end"));
  assert.ok(sql.includes("freshness_status"));
  assert.ok(sql.includes("'fresh'"));
  assert.ok(sql.includes("'warning'"));
  assert.ok(sql.includes("'stale'"));
  assert.ok(sql.includes("'missing'"));
  assert.ok(monitor.includes("Latest period"));
  assert.ok(monitor.includes("Expected"));
});

test("PWA V6 is installable without caching private workspace navigation", () => {
  const manifest = JSON.parse(fs.readFileSync("public/manifest.webmanifest", "utf8"));
  const sw = fs.readFileSync("public/sw.js", "utf8");
  const bootstrap = fs.readFileSync("components/pwa/PwaBootstrap.jsx", "utf8");
  const layout = fs.readFileSync("app/layout.jsx", "utf8");

  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/app");
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0);
  assert.ok(sw.includes('url.pathname.startsWith("/_next/static/")'));
  assert.ok(sw.includes('if(!cacheable)return'));
  assert.equal(sw.includes('caches.match("/app")'), false);
  assert.equal(sw.includes('url.pathname.startsWith("/api/")'), false);
  assert.ok(bootstrap.includes('navigator.serviceWorker.register("/sw.js"'));
  assert.ok(bootstrap.includes("beforeinstallprompt"));
  assert.ok(layout.includes("<PwaBootstrap />"));
  assert.ok(layout.includes('viewportFit: "cover"'));
});

test("Mobile Manager Mode exposes action queue, driver lookup, audited notes and install path", () => {
  const mobile = fs.readFileSync("components/mobile/MobileManagerMode.jsx", "utf8");
  const dock = fs.readFileSync("components/mobile/MobileCommandDock.jsx", "utf8");
  const dashboard = fs.readFileSync("components/DashboardClient.jsx", "utf8");

  assert.ok(mobile.includes("MOBILE MANAGER MODE"));
  assert.ok(mobile.includes("Quick driver search"));
  assert.ok(mobile.includes("Quick manager note"));
  assert.ok(mobile.includes("addDriverNote"));
  assert.ok(mobile.includes("installApp"));
  assert.ok(dock.includes("Mobile manager shortcuts"));
  assert.ok(dashboard.includes('./mobile/MobileManagerMode'));
  assert.ok(dashboard.includes("<MobileCommandDock"));
  assert.ok(dashboard.includes('case "mobile-manager"'));
});

test("Integration Hub and Reliability Center are canonical V6 platform surfaces", () => {
  const dashboard = fs.readFileSync("components/DashboardClient.jsx", "utf8");
  const navigation = fs.readFileSync("components/dashboard/navigation.js", "utf8");
  const integrations = fs.readFileSync("components/platform/IntegrationHub.jsx", "utf8");
  const reliability = fs.readFileSync("components/platform/ReliabilityCenter.jsx", "utf8");
  const data = fs.readFileSync("lib/data/platformV6.js", "utf8");

  assert.ok(navigation.includes('["integrations", "Integration Hub"]'));
  assert.ok(navigation.includes('["reliability", "Reliability Center"]'));
  assert.ok(dashboard.includes('./platform/IntegrationHub'));
  assert.ok(dashboard.includes('./platform/ReliabilityCenter'));
  assert.ok(dashboard.includes('case "integrations"'));
  assert.ok(dashboard.includes('case "reliability"'));
  assert.ok(integrations.includes("Operational Data Sources"));
  assert.ok(integrations.includes("Freshness policy"));
  assert.ok(reliability.includes("Release-readiness checklist"));
  assert.ok(reliability.includes("Run full check"));
  assert.ok(data.includes('supabase.rpc("list_integration_health"'));
  assert.ok(data.includes('supabase.rpc("get_reliability_snapshot"'));
  assert.ok(data.includes('supabase.rpc("save_reliability_check"'));
});
