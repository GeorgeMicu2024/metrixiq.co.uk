import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("team invite fix sends real Supabase invitations through a server endpoint", () => {
  const route = fs.readFileSync("app/api/team/invite/route.js", "utf8");
  const team = fs.readFileSync("lib/data/team.js", "utf8");

  assert.ok(route.includes("inviteUserByEmail"));
  assert.ok(route.includes("/auth/accept-invite"));
  assert.ok(route.includes("create_team_invite"));
  assert.ok(route.includes("NEXT_PUBLIC_APP_URL"));
  assert.ok(team.includes('fetch("/api/team/invite"'));
  assert.ok(team.includes("access_token"));
});

test("team invitation onboarding verifies the mailbox before attaching workspace access", () => {
  const sql = fs.readFileSync("supabase/migrations/20260919_team_invite_delivery_access_fix.sql", "utf8").toLowerCase();

  assert.ok(sql.includes("private.attach_pending_workspace_invite"));
  assert.ok(sql.includes("new.email_confirmed_at is not null"));
  assert.ok(sql.includes("join auth.users au on au.id=p.id"));
  assert.ok(sql.includes("au.email_confirmed_at is not null"));
  assert.ok(sql.includes("create or replace function public.redeem_my_pending_invites"));
  assert.ok(sql.includes("create or replace function public.create_team_invite"));
  assert.ok(sql.includes("on conflict (organization_id,user_id) do update"));
});

test("invite acceptance page sets password and explicitly redeems the pending workspace", () => {
  const page = fs.readFileSync("app/auth/accept-invite/page.jsx", "utf8");

  assert.ok(page.includes("exchangeCodeForSession"));
  assert.ok(page.includes('updateUser({'));
  assert.ok(page.includes("password"));
  assert.ok(page.includes("full_name"));
  assert.ok(page.includes('rpc("redeem_my_pending_invites")'));
  assert.ok(page.includes("Join workspace"));
});

test("invite registration UX pre-fills the exact invited email and no longer says create workspace", () => {
  const login = fs.readFileSync("components/LoginClient.jsx", "utf8");
  const teamView = fs.readFileSync("components/team/TeamManagementView.jsx", "utf8");

  assert.ok(login.includes('params.get("email")'));
  assert.ok(login.includes('inviteMode ? "Join workspace" : "Create workspace"'));
  assert.ok(teamView.includes("Resend email"));
  assert.ok(teamView.includes("Personal invite signup link copied."));
  assert.ok(teamView.includes("Invitation email sent."));
});


test("personal invite links carry the secure token and registration cannot spin forever", () => {
  const teamView = fs.readFileSync("components/team/TeamManagementView.jsx", "utf8");
  const login = fs.readFileSync("components/LoginClient.jsx", "utf8");
  const route = fs.readFileSync("app/api/auth/register-invite/route.js", "utf8");
  const sql = fs.readFileSync("supabase/migrations/20260919_team_invite_token_signup.sql", "utf8").toLowerCase();

  assert.ok(teamView.includes('params.set("token", invite.token)'));
  assert.ok(login.includes('params.get("token")'));
  assert.ok(login.includes('fetch("/api/auth/register-invite"'));
  assert.ok(login.includes("AbortController"));
  assert.ok(login.includes("Registration timed out."));
  assert.ok(login.includes("withTimeout("));
  assert.ok(login.includes('readOnly={invitedEmailLocked}'));

  assert.ok(route.includes("admin.auth.admin.createUser"));
  assert.ok(route.includes("email_confirm: true"));
  assert.ok(route.includes('admin.rpc("complete_team_invite_signup"'));
  assert.ok(route.includes("deleteUser(createdUserId)"));

  assert.ok(sql.includes("create or replace function public.get_team_invite_signup_context"));
  assert.ok(sql.includes("create or replace function public.complete_team_invite_signup"));
  assert.ok(sql.includes("grant execute on function public.get_team_invite_signup_context(uuid,text) to service_role"));
  assert.ok(sql.includes("grant execute on function public.complete_team_invite_signup(uuid,uuid,text) to service_role"));
  assert.ok(sql.includes("revoke all on function public.get_team_invite_signup_context(uuid,text) from authenticated"));
});
