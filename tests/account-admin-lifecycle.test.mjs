import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Super Admin imports daysLeft and exposes guarded delete control", () => {
  const adminView = fs.readFileSync("components/admin/PlatformAdminView.jsx", "utf8");
  const adminData = fs.readFileSync("lib/data/admin.js", "utf8");

  assert.ok(adminView.includes("daysLeft"));
  assert.ok(adminView.includes("deleteAdminAccount"));
  assert.ok(adminView.includes('window.prompt('));
  assert.ok(adminView.includes('Type DELETE to continue'));
  assert.ok(adminData.includes('fetch("/api/admin/accounts/delete"'));
});

test("account settings includes profile password logout and delete account", () => {
  const settings = fs.readFileSync("components/account/AccountSettingsView.jsx", "utf8");
  const dashboard = fs.readFileSync("components/DashboardClient.jsx", "utf8");

  assert.ok(settings.includes("Save profile"));
  assert.ok(settings.includes("Update password"));
  assert.ok(settings.includes("Log out"));
  assert.ok(settings.includes("Delete my account"));
  assert.ok(settings.includes('fetch("/api/account/delete"'));
  assert.ok(settings.includes('deleteText!=="DELETE"'));
  assert.ok(dashboard.includes('./account/AccountSettingsView'));
  assert.ok(dashboard.includes('case "settings": view = <AccountSettingsView'));
});

test("account deletion helper blocks destructive owner deletion", () => {
  const helper = fs.readFileSync("lib/accounts/deleteAccountServer.js", "utf8");

  assert.ok(helper.includes("The last Platform Admin account cannot be deleted."));
  assert.ok(helper.includes("Transfer ownership of"));
  assert.ok(helper.includes("Delete or transfer the operational data"));
  assert.ok(helper.includes("Cancel the active subscription"));
  assert.ok(helper.includes("admin.auth.admin.deleteUser"));
});

test("self and Super Admin delete endpoints require DELETE confirmation and authentication", () => {
  const selfRoute = fs.readFileSync("app/api/account/delete/route.js", "utf8");
  const adminRoute = fs.readFileSync("app/api/admin/accounts/delete/route.js", "utf8");

  assert.ok(selfRoute.includes('confirmation || "") !== "DELETE"'));
  assert.ok(selfRoute.includes("client.auth.getUser"));
  assert.ok(selfRoute.includes("deleteMetrixAccount"));

  assert.ok(adminRoute.includes('confirmation || "") !== "DELETE"'));
  assert.ok(adminRoute.includes('client.rpc("is_platform_admin")'));
  assert.ok(adminRoute.includes("deleteMetrixAccount"));
});
