import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("SEO uses the Vercel primary www canonical domain", () => {
  const site = read("lib/seo/site.js");
  const layout = read("app/layout.jsx");
  const robots = read("app/robots.js");
  const sitemap = read("app/sitemap.js");
  assert.ok(site.includes('SITE_URL = "https://www.metrixiq.co.uk"'));
  assert.ok(layout.includes("metadataBase: new URL(SITE_URL)"));
  assert.ok(robots.includes("SITE_URL"));
  assert.ok(sitemap.includes("SITE_URL"));
});

test("public company and legal pages are part of the sitemap", () => {
  const site = read("lib/seo/site.js");
  for (const page of ["about","contact","privacy","terms","security"]) {
    assert.ok(fs.existsSync(new URL("../app/" + page + "/page.jsx", import.meta.url)));
    assert.ok(site.includes('path: "/' + page + '"'));
  }
});

test("structured data covers the public product and FAQ", () => {
  const site = read("lib/seo/site.js");
  const home = read("app/page.jsx");
  assert.ok(site.includes('"@type": "Organization"'));
  assert.ok(site.includes('"@type": "WebSite"'));
  assert.ok(site.includes('"@type": "SoftwareApplication"'));
  assert.ok(home.includes('"@type": "FAQPage"'));
});

test("social preview images and favicon conventions exist", () => {
  const layout = read("app/layout.jsx");
  assert.ok(layout.includes('url: "/opengraph-image"'));
  assert.ok(layout.includes('images: ["/twitter-image"]'));
  assert.ok(fs.existsSync(new URL("../app/opengraph-image.jsx", import.meta.url)));
  assert.ok(fs.existsSync(new URL("../app/twitter-image.jsx", import.meta.url)));
  assert.ok(fs.existsSync(new URL("../app/icon.svg", import.meta.url)));
});

test("homepage has ordered headings and descriptive SEO sections", () => {
  const landing = read("components/Landing.jsx");
  assert.ok(landing.includes("<h1>"));
  assert.ok(landing.includes("<h2>"));
  assert.ok(landing.includes("<h3>"));
  assert.ok(landing.includes('id="faq"'));
  assert.equal(landing.startsWith('"use client";'), false);
});

test("GA4 is opt-in through a configured measurement ID", () => {
  const analytics = read("components/GoogleAnalytics.jsx");
  assert.ok(analytics.includes("NEXT_PUBLIC_GA_MEASUREMENT_ID"));
  assert.ok(analytics.includes("googletagmanager.com/gtag/js"));
});
