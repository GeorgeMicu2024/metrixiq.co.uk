import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) =>
  fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("canonical MetrixIQ brand logo asset is published", () => {
  assert.ok(fs.existsSync(new URL("../public/metrixiq-logo.svg", import.meta.url)));

  const site = read("lib/seo/site.js");
  assert.ok(site.includes('logo: `${SITE_URL}/metrixiq-logo.svg`'));
  assert.ok(site.includes('image: `${SITE_URL}/opengraph-image`'));
});

test("About page exposes a clear official identity block", () => {
  const about = read("app/about/page.jsx");

  assert.ok(about.includes("Official MetrixIQ information"));
  assert.ok(about.includes("Fleet & driver performance software"));
  assert.ok(about.includes("United Kingdom"));
  assert.ok(about.includes("www.metrixiq.co.uk"));
  assert.ok(about.includes("CONTACT_PHONE_DISPLAY"));
  assert.ok(about.includes("CONTACT_PHONE_E164"));
});

test("official identity block avoids unverified legal or social claims", () => {
  const about = read("app/about/page.jsx");

  assert.equal(about.includes("Company number"), false);
  assert.equal(about.includes("LinkedIn"), false);
  assert.equal(about.includes("Registered office"), false);
});
