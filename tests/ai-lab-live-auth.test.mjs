import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("../app/api/ai-lab/live-report/route.js", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20261104053000_ai_lab_user_state.sql", import.meta.url), "utf8");
const chat = readFileSync(new URL("../components/ai-lab/AiLabChat.jsx", import.meta.url), "utf8");

test("AI Lab live report endpoint authenticates as the caller and preserves source RLS", () => {
  assert.match(route, /auth\.getUser\(/);
  assert.match(route, /rpc\("is_platform_admin"\)/);
  assert.match(route, /Authorization: "Bearer " \+ match\[1\]/);
  assert.match(route, /\.eq\("organization_id", organizationId\)\.eq\("site", site\)/);
  assert.doesNotMatch(route, /process\.env\.SUPABASE_SERVICE_ROLE_KEY|createServiceRoleClient/);
  assert.match(route, /select\("dcr,pod,iadc,cdf_dpmo,concessions"\)/);
  assert.match(route, /select\("feedback_l0"\)/);
  assert.match(route, /select\("dnr"\)/);
});

test("AI Lab cloud state is independent and restricted to owner and platform admin", () => {
  assert.match(migration, /create table if not exists public\.ai_lab_user_state/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /user_id = \(select auth\.uid\(\)\) and \(select public\.is_platform_admin\(\)\)/);
  assert.match(migration, /grant select, insert, update/);
  assert.doesNotMatch(migration, /grant .* to anon/);
});

test("Chat requires explicit opt-in for RLS-scoped aggregates", () => {
  assert.match(chat, /setIncludeReport\(false\); setLiveReport\(""\)/);
  assert.match(chat, /Share selected report summary with AI/);
  assert.match(chat, /includeReport: Boolean\(includeReport && activeContext\)/);
  assert.match(chat, /AI_LAB_STATE_TABLE/);
});
