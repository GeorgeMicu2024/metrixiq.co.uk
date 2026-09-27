import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) =>
  fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("premium dashboard header matches approved navigation structure", () => {
  const dashboard = read("components/DashboardClient.jsx");
  const notifications = read("components/notifications/NotificationsCenterV2.jsx");
  const css = read("app/globals.css");

  assert.ok(dashboard.includes("topbar-premium"));
  assert.ok(dashboard.includes("site-switcher-premium"));
  assert.ok(dashboard.includes("topbar-date-week"));
  assert.ok(dashboard.includes("Week {headerWeek}"));
  assert.ok(dashboard.includes("topbar-sync"));
  assert.ok(dashboard.includes("topbar-profile-premium"));
  assert.ok(dashboard.includes("session?.avatar_url"));
  assert.ok(dashboard.includes("setSidebarCompact(value=>!value)"));

  assert.ok(notifications.includes("notification-bell-icon"));
  assert.ok(notifications.includes("<svg"));

  assert.ok(css.includes("Premium MetrixIQ top rail"));
  assert.ok(css.includes(".topbar-premium .notification-bell"));
  assert.ok(css.includes("#f1c96c"));
  assert.ok(css.includes(".site-switcher-premium"));
});

test("site selector remains the single global site control in the premium header", () => {
  const dashboard = read("components/DashboardClient.jsx");

  assert.equal(
    (dashboard.match(/aria-label="Filter workspace by site"/g) || []).length,
    1
  );
  assert.ok(dashboard.includes('<span className="site-switcher-mark">SITE</span>'));
});
