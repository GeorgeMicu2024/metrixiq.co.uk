import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) =>
  fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("public performance audit enforces CSS and JS budgets", () => {
  const script = read("scripts/public-performance-budget.mjs");
  const pkg = JSON.parse(read("package.json"));

  assert.ok(script.includes("PERF_CSS_BUDGET"));
  assert.ok(script.includes("PERF_JS_BUDGET"));
  assert.ok(script.includes("cssWithinBudget"));
  assert.ok(script.includes("jsWithinBudget"));
  assert.ok(script.includes("process.exitCode = 1"));
  assert.equal(pkg.scripts["perf:audit"], "node scripts/public-performance-budget.mjs");
});

test("performance budgets preserve the post-LCP CSS reduction", () => {
  const script = read("scripts/public-performance-budget.mjs");

  assert.ok(script.includes("45000"));
  assert.ok(script.includes("625000"));
});
