import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { findIadcHeader } from "../lib/parsers/iadc.js";
import { classifyImportFile, prepareImportFiles, summarizePreflight } from "../lib/imports/preflight.js";
import { buildImportIntelligence } from "../lib/imports/analysisSummary.js";
import { inferPeriod, normalizeSiteCode, riskFor, scorecardTierFromTotal } from "../lib/analyzer/core.js";
import { parseGenericMatrix } from "../lib/analyzer/spreadsheet.js";
import { buildFleetIntelligence } from "../lib/intelligence/fleet.js";
import { PLAN_CATALOG, formatPlanPrice } from "../lib/config/plans.js";
import { issueFrom as persistenceIssue, riskFrom as persistenceRisk } from "../lib/persistence/metrics.js";
import { buildDriverPerformanceRows, buildExecutiveSummary, buildRiskRows, toCsv } from "../lib/reports/fleetReports.js";
import { buildDriver360Snapshot } from "../lib/drivers/driver360.js";
import { buildConcessionsSignals } from "../lib/operations/concessions.js";
import { buildWeeklyExecutiveBrief, formatWeeklyExecutiveBrief } from "../lib/reports/weeklyExecutiveBrief.js";

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

test("performance and scorecards use the central Contact Compliance target", () => {
  const performance = read("components/performance/PerformanceView.jsx");
  const scorecards = read("components/scorecards/ScorecardViews.jsx");

  assert.ok(performance.includes("driver.cc>=TARGETS.cc"));
  assert.equal(performance.includes("driver.cc>=98"), false);
  assert.ok(scorecards.includes('key === "cc") return v >= TARGETS.cc'));
  assert.equal(scorecards.includes('key === "cc") return v >= 99'), false);
});

test("performance and scorecard views keep large styling out of component files", () => {
  const performance = read("components/performance/PerformanceView.jsx");
  const scorecards = read("components/scorecards/ScorecardViews.jsx");
  const css = read("app/globals.css");

  assert.equal(performance.includes("<style jsx global>"), false);
  assert.equal(scorecards.includes("<style jsx global>"), false);
  assert.ok(performance.length < 45000);
  assert.ok(scorecards.length < 45000);
  assert.ok(css.includes(".pfp-root"));
  assert.ok(css.includes(".sitepro-root"));
});


test("PerformanceView delegates metric logic and chart primitives", () => {
  const view = read("components/performance/PerformanceView.jsx");
  const metrics = read("lib/performance/metrics.js");
  const primitives = read("components/performance/PerformancePrimitives.jsx");

  assert.equal(view.includes("function driverIndex("), false);
  assert.equal(view.includes("function ProTrendChart("), false);
  assert.equal(view.includes("function RangeTabs("), false);
  assert.ok(view.includes("../../lib/performance/metrics"));
  assert.ok(view.includes("./PerformancePrimitives"));
  assert.ok(metrics.includes("export function driverIndex"));
  assert.ok(metrics.includes("export function metricStatus"));
  assert.ok(primitives.includes("export function ProTrendChart"));
  assert.ok(primitives.includes("export function RangeTabs"));
});


test("global CSS contains application shell styles", () => {
  assert.ok(read("app/globals.css").includes(".app-shell"));
});

test("Smart Import preflight rejects unsupported and deduplicates files", () => {
  const good = { name: "iadc-week36.xlsx", size: 1024, lastModified: 1 };
  const duplicate = { name: "iadc-week36.xlsx", size: 1024, lastModified: 1 };
  const unsupported = { name: "photo.png", size: 2048, lastModified: 2 };

  assert.equal(classifyImportFile(good).status, "ready");
  assert.equal(classifyImportFile(unsupported).status, "blocked");

  const prepared = prepareImportFiles([good], [duplicate, unsupported]);
  assert.equal(prepared.duplicates, 1);
  assert.equal(prepared.files.length, 2);

  const summary = summarizePreflight(prepared.files);
  assert.equal(summary.ready, 1);
  assert.equal(summary.blocked, 1);
});

test("Smart Import readiness explains incomplete evidence", () => {
  const intelligence = buildImportIntelligence({
    fileResults: [
      { name: "iadc.xlsx", recognized: true, status: "parsed", reportType: "iadc" },
      { name: "mentor.xlsx", recognized: false, status: "error", reportType: null },
    ],
    recognizedFiles: 1,
    errorFiles: 1,
    unsupportedFiles: 0,
    driverCount: 10,
    unmatchedDrivers: 2,
    periods: [{ key: "2026-W36" }],
  });

  assert.ok(intelligence.readiness > 0 && intelligence.readiness < 100);
  assert.ok(intelligence.reportTypes.includes("iadc"));
  assert.ok(intelligence.actions.some((item) => item.includes("failed to parse")));
  assert.ok(intelligence.actions.some((item) => item.includes("unmatched driver")));
});

test("shared analyzer parsers remain runtime-safe across formats", () => {
  assert.equal(scorecardTierFromTotal(49), "Poor");
  assert.equal(scorecardTierFromTotal(94), "Fantastic Plus");

  const generic = parseGenericMatrix(
    [
      ["TRID", "Driver Name", "DCR"],
      ["A123456789", "John Driver", "99.5%"],
    ],
    "generic.csv",
    "Sheet1"
  );

  assert.equal(generic?.records?.length, 1);
  assert.equal(generic.records[0].metrics.dcr, 99.5);
});

test("analyzer delegates HTML and PDF parsing to dedicated engines", () => {
  const analyzer = read("lib/analyzer.js");
  const html = read("lib/analyzer/html.js");
  const pdf = read("lib/analyzer/pdf.js");
  const spreadsheet = read("lib/analyzer/spreadsheet.js");

  assert.ok(analyzer.includes('from "./analyzer/html"'));
  assert.ok(analyzer.includes('from "./analyzer/pdf"'));
  assert.equal(analyzer.includes("function parseIadcHtml"), false);
  assert.equal(analyzer.includes("async function extractPdf"), false);
  assert.ok(html.includes("export async function parseHtml"));
  assert.ok(html.includes("parseGenericMatrix"));
  assert.ok(pdf.includes("export async function parsePdf"));
  assert.ok(pdf.includes("scorecardTierFromTotal"));
  assert.ok(spreadsheet.includes("export function parseGenericMatrix"));
  assert.ok(analyzer.length < 18000);
});

test("analyzer delegates spreadsheet parsing to a dedicated engine", () => {
  const analyzer = read("lib/analyzer.js");
  const spreadsheet = read("lib/analyzer/spreadsheet.js");
  const core = read("lib/analyzer/core.js");

  assert.ok(analyzer.includes('from "./analyzer/spreadsheet"'));
  assert.ok(analyzer.includes("parseSpreadsheet(file)"));
  assert.equal(analyzer.includes("function parseMentorMatrix"), false);
  assert.equal(analyzer.includes("function parseConcessionMatrix"), false);
  assert.equal(analyzer.includes("function parseScorecardMatrix"), false);
  assert.ok(spreadsheet.includes("export async function parseSpreadsheet"));
  assert.ok(spreadsheet.includes("function parseMentorMatrix"));
  assert.ok(spreadsheet.includes("function parseConcessionMatrix"));
  assert.ok(spreadsheet.includes("function parseScorecardMatrix"));
  assert.ok(core.includes("export function inferPeriod"));
  assert.ok(analyzer.length < 40000);
});

test("Concessions spreadsheet parsers preserve site from source filenames", () => {
  const spreadsheet = read("lib/analyzer/spreadsheet.js");

  assert.ok(spreadsheet.includes("const site = inferSiteCode(fileName, sheetName);"));
  assert.ok(spreadsheet.includes("trid,\n        site,\n        metrics: { concessions: count }"));
  assert.ok(spreadsheet.includes("name,\n        site,\n        source: fileName"));
  assert.ok(spreadsheet.includes("name: x.name,\n        site,\n        metrics: {"));
});

test("Concessions historical site backfill remains conflict-safe", () => {
  const migration = read("supabase/migrations/202609182039_backfill_driver_site_from_metric_sources.sql");

  assert.ok(migration.includes("having count(distinct site)=1"));
  assert.ok(migration.includes("d.site is null or btrim(d.site)=''"));
  assert.ok(migration.includes("raw_data->'source_files'"));
});



test("persistence metrics use central KPI targets", () => {
  assert.equal(
    persistenceIssue({ cc: 98.5 }),
    "No active concern"
  );
  assert.equal(
    persistenceIssue({ cc: 97.5 }),
    "Contact Compliance below 98.00% target"
  );
  assert.equal(
    persistenceRisk({ dcr: 98, pod: 99, iadc: 70, mentor_score: 800 }),
    "High"
  );

  const metrics = read("lib/persistence/metrics.js");
  assert.ok(metrics.includes('from "../config/performance.js"'));
  assert.equal(metrics.includes("Number(row.cc) < 99"), false);
});

test("Weekly Executive Brief combines fleet movement and command center evidence", () => {
  const brief = buildWeeklyExecutiveBrief({
    drivers: [
      { id: "A1", name: "Driver One", site: "DLS2", risk: "High", performance: 82, dcr: 98.8, pod: 99.5, iadc: 75, cc: 97, mentor_score: 810, concessions: 2 },
      { id: "A2", name: "Driver Two", site: "DLS2", risk: "Low", performance: 91, dcr: 99.5, pod: 99.8, iadc: 88, cc: 99, mentor_score: 830, concessions: 0 },
    ],
    kpis: { dcr: 99.15, pod: 99.65, iadc: 81.5, cc: 98, mentor: 820, concessions: 1 },
    history: [
      { week_label: "W36", performance: 84 },
      { week_label: "W37", performance: 87 },
    ],
    commandCenter: {
      period_label: "W37",
      alerts: { total: 3, critical: 1, high: 1, repeat_concessions: 1, dcr_drop: 1, deteriorating: 0 },
      coaching: { open: 2, overdue: 1, closed: 3 },
      priority_drivers: [
        { driver_name: "Driver One", trid: "A1", site: "DLS2", alert_count: 2, critical_count: 1, high_count: 1, rank_score: 140 },
      ],
    },
  });

  assert.equal(brief.period, "W37");
  assert.equal(brief.performance.delta, 3);
  assert.equal(brief.alerts.total, 3);
  assert.equal(brief.coaching.overdue, 1);
  assert.equal(brief.priorities[0].trid, "A1");

  const textBrief = formatWeeklyExecutiveBrief(brief);
  assert.ok(textBrief.includes("METRIXIQ WEEKLY EXECUTIVE BRIEF"));
  assert.ok(textBrief.includes("PRIORITY DRIVERS"));
  assert.ok(textBrief.includes("NEXT ACTIONS"));
});

test("Reports exposes the Weekly Executive Brief workflow", () => {
  const reports = read("components/reports/ReportsView.jsx");
  const dashboard = read("components/DashboardClient.jsx");

  assert.ok(reports.includes("Weekly Executive Brief"));
  assert.ok(reports.includes("copyWeeklyBrief"));
  assert.ok(reports.includes("formatWeeklyExecutiveBrief"));
  assert.ok(dashboard.includes("commandCenter={commandCenter}"));
});

test("reports builders export real fleet evidence", () => {
  const drivers = [
    { id: "TRID1", name: "Driver One", site: "DLS2", risk: "High", dcr: 98, pod: 99, iadc: 70, ementor: 800, cc: 96, concessions: 4 },
    { id: "TRID2", name: "Driver Two", site: "DLS2", risk: "Low", dcr: 100, pod: 100, iadc: 90, ementor: 830, cc: 99, concessions: 0 },
  ];

  const driverRows = buildDriverPerformanceRows(drivers);
  const riskRows = buildRiskRows(drivers);
  const csv = toCsv(driverRows);
  const executive = buildExecutiveSummary(drivers, {}, []);

  assert.equal(driverRows.length, 2);
  assert.equal(riskRows.length, 1);
  assert.ok(csv.includes("trid,name,site"));
  assert.ok(csv.includes("TRID1"));
  assert.equal(executive.fleet.drivers, 2);
  assert.equal(executive.fleet.highRisk, 1);
});

test("Reports CSV export is Excel-friendly and formula-safe", () => {
  const csv = toCsv([
    {
      name: "=2+2",
      note: "@SUM(A1:A2)",
      negative_text: "-5+2",
      negative_number: -5,
      normal: "Driver",
    },
  ]);

  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes("'=2+2"));
  assert.ok(csv.includes("'@SUM(A1:A2)"));
  assert.ok(csv.includes("'-5+2"));
  assert.ok(csv.includes(",-5,"));
  assert.ok(csv.includes("\r\n"));
});


test("Reports Center is a canonical functional module", () => {
  const dashboardViews = read("components/dashboard/DashboardViews.jsx");
  const reports = read("components/reports/ReportsView.jsx");
  const dashboard = read("components/DashboardClient.jsx");

  assert.equal(dashboardViews.includes("export function ReportsView"), false);
  assert.ok(reports.includes("buildExecutiveSummary"));
  assert.ok(reports.includes("Download CSV"));
  assert.ok(reports.includes("Print / Save PDF"));
  assert.ok(dashboard.includes('./reports/ReportsView'));
  assert.ok(dashboard.includes("visibleFleetHistory"));
});

test("persistence orchestration delegates identity and evidence storage", () => {
  const persistence = read("lib/persistence.js");
  const identity = read("lib/persistence/identity.js");
  const evidence = read("lib/persistence/evidence.js");

  assert.ok(persistence.includes("persistImportAudit"));
  assert.ok(persistence.includes("persistSiteScorecards"));
  assert.ok(persistence.includes("persistFeedbackEvents"));
  assert.ok(persistence.includes("persistResolvedNameAliases"));
  assert.equal(persistence.includes('.from("imports")'), false);
  assert.equal(persistence.includes('.from("site_scorecards")'), false);
  assert.equal(persistence.includes('.from("feedback_events")'), false);
  assert.ok(identity.includes("export async function seedIdentityRecords"));
  assert.ok(evidence.includes("export async function persistImportAudit"));
  assert.ok(persistence.length < 8000);
});

test("persistence delegates driver metric repository access", () => {
  const persistence = read("lib/persistence.js");
  const repository = read("lib/persistence/driverMetrics.js");

  assert.equal(persistence.includes('.from("driver_metrics")'), false);
  assert.ok(persistence.includes("fetchExistingMetricRows"));
  assert.ok(persistence.includes("upsertDriverMetricRows"));
  assert.ok(repository.includes("export async function fetchExistingMetricRows"));
  assert.ok(repository.includes("export async function upsertDriverMetricRows"));
});


test("fleet intelligence prioritises operational risk and next actions", () => {
  const intelligence = buildFleetIntelligence(
    [
      {
        id: "A1",
        name: "Driver One",
        risk: "High",
        dcr: 98,
        pod: 99,
        iadc: 70,
        ementor: 800,
        cc: 96,
        concessions: 4,
        dataConfidence: 90,
      },
      {
        id: "A2",
        name: "Unresolved identity",
        risk: "Medium",
        dcr: 99.5,
        pod: 99.8,
        iadc: 90,
        ementor: 830,
        cc: 99,
        concessions: 0,
        dataConfidence: 60,
      },
    ],
    {},
    [
      { week_label: "W35", performance: 90 },
      { week_label: "W36", performance: 84 },
    ]
  );

  assert.equal(intelligence.highRisk, 1);
  assert.ok(intelligence.priorityDrivers[0].score > 0);
  assert.ok(intelligence.actions.some((action) => action.destination === "coaching"));
  assert.ok(intelligence.actions.some((action) => action.destination === "performance"));
  assert.equal(intelligence.trend.direction, "down");
});

test("Notifications Center uses site-scoped performance alerts", () => {
  const dashboard = read("components/DashboardClient.jsx");
  const notifications = read("components/notifications/NotificationsCenter.jsx");
  const data = read("lib/data/notifications.js");

  assert.ok(dashboard.includes('import NotificationsCenter from "./notifications/NotificationsCenter"'));
  assert.ok(dashboard.includes("<NotificationsCenter"));
  assert.ok(data.includes('supabase.rpc("list_performance_alerts"'));
  assert.ok(data.includes('item.status !== "resolved"'));
  assert.ok(notifications.includes('item.status === "open"'));
  assert.ok(notifications.includes("Acknowledge"));
  assert.ok(notifications.includes("siteFilter"));
  assert.ok(notifications.includes("onOpenDriver"));
  assert.ok(notifications.includes("onOpenCoaching"));
});

test("Command Center V2 uses the server-side workspace summary", () => {
  const panel = read("components/dashboard/CommandCenterPanel.jsx");
  const dashboard = read("components/DashboardClient.jsx");
  const workspace = read("lib/data/workspace.js");
  const importFlow = read("lib/data/importWorkflow.js");
  const data = read("lib/data/commandCenter.js");

  assert.ok(panel.includes("TODAY · COMMAND CENTER"));
  assert.ok(panel.includes("Priority alerts"));
  assert.ok(panel.includes("Overdue coaching"));
  assert.ok(panel.includes("Repeat concessions"));
  assert.ok(panel.includes("Deterioration signals"));
  assert.ok(data.includes('supabase.rpc("get_command_center_summary"'));
  assert.ok(importFlow.includes("refreshCommandCenterSummary"));
  assert.ok(importFlow.includes("refreshAlerts: true"));
  assert.ok(workspace.includes("fetchCommandCenterSummary"));
  assert.ok(dashboard.includes("setCommandCenter"));
  assert.ok(dashboard.includes('onConcessions={() => navigate("concessions")}'));
});

test("dashboard consumes explainable fleet intelligence", () => {
  const dashboardViews = read("components/dashboard/DashboardViews.jsx");
  const dashboardClient = read("components/DashboardClient.jsx");
  const navigation = read("components/dashboard/navigation.js");

  assert.ok(dashboardViews.includes("buildFleetIntelligence"));
  assert.ok(dashboardViews.includes("Operational intelligence"));
  assert.ok(dashboardViews.includes("Decision confidence"));
  assert.ok(dashboardClient.includes('onDataQuality={() => navigate("data-quality")}'));
  assert.ok(navigation.includes('["intelligence", "Intelligence"]'));
  assert.equal(navigation.includes("AI Insights"), false);
});

test("priority driver tables expose intentional empty states", () => {
  const views = read("components/dashboard/DashboardViews.jsx");
  const css = read("app/globals.css");

  assert.ok(views.includes("No drivers currently require priority management attention."));
  assert.ok(views.includes("No driver currently triggers a priority intelligence signal."));
  assert.ok(views.includes('className="table-empty-state"'));
  assert.ok(css.includes(".table-empty-state"));
});


test("Smart Import exposes professional preflight and readiness UI", () => {
  const view = read("components/imports/SmartImportView.jsx");
  const css = read("app/globals.css");

  assert.ok(view.includes("summarizePreflight"));
  assert.ok(view.includes("buildImportIntelligence"));
  assert.ok(view.includes("onDrop={onDrop}"));
  assert.ok(view.includes("Smart next actions"));
  assert.ok(view.includes("Data readiness"));
  assert.ok(css.includes(".smart-import-drop"));
  assert.ok(css.includes(".smart-readiness"));
});

test("dashboard exposes Smart Import", () => {
  assert.ok(read("components/dashboard/navigation.js").includes("Smart Import"));
  assert.ok(read("components/imports/SmartImportView.jsx").includes("Smart Import"));
});

test("analyzer core validates station codes and reporting periods", () => {
  assert.equal(normalizeSiteCode("dls2"), "DLS2");
  assert.equal(normalizeSiteCode("unknown"), "");
  assert.equal(inferPeriod("DLS2_week36_2026.xlsx").key, "2026-W36");
  assert.equal(riskFor({ dcr: 98, pod: 98, iadc: 70, mentor_score: 800 }), "High");

  const analyzer = read("lib/analyzer.js");
  assert.ok(analyzer.includes('from "./analyzer/core"'));
  assert.equal(analyzer.includes("function normalizeSiteCode"), false);
});

test("auth callback restricts redirects to internal paths", () => {
  const callback = read("app/auth/callback/page.jsx");
  assert.ok(callback.includes("function safeInternalPath"));
  assert.ok(callback.includes('candidate.startsWith("//")'));
});

test("billing catalogue matches the live MetrixIQ Stripe pricing", () => {
  const starter = PLAN_CATALOG.find((plan) => plan.key === "pro");
  const professional = PLAN_CATALOG.find((plan) => plan.key === "business");
  const business = PLAN_CATALOG.find((plan) => plan.key === "full");

  assert.equal(formatPlanPrice(starter, "month"), "£29");
  assert.equal(formatPlanPrice(starter, "year"), "£290");
  assert.equal(formatPlanPrice(professional, "month"), "£69");
  assert.equal(formatPlanPrice(professional, "year"), "£690");
  assert.equal(formatPlanPrice(business, "month"), "£149");
  assert.equal(formatPlanPrice(business, "year"), "£1,490");

  const billing = read("components/billing/BillingProView.jsx");
  assert.ok(billing.includes("PLAN_CATALOG"));
  assert.ok(billing.includes("dateLabel"));
  assert.equal(billing.includes('"AI Insights"'), false);
});

test("public landing page consumes the same canonical plan catalogue", () => {
  const landing = read("components/Landing.jsx");

  assert.ok(landing.includes("PLAN_CATALOG"));
  assert.ok(landing.includes("formatPlanPrice"));
  assert.equal(landing.includes('"£39"'), false);
  assert.equal(landing.includes('"£89"'), false);
  assert.equal(landing.includes('"£169"'), false);
  assert.equal(landing.includes("AI Insights"), false);
  assert.equal(landing.includes('href="/app">Open product demo'), false);
  assert.ok(landing.includes("See how it works"));
});


test("site-scoped data quality hardening is tracked in code", () => {
  const persistence = read("lib/persistence.js");
  const dataQuality = read("lib/data/dataQuality.js");
  const migration = read("supabase/migrations/202609181948_harden_site_scope_and_sensitive_rpcs.sql");

  assert.ok(persistence.includes("site: driver.site"));
  assert.ok(dataQuality.includes('from("unmatched_driver_records")'));
  assert.ok(dataQuality.includes('.select("*")'));
  assert.ok(migration.includes("add column if not exists site text"));
  assert.ok(migration.includes("private.can_access_driver(organization_id, driver_id)"));
  assert.ok(migration.includes("private.can_access_site(organization_id, site)"));
  assert.ok(migration.includes("create or replace function public.choose_free_plan"));
  assert.ok(migration.includes("create or replace function public.get_command_center_summary"));
});

test("password recovery is complete from login to password update", () => {
  const login = read("components/LoginClient.jsx");
  const reset = read("app/auth/reset-password/page.jsx");

  assert.ok(login.includes("resetPasswordForEmail"));
  assert.ok(login.includes("/auth/reset-password"));
  assert.ok(login.includes("Forgot password?"));
  assert.ok(reset.includes('event === "PASSWORD_RECOVERY"'));
  assert.ok(reset.includes("updateUser({ password })"));
  assert.ok(reset.includes('router.replace("/app")'));
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

test("release routes expose hardened production defaults", () => {
  const nextConfig = read("next.config.mjs");
  const appLayout = read("app/app/layout.jsx");
  const loginLayout = read("app/login/layout.jsx");
  const authLayout = read("app/auth/layout.jsx");
  const health = read("app/api/health/route.js");

  assert.ok(nextConfig.includes("X-Content-Type-Options"));
  assert.ok(nextConfig.includes("X-Frame-Options"));
  assert.ok(nextConfig.includes("Strict-Transport-Security"));
  assert.ok(nextConfig.includes("Permissions-Policy"));
  assert.ok(appLayout.includes("index: false"));
  assert.ok(loginLayout.includes("index: false"));
  assert.ok(authLayout.includes("index: false"));
  assert.ok(health.includes('status: "ok"'));
  assert.ok(health.includes('"cache-control": "no-store"'));
});

test("active product controls keep accessible names", () => {
  const dashboard = read("components/DashboardClient.jsx");
  const performance = read("components/performance/PerformanceView.jsx");
  const scorecards = read("components/scorecards/ScorecardViews.jsx");
  const iadc = read("components/operations/IadcView.jsx");
  const mentor = read("components/operations/MentorView.jsx");
  const cdf = read("components/customer-feedback/CdfView.jsx");

  assert.ok(dashboard.includes('aria-label="Sign out"'));
  assert.ok(dashboard.includes('aria-label="Filter workspace by site"'));
  assert.ok(performance.includes('aria-label="Search performance drivers"'));
  assert.ok(scorecards.includes('aria-label="Search scorecards"'));
  assert.ok(iadc.includes('aria-label="Search IADC drivers"'));
  assert.ok(mentor.includes('aria-label="Search Mentor drivers"'));
  assert.ok(cdf.includes('aria-label="Search CDF records"'));
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

test("team management delegates data and permission logic", () => {
  const teamView = read("components/team/TeamManagementView.jsx");
  const teamData = read("lib/data/team.js");
  const roles = read("lib/permissions/roles.js");

  assert.equal(teamView.includes(".rpc("), false);
  assert.equal(teamView.includes("supabase.auth.getUser"), false);
  assert.ok(teamView.includes("fetchTeamWorkspace"));
  assert.ok(teamView.includes("parseSiteScope"));
  assert.ok(teamData.includes("export async function createTeamInvite"));
  assert.ok(teamData.includes("export async function updateTeamMember"));
  assert.ok(roles.includes("export function canManageTeam"));
  assert.ok(roles.includes("export function parseSiteScope"));
});

test("team invite signup flow joins an existing workspace instead of asking for a new organisation", () => {
  const team = read("components/team/TeamManagementView.jsx");
  const login = read("components/LoginClient.jsx");
  const workspace = read("lib/data/workspace.js");

  assert.ok(team.includes('/login?mode=register&invite=1'));
  assert.ok(team.includes("window.location.origin"));
  assert.ok(login.includes('params.get("invite") === "1"'));
  assert.ok(login.includes("inviteMode ?"));
  assert.ok(login.includes("JOIN WORKSPACE"));
  assert.ok(login.includes("!inviteMode &&"));
  const loadContext = workspace.slice(workspace.indexOf("export async function loadWorkspaceContext"));
  assert.ok(loadContext.indexOf('redeem_my_pending_invites') < loadContext.indexOf('resolveWorkspace(supabase, user)'));
});


test("team invite RPC migration qualifies status references", () => {
  const migration = read("supabase/migrations/202609182055_fix_team_invite_rpc_ambiguity.sql");

  assert.ok(migration.includes("wi.status='pending'"));
  assert.ok(migration.includes("wi.status = 'pending'"));
  assert.ok(migration.includes("update public.workspace_invites wi"));
});


test("SaaS product views delegate Supabase and billing operations", () => {
  const onboarding = read("components/saas/PlanOnboardingView.jsx");
  const billing = read("components/billing/BillingProView.jsx");
  const admin = read("components/admin/PlatformAdminView.jsx");
  const billingData = read("lib/data/billing.js");
  const adminData = read("lib/data/admin.js");

  assert.equal(onboarding.includes(".rpc("), false);
  assert.equal(billing.includes(".rpc("), false);
  assert.equal(billing.includes('fetch("/api/billing'), false);
  assert.equal(admin.includes(".rpc("), false);
  assert.ok(onboarding.includes("activateWorkspaceMode"));
  assert.ok(billing.includes("createBillingCheckout"));
  assert.ok(billing.includes("createBillingPortal"));
  assert.ok(admin.includes("fetchAdminAccounts"));
  assert.ok(billingData.includes("export async function fetchWorkspaceAccess"));
  assert.ok(billingData.includes("export async function createBillingCheckout"));
  assert.ok(adminData.includes("export async function setAdminWorkspacePlan"));
});

test("Billing distinguishes Stripe-managed subscriptions from manual admin access", () => {
  const billingView = read("components/billing/BillingProView.jsx");
  const billingData = read("lib/data/billing.js");

  assert.ok(billingData.includes("has_stripe_subscription"));
  assert.ok(billingData.includes('from("organizations")'));
  assert.ok(billingView.includes("manualActiveAccess"));
  assert.ok(billingView.includes("Plan access enabled by administrator"));
  assert.equal(
    billingView.includes('const hasStripeSubscription = ["active", "past_due", "cancelled"].includes(status)'),
    false
  );
});

test("workspace context loads canonical billing state on first render", () => {
  const workspace = read("lib/data/workspace.js");

  assert.ok(workspace.includes('import { fetchWorkspaceAccess } from "./billing";'));
  assert.ok(workspace.includes("fetchWorkspaceAccess(supabase, resolved.organization.id)"));
  assert.equal(workspace.includes('supabase.rpc("get_workspace_access"'), false);
});



test("SaaS foundation is split into canonical product modules", () => {
  const legacy = read("components/SaasFoundation.jsx");
  const shared = read("components/saas/SaasShared.jsx");
  const onboarding = read("components/saas/PlanOnboardingView.jsx");
  const suspended = read("components/saas/SuspendedWorkspaceView.jsx");
  const billing = read("components/billing/BillingProView.jsx");
  const team = read("components/team/TeamManagementView.jsx");
  const admin = read("components/admin/PlatformAdminView.jsx");
  const dashboard = read("components/DashboardClient.jsx");

  assert.equal(legacy.includes("export function BillingProView"), false);
  assert.equal(legacy.includes("export function TeamManagementView"), false);
  assert.equal(legacy.includes("export function PlatformAdminView"), false);
  assert.ok(shared.includes("export function SaasStyles"));
  assert.ok(onboarding.includes("export function PlanOnboardingView"));
  assert.ok(suspended.includes("export function SuspendedWorkspaceView"));
  assert.ok(billing.includes("export function BillingProView"));
  assert.ok(team.includes("export function TeamManagementView"));
  assert.ok(admin.includes("export function PlatformAdminView"));
  assert.ok(dashboard.includes('./billing/BillingProView'));
  assert.ok(dashboard.includes('./team/TeamManagementView'));
  assert.ok(dashboard.includes('./admin/PlatformAdminView'));
  assert.equal(dashboard.includes('./SaasFoundation'), false);
});

test("internal workspace navigation cannot bypass plan or role permissions", () => {
  const dashboard = read("components/DashboardClient.jsx");

  assert.ok(dashboard.includes("function navigate(id)"));
  assert.ok(dashboard.includes("canAccessNav(id, access, platformAdmin, session?.role)"));
  assert.ok(dashboard.includes("const routedActive"));
  assert.ok(dashboard.includes('onImport={() => navigate("imports")}'));
  assert.ok(dashboard.includes('onDataQuality={() => navigate("data-quality")}'));
  assert.equal(dashboard.includes('onImport={() => setActive("imports")}'), false);
});

test("navigation permissions live outside UI components", () => {
  const saas = read("components/SaasFoundation.jsx");
  const permissions = read("lib/permissions/navigation.js");
  const dashboard = read("components/DashboardClient.jsx");

  assert.equal(saas.includes("const NAV_MIN_PLAN"), false);
  assert.equal(saas.includes("export function canAccessNav"), false);
  assert.ok(saas.includes('from "../lib/permissions/navigation"'));
  assert.ok(permissions.includes("export const NAV_MIN_PLAN"));
  assert.ok(permissions.includes("export function canAccessNav"));
  assert.ok(dashboard.includes('../lib/permissions/navigation'));
});

test("dashboard delegates Smart Import persistence workflow", () => {
  const dashboard = read("components/DashboardClient.jsx");
  const workflow = read("lib/data/importWorkflow.js");

  assert.ok(dashboard.includes("../lib/data/importWorkflow"));
  assert.equal(dashboard.includes("persistAnalysis("), false);
  assert.equal(dashboard.includes("sync_driver_directory"), false);
  assert.ok(workflow.includes("persistAnalysis"));
  assert.ok(workflow.includes("sync_driver_directory"));
  assert.ok(workflow.includes("if (syncError) throw syncError"));
  assert.ok(workflow.includes("refreshWorkspacePerformance"));
});

test("workspace search keyboard hint is functional", () => {
  const dashboard = read("components/DashboardClient.jsx");

  assert.ok(dashboard.includes("useRef"));
  assert.ok(dashboard.includes('key === "k"'));
  assert.ok(dashboard.includes("event.ctrlKey || event.metaKey"));
  assert.ok(dashboard.includes("searchRef.current?.focus()"));
  assert.ok(dashboard.includes('key === "escape"'));
  assert.ok(dashboard.includes("<kbd>⌘ / Ctrl K</kbd>"));
});

test("Driver 360 calculates recent trajectory and evidence correctly", () => {
  const snapshot = buildDriver360Snapshot(
    {
      name: "Driver One",
      risk: "Medium",
      performance: 86,
      dcr: 99.1,
      pod: 99.7,
      iadc: 82,
      cc: 98,
      mentor_score: 820,
      concessions: 1,
    },
    [
      { week_label: "W35", performance: 80, dcr: 98.6, pod: 99.2, iadc: 72, cc: 95, mentor_score: 805, concessions: 2, risk: "High", data_confidence: 80 },
      { week_label: "W36", performance: 83, dcr: 98.9, pod: 99.5, iadc: 77, cc: 97, mentor_score: 812, concessions: 1, risk: "Medium", data_confidence: 90 },
      { week_label: "W37", performance: 86, dcr: 99.1, pod: 99.7, iadc: 82, cc: 98, mentor_score: 820, concessions: 1, risk: "Medium", data_confidence: 100 },
    ]
  );

  assert.equal(snapshot.latestLabel, "W37");
  assert.equal(snapshot.previousLabel, "W36");
  assert.equal(snapshot.performanceDelta, 3);
  assert.equal(snapshot.fourWeekConcessions, 4);
  assert.equal(snapshot.concessionWeeks, 3);
  assert.equal(snapshot.coverage, 100);
  assert.equal(snapshot.latestRisk, "Medium");
  assert.equal(snapshot.previousRisk, "Medium");
  assert.equal(snapshot.metricDeltas.find((metric) => metric.key === "iadc").delta, 5);
});

test("Driver 360 V2 exposes trajectory, KPI movement and evidence timeline", () => {
  const views = read("components/dashboard/DashboardViews.jsx");
  const sections = read("components/drivers/Driver360Sections.jsx");
  const model = read("lib/drivers/driver360.js");

  assert.ok(views.includes("DRIVER 360"));
  assert.ok(views.includes("Driver360Overview"));
  assert.ok(views.includes("Driver360DeltaGrid"));
  assert.ok(views.includes("DriverTrajectoryChart"));
  assert.ok(views.includes("DriverEvidenceTimeline"));
  assert.ok(sections.includes("KPI movement"));
  assert.ok(sections.includes("Evidence timeline"));
  assert.ok(model.includes("buildDriver360Snapshot"));
  assert.ok(model.includes("fourWeekConcessions"));
  assert.ok(model.includes("performanceDelta"));
});

test("Driver history returns the latest periods in chronological display order", () => {
  const data = read("lib/data/driverMetrics.js");

  assert.ok(data.includes('.order("period_end", { ascending: false, nullsFirst: false })'));
  assert.ok(data.includes("return (data || []).reverse()"));
  assert.ok(data.includes("psb,reattempts,concessions,lor"));
  assert.ok(data.includes("scorecard_score,tier,risk,issue,data_confidence"));
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

test("coaching view lives in the coaching product module", () => {
  const legacy = read("components/CoachingAlertsView.jsx");
  const coaching = read("components/coaching/CoachingAlertsView.jsx");
  const dashboard = read("components/DashboardClient.jsx");

  assert.ok(legacy.includes('from "./coaching/CoachingAlertsView"'));
  assert.ok(coaching.includes("export default function CoachingAlertsView"));
  assert.ok(dashboard.includes('./coaching/CoachingAlertsView'));
});

test("coaching UI delegates mutations and reads to the data layer", () => {
  const coaching = read("components/coaching/CoachingAlertsView.jsx");
  const data = read("lib/data/coaching.js");

  assert.equal(coaching.includes(".rpc("), false);
  assert.ok(coaching.includes("fetchCoachingOverview"));
  assert.ok(coaching.includes("fetchCoachingCaseNotes"));
  assert.ok(coaching.includes("acknowledgePerformanceAlert"));
  assert.ok(coaching.includes("updateCoachingCase"));
  assert.ok(data.includes("export async function fetchCoachingOverview"));
  assert.ok(data.includes("export async function addCoachingCaseNote"));
});


test("ScorecardViews delegates shared metrics and primitives", () => {
  const view = read("components/scorecards/ScorecardViews.jsx");
  const metrics = read("lib/scorecards/metrics.js");
  const primitives = read("components/scorecards/ScorecardPrimitives.jsx");

  assert.equal(view.includes("function indexFor("), false);
  assert.equal(view.includes("function LeaderList("), false);
  assert.equal(view.includes("function LoadingPanel("), false);
  assert.ok(view.includes("../../lib/scorecards/metrics"));
  assert.ok(view.includes("./ScorecardPrimitives"));
  assert.ok(metrics.includes("export function driverShape"));
  assert.ok(metrics.includes("export function indexFor"));
  assert.ok(primitives.includes("export function LeaderList"));
  assert.ok(primitives.includes("export function useLoad"));
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

test("scorecard UI delegates data access to the data layer", () => {
  const scorecards = read("components/scorecards/ScorecardViews.jsx");
  const data = read("lib/data/scorecardData.js");

  assert.equal(scorecards.includes('.from("site_scorecards")'), false);
  assert.equal(scorecards.includes('.from("driver_metrics")'), false);
  assert.ok(scorecards.includes("fetchSiteScorecardData"));
  assert.ok(scorecards.includes("fetchDriverScorecardData"));
  assert.ok(data.includes("export async function fetchSiteScorecardData"));
  assert.ok(data.includes("export async function fetchDriverScorecardData"));
});


test("smart import lives in its own product module", () => {
  const dashboardViews = read("components/dashboard/DashboardViews.jsx");
  const smartImport = read("components/imports/SmartImportView.jsx");
  const dashboard = read("components/DashboardClient.jsx");

  assert.equal(dashboardViews.includes("export function ImportsView"), false);
  assert.ok(smartImport.includes("export default function SmartImportView"));
  assert.ok(smartImport.includes("analyseFiles"));
  assert.ok(dashboard.includes('./imports/SmartImportView'));
});

test("CDF and Data Quality use canonical product modules", () => {
  const legacy = read("components/OperationalViews.jsx");
  const cdf = read("components/customer-feedback/CdfView.jsx");
  const dataQuality = read("components/data-quality/DataQualityView.jsx");
  const cdfData = read("lib/data/cdf.js");
  const dataQualityData = read("lib/data/dataQuality.js");
  const dashboard = read("components/DashboardClient.jsx");

  assert.equal(legacy.includes("export function CdfView"), false);
  assert.equal(legacy.includes("export function DataQualityView"), false);
  assert.equal(legacy.includes("export function IadcView"), false);
  assert.ok(cdf.includes("export default function CdfView"));
  assert.ok(dataQuality.includes("export default function DataQualityView"));
  assert.equal(cdf.includes('.from("feedback_events")'), false);
  assert.equal(dataQuality.includes(".rpc("), false);
  assert.equal(dataQuality.includes("driver_aliases"), false);
  assert.ok(cdfData.includes("export async function fetchCdfWorkspaceData"));
  assert.ok(dataQualityData.includes("export async function fetchDataQualityState"));
  assert.ok(dataQualityData.includes("export async function resolveDriverIdentity"));
  assert.ok(dashboard.includes('./customer-feedback/CdfView'));
  assert.ok(dashboard.includes('./data-quality/DataQualityView'));
});

test("Concessions V2 calculates movement, repeat offenders and actions", () => {
  const ranking = [
    { id: "A", affected: 3, total: 6, byWeek: { W35: 1, W36: 2, W37: 3 } },
    { id: "B", affected: 2, total: 3, byWeek: { W35: 0, W36: 1, W37: 2 } },
    { id: "C", affected: 1, total: 1, byWeek: { W35: 0, W36: 0, W37: 1 } },
  ];
  const signals = buildConcessionsSignals({
    ranking,
    weeks: ["W35", "W36", "W37", "W38"],
    presentSet: new Set(["W35", "W36", "W37"]),
    weekTotals: [10, 12, 15, 0],
  });

  assert.equal(signals.latestWeek, "W37");
  assert.equal(signals.previousWeek, "W36");
  assert.equal(signals.wow, 3);
  assert.equal(signals.wowPct, 25);
  assert.equal(signals.repeatOffenders.length, 2);
  assert.deepEqual(signals.missingWeeks, ["W38"]);
  assert.ok(signals.managementActions.some((action) => action.id === "repeat"));
  assert.ok(signals.managementActions.some((action) => action.id === "increase"));
  assert.ok(signals.managementActions.some((action) => action.id === "missing"));
});

test("Concessions Overview receives its ranking accessor and V2 management evidence", () => {
  const view = read("components/operations/ConcessionsView.jsx");
  const sections = read("components/operations/ConcessionsSections.jsx");

  assert.ok(view.includes("buildConcessionsSignals"));
  assert.ok(view.includes("valueFor={valueFor}"));
  assert.ok(view.includes("managementActions={managementActions}"));
  assert.ok(view.includes("repeatOffenders={repeatOffenders}"));
  assert.ok(sections.includes("valueFor,"));
  assert.ok(sections.includes("MANAGEMENT ACTIONS"));
  assert.ok(sections.includes("Repeat-driver shortlist"));
});

test("Concessions separates orchestration from presentation sections", () => {
  const view = read("components/operations/ConcessionsView.jsx");
  const sections = read("components/operations/ConcessionsSections.jsx");

  assert.ok(view.includes("ConcessionsHeader"));
  assert.ok(view.includes("ConcessionsKpis"));
  assert.ok(view.includes("ConcessionsMatrix"));
  assert.ok(view.includes("ConcessionsOverview"));
  assert.ok(view.includes("<style jsx global>"));
  assert.equal(view.includes('<section className="cx2-kpis">'), false);
  assert.equal(view.includes('<section className="cx2-card cx2-matrix-card">'), false);
  assert.equal(view.includes('<section className="cx2-overview-grid">'), false);
  assert.ok(sections.includes("export function ConcessionsHeader"));
  assert.ok(sections.includes("export function ConcessionsKpis"));
  assert.ok(sections.includes("export function ConcessionsMatrix"));
  assert.ok(sections.includes("export function ConcessionsOverview"));
});

test("IADC Mentor and Concessions use canonical operational modules", () => {
  const legacy = read("components/DirectOperationalViews.jsx");
  const shared = read("components/operations/OperationalShared.jsx");
  const iadc = read("components/operations/IadcView.jsx");
  const mentor = read("components/operations/MentorView.jsx");
  const concessions = read("components/operations/ConcessionsView.jsx");
  const data = read("lib/data/directOperational.js");
  const dashboard = read("components/DashboardClient.jsx");

  assert.equal(legacy.includes("export function DirectIadcView"), false);
  assert.equal(legacy.includes("export function DirectMentorView"), false);
  assert.equal(legacy.includes("export function DirectConcessionsView"), false);
  assert.ok(iadc.includes("export default function IadcView"));
  assert.ok(mentor.includes("export default function MentorView"));
  assert.ok(concessions.includes("export default function ConcessionsView"));
  assert.ok(shared.includes("useOperationalRows"));
  assert.equal(iadc.includes('.from("driver_metrics")'), false);
  assert.equal(mentor.includes('.from("driver_metrics")'), false);
  assert.equal(concessions.includes('.from("driver_metrics")'), false);
  assert.ok(data.includes("export async function fetchDirectOperationalRows"));
  assert.ok(dashboard.includes('./operations/IadcView'));
  assert.ok(dashboard.includes('./operations/MentorView'));
  assert.ok(dashboard.includes('./operations/ConcessionsView'));
});

test("Concessions keeps React hook order stable across loading states", () => {
  const concessions = read("components/operations/ConcessionsView.jsx");

  assert.equal(concessions.includes("useMemo("), false);
  assert.ok(concessions.includes("const rows=filterRowsBySite(load.rows,siteFilter);"));
  assert.ok(
    concessions.indexOf("const rows=filterRowsBySite(load.rows,siteFilter);") <
    concessions.indexOf("if(load.loading)")
  );
});

test("site-scoped operational views recover from stale week selections", () => {
  const iadc = read("components/operations/IadcView.jsx");
  const cdf = read("components/customer-feedback/CdfView.jsx");
  const dashboard = read("components/DashboardClient.jsx");

  assert.ok(iadc.includes("week&&weeks.includes(week)?week"));
  assert.ok(cdf.includes("!weeks.includes(week)"));
  assert.equal(
    (dashboard.match(/aria-label="Filter workspace by site"/g) || []).length,
    1
  );
});

test("Performance recovers stale site and week filters", () => {
  const performance = read("components/performance/PerformanceView.jsx");

  assert.ok(performance.includes('if (site !== "all" && !sites.includes(site)) setSite("all")'));
  assert.ok(performance.includes('focusWeek !== "latest"'));
  assert.ok(performance.includes('setFocusWeek("latest")'));
});




test("legacy compatibility files stay thin and cannot regrow into monoliths", () => {
  const directLegacy = read("components/DirectOperationalViews.jsx");
  const operationalLegacy = read("components/OperationalViews.jsx");
  const saasLegacy = read("components/SaasFoundation.jsx");

  assert.ok(directLegacy.length < 1000);
  assert.ok(operationalLegacy.length < 1000);
  assert.ok(saasLegacy.length < 1000);
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
  const html = read("lib/analyzer/html.js");
  const pdf = read("lib/analyzer/pdf.js");
  const core = read("lib/analyzer/core.js");

  assert.equal(analyzer.includes('|| "DLS2"'), false);
  assert.equal(html.includes('|| "DLS2"'), false);
  assert.equal(pdf.includes('|| "DLS2"'), false);
  assert.ok(core.includes("export function inferSiteCode"));
  assert.ok(html.includes("inferSiteCode(fileName"));
  assert.ok(pdf.includes("inferSiteCode(fileName"));
});


test("invite registration uses token-bound workspace validation", () => {
  const login = read("components/LoginClient.jsx");
  assert.match(login, /getInviteSignupContext/);
  assert.match(login, /inviteToken/);
  assert.match(login, /invited_email/);
  assert.match(login, /redeemPendingInvites/);
  assert.match(login, /secure personal invitation link/i);
});

test("team management exposes invite-specific secure links", () => {
  const team = read("components/team/TeamManagementView.jsx");
  assert.match(team, /token=\$\{encodeURIComponent\(invite\.token\)\}/);
  assert.match(team, /email=\$\{encodeURIComponent\(invite\.email\)\}/);
  assert.match(team, /Copy link/);
});
