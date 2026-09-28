import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("organization schema publishes email and sameAs only when verified values exist", () => {
  const site = read("lib/seo/site.js");
  assert.ok(site.includes("PUBLIC_CONTACT_EMAIL"));
  assert.ok(site.includes("PUBLIC_SAME_AS"));
  assert.ok(site.includes("sameAs: PUBLIC_SAME_AS"));
  assert.ok(site.includes("email: PUBLIC_CONTACT_EMAIL"));
});

test("authority profile URLs must be HTTPS before publication", () => {
  const site = read("lib/seo/site.js");
  assert.ok(site.includes('return url.protocol === "https:"'));
  assert.ok(site.includes("PUBLIC_LINKEDIN_URL"));
  assert.ok(site.includes("PUBLIC_X_URL"));
});

test("contact and public footers expose verified authority links conditionally", () => {
  const contact = read("app/contact/page.jsx");
  const shell = read("components/PublicPageShell.jsx");
  const landing = read("components/Landing.jsx");
  for (const source of [contact, shell, landing]) {
    assert.ok(source.includes("PUBLIC_CONTACT_EMAIL") || source.includes("PUBLIC_LINKEDIN_URL"));
  }
  assert.ok(contact.includes('rel="me noopener noreferrer"'));
});

test("environment examples document authority settings without hardcoding them in schema", () => {
  const env = read(".env.example");
  const site = read("lib/seo/site.js");
  assert.ok(env.includes("LINKEDIN_URL="));
  assert.ok(env.includes("X_URL="));
  assert.equal(site.includes("linkedin.com/company/your-company"), false);
  assert.equal(site.includes("x.com/your-company"), false);
});
