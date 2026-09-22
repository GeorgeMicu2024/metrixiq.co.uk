import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { ROLE_DEFAULTS } from "../lib/governance/permissions.js";
import { canAccessNav } from "../lib/permissions/navigation.js";

test("V8 workflow permissions separate viewing, automation management and approvals", () => {
  assert.equal(ROLE_DEFAULTS.owner.view_workflows, true);
  assert.equal(ROLE_DEFAULTS.owner.manage_automations, true);
  assert.equal(ROLE_DEFAULTS.owner.approve_workflows, true);

  assert.equal(ROLE_DEFAULTS.manager.view_workflows, true);
  assert.equal(ROLE_DEFAULTS.manager.manage_automations, true);
  assert.equal(ROLE_DEFAULTS.manager.manage_workflows, true);
  assert.equal(ROLE_DEFAULTS.manager.approve_workflows, true);

  assert.equal(ROLE_DEFAULTS.dispatcher.view_workflows, true);
  assert.equal(ROLE_DEFAULTS.dispatcher.manage_automations, false);
  assert.equal(ROLE_DEFAULTS.dispatcher.manage_workflows, true);
  assert.equal(ROLE_DEFAULTS.dispatcher.approve_workflows, false);

  assert.equal(ROLE_DEFAULTS.viewer.view_workflows, false);
});

test("Action Center and Automation Engine are Business-plan workflow surfaces", () => {
  assert.equal(
    canAccessNav("manager-control", { effective_plan: "business" }, false, "dispatcher", ROLE_DEFAULTS.dispatcher),
    true
  );
  assert.equal(
    canAccessNav("automation", { effective_plan: "business" }, false, "manager", ROLE_DEFAULTS.manager),
    true
  );
  assert.equal(
    canAccessNav("automation", { effective_plan: "pro" }, false, "manager", ROLE_DEFAULTS.manager),
    false
  );
  assert.equal(
    canAccessNav("automation", { effective_plan: "business" }, false, "viewer", ROLE_DEFAULTS.viewer),
    false
  );
});

test("V8 core migration creates rules, playbooks, workflows, approvals, SLA and routing", () => {
  const sql = fs.readFileSync("supabase/migrations/20260919_automation_workflows_v8_core.sql", "utf8").toLowerCase();

  for (const fragment of [
    "create table if not exists public.automation_rules",
    "create table if not exists public.automation_runs",
    "create table if not exists public.workflow_playbooks",
    "create table if not exists public.workflow_instances",
    "create table if not exists public.workflow_step_runs",
    "create table if not exists public.approval_requests",
    "create table if not exists public.workflow_sla_policies",
    "create table if not exists public.workflow_notification_routes",
    "create table if not exists public.workflow_delivery_queue",
    "create or replace function public.start_playbook_workflow",
    "create or replace function public.complete_workflow_step",
    "create or replace function public.decide_approval_request",
    "create or replace function public.upsert_workflow_sla_policy",
    "create or replace function public.upsert_notification_route",
    "'fico_recovery'",
    "'dnr_investigation'",
    "'poor_performance'",
    "'approval'",
  ]) {
    assert.ok(sql.includes(fragment), "missing " + fragment);
  }
});

test("V8 engine supports requested operational triggers and governed actions", () => {
  const sql = fs.readFileSync("supabase/migrations/20260919_automation_workflows_v8_engine.sql", "utf8").toLowerCase();

  for (const fragment of [
    "'fico_below'",
    "'total_score_below'",
    "'concessions_above'",
    "'dcr_wow_drop'",
    "'stale_source'",
    "'overdue_coaching'",
    "'overdue_incident'",
    "'scheduled_digest'",
    "private.driver_point_score",
    "create or replace function private.emit_automation_action",
    "create or replace function public.run_automation_rule",
    "create or replace function public.run_automation_engine",
    "create or replace function public.list_action_center_v2",
    "create or replace function public.refresh_sla_escalations",
    "create or replace function public.request_action_close_approval",
    "create or replace function public.run_due_automations_system",
  ]) {
    assert.ok(sql.includes(fragment), "missing " + fragment);
  }

  assert.ok(sql.includes("consecutive_periods"));
  assert.ok(sql.includes("workflow_delivery_queue"));
  assert.ok(sql.includes("service_role"));
  assert.ok(sql.includes("p_source='system_cron'"));
});

test("Default V8 rules are safe templates and start disabled", () => {
  const sql = fs.readFileSync("supabase/migrations/20260919_automation_workflows_v8_engine.sql", "utf8");
  const names = [
    "FICO Recovery < 815",
    "Poor Performance 2 Weeks",
    "Concession Review",
    "DCR WoW Drop >= 0.5pp",
    "Scorecard Data Stale",
    "Overdue Coaching Escalation",
    "Overdue Incident Escalation",
    "Daily eMentor Brief",
    "Monday Operations Brief",
    "Weekly Executive Pack",
  ];
  for (const name of names) assert.ok(sql.includes(name), "missing default rule " + name);

  const defaultSection = sql.slice(
    sql.indexOf("insert into public.automation_rules"),
    sql.indexOf("on conflict (organization_id,name) do nothing")
  );
  assert.equal(defaultSection.includes("true,'fico_below'"), false);
  assert.ok(defaultSection.includes("false,'fico_below'"));
  assert.ok(defaultSection.includes("false,'scheduled_digest'"));
});

test("V8 scheduler endpoint is protected and hourly cron is code-configured", () => {
  const route = fs.readFileSync("app/api/cron/automation/route.js", "utf8");
  const vercel = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
  const env = fs.readFileSync(".env.example", "utf8");

  assert.ok(route.includes("CRON_SECRET"));
  assert.ok(route.includes("SUPABASE_SERVICE_ROLE_KEY"));
  assert.ok(route.includes('authorization !== "Bearer " + cronSecret'));
  assert.ok(route.includes('supabase.rpc("run_due_automations_system"'));
  assert.ok(vercel.crons.some((item) => item.path === "/api/cron/automation" && item.schedule === "0 6 * * *"));
  assert.ok(env.includes("CRON_SECRET=YOUR_RANDOM_CRON_SECRET"));
});

test("V8 product surfaces replace Manager Control with Action Center V2 and wire automation after imports", () => {
  const dashboard = fs.readFileSync("components/DashboardClient.jsx", "utf8");
  const navigation = fs.readFileSync("components/dashboard/navigation.js", "utf8");
  const actionCenter = fs.readFileSync("components/automation/ActionCenterV2.jsx", "utf8");
  const automation = fs.readFileSync("components/automation/AutomationCenter.jsx", "utf8");

  assert.ok(dashboard.includes('./automation/ActionCenterV2'));
  assert.ok(dashboard.includes('./automation/AutomationCenter'));
  assert.equal(dashboard.includes('./management/ManagerControlCenterV2'), false);
  assert.ok(dashboard.includes('case "manager-control"'));
  assert.ok(dashboard.includes('case "automation"'));
  assert.ok(dashboard.includes('runAutomationEngine(getSupabaseBrowserClient(), organizationId, false, "import_completed")'));
  assert.ok(dashboard.includes('runAutomationEngine(supabase, organizationId, false, "workspace_open")'));

  assert.equal(navigation.includes('["manager-control", "Action Center"]'), false);
  assert.ok(navigation.includes('["automation", "Automation Engine"]'));
  assert.ok(actionCenter.includes("ACTION CENTER V2"));
  assert.ok(actionCenter.includes("Request closure approval"));
  assert.ok(actionCenter.includes("SLA breached"));
  assert.ok(automation.includes("AUTOMATION & WORKFLOW ENGINE V8"));
  assert.ok(automation.includes("Rules Builder"));
  assert.ok(automation.includes("Operational Playbooks"));
  assert.ok(automation.includes("Approval Center"));
  assert.ok(automation.includes("Notification Routing"));
  assert.ok(automation.includes("External Delivery Queue"));
});

test("V8 scheduler SQL does not contain malformed single-dollar function delimiters", () => {
  for (const path of [
    "supabase/migrations/20260919_automation_workflows_v8_core.sql",
    "supabase/migrations/20260919_automation_workflows_v8_engine.sql",
  ]) {
    const sql = fs.readFileSync(path, "utf8");
    assert.equal(/as \$\n/.test(sql), false, path + " has malformed dollar quote");
    assert.equal(/\n\$;/.test(sql), false, path + " has malformed closing dollar quote");
  }
});
