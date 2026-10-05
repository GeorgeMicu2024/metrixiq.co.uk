import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) =>
  fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

const slugs = [
  "driver-performance-scorecards",
  "fleet-compliance-monitoring",
  "delivery-operations-software",
  "driver-coaching-software",
  "fleet-data-analytics",
  "fleet-performance-management",
];

test("SEO Batch 2 exposes the solutions hub and six indexable solution routes", () => {
  const site = read("lib/seo/site.js");
  assert.ok(fs.existsSync(new URL("../app/solutions/page.jsx", import.meta.url)));
  assert.ok(site.includes('path: "/solutions"'));

  for (const slug of slugs) {
    assert.ok(
      fs.existsSync(new URL("../app/" + slug + "/page.jsx", import.meta.url)),
      slug + " page is missing"
    );
    assert.ok(site.includes('path: "/' + slug + '"'));
  }
});

test("solution pages have unique metadata and FAQ/Breadcrumb schema", () => {
  const definitions = read("lib/seo/solutionPages.js");

  assert.ok(definitions.includes('"@type": "WebPage"'));
  assert.ok(definitions.includes('"@type": "BreadcrumbList"'));
  assert.ok(definitions.includes('"@type": "FAQPage"'));
  assert.ok(definitions.includes("buildSolutionSchemas"));

  for (const slug of slugs) {
    assert.ok(definitions.includes('"' + slug + '": {'));
  }
});

test("solution pages are connected by internal links", () => {
  const component = read("components/SolutionLandingPage.jsx");
  const home = read("components/Landing.jsx");

  assert.ok(component.includes("Related MetrixIQ solutions"));
  assert.ok(component.includes("page.related.map"));
  assert.ok(home.includes("EXPLORE SOLUTIONS"));

  for (const slug of slugs) {
    assert.ok(home.includes('"/' + slug + '"'));
  }
});

test("solution page copy has structured H2/H3 content and CTA", () => {
  const component = read("components/SolutionLandingPage.jsx");

  assert.ok(component.includes("<h2>"));
  assert.ok(component.includes("<h3>"));
  assert.ok(component.includes("Frequently asked questions"));
  assert.ok(component.includes('href="/login?mode=register"'));
  assert.ok(component.includes('href="/contact"'));
});


test("solutions hub exposes the six workflows as an ItemList", () => {
  const hub = read("app/solutions/page.jsx");
  assert.ok(hub.includes('"@type": "ItemList"'));
  assert.ok(hub.includes("SOLUTION_PAGE_LIST.map"));
  assert.ok(hub.includes("Explore solution"));
});
