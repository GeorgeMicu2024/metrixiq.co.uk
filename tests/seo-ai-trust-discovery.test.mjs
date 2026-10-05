import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) =>
  fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("llms.txt defines the canonical MetrixIQ entity without unverified claims", () => {
  const llms = read("public/llms.txt");

  assert.ok(llms.includes("MetrixIQ is fleet and driver performance software"));
  assert.ok(llms.includes("https://www.metrixiq.co.uk"));
  assert.ok(llms.includes("+44 7490 544199"));
  assert.ok(llms.includes("It is not the unrelated organisation"));
  assert.equal(llms.includes("Company number"), false);
  assert.equal(llms.includes("LinkedIn"), false);
});

test("security.txt publishes canonical security contact metadata", () => {
  const security = read("public/.well-known/security.txt");

  assert.ok(security.includes("Contact: https://www.metrixiq.co.uk/contact"));
  assert.ok(security.includes("Canonical: https://www.metrixiq.co.uk/.well-known/security.txt"));
  assert.ok(security.includes("Policy: https://www.metrixiq.co.uk/security"));
  assert.ok(security.includes("Preferred-Languages: en"));
  assert.ok(security.includes("Expires: 2027-09-28T23:59:59Z"));
});

test("root security.txt safely redirects to the RFC well-known location", () => {
  const config = read("next.config.mjs");

  assert.ok(config.includes('source: "/security.txt"'));
  assert.ok(config.includes('destination: "/.well-known/security.txt"'));
  assert.equal(config.includes('destination: "https://www.metrixiq.co.uk/.well-known/security.txt"'), false);
});
