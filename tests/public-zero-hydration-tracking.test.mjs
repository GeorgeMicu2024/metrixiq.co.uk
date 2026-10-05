import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) =>
  fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("public tracked links are server-rendered with analytics data attributes", () => {
  const tracked = read("components/TrackedLink.jsx");

  assert.equal(tracked.includes('"use client"'), false);
  assert.ok(tracked.includes("data-track-event={eventName}"));
  assert.ok(tracked.includes("data-track-params={params}"));
  assert.equal(tracked.includes("onClick={handleClick}"), false);
});

test("analytics uses one delegated click listener after consent", () => {
  const analytics = read("components/GoogleAnalytics.jsx");

  assert.ok(analytics.includes('consent !== "accepted"'));
  assert.ok(analytics.includes('document.addEventListener("click", trackClick, true)'));
  assert.ok(analytics.includes('closest?.("[data-track-event]")'));
  assert.ok(analytics.includes('target.getAttribute("data-track-params")'));
});

test("cookie settings button does not require its own client bundle", () => {
  const settings = read("components/CookieSettingsButton.jsx");

  assert.equal(settings.includes('"use client"'), false);
  assert.ok(settings.includes('data-cookie-settings="true"'));
});
