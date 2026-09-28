import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) =>
  fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

const slugs = [
  "driver-performance-scorecard-guide",
  "fleet-performance-kpis",
  "delivery-driver-coaching-guide",
  "fleet-compliance-monitoring-guide",
  "delivery-operations-data-quality",
];

test("SEO Batch 4 exposes an indexable resources hub and five guide pages", () => {
  const resources = read("lib/seo/resources.js");
  const site = read("lib/seo/site.js");
  const sitemap = read("app/sitemap.js");

  assert.ok(fs.existsSync(new URL("../app/resources/page.jsx", import.meta.url)));
  assert.ok(fs.existsSync(new URL("../app/resources/[slug]/page.jsx", import.meta.url)));
  assert.ok(site.includes('path: "/resources"'));
  assert.ok(sitemap.includes("RESOURCE_LIST"));

  for (const slug of slugs) {
    assert.ok(resources.includes('"' + slug + '": {'));
  }
});

test("resource guides publish Article and Breadcrumb structured data", () => {
  const resources = read("lib/seo/resources.js");

  assert.ok(resources.includes('"@type": "Article"'));
  assert.ok(resources.includes('"@type": "BreadcrumbList"'));
  assert.ok(resources.includes("datePublished"));
  assert.ok(resources.includes("publisher"));
});

test("resource pages use Next 16 async params and static generation", () => {
  const route = read("app/resources/[slug]/page.jsx");

  assert.ok(route.includes("generateStaticParams"));
  assert.ok(route.includes("export async function generateMetadata"));
  assert.ok(route.includes("const { slug } = await params"));
  assert.ok(route.includes("notFound()"));
});

test("homepage and public navigation link to the resources hub", () => {
  const landing = read("components/Landing.jsx");
  const shell = read("components/PublicPageShell.jsx");

  assert.ok(landing.includes('href="/resources"'));
  assert.ok(landing.includes("OPERATIONS RESOURCES"));
  assert.ok(shell.includes('href="/resources"'));
});

test("resource guides link into product solutions and solution pages link back to guides", () => {
  const article = read("components/ResourceArticle.jsx");
  const solution = read("components/SolutionLandingPage.jsx");

  assert.ok(article.includes("article.relatedSolution"));
  assert.ok(article.includes("Continue reading"));
  assert.ok(solution.includes("RESOURCE_LIST.filter"));
  assert.ok(solution.includes("Learn more"));
});
