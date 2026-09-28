import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) =>
  fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("SEO host canonicalization is left to Vercel while internal aliases can redirect safely", () => {
  const nextConfig = read("next.config.mjs");
  const site = read("lib/seo/site.js");

  assert.ok(site.includes('SITE_URL = "https://www.metrixiq.co.uk"'));
  assert.equal(nextConfig.includes('type: "host"'), false);
  assert.equal(nextConfig.includes('destination: "https://metrixiq.co.uk'), false);
  assert.equal(nextConfig.includes('destination: "https://www.metrixiq.co.uk'), false);
  assert.ok(nextConfig.includes('source: "/driver-scorecards"'));
});

test("private, auth, login and API routes send noindex directives", () => {
  const nextConfig = read("next.config.mjs");
  const robots = read("app/robots.js");
  const loginLayout = read("app/login/layout.jsx");
  const appLayout = read("app/app/layout.jsx");
  const authLayout = read("app/auth/layout.jsx");

  assert.ok(nextConfig.includes('"X-Robots-Tag"'));
  for (const route of ["/app/:path*", "/auth/:path*", "/login", "/api/:path*"]) {
    assert.ok(nextConfig.includes(`source: "${route}"`));
  }

  assert.ok(robots.includes('"/login"'));
  assert.ok(loginLayout.includes("index: false"));
  assert.ok(appLayout.includes("index: false"));
  assert.ok(authLayout.includes("index: false"));
});

test("GA4 cannot load before explicit analytics consent", () => {
  const analytics = read("components/GoogleAnalytics.jsx");

  assert.ok(analytics.includes('consent === "accepted"'));
  assert.ok(analytics.includes("metrixiq_analytics_consent"));
  assert.ok(analytics.includes("Reject analytics"));
  assert.ok(analytics.includes("Accept analytics"));
  assert.ok(analytics.includes("They are not loaded unless you accept"));
});

test("cookie preferences can be reopened from public pages", () => {
  const settings = read("components/CookieSettingsButton.jsx");
  const landing = read("components/Landing.jsx");
  const publicShell = read("components/PublicPageShell.jsx");
  const privacy = read("app/privacy/page.jsx");

  assert.ok(settings.includes("CONSENT_EVENT"));
  assert.ok(landing.includes("<CookieSettingsButton />"));
  assert.ok(publicShell.includes("<CookieSettingsButton />"));
  assert.ok(privacy.includes("Analytics cookies"));
});

test("public marketing routes no longer load private dashboard CSS bundles", () => {
  const rootLayout = read("app/layout.jsx");
  const privateLayout = read("app/app/layout.jsx");

  for (const css of [
    "scorecard.css",
    "scorecards-v22.css",
    "mentor.css",
    "governance-v2.css",
    "operations-intelligence-v4.css",
    "intelligence-reporting-v5.css",
    "platform-mobile-v6.css",
    "enterprise-portfolio-v7.css",
    "automation-workflows-v8.css",
    "integration-delivery-v9.css",
    "account-settings.css",
  ]) {
    assert.equal(rootLayout.includes(css), false, css + " still loaded by public root");
    assert.ok(privateLayout.includes(css), css + " missing from private app layout");
  }
});

test("landing authentication lazy-loads Supabase only after interaction", () => {
  const card = read("components/LandingSignInCard.jsx");
  const rootLayout = read("app/layout.jsx");
  const privateLayout = read("app/app/layout.jsx");

  assert.ok(card.includes('await import("../lib/supabase/client")'));
  assert.equal(card.includes('import { getSupabaseBrowserClient }'), false);
  assert.ok(rootLayout.includes("<PwaBootstrap />"));
  assert.equal(privateLayout.includes("PwaBootstrap"), false);
});
