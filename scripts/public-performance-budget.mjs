import process from "node:process";

const BASE = (process.env.PERF_AUDIT_BASE_URL || "https://www.metrixiq.co.uk").replace(/\/$/, "");
const CSS_BUDGET = Number(process.env.PERF_CSS_BUDGET || 20000);
const JS_BUDGET = Number(process.env.PERF_JS_BUDGET || 625000);

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "MetrixIQ-Performance-Budget/1.0" },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return { response, body };
}

const { body: html } = await fetchText(BASE + "/");

const cssUrls = [...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/g)]
  .map((match) => new URL(match[1], BASE).toString());
const scriptUrls = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)]
  .map((match) => new URL(match[1], BASE).toString());

let cssChars = 0;
for (const url of cssUrls) {
  const { body } = await fetchText(url);
  cssChars += body.length;
}

let jsChars = 0;
for (const url of scriptUrls) {
  const { body } = await fetchText(url);
  jsChars += body.length;
}

const result = {
  baseUrl: BASE,
  stylesheets: cssUrls.length,
  scripts: scriptUrls.length,
  cssChars,
  cssBudget: CSS_BUDGET,
  jsChars,
  jsBudget: JS_BUDGET,
  cssWithinBudget: cssChars <= CSS_BUDGET,
  jsWithinBudget: jsChars <= JS_BUDGET,
};

console.log(JSON.stringify(result, null, 2));

if (!result.cssWithinBudget || !result.jsWithinBudget) {
  process.exitCode = 1;
}
