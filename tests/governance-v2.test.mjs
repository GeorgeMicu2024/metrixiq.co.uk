import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { effectivePermissions, explicitOverrides, ROLE_DEFAULTS } from "../lib/governance/permissions.js";
import { buildDataQualityV2, missingScorecardMetrics } from "../lib/governance/dataQualityV2.js";

test("role defaults preserve a strict enterprise access model", () => {
  assert.equal(ROLE_DEFAULTS.owner.manage_permissions, true);
  assert.equal(ROLE_DEFAULTS.admin.manage_permissions, true);
  assert.equal(ROLE_DEFAULTS.manager.manage_permissions, false);
  assert.equal(ROLE_DEFAULTS.dispatcher.manage_coaching, true);
  assert.equal(ROLE_DEFAULTS.dispatcher.edit_scorecards, false);
  assert.equal(ROLE_DEFAULTS.viewer.bulk_actions, false);
});

test("explicit permission overrides only store changes from role defaults", () => {
  const desired = { ...ROLE_DEFAULTS.dispatcher, edit_scorecards: true, manage_coaching: true };
  const overrides = explicitOverrides("dispatcher", desired);
  assert.deepEqual(overrides, { edit_scorecards: true });
  assert.equal(effectivePermissions("dispatcher", overrides).edit_scorecards, true);
});

test("scorecard source N/A CDF/PSB is not treated as missing data", () => {
  const missing = missingScorecardMetrics({
    mentor_score: 820, dcr: 99.5, dsc_dpmo: 0, lor: 0, pod: 100, cc: 100, ce_dpmo: 0,
    cdf_dpmo: null, psb: null,
    raw_data: { source_files: ["DLS2-DSP-Scorecard.pdf"] },
  });
  assert.deepEqual(missing, []);
});

test("data quality health responds to unmatched, duplicates and completeness", () => {
  const state = buildDataQualityV2({
    drivers: [
      { id:"1",trid:"A",full_name:"Alex Driver",site:"DLS2" },
      { id:"2",trid:"B",full_name:"Alex Driver",site:"DLS2" },
      { id:"3",trid:"C",full_name:"Unresolved driver",site:"DLS2" },
    ],
    unmatched: [{ id:"u1" }],
    aliases: [],
    metricRows: [
      { driver_id:"1",week_label:"W37",period_end:"2026-09-18",mentor_score:820,dcr:99.5,dsc_dpmo:0,lor:0,pod:100,cc:100,ce_dpmo:0,cdf_dpmo:0,psb:0 },
      { driver_id:"2",week_label:"W37",period_end:"2026-09-18",mentor_score:null,dcr:99.5,dsc_dpmo:0,lor:0,pod:100,cc:100,ce_dpmo:0,cdf_dpmo:0,psb:0 },
    ],
    imports: [{ status:"complete",error_message:null }],
  });
  assert.equal(state.duplicates.length, 1);
  assert.equal(state.unresolved.length, 1);
  assert.equal(state.openUnmatched, 1);
  assert.ok(state.healthScore < 100);
  assert.equal(state.weeks[0].ficoMissing, 1);
});

test("Governance migration includes protected audit, permission, saved view and override layers", () => {
  const source = fs.readFileSync("supabase/migrations/20260919_governance_v2.sql","utf8");
  for (const fragment of [
    "create table if not exists public.audit_events",
    "create table if not exists public.member_permission_overrides",
    "create table if not exists public.saved_views",
    "create table if not exists public.driver_metric_overrides",
    "private.has_workspace_permission",
    "public.bulk_open_coaching_cases",
    "public.reset_driver_metric_override",
  ]) assert.ok(source.toLowerCase().includes(fragment.toLowerCase()), `missing ${fragment}`);
});
