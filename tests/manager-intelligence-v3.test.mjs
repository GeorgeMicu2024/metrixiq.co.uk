import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildManagerWorkQueue, summarizeManagerQueue } from "../lib/management/controlCenterV2.js";
import { COACHING_TEMPLATES, templateForMetric } from "../lib/coaching/templates.js";
import { applyTargetPreset, createScenario, simulateDriver, teamImpact } from "../lib/simulator/whatIf.js";

test("What-if Simulator uses the exact point-band formula without mutating source data", () => {
  const row = {
    mentor_score: 800,
    dcr: 99.25,
    dsc_dpmo: 0,
    lor: 0,
    pod: 100,
    cc: 100,
    ce_dpmo: 0,
    cdf_dpmo: 2049,
    psb: 0,
    raw_data: { source_files: ["W37-DSP-Scorecard.pdf"] },
  };
  const scenario = createScenario(row);
  const improved = { ...scenario, mentor_score: 849 };
  const result = simulateDriver(row, improved);

  assert.equal(row.mentor_score, 800);
  assert.equal(result.baseline.value, 89);
  assert.equal(result.projected.value, 98);
  assert.equal(result.scoreDelta, 9);
  assert.equal(result.projectedTier.label, "Fantastic Plus");
  assert.equal(teamImpact(result.scoreDelta, 90), 0.1);
});

test("What-if target preset only lifts core metrics to minimum management targets", () => {
  const preset = applyTargetPreset({
    mentor_score: 790,
    dcr: 98.5,
    pod: 98,
    cc: 94,
  }, "core-targets");

  assert.equal(preset.mentor_score, 815);
  assert.equal(preset.dcr, 99.2);
  assert.equal(preset.pod, 99.6);
  assert.equal(preset.cc, 98);
});

test("Manager Control Center builds a prioritised action queue from latest driver evidence", () => {
  const queue = buildManagerWorkQueue({
    metricRows: [{
      driver_id: "driver-1",
      week_label: "W37",
      period_end: "2026-09-18",
      mentor_score: 700,
      dcr: 98,
      dsc_dpmo: 1000,
      lor: 1,
      pod: 90,
      cc: 90,
      ce_dpmo: 10,
      cdf_dpmo: 7000,
      psb: 1,
      concessions: 3,
      drivers: { id: "driver-1", trid: "A1TEST", full_name: "Test Driver", site: "DLS2" },
      raw_data: { source_files: ["scorecard.pdf"] },
    }],
    unmatchedCount: 4,
    failedImports: 1,
  });

  assert.ok(queue.some((item) => item.category === "fico"));
  assert.ok(queue.some((item) => item.category === "scorecard"));
  assert.ok(queue.some((item) => item.category === "concessions"));
  assert.ok(queue.some((item) => item.category === "data-quality"));
  assert.ok(queue.some((item) => item.category === "imports"));
  assert.ok(summarizeManagerQueue(queue).high > 0);
});

test("Coaching V3 provides targeted templates for operational metrics", () => {
  assert.ok(COACHING_TEMPLATES.length >= 6);
  assert.equal(templateForMetric("FICO").id, "fico");
  assert.equal(templateForMetric("POD").id, "pod");
  assert.equal(templateForMetric("Concessions").id, "concessions");
  assert.ok(templateForMetric("DCR").checklist.length >= 4);
});

test("Manager Intelligence V3 migration creates workflow, notification and rollback RPCs", () => {
  const sql = fs.readFileSync("supabase/migrations/20260919_manager_intelligence_v3.sql", "utf8").toLowerCase();
  for (const fragment of [
    "create table if not exists public.manager_tasks",
    "create table if not exists public.notification_events",
    "create or replace function public.refresh_manager_tasks",
    "create or replace function public.refresh_notification_events",
    "create or replace function public.open_coaching_case_direct",
    "create or replace function public.evaluate_coaching_case_improvement",
    "create or replace function public.preview_import_rollback",
    "create or replace function public.rollback_import_v2",
  ]) {
    assert.ok(sql.includes(fragment), "missing " + fragment);
  }
});

test("V3 product surfaces are wired into the workspace", () => {
  const dashboard = fs.readFileSync("components/DashboardClient.jsx", "utf8");
  const navigation = fs.readFileSync("components/dashboard/navigation.js", "utf8");
  const imports = fs.readFileSync("components/imports/ImportCenterV2.jsx", "utf8");
  const notifications = fs.readFileSync("components/notifications/NotificationsPageV2.jsx", "utf8");

  assert.ok(dashboard.includes('./management/ManagerControlCenterV2'));
  assert.ok(dashboard.includes('./simulator/WhatIfSimulator'));
  assert.ok(dashboard.includes('./imports/ImportCenterV2'));
  assert.ok(dashboard.includes('./coaching/CoachingV3'));
  assert.ok(navigation.includes('["manager-control", "Manager Control"]'));
  assert.ok(navigation.includes('["simulator", "What-if Simulator"]'));
  assert.ok(imports.includes("Replace previous"));
  assert.ok(imports.includes("History & Rollback"));
  assert.ok(notifications.includes("Action Feed"));
});
