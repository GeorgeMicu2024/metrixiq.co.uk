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
  assert.ok(dashboard.includes("topbar-calendar-popover"));
  assert.ok(dashboard.includes("Week {headerWeek}"));
  assert.equal(dashboard.includes("topbar-sync"), false);
  assert.ok(dashboard.includes("topbar-profile-premium"));
  assert.ok(dashboard.includes("session?.avatar_url"));
  assert.ok(dashboard.includes("setSidebarCompact(value=>!value)"));

  assert.ok(notifications.includes("notification-bell-icon"));
  assert.ok(notifications.includes("<svg"));

  assert.ok(css.includes("Premium MetrixIQ top rail"));
  assert.ok(css.includes("Premium header interaction corrections"));
  assert.ok(css.includes(".topbar-premium .notification-bell"));
  assert.ok(css.includes("content:none!important"));
  assert.ok(css.includes(".site-switcher-premium select"));
  assert.ok(css.includes("position:absolute!important"));
});

test("site selector remains the single global site control and full pill is interactive", () => {
  const dashboard = read("components/DashboardClient.jsx");
  const css = read("app/globals.css");

  assert.equal(
    (dashboard.match(/aria-label="Filter workspace by site"/g) || []).length,
    1
  );
  assert.ok(dashboard.includes('<span className="site-switcher-mark">SITE</span>'));
  assert.ok(css.includes("pointer-events:none!important"));
  assert.ok(css.includes("cursor:pointer!important"));
});

test("home site identities use professional bordered badges", () => {
  const home = read("components/dashboard/HomeView.jsx");
  const css = read("app/globals.css");

  assert.ok(home.includes("siteperf-site"));
  assert.ok(home.includes("scoretrend-card-head"));
  assert.ok(css.includes(".siteperf-site{"));
  assert.ok(css.includes("border:1px solid #dce5ec"));
  assert.ok(css.includes(".scoretrend-card-head>b{"));
});
