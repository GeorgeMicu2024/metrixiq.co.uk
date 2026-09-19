import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { ROLE_DEFAULTS } from "../lib/governance/permissions.js";
import { canAccessNav } from "../lib/permissions/navigation.js";

test("V9 permissions separate API-key authority from manager delivery authority", () => {
  assert.equal(ROLE_DEFAULTS.owner.view_developer_platform, true);
  assert.equal(ROLE_DEFAULTS.owner.manage_api_keys, true);
  assert.equal(ROLE_DEFAULTS.owner.manage_webhooks, true);
  assert.equal(ROLE_DEFAULTS.owner.manage_delivery, true);

  assert.equal(ROLE_DEFAULTS.manager.view_developer_platform, true);
  assert.equal(ROLE_DEFAULTS.manager.manage_api_keys, false);
  assert.equal(ROLE_DEFAULTS.manager.manage_webhooks, true);
  assert.equal(ROLE_DEFAULTS.manager.manage_delivery, true);

  assert.equal(ROLE_DEFAULTS.dispatcher.view_developer_platform, false);
  assert.equal(ROLE_DEFAULTS.viewer.view_developer_platform, false);
});

test("Integration and API Platform is a Full-plan gated surface", () => {
  assert.equal(
    canAccessNav("developer-platform", { effective_plan: "full" }, false, "owner", ROLE_DEFAULTS.owner),
    true
  );
  assert.equal(
    canAccessNav("developer-platform", { effective_plan: "business" }, false, "owner", ROLE_DEFAULTS.owner),
    false
  );
  assert.equal(
    canAccessNav("developer-platform", { effective_plan: "full" }, false, "manager", ROLE_DEFAULTS.manager),
    true
  );
  assert.equal(
    canAccessNav("developer-platform", { effective_plan: "full" }, false, "viewer", ROLE_DEFAULTS.viewer),
    false
  );
});

test("V9 migration creates hashed API keys, metering, signed webhooks and encrypted delivery records", () => {
  const sql = fs.readFileSync("supabase/migrations/20260919_integration_delivery_v9.sql", "utf8").toLowerCase();
  for (const fragment of [
    "create table if not exists public.developer_api_keys",
    "create table if not exists public.developer_api_usage_hourly",
    "create table if not exists public.outbound_webhook_endpoints",
    "create table if not exists public.outbound_webhook_events",
    "create table if not exists public.outbound_webhook_deliveries",
    "create table if not exists public.delivery_connections",
    "create or replace function public.authenticate_api_key",
    "create or replace function public.claim_webhook_deliveries",
    "create or replace function public.complete_webhook_delivery",
    "create or replace function public.claim_delivery_messages",
    "create or replace function public.complete_delivery_message",
    "create or replace function public.get_integration_delivery_health",
    "create or replace function private.enqueue_webhook_event",
    "create trigger trg_v9_site_scorecard_webhook",
    "create trigger trg_v9_workflow_webhook",
    "create trigger trg_v9_coaching_webhook",
    "create trigger trg_v9_incident_webhook",
    "create trigger trg_v9_sla_webhook",
    "'webhook.test'",
    "'scorecard.updated'",
    "'workflow.created'",
    "'sla.breached'",
    "'import.completed'",
  ]) {
    assert.ok(sql.includes(fragment), "missing " + fragment);
  }
  assert.ok(sql.includes("key_hash text not null unique"));
  assert.ok(sql.includes("secret_ciphertext text not null"));
  assert.ok(sql.includes("config_ciphertext text not null"));
  assert.ok(sql.includes("grant execute on function public.authenticate_api_key(text,text) to service_role"));
  assert.ok(sql.includes("revoke all on function public.authenticate_api_key(text,text) from authenticated"));
});

test("V9 server security uses AES-GCM, SHA-256 API hashes and DNS-based private-host blocking", () => {
  const server = fs.readFileSync("lib/integrations/serverV9.js", "utf8");
  assert.ok(server.includes('createCipheriv("aes-256-gcm"'));
  assert.ok(server.includes('createDecipheriv("aes-256-gcm"'));
  assert.ok(server.includes('createHash("sha256")'));
  assert.ok(server.includes('"miq_live_"'));
  assert.ok(server.includes("dns.lookup"));
  assert.ok(server.includes("isPrivateIpv4"));
  assert.ok(server.includes("isPrivateIpv6"));
  assert.ok(server.includes('url.protocol !== "https:"'));
});

test("V9 public REST API exposes scoped resources and exact scorecard formula", () => {
  const drivers = fs.readFileSync("app/api/v1/drivers/route.js", "utf8");
  const scorecards = fs.readFileSync("app/api/v1/scorecards/route.js", "utf8");
  const workflows = fs.readFileSync("app/api/v1/workflows/route.js", "utf8");
  const reports = fs.readFileSync("app/api/v1/reports/route.js", "utf8");
  const bi = fs.readFileSync("app/api/v1/bi/route.js", "utf8");
  const helper = fs.readFileSync("lib/integrations/publicApiV9.js", "utf8");

  assert.ok(drivers.includes('"drivers:read"'));
  assert.ok(scorecards.includes('"scorecards:read"'));
  assert.ok(workflows.includes('"workflows:read"'));
  assert.ok(reports.includes('"reports:read"'));
  assert.ok(bi.includes('"bi:read"'));
  assert.ok(helper.includes("calculateDriverScorecard"));
  assert.ok(helper.includes('formula'));
  assert.ok(helper.includes("rowsToCsv"));
});

test("V9 Import Gateway accepts only bounded CSV XLSX JSON machine imports", () => {
  const route = fs.readFileSync("app/api/v1/import/route.js", "utf8");
  const persistence = fs.readFileSync("lib/persistence.js", "utf8");

  assert.ok(route.includes('"imports:write"'));
  assert.ok(route.includes('new Set(["csv","xlsx","json"])'));
  assert.ok(route.includes("MAX_FILE_BYTES = 20 * 1024 * 1024"));
  assert.ok(route.includes("MAX_TOTAL_BYTES = 50 * 1024 * 1024"));
  assert.ok(route.includes("MAX_FILES = 10"));
  assert.ok(route.includes("analyseFiles(files)"));
  assert.ok(route.includes("persistAnalysisWithClient"));
  assert.ok(route.includes('"import.completed"'));
  assert.ok(route.includes('"api_import_completed"'));
  assert.ok(persistence.includes("export async function persistAnalysisWithClient"));
});

test("V9 delivery adapters support Email Slack Teams WhatsApp and generic webhooks", () => {
  const delivery = fs.readFileSync("lib/integrations/deliveryV9.js", "utf8");
  for (const provider of [
    '"resend"',
    '"slack_webhook"',
    '"teams_webhook"',
    '"whatsapp_cloud"',
    '"generic_webhook"',
  ]) assert.ok(delivery.includes(provider), "missing provider " + provider);

  assert.ok(delivery.includes('createHmac("sha256"'));
  assert.ok(delivery.includes("assertSafeHttpsUrl"));
  assert.ok(delivery.includes("AbortSignal.timeout"));
});

test("V9 cron worker processes webhook and delivery queues behind CRON_SECRET", () => {
  const route = fs.readFileSync("app/api/cron/integrations/route.js", "utf8");
  const vercel = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
  const env = fs.readFileSync(".env.example", "utf8");

  assert.ok(route.includes("CRON_SECRET"));
  assert.ok(route.includes("INTEGRATION_ENCRYPTION_KEY"));
  assert.ok(route.includes('admin.rpc("claim_webhook_deliveries"'));
  assert.ok(route.includes('admin.rpc("claim_delivery_messages"'));
  assert.ok(route.includes('admin.rpc("complete_webhook_delivery"'));
  assert.ok(route.includes('admin.rpc("complete_delivery_message"'));
  assert.ok(vercel.crons.some((item) => item.path === "/api/cron/integrations" && item.schedule === "5 * * * *"));
  assert.ok(env.includes("INTEGRATION_ENCRYPTION_KEY=GENERATE_A_LONG_RANDOM_SECRET"));
});

test("V9 workspace UI exposes API keys webhooks delivery health and docs", () => {
  const dashboard = fs.readFileSync("components/DashboardClient.jsx", "utf8");
  const navigation = fs.readFileSync("components/dashboard/navigation.js", "utf8");
  const center = fs.readFileSync("components/integrations/IntegrationDeliveryCenter.jsx", "utf8");
  const automation = fs.readFileSync("components/automation/AutomationCenter.jsx", "utf8");

  assert.ok(dashboard.includes('./integrations/IntegrationDeliveryCenter'));
  assert.ok(dashboard.includes('case "developer-platform"'));
  assert.ok(navigation.includes('["developer-platform", "Integration & API"]'));
  assert.ok(center.includes("INTEGRATION & DELIVERY PLATFORM V9"));
  assert.ok(center.includes("Developer API Keys"));
  assert.ok(center.includes("Signed Outgoing Webhooks"));
  assert.ok(center.includes("External Delivery Connections"));
  assert.ok(center.includes("Integration Health V2"));
  assert.ok(center.includes("MetrixIQ REST API v1"));
  assert.ok(automation.includes('<option value="slack">Slack</option>'));
  assert.ok(automation.includes('<option value="teams">Microsoft Teams</option>'));
  assert.ok(automation.includes('<option value="webhook">Generic webhook</option>'));
});

test("V9 migration does not expose secret-bearing integration tables directly to authenticated users", () => {
  const sql = fs.readFileSync("supabase/migrations/20260919_integration_delivery_v9.sql", "utf8").toLowerCase();
  assert.ok(sql.includes("revoke all on public.developer_api_keys from authenticated"));
  assert.ok(sql.includes("revoke all on public.outbound_webhook_endpoints from authenticated"));
  assert.ok(sql.includes("revoke all on public.delivery_connections from authenticated"));
  assert.equal(sql.includes("grant select on public.developer_api_keys to authenticated"), false);
  assert.equal(sql.includes("grant select on public.outbound_webhook_endpoints to authenticated"), false);
  assert.equal(sql.includes("grant select on public.delivery_connections to authenticated"), false);
});
