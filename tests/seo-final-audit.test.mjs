import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

test("final SEO audit passes", () => {
  const output = execFileSync(process.execPath, ["scripts/seo-audit.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  const result = JSON.parse(output);
  assert.equal(result.status, "ok");
  assert.equal(result.canonicalHost, "https://www.metrixiq.co.uk");
  assert.equal(result.searchConsoleReady, true);
  assert.ok(result.discoveredPublicPaths >= 25);
  assert.ok(result.uniqueSeoDescriptions >= 10);
});
