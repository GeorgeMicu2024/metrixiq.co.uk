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
  assert.ok(contact.includes("TrackedPhoneLink"));
  assert.ok(contact.includes('location="contact_page"'));
  assert.ok(contact.includes("Call MetrixIQ"));
});


test("verified contact number is visible across public footers", () => {
  const shell = read("components/PublicPageShell.jsx");
  const landing = read("components/Landing.jsx");

  for (const source of [shell, landing]) {
    assert.ok(source.includes("CONTACT_PHONE_E164"));
    assert.ok(source.includes("CONTACT_PHONE_DISPLAY"));
    assert.ok(source.includes("TrackedPhoneLink"));
  }
});


test("phone conversions emit a consent-dependent analytics event", () => {
  const trackedPhone = read("components/TrackedPhoneLink.jsx");

  assert.ok(trackedPhone.includes('window.gtag("event", "phone_click"'));
  assert.ok(trackedPhone.includes('typeof window.gtag !== "function"'));
  assert.ok(trackedPhone.includes("contact_method: \"phone\""));
});
