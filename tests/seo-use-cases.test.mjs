import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) =>
  fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

const useCaseSlugs = [
  "multi-site-delivery-performance",
  "fleet-performance-dashboard",
  "driver-safety-analytics",
  "delivery-compliance-dashboard",
  "delivery-management-reporting",
];

test("SEO Batch 5 exposes a use-case hub and five commercial-intent pages", () => {
  const definitions = read("lib/seo/useCasePages.js");
  const site = read("lib/seo/site.js");
  const sitemap = read("app/sitemap.js");

  assert.ok(fs.existsSync(new URL("../app/use-cases/page.jsx", import.meta.url)));
  assert.ok(fs.existsSync(new URL("../app/use-cases/[slug]/page.jsx", import.meta.url)));
  assert.ok(site.includes('path: "/use-cases"'));
  assert.ok(sitemap.includes("USE_CASE_LIST"));

  for (const slug of useCaseSlugs) {
    assert.ok(definitions.includes('"' + slug + '": {'), slug);
  }
});

test("use-case pages are static, indexable and publish FAQ/Breadcrumb schema", () => {
  const route = read("app/use-cases/[slug]/page.jsx");
  const definitions = read("lib/seo/useCasePages.js");

  assert.ok(route.includes("generateStaticParams"));
  assert.ok(route.includes("export async function generateMetadata"));
  assert.ok(route.includes("const { slug } = await params"));
  assert.ok(definitions.includes('"@type": "BreadcrumbList"'));
  assert.ok(definitions.includes('"@type": "FAQPage"'));
  assert.ok(definitions.includes('"@type": "WebPage"'));
});

test("comparison page is commercial but avoids named competitor claims", () => {
  const definitions = read("lib/seo/useCasePages.js");
  const page = read("app/compare/spreadsheets-vs-fleet-performance-software/page.jsx");
  const site = read("lib/seo/site.js");

  assert.ok(page.includes("Workflow comparison"));
  assert.ok(page.includes("Spreadsheet workflow"));
  assert.ok(page.includes("Fleet performance software"));
  assert.ok(definitions.includes("Spreadsheets vs Fleet Performance Software"));
  assert.ok(site.includes('path: "/compare/spreadsheets-vs-fleet-performance-software"'));
});

test("homepage, public navigation and solution pages link into use cases", () => {
  const landing = read("components/Landing.jsx");
  const shell = read("components/PublicPageShell.jsx");
  const solution = read("components/SolutionLandingPage.jsx");

  assert.ok(landing.includes('href="/use-cases"'));
  assert.ok(landing.includes("Explore all use cases"));
  assert.ok(shell.includes('href="/use-cases"'));
  assert.ok(solution.includes("USE_CASE_LIST.filter"));
  assert.ok(solution.includes("Operational use cases"));
});

test("use cases connect to relevant product solutions and related use cases", () => {
  const component = read("components/UseCaseLandingPage.jsx");

  assert.ok(component.includes("page.relatedSolution"));
  assert.ok(component.includes("Related use cases"));
  assert.ok(component.includes("USE_CASE_LIST.filter"));
  assert.ok(component.includes('href="/login?mode=register"'));
});
