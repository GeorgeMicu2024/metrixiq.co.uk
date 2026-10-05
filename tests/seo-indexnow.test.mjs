import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) =>
  fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("IndexNow publishes a stable root verification key file", () => {
  const config = read("lib/seo/indexnow.js");
  const key = config.match(/INDEXNOW_KEY = "([a-f0-9]+)"/)?.[1] || "";

  assert.ok(/^[a-f0-9]{32}$/.test(key));
  assert.ok(fs.existsSync(new URL("../public/" + key + ".txt", import.meta.url)));
  assert.equal(read("public/" + key + ".txt").trim(), key);
  assert.ok(config.includes("INDEXNOW_KEY_URL"));
});

test("IndexNow submission verifies the production key before sending URLs", () => {
  const script = read("scripts/indexnow-submit.mjs");

  assert.ok(script.includes("await fetchText(INDEXNOW_KEY_URL)"));
  assert.ok(script.includes("keyFile !== INDEXNOW_KEY"));
  assert.ok(script.includes('fetch("https://api.indexnow.org/indexnow"'));
  assert.ok(script.includes("urlList: urls.slice(0, 100)"));
  assert.ok(script.includes('process.argv.includes("--submit")'));
});

test("IndexNow workflow is manual and guarded by explicit submit confirmation", () => {
  const workflow = read(".github/workflows/indexnow.yml");
  const pkg = JSON.parse(read("package.json"));

  assert.ok(workflow.includes("workflow_dispatch:"));
  assert.ok(workflow.includes("type: boolean"));
  assert.ok(workflow.includes('if: ${{ inputs.submit }}'));
  assert.equal(pkg.scripts["seo:indexnow"], "node scripts/indexnow-submit.mjs");
  assert.equal(pkg.scripts["seo:indexnow:submit"], "node scripts/indexnow-submit.mjs --submit");
});
