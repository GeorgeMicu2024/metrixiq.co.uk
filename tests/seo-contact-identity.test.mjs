import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) =>
  fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("MetrixIQ organization schema publishes the verified UK contact number", () => {
  const site = read("lib/seo/site.js");

  assert.ok(site.includes('CONTACT_PHONE_E164 = "+447490544199"'));
  assert.ok(site.includes('CONTACT_PHONE_DISPLAY = "07490 544199"'));
  assert.ok(site.includes("telephone: CONTACT_PHONE_E164"));
  assert.ok(site.includes('contactType: "sales"'));
  assert.ok(site.includes('contactType: "customer support"'));
});

test("Contact page displays a clickable phone link and ContactPage schema", () => {
  const contact = read("app/contact/page.jsx");

  assert.ok(contact.includes('"@type": "ContactPage"'));
  assert.ok(contact.includes("CONTACT_PHONE_E164"));
  assert.ok(contact.includes("CONTACT_PHONE_DISPLAY"));
  assert.ok(contact.includes('href={`tel:${CONTACT_PHONE_E164}`}'));
  assert.ok(contact.includes("Call MetrixIQ"));
});
