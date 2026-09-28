import process from "node:process";

const BASE = (process.env.SEO_AUDIT_BASE_URL || "https://www.metrixiq.co.uk").replace(/\/$/, "");
const EXPECTED_CANONICAL_HOST = "www.metrixiq.co.uk";
const APEX = "https://metrixiq.co.uk";

const priorityPaths = [
  "/",
  "/solutions",
  "/fleet-performance-management",
  "/driver-performance-scorecards",
  "/fleet-compliance-monitoring",
  "/delivery-operations-software",
  "/driver-coaching-software",
  "/fleet-data-analytics",
  "/use-cases",
  "/use-cases/fleet-performance-dashboard",
  "/use-cases/multi-site-delivery-performance",
  "/compare/spreadsheets-vs-fleet-performance-software",
  "/resources",
];

const failures = [];
const results = [];

function fail(message) {
  failures.push(message);
}

async function fetchTimed(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "user-agent": "MetrixIQ-SEO-Audit/1.0",
        ...(options.headers || {}),
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function get(path, options = {}) {
  const url = path.startsWith("http") ? path : BASE + path;
  const response = await fetchTimed(url, options);
  const text = options.method === "HEAD" ? "" : await response.text();
  return { url, response, text };
}

function extract(html, pattern) {
  return html.match(pattern)?.[1]?.trim() || "";
}

function normaliseCanonical(value) {
  try {
    const url = new URL(value, BASE);
    url.hash = "";
    if (url.pathname !== "/" && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }
    return url.toString();
  } catch {
    return "";
  }
}

async function checkApexRedirect() {
  try {
    const { response } = await get(APEX + "/", { redirect: "manual" });
    const location = response.headers.get("location") || "";
    const validStatus = [301, 302, 307, 308].includes(response.status);
    const pointsToCanonical = location.includes(EXPECTED_CANONICAL_HOST);

    results.push({
      check: "apex_redirect",
      status: response.status,
      location,
    });

    if (!validStatus) fail(`apex host should redirect, got HTTP ${response.status}`);
    if (!pointsToCanonical) fail(`apex redirect does not point to ${EXPECTED_CANONICAL_HOST}: ${location}`);
  } catch (error) {
    fail("apex redirect check failed: " + error.message);
  }
}

async function checkPriorityPage(path) {
  try {
    const { response, text } = await get(path, { redirect: "follow" });
    const finalUrl = response.url;
    const title = extract(text, /<title[^>]*>([^<]+)<\/title>/i);
    const description = extract(
      text,
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i
    ) || extract(
      text,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["'][^>]*>/i
    );
    const canonical = extract(
      text,
      /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>/i
    ) || extract(
      text,
      /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["'][^>]*>/i
    );
    const robotsMeta = extract(
      text,
      /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["'][^>]*>/i
    ).toLowerCase();

    const expectedUrl = normaliseCanonical(BASE + path);
    const actualCanonical = normaliseCanonical(canonical);

    results.push({
      check: "priority_page",
      path,
      status: response.status,
      finalUrl,
      title,
      canonical: actualCanonical,
    });

    if (response.status !== 200) fail(`${path} returned HTTP ${response.status}`);
    if (!title) fail(`${path} is missing a title`);
    if (!description) fail(`${path} is missing a meta description`);
    if (!actualCanonical) fail(`${path} is missing a canonical URL`);
    if (actualCanonical && actualCanonical !== expectedUrl) {
      fail(`${path} canonical mismatch: expected ${expectedUrl}, got ${actualCanonical}`);
    }
    if (robotsMeta.includes("noindex")) fail(`${path} unexpectedly contains noindex`);
    if (!finalUrl.includes(EXPECTED_CANONICAL_HOST)) {
      fail(`${path} resolved to non-canonical host: ${finalUrl}`);
    }
  } catch (error) {
    fail(`${path} check failed: ${error.message}`);
  }
}

async function checkRobots() {
  try {
    const { response, text } = await get("/robots.txt");
    results.push({ check: "robots", status: response.status });

    if (response.status !== 200) fail(`robots.txt returned HTTP ${response.status}`);
    if (!text.includes(`Sitemap: https://${EXPECTED_CANONICAL_HOST}/sitemap.xml`)) {
      fail("robots.txt does not reference the canonical sitemap");
    }
    for (const route of ["/app", "/auth", "/api", "/login"]) {
      if (!text.includes("Disallow: " + route)) {
        fail(`robots.txt does not disallow ${route}`);
      }
    }
  } catch (error) {
    fail("robots.txt check failed: " + error.message);
  }
}

async function checkSitemap() {
  try {
    const { response, text } = await get("/sitemap.xml");
    const locs = [...text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);

    results.push({
      check: "sitemap",
      status: response.status,
      urls: locs.length,
    });

    if (response.status !== 200) fail(`sitemap.xml returned HTTP ${response.status}`);
    if (locs.length < 25) fail(`sitemap unexpectedly small: ${locs.length} URLs`);

    for (const loc of locs) {
      if (!loc.startsWith(`https://${EXPECTED_CANONICAL_HOST}`)) {
        fail("sitemap contains non-canonical URL: " + loc);
      }
      if (/\/(app|auth|api|login)(\/|$)/.test(new URL(loc).pathname)) {
        fail("sitemap contains private/auth URL: " + loc);
      }
    }

    for (const path of priorityPaths) {
      const expected = path === "/" ? BASE : BASE + path;
      if (!locs.includes(expected)) fail("sitemap missing priority URL: " + expected);
    }
  } catch (error) {
    fail("sitemap check failed: " + error.message);
  }
}

async function checkPrivateNoindex() {
  for (const path of ["/login", "/app"]) {
    try {
      const { response, text } = await get(path, { redirect: "manual" });
      const xRobots = (response.headers.get("x-robots-tag") || "").toLowerCase();
      const metaRobots = extract(
        text,
        /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["'][^>]*>/i
      ).toLowerCase();

      results.push({
        check: "private_noindex",
        path,
        status: response.status,
        xRobots,
        metaRobots,
      });

      if (!xRobots.includes("noindex") && !metaRobots.includes("noindex")) {
        fail(`${path} is missing noindex protection`);
      }
    } catch (error) {
      fail(`${path} noindex check failed: ${error.message}`);
    }
  }
}

async function check404() {
  const path = "/seo-audit-definitely-not-a-real-page";
  try {
    const { response, text } = await get(path, { redirect: "follow" });
    const robots = extract(
      text,
      /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["'][^>]*>/i
    ).toLowerCase();

    results.push({ check: "404", status: response.status, robots });

    if (response.status !== 404) fail(`invalid URL should return 404, got HTTP ${response.status}`);
    if (!robots.includes("noindex")) fail("404 page is missing noindex");
  } catch (error) {
    fail("404 check failed: " + error.message);
  }
}

await checkApexRedirect();
await Promise.all(priorityPaths.map(checkPriorityPage));
await checkRobots();
await checkSitemap();
await checkPrivateNoindex();
await check404();

const summary = {
  baseUrl: BASE,
  checkedAt: new Date().toISOString(),
  checks: results.length,
  failures,
  results,
};

console.log(JSON.stringify(summary, null, 2));

if (failures.length) {
  process.exitCode = 1;
}
