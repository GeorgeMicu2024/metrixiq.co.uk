import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("pricing page is public and indexable through the sitemap inventory", () => {
  const site = read("lib/seo/site.js");
  const pricing = read("app/pricing/page.jsx");
  assert.ok(site.includes('path: "/pricing"'));
  assert.ok(pricing.includes('path: "/pricing"'));
  assert.ok(pricing.includes("PLAN_CATALOG.map"));
});

test("software schema exposes real GBP monthly offers from the plan catalog", () => {
  const site = read("lib/seo/site.js");
  assert.ok(site.includes('priceCurrency: "GBP"'));
  assert.ok(site.includes('billingDuration: "P1M"'));
  assert.ok(site.includes("PLAN_CATALOG.map"));
  assert.ok(site.includes('availability: "https://schema.org/InStock"'));
});

test("pricing page publishes tracked plan CTAs and structured FAQ", () => {
  const pricing = read("app/pricing/page.jsx");
  assert.ok(pricing.includes("TrackedLink"));
  assert.ok(pricing.includes('cta_location: "pricing_page"'));
  assert.ok(pricing.includes('"@type": "FAQPage"'));
  assert.ok(pricing.includes("formatPlanPrice"));
});

test("public navigation points to the dedicated pricing page", () => {
  const landing = read("components/Landing.jsx");
  const shell = read("components/PublicPageShell.jsx");
  assert.ok(landing.includes('<Link href="/pricing">Pricing</Link>'));
  assert.ok(shell.includes('<Link href="/pricing">Pricing</Link>'));
});
