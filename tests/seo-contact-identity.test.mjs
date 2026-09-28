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


test("verified contact number stays on Contact page but not in public footers", () => {
  const shell = read("components/PublicPageShell.jsx");
  const landing = read("components/Landing.jsx");
  const contact = read("app/contact/page.jsx");

  for (const source of [shell, landing]) {
    assert.equal(source.includes("CONTACT_PHONE_E164"), false);
    assert.equal(source.includes("CONTACT_PHONE_DISPLAY"), false);
    assert.equal(source.includes("TrackedPhoneLink"), false);
  }

  assert.ok(contact.includes("CONTACT_PHONE_E164"));
  assert.ok(contact.includes("CONTACT_PHONE_DISPLAY"));
  assert.ok(contact.includes("TrackedPhoneLink"));
});


test("phone conversions use delegated consent-dependent analytics", () => {
  const trackedPhone = read("components/TrackedPhoneLink.jsx");
  const analytics = read("components/GoogleAnalytics.jsx");

  assert.equal(trackedPhone.includes('"use client"'), false);
  assert.ok(trackedPhone.includes('data-track-event="phone_click"'));
  assert.ok(trackedPhone.includes('contact_method: "phone"'));
  assert.ok(analytics.includes('closest?.("[data-track-event]")'));
  assert.ok(analytics.includes('window.gtag("event"'));
});
