import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { findIadcHeader } from "../lib/parsers/iadc.js";
import { classifyImportFile, prepareImportFiles, summarizePreflight } from "../lib/imports/preflight.js";
import { buildImportIntelligence } from "../lib/imports/analysisSummary.js";
import { inferPeriod, normalizeSiteCode, riskFor } from "../lib/analyzer/core.js";

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
  assert.ok(read("components/dashboard/DashboardViews.jsx").includes("Smart Import"));
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
  assert.equal(analyzer.includes('|| "DLS2"'), false);
  assert.ok(analyzer.includes("inferSiteCode(fileName"));
});
