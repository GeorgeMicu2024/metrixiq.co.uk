import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) =>
  fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("MetrixIQ entity schema clearly identifies the fleet software category", () => {
  const site = read("lib/seo/site.js");

  assert.ok(site.includes('alternateName: "MetrixIQ Fleet Performance Intelligence"'));
  assert.ok(site.includes("disambiguatingDescription"));
  assert.ok(site.includes('"Fleet performance management"'));
  assert.ok(site.includes('applicationSubCategory: "Fleet performance management software"'));
  assert.ok(site.includes('"Driver performance scorecards"'));
  assert.ok(site.includes('"Fleet compliance monitoring"'));
  assert.ok(site.includes('audienceType: "Delivery operators, fleet managers and site managers"'));
});

test("public entity signals are UK English and UK-targeted", () => {
  const site = read("lib/seo/site.js");

  assert.ok(site.includes('inLanguage: "en-GB"'));
  assert.ok(site.includes('name: "United Kingdom"'));
});

test("homepage and About page define MetrixIQ as fleet and driver performance software", () => {
  const home = read("app/page.jsx");
  const landing = read("components/Landing.jsx");
  const about = read("app/about/page.jsx");

  assert.ok(home.includes('title: "Fleet & Driver Performance Software"'));
  assert.ok(home.includes("MetrixIQ is fleet and driver performance software for delivery operations."));
  assert.ok(landing.includes("FLEET & DRIVER PERFORMANCE SOFTWARE"));
  assert.ok(about.includes('title: "About MetrixIQ Fleet Performance Software"'));
  assert.ok(about.includes("MetrixIQ is fleet and driver performance software for delivery operations."));
});

test("entity clarification does not invent company identifiers or social profiles", () => {
  const site = read("lib/seo/site.js");

  assert.equal(site.includes("legalName:"), false);
  assert.equal(site.includes("sameAs:"), false);
  assert.equal(site.includes("telephone:"), false);
});


test("About page publishes explicit AboutPage schema for the MetrixIQ entity", () => {
  const about = read("app/about/page.jsx");

  assert.ok(about.includes('"@type": "AboutPage"'));
  assert.ok(about.includes('mainEntity: { "@id": organizationSchema["@id"] }'));
  assert.ok(about.includes('inLanguage: "en-GB"'));
});

test("software schema has an explicit Brand node", () => {
  const site = read("lib/seo/site.js");

  assert.ok(site.includes('"@type": "Brand"'));
  assert.ok(site.includes("name: SITE_NAME"));
});
