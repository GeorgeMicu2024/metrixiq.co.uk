import process from "node:process";
import { INDEXNOW_KEY, INDEXNOW_KEY_URL } from "../lib/seo/indexnow.js";
import { SITE_URL } from "../lib/seo/site.js";

const submit = process.argv.includes("--submit");
const sitemapUrl = `${SITE_URL}/sitemap.xml`;

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "MetrixIQ-IndexNow/1.0" },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}`);
  }
  return text;
}

function extractSitemapUrls(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((match) => match[1].trim())
    .filter((url) => url.startsWith(SITE_URL));
}

const keyFile = (await fetchText(INDEXNOW_KEY_URL)).trim();
if (keyFile !== INDEXNOW_KEY) {
  throw new Error("IndexNow key file is not live or does not match the configured key.");
}

const sitemap = await fetchText(sitemapUrl);
const urls = extractSitemapUrls(sitemap);

if (!urls.length) {
  throw new Error("No canonical URLs found in sitemap.");
}

const payload = {
  host: new URL(SITE_URL).host,
  key: INDEXNOW_KEY,
  keyLocation: INDEXNOW_KEY_URL,
  urlList: urls.slice(0, 100),
};

if (!submit) {
  console.log(JSON.stringify({
    mode: "dry-run",
    keyLocation: INDEXNOW_KEY_URL,
    sitemapUrl,
    urlCount: payload.urlList.length,
    sample: payload.urlList.slice(0, 10),
  }, null, 2));
  process.exit(0);
}

const response = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: {
    "content-type": "application/json; charset=utf-8",
    "user-agent": "MetrixIQ-IndexNow/1.0",
  },
  body: JSON.stringify(payload),
});

const body = await response.text();

if (![200, 202].includes(response.status)) {
  throw new Error(`IndexNow submission failed with HTTP ${response.status}: ${body}`);
}

console.log(JSON.stringify({
  mode: "submit",
  status: response.status,
  acceptedForValidation: response.status === 202,
  submitted: payload.urlList.length,
  keyLocation: INDEXNOW_KEY_URL,
}, null, 2));
