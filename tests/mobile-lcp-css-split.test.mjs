import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) =>
  fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("public root no longer ships the full private application stylesheet", () => {
  const root = read("app/layout.jsx");
  const marketing = read("app/marketing-base.css");

  assert.ok(root.includes('import "./marketing-base.css"'));
  assert.equal(root.includes('import "./globals.css"'), false);
  assert.ok(marketing.length < 20000, "marketing CSS unexpectedly large");
  assert.ok(marketing.includes("Approved MetrixIQ Homepage Mockup V4"));
});

test("full application CSS remains scoped to authenticated routes", () => {
  for (const path of [
    "app/app/layout.jsx",
    "app/auth/layout.jsx",
    "app/login/layout.jsx",
  ]) {
    assert.ok(read(path).includes('import "../globals.css"'), path);
  }
});

test("below-the-fold homepage sections use content visibility containment", () => {
  const marketing = read("app/marketing-base.css");

  assert.ok(marketing.includes("content-visibility:auto"));
  assert.ok(marketing.includes("contain-intrinsic-size:auto 720px"));
  assert.ok(marketing.includes(".mk-feature-section"));
  assert.ok(marketing.includes(".mk-resource-links"));
});

test("mobile hero keeps the approved design while using a cheaper card shadow", () => {
  const marketing = read("app/marketing-base.css");

  assert.ok(marketing.includes(".mk-hero{min-height:585px"));
  assert.ok(marketing.includes(".mk-login-card{box-shadow:0 14px 32px"));
});


test("PWA service worker uses a non-hydrated deferred bootstrap", () => {
  const root = read("app/layout.jsx");

  assert.ok(root.includes('id="metrixiq-pwa-bootstrap"'));
  assert.ok(root.includes("requestIdleCallback"));
  assert.ok(root.includes('window.addEventListener("load", deferServiceWorker'));
  assert.ok(root.includes('navigator.serviceWorker.register("/sw.js"'));
  assert.equal(root.includes('import PwaBootstrap'), false);
});

test("mobile sign-in card can skip offscreen rendering before LCP", () => {
  const marketing = read("app/marketing-base.css");

  assert.ok(marketing.includes("content-visibility:auto;contain-intrinsic-size:auto 430px"));
});


test("homepage sign-in hydration is deferred until the card nears the viewport", () => {
  const landing = read("components/Landing.jsx");
  const deferred = read("components/DeferredLandingSignInCard.jsx");

  assert.ok(landing.includes('DeferredLandingSignInCard'));
  assert.equal(landing.includes('import LandingSignInCard from "./LandingSignInCard"'), false);
  assert.ok(deferred.includes('lazy(() => import("./LandingSignInCard"))'));
  assert.ok(deferred.includes("IntersectionObserver"));
  assert.ok(deferred.includes('rootMargin: "220px"'));
});

test("mobile hero removes decorative radial layers before LCP", () => {
  const marketing = read("app/marketing-base.css");

  assert.ok(marketing.includes(".mk-hero{background:#071725}"));
  assert.ok(marketing.includes(".mk-hero-bg{display:none}"));
  assert.ok(marketing.includes(".mk-stats{content-visibility:auto"));
});


test("secondary public-page CSS is route-scoped away from the homepage", () => {
  const root = read("app/layout.jsx");
  const shell = read("components/PublicPageShell.jsx");
  const notFound = read("app/not-found.jsx");

  assert.equal(root.includes('import "./public-pages.css"'), false);
  assert.ok(shell.includes('import "../app/public-pages.css"'));
  assert.ok(notFound.includes('import "./public-pages.css"'));
});
