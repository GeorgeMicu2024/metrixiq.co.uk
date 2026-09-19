import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  POLICY_METRICS,
  evaluatePerformancePolicy,
  resolvePerformancePolicy,
} from "../lib/config/performance.js";
import { ROLE_DEFAULTS } from "../lib/governance/permissions.js";
import { canAccessNav } from "../lib/permissions/navigation.js";

test("V7 resolves site KPI overrides before organisation policies and defaults", () => {
  const policies = [
    { site: null, metric: "dcr", target: 99.3, direction: "gte", warning_margin: 0.2, unit: "percent", enabled: true },
    { site: "DLS2", metric: "dcr", target: 99.5, direction: "gte", warning_margin: 0.1, unit: "percent", enabled: true },
  ];

  const sitePolicy = resolvePerformancePolicy("dcr", policies, "DLS2");
  const orgPolicy = resolvePerformancePolicy("dcr", policies, "DXM3");
  const fallback = resolvePerformancePolicy("pod", [], "DLS2");

  assert.equal(sitePolicy.target, 99.5);
  assert.equal(sitePolicy.scope, "DLS2");
  assert.equal(sitePolicy.source, "custom");
  assert.equal(orgPolicy.target, 99.3);
  assert.equal(orgPolicy.scope, "organization");
  assert.equal(fallback.target, 99.6);
  assert.equal(fallback.source, "default");
});

test("V7 policy evaluator supports higher-is-better and lower-is-better KPIs", () => {
  const policies = [
    { site: null, metric: "dcr", target: 99.2, direction: "gte", warning_margin: 0.2, unit: "percent", enabled: true },
    { site: null, metric: "cdf_dpmo", target: 4420, direction: "lte", warning_margin: 1000, unit: "dpmo", enabled: true },
  ];

  assert.equal(evaluatePerformancePolicy("dcr", 99.4, policies).status, "pass");
  assert.equal(evaluatePerformancePolicy("dcr", 99.1, policies).status, "warning");
  assert.equal(evaluatePerformancePolicy("dcr", 98.5, policies).status, "fail");

  assert.equal(evaluatePerformancePolicy("cdf_dpmo", 4000, policies).status, "pass");
  assert.equal(evaluatePerformancePolicy("cdf_dpmo", 5000, policies).status, "warning");
  assert.equal(evaluatePerformancePolicy("cdf_dpmo", 7000, policies).status, "fail");
  assert.ok(POLICY_METRICS.some((item) => item.key === "total_score"));
});

test("V7 enterprise permissions are manager-readable but portfolio linking remains owner/admin controlled", () => {
  assert.equal(ROLE_DEFAULTS.owner.view_portfolio, true);
  assert.equal(ROLE_DEFAULTS.owner.manage_portfolio, true);
  assert.equal(ROLE_DEFAULTS.manager.view_portfolio, true);
  assert.equal(ROLE_DEFAULTS.manager.manage_portfolio, false);
  assert.equal(ROLE_DEFAULTS.manager.manage_kpi_policy, true);
  assert.equal(ROLE_DEFAULTS.manager.manage_branding, true);
  assert.equal(ROLE_DEFAULTS.dispatcher.view_portfolio, false);
  assert.equal(ROLE_DEFAULTS.viewer.view_enterprise_settings, false);
});

test("V7 portfolio navigation is Full-plan gated", () => {
  assert.equal(
    canAccessNav("portfolio", { effective_plan: "full" }, false, "owner", ROLE_DEFAULTS.owner),
    true
  );
  assert.equal(
    canAccessNav("portfolio", { effective_plan: "business" }, false, "owner", ROLE_DEFAULTS.owner),
    false
  );
  assert.equal(
    canAccessNav("enterprise-settings", { effective_plan: "full" }, false, "manager", ROLE_DEFAULTS.manager),
    true
  );
  assert.equal(
    canAccessNav("portfolio", { effective_plan: "full" }, false, "dispatcher", ROLE_DEFAULTS.dispatcher),
    false
  );
});

test("V7 migration creates tenant-isolated portfolio, hierarchy, KPI and branding layers", () => {
  const sql = fs.readFileSync("supabase/migrations/20260919_enterprise_portfolio_v7.sql", "utf8").toLowerCase();

  for (const fragment of [
    "create table if not exists public.enterprise_portfolios",
    "create table if not exists public.enterprise_portfolio_members",
    "create table if not exists public.enterprise_portfolio_organizations",
    "create table if not exists public.organization_site_profiles",
    "create table if not exists public.organization_kpi_policies",
    "create table if not exists public.organization_branding",
    "alter table public.enterprise_portfolios enable row level security",
    "create or replace function private.can_view_portfolio",
    "create or replace function private.can_manage_portfolio",
    "create or replace function public.list_my_workspaces",
    "create or replace function public.list_my_portfolios",
    "create or replace function public.list_portfolio_benchmark",
    "create or replace function public.list_portfolio_weeks",
    "create or replace function public.upsert_kpi_policy",
    "create or replace function public.update_organization_branding",
    "private.driver_point_score",
    "'portfolio_linked'",
    "'kpi_policy_updated'",
    "'branding_updated'",
  ]) {
    assert.ok(sql.includes(fragment), "missing " + fragment);
  }
});

test("V7 workspace resolver supports multiple organisation memberships and preferred workspace selection", () => {
  const workspace = fs.readFileSync("lib/data/workspace.js", "utf8");

  assert.ok(workspace.includes("preferredOrganizationId"));
  assert.ok(workspace.includes("memberships.find"));
  assert.ok(workspace.includes("workspaces: memberships.map(workspaceOption)"));
  assert.equal(workspace.includes(".limit(1)"), false);
  assert.ok(workspace.includes('supabase.rpc("get_organization_branding"'));
});

test("V7 product surfaces wire portfolio, enterprise settings and workspace switching into the app shell", () => {
  const dashboard = fs.readFileSync("components/DashboardClient.jsx", "utf8");
  const navigation = fs.readFileSync("components/dashboard/navigation.js", "utf8");
  const portfolio = fs.readFileSync("components/enterprise/PortfolioDashboard.jsx", "utf8");
  const settings = fs.readFileSync("components/enterprise/EnterpriseSettings.jsx", "utf8");
  const brand = fs.readFileSync("components/Brand.jsx", "utf8");

  assert.ok(dashboard.includes('./enterprise/PortfolioDashboard'));
  assert.ok(dashboard.includes('./enterprise/EnterpriseSettings'));
  assert.ok(dashboard.includes("switchWorkspace"));
  assert.ok(dashboard.includes('aria-label="Switch organisation workspace"'));
  assert.ok(dashboard.includes("<Brand inverse branding={branding}"));
  assert.ok(navigation.includes('["portfolio", "Enterprise Portfolio"]'));
  assert.ok(navigation.includes('["enterprise-settings", "Enterprise Settings"]'));
  assert.ok(portfolio.includes("Cross-site benchmark"));
  assert.ok(portfolio.includes("Only organisations you already manage can be linked"));
  assert.ok(settings.includes("Policy inheritance"));
  assert.ok(settings.includes("White-label Branding"));
  assert.ok(brand.includes("brand-custom-logo"));
  assert.ok(brand.includes("branding?.brand_name"));
});
