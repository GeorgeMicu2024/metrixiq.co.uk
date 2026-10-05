import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const fail = (message) => {
  throw new Error("[seo-audit] " + message);
};

const site = read("lib/seo/site.js");
const solutions = read("lib/seo/solutionPages.js");
const resources = read("lib/seo/resources.js");
const useCases = read("lib/seo/useCasePages.js");
const sitemap = read("app/sitemap.js");
const robots = read("app/robots.js");
const layout = read("app/layout.jsx");
const nextConfig = read("next.config.mjs");
const shell = read("components/PublicPageShell.jsx");
const solutionHub = read("app/solutions/page.jsx");
const resourceHub = read("app/resources/page.jsx");
const useCaseHub = read("app/use-cases/page.jsx");
const indexingManifest = read("lib/seo/indexingManifest.js");

if (!site.includes('SITE_URL = "https://www.metrixiq.co.uk"')) {
  fail("canonical SITE_URL is not the Vercel primary www host");
}
if (nextConfig.includes('type: "host"')) {
  fail("application-level host redirects are forbidden because Vercel owns host canonicalization");
}
if (
  nextConfig.includes('destination: "https://metrixiq.co.uk') ||
  nextConfig.includes('destination: "https://www.metrixiq.co.uk')
) {
  fail("absolute host redirects can recreate the www/non-www redirect loop");
}

for (const privateRoute of ["/app", "/auth", "/login", "/api"]) {
  if (!robots.includes(privateRoute)) fail(privateRoute + " missing from robots exclusions");
}

for (const hub of ["/solutions", "/use-cases", "/resources"]) {
  if (!shell.includes(`href="${hub}"`)) fail(hub + " is not linked from public navigation");
}

if (!solutionHub.includes("SOLUTION_PAGE_LIST.map")) fail("solution pages are not discoverable from /solutions");
if (!resourceHub.includes("RESOURCE_LIST.map")) fail("resource pages are not discoverable from /resources");
if (!useCaseHub.includes("USE_CASE_LIST.map")) fail("use-case pages are not discoverable from /use-cases");

if (!sitemap.includes("PUBLIC_PAGES")) fail("sitemap does not include public pages");
if (!sitemap.includes("RESOURCE_LIST")) fail("sitemap does not include resource articles");
if (!sitemap.includes("USE_CASE_LIST")) fail("sitemap does not include use cases");
if (!sitemap.includes('lastModified: "2026-09-28"')) fail("sitemap lastModified is not stable");

if (!layout.includes("GOOGLE_SITE_VERIFICATION")) fail("Search Console verification hook is missing");
if (!layout.includes('<html lang="en-GB">')) fail("document language is not en-GB");
if (!site.includes('languages: { "en-GB": canonicalPath }')) fail("page metadata lacks en-GB alternate");

const descriptionPattern = /description:\s*(?:\n\s*)?"([^"]+)"/g;
const descriptions = [];
for (const source of [solutions, resources, useCases]) {
  for (const match of source.matchAll(descriptionPattern)) descriptions.push(match[1]);
}
const duplicates = descriptions.filter((value, index) => descriptions.indexOf(value) !== index);
if (duplicates.length) fail("duplicate SEO descriptions found: " + [...new Set(duplicates)].join(" | "));

const pathPattern = /path:\s*"([^"]+)"/g;
const discoveredPaths = new Set();
for (const source of [site, solutions, resources, useCases]) {
  for (const match of source.matchAll(pathPattern)) discoveredPaths.add(match[1]);
}
if (!discoveredPaths.has("/")) fail("homepage missing from SEO path inventory");
if (discoveredPaths.size < 25) fail("SEO path inventory unexpectedly small: " + discoveredPaths.size);

for (const required of [
  "/",
  "/solutions",
  "/fleet-performance-management",
  "/driver-performance-scorecards",
  "/fleet-compliance-monitoring",
  "/delivery-operations-software",
  "/driver-coaching-software",
  "/fleet-data-analytics",
  "/use-cases",
]) {
  if (!indexingManifest.includes('"' + required + '"')) {
    fail("priority indexing manifest is missing " + required);
  }
}

console.log(
  JSON.stringify(
    {
      status: "ok",
      canonicalHost: "https://www.metrixiq.co.uk",
      discoveredPublicPaths: discoveredPaths.size,
      uniqueSeoDescriptions: new Set(descriptions).size,
      searchConsoleReady: true,
    },
    null,
    2
  )
);
