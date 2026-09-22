import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  aggregateRootCauses,
  recoveryPlan,
  rootCauseForRow,
  rootCauseTrend,
} from "../lib/intelligence/rootCause.js";
import { ROLE_DEFAULTS, effectivePermissions } from "../lib/governance/permissions.js";

test("Root-Cause Engine explains the exact point-band loss", () => {
  const row = {
    week_label: "W37",
    mentor_score: 836,
    dcr: 99.25,
    dsc_dpmo: 0,
    lor: 0,
    pod: 100,
    cc: 100,
    ce_dpmo: 0,
    cdf_dpmo: null,
    psb: 0,
    raw_data: { source_files: ["DLS2-DSP-Scorecard.pdf"] },
  };

  const result = rootCauseForRow(row);
  assert.equal(result.score, 96);
  assert.equal(result.tier, "Fantastic Plus");
  assert.equal(result.pointsLost, 4);
  assert.equal(result.coverage, 9);
  assert.equal(result.primary.key, "fico");
  assert.equal(result.primary.recoverableNext, 2);
  assert.equal(result.components.find((x) => x.key === "cdf_dpmo").points, 10);
});

test("Root-Cause Engine produces an ordered recovery plan", () => {
  const row = {
    mentor_score: 790,
    dcr: 98.5,
    dsc_dpmo: 1000,
    lor: 1,
    pod: 96,
    cc: 94,
    ce_dpmo: 10,
    cdf_dpmo: 7000,
    psb: 1,
  };
  const plan = recoveryPlan(row, 4);

  assert.equal(plan.length, 4);
  assert.ok(plan[0].recoverableNext >= plan[1].recoverableNext);
  assert.ok(plan.every((item) => item.lostPoints > 0));
  assert.ok(plan.some((item) => item.metric === "CE"));
});

test("Root-Cause trend keeps period chronology and primary causes", () => {
  const rows = [
    { week_label:"W38",period_end:"2026-09-25",mentor_score:849,dcr:99.9,dsc_dpmo:0,lor:0,pod:99.99,cc:99.9,ce_dpmo:0,cdf_dpmo:0,psb:0 },
    { week_label:"W37",period_end:"2026-09-18",mentor_score:800,dcr:99.2,dsc_dpmo:0,lor:0,pod:99,cc:99,ce_dpmo:0,cdf_dpmo:0,psb:0 },
  ];
  const trend = rootCauseTrend(rows);

  assert.equal(trend[0].weekLabel, "W37");
  assert.equal(trend[1].weekLabel, "W38");
  assert.ok(trend[1].score > trend[0].score);
});

test("Site aggregate root causes total point loss across drivers", () => {
  const aggregate = aggregateRootCauses([
    { mentor_score:800,dcr:99.2,dsc_dpmo:0,lor:0,pod:99,cc:99,ce_dpmo:0,cdf_dpmo:0,psb:0 },
    { mentor_score:849,dcr:99.9,dsc_dpmo:0,lor:0,pod:99.99,cc:99.9,ce_dpmo:0,cdf_dpmo:0,psb:0 },
  ]);

  assert.equal(aggregate.drivers, 2);
  assert.ok(aggregate.totalLostPoints > 0);
  assert.ok(aggregate.causes.some((item) => item.key === "fico"));
  assert.ok(aggregate.averageScore < 100);
});

test("V4 permissions expose read-only site and incident access with controlled mutations", () => {
  assert.equal(ROLE_DEFAULTS.manager.view_site_operations, true);
  assert.equal(ROLE_DEFAULTS.manager.manage_incidents, true);
  assert.equal(ROLE_DEFAULTS.dispatcher.view_incidents, true);
  assert.equal(ROLE_DEFAULTS.dispatcher.manage_incidents, true);
  assert.equal(ROLE_DEFAULTS.viewer.view_incidents, true);
  assert.equal(ROLE_DEFAULTS.viewer.manage_incidents, false);
  assert.equal(effectivePermissions("viewer", { manage_incidents: true }).manage_incidents, true);
});

test("Operations Intelligence V4 migration creates auditable incident and driver-note layers", () => {
  const sql = fs.readFileSync("supabase/migrations/20260919_operations_intelligence_v4.sql","utf8").toLowerCase();
  for (const fragment of [
    "create table if not exists public.operational_incidents",
    "create table if not exists public.incident_notes",
    "create table if not exists public.driver_notes",
    "create or replace function public.list_operational_incidents",
    "create or replace function public.create_incident_from_feedback",
    "create or replace function public.add_driver_note",
    "create or replace function public.list_driver_notes",
    "'view_site_operations'",
    "'manage_incidents'",
  ]) {
    assert.ok(sql.includes(fragment), "missing " + fragment);
  }
});

test("V4 product surfaces are wired into the workspace without replacing source score logic", () => {
  const dashboard = fs.readFileSync("components/DashboardClient.jsx","utf8");
  const navigation = fs.readFileSync("components/dashboard/navigation.js","utf8");
  const driver = fs.readFileSync("components/drivers/Driver360V2.jsx","utf8");
  const incidents = fs.readFileSync("components/evidence/EvidenceIncidentCenter.jsx","utf8");
  const site = fs.readFileSync("components/sites/SiteOperationsCenter.jsx","utf8");

  assert.ok(dashboard.includes('./drivers/Driver360V2'));
  assert.ok(dashboard.includes('./evidence/EvidenceIncidentCenter'));
  assert.ok(dashboard.includes('./sites/SiteOperationsCenter'));
  assert.ok(dashboard.includes("<Driver360V2"));
  assert.ok(navigation.includes('["site-operations", "Site Operations"]'));
  assert.ok(navigation.includes('["evidence", "Evidence & Incidents"]'));
  assert.ok(driver.includes("Driver Root-Cause Engine"));
  assert.ok(driver.includes("Unified driver timeline"));
  assert.ok(incidents.includes("Operational Investigations"));
  assert.ok(site.includes("Control Room"));
});

test('IADC DWC V4 keeps daily snapshots separate from weekly metrics', () => {
  const html = fs.readFileSync('lib/analyzer/html.js','utf8');
  const metrics = fs.readFileSync('lib/persistence/metrics.js','utf8');
  const view = fs.readFileSync('components/operations/IadcView.jsx','utf8');
  assert.ok(html.includes('iadc-daily'));
  assert.ok(html.includes('iadc-weekly'));
  assert.ok(metrics.includes('metric_granularity'));
  assert.ok(metrics.includes('calendar_week'));
  assert.ok(metrics.includes('metric_date'));
  assert.ok(view.includes('.sort((a,b)=>Number(metricValue(b))-Number(metricValue(a)))'));
});


test("POD DCR CC operations views use their own metric and targets", () => {
  const view = fs.readFileSync("components/operations/IadcView.jsx","utf8");
  const nav = fs.readFileSync("components/dashboard/navigation.js","utf8");
  const dashboard = fs.readFileSync("components/DashboardClient.jsx","utf8");
  const data = fs.readFileSync("lib/data/directOperational.js","utf8");
  assert.ok(view.includes('metric="iadc"') || view.includes('metric="iadc"'));
  assert.ok(view.includes('target:99.6'));
  assert.ok(view.includes('target:99.2'));
  assert.ok(view.includes('target:98'));
  assert.ok(view.includes('useOperationalRows(organizationId,metric,refreshKey)'));
  assert.ok(nav.includes('["pod", "POD"]'));
  assert.ok(nav.includes('["dcr", "DCR"]'));
  assert.ok(nav.includes('["cc", "Customer Compliance"]'));
  assert.ok(dashboard.includes('<PodQualityView'));
  assert.ok(dashboard.includes('metric="dcr"'));
  assert.ok(dashboard.includes('<CustomerComplianceView'));
  assert.ok(data.includes('"driver_id,week_label,period_start,period_end,dcr,pod,cc,iadc'));
});


test("operational metric imports reload and query the correct metric column", () => {
  const data = fs.readFileSync("lib/data/directOperational.js","utf8");
  const shared = fs.readFileSync("components/operations/OperationalShared.jsx","utf8");
  const dashboard = fs.readFileSync("components/DashboardClient.jsx","utf8");
  const iadc = fs.readFileSync("components/operations/IadcView.jsx","utf8");
  const mentor = fs.readFileSync("components/operations/MentorView.jsx","utf8");

  assert.ok(data.includes('["pod", "dcr", "cc"].includes(kind)'));
  assert.ok(data.includes('query.not(kind, "is", null)'));
  assert.ok(shared.includes("refreshKey = 0"));
  assert.ok(shared.includes("[organizationId, kind, refreshKey]"));
  assert.ok(dashboard.includes("setOperationalRefreshKey((value) => value + 1)"));
  assert.ok(dashboard.includes("refreshKey={operationalRefreshKey}"));
  assert.ok(iadc.includes("useOperationalRows(organizationId,metric,refreshKey)"));
  assert.ok(mentor.includes('useOperationalRows(organizationId, "mentor", refreshKey)'));
});
