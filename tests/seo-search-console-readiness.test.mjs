import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) =>
  fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("SEO Batch 6 exposes visible breadcrumbs across commercial content", () => {
  const shell = read("components/PublicPageShell.jsx");
  const solution = read("components/SolutionLandingPage.jsx");
  const useCase = read("components/UseCaseLandingPage.jsx");
  const resource = read("components/ResourceArticle.jsx");

  assert.ok(shell.includes("PublicBreadcrumbs"));
  assert.ok(shell.includes("breadcrumbs = []"));
  assert.ok(solution.includes('{ label: "Solutions", href: "/solutions" }'));
  assert.ok(useCase.includes('{ label: "Use cases", href: "/use-cases" }'));
  assert.ok(resource.includes('{ label: "Resources", href: "/resources" }'));
});

test("conversion CTAs track only when consent-loaded gtag is available", () => {
  const tracked = read("components/TrackedLink.jsx");
  const analytics = read("components/GoogleAnalytics.jsx");
  const solution = read("components/SolutionLandingPage.jsx");

  assert.equal(tracked.includes('"use client"'), false);
  assert.ok(tracked.includes("data-track-event={eventName}"));
  assert.ok(tracked.includes("data-track-params={params}"));
  assert.ok(analytics.includes('consent === "accepted"'));
  assert.ok(analytics.includes('typeof window.gtag !== "function"'));
  assert.ok(analytics.includes('window.gtag("event"'));
  assert.ok(solution.includes("TrackedLink"));
  assert.ok(solution.includes('cta_location: "solution_page"'));
});

test("Search Console verification is environment-driven and documented", () => {
  const layout = read("app/layout.jsx");
  const envExample = read(".env.example");

  assert.ok(layout.includes("GOOGLE_SITE_VERIFICATION"));
  assert.ok(layout.includes("verification: { google: googleSiteVerification }"));
  assert.ok(envExample.includes("GOOGLE_SITE_VERIFICATION=YOUR_GOOGLE_SEARCH_CONSOLE_TOKEN"));
  assert.equal(/google-site-verification=[A-Za-z0-9_-]{20,}/.test(layout), false);
});

test("public pages declare UK English locale and language alternates", () => {
  const layout = read("app/layout.jsx");
  const site = read("lib/seo/site.js");

  assert.ok(layout.includes('<html lang="en-GB">'));
  assert.ok(layout.includes('locale: "en_GB"'));
  assert.ok(layout.includes('languages: { "en-GB": "/" }'));
  assert.ok(site.includes('languages: { "en-GB": canonicalPath }'));
});

test("404 page is noindex and provides useful recovery links", () => {
  const page = read("app/not-found.jsx");

  assert.ok(page.includes("index: false"));
  assert.ok(page.includes('href="/solutions"'));
  assert.ok(page.includes('href="/resources"'));
  assert.ok(page.includes("Page not found"));
});

test("sitemap uses stable lastModified values and excludes private routes", () => {
  const sitemap = read("app/sitemap.js");
  const site = read("lib/seo/site.js");

  assert.ok(sitemap.includes('lastModified: "2026-09-28"'));
  for (const privatePath of ["/app", "/auth", "/login", "/api"]) {
    assert.equal(site.includes('path: "' + privatePath), false);
  }
});

test("legacy keyword aliases redirect to canonical public pages without a host redirect", () => {
  const config = read("next.config.mjs");

  const aliases = [
    ["/guides", "/resources"],
    ["/blog", "/resources"],
    ["/driver-scorecards", "/driver-performance-scorecards"],
    ["/fleet-management-software", "/fleet-performance-management"],
    ["/fleet-compliance-software", "/fleet-compliance-monitoring"],
    ["/driver-coaching", "/driver-coaching-software"],
    ["/fleet-analytics", "/fleet-data-analytics"],
  ];

  for (const [source, destination] of aliases) {
    assert.ok(config.includes(`source: "${source}"`));
    assert.ok(config.includes(`destination: "${destination}"`));
  }

  assert.equal(config.includes('type: "host"'), false);
});


test("primary homepage CTAs are conversion tracked after analytics consent", () => {
  const landing = read("components/Landing.jsx");

  assert.ok(landing.includes("TrackedLink"));
  assert.ok(landing.includes('cta_location: "homepage_header"'));
  assert.ok(landing.includes('cta_location: "homepage_hero"'));
  assert.ok(landing.includes('cta_location: "homepage_closing"'));
});
