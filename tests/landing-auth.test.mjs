import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) =>
  fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("homepage sign-in authenticates directly instead of forwarding to a second login", () => {
  const landing = read("components/Landing.jsx");
  const deferred = read("components/DeferredLandingSignInCard.jsx");
  const card = read("components/LandingSignInCard.jsx");

  assert.ok(landing.includes('import DeferredLandingSignInCard from "./DeferredLandingSignInCard"'));
  assert.ok(landing.includes("<DeferredLandingSignInCard/>"));
  assert.ok(deferred.includes('lazy(() => import("./LandingSignInCard"))'));
  assert.equal(landing.includes("function SignInCard"), false);

  assert.ok(card.includes("signInWithPassword"));
  assert.ok(card.includes('window.location.replace("/app")'));
  assert.ok(card.includes("signInWithOAuth"));
  assert.ok(card.includes("resetPasswordForEmail"));
  assert.equal(card.includes('className="mk-signin" href="/login"'), false);
  assert.equal(card.includes('className="mk-google" href="/login"'), false);
});


test("approved landing keeps Amazon fleet photography and larger carrier strip", () => {
  const landing = read("components/Landing.jsx");
  const css = read("app/marketing-base.css");

  assert.ok(landing.includes("assets.aboutamazon.com"));
  assert.ok(landing.includes('className="mk-hero-photo"'));
  assert.ok(landing.includes("<strong>EVRi</strong>"));
  assert.ok(landing.includes("<strong>YODEL</strong>"));
  assert.ok(css.includes("Homepage V5.2 · approved Amazon fleet hero restored"));
  assert.ok(css.includes("min-height:48px!important"));
  assert.ok(css.includes("font-size:23px!important"));
});

test("post-login handoff paints immediately and hydrates heavy performance data after the shell", () => {
  const card = read("components/LandingSignInCard.jsx");
  const dashboard = read("components/DashboardClient.jsx");
  const workspace = read("lib/data/workspace.js");

  assert.ok(card.includes('router.prefetch("/app")'));
  assert.ok(workspace.includes("loadWorkspaceShellContext"));
  assert.ok(dashboard.includes("fetchWorkspaceShellForUser"));
  assert.ok(dashboard.includes("refreshWorkspacePerformance(supabase, context.resolved.organization.id)"));
  assert.ok(dashboard.includes("Opening your workspace…"));
  assert.equal(dashboard.includes("if (authLoading) return null;"), false);
});
