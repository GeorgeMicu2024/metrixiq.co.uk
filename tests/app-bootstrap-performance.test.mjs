import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dashboard = readFileSync(new URL("../components/DashboardClient.jsx", import.meta.url), "utf8");
const login = readFileSync(new URL("../components/LoginClient.jsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../lib/data/workspace.js", import.meta.url), "utf8");
const loading = readFileSync(new URL("../app/app/loading.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/manager-intelligence-v3.css", import.meta.url), "utf8");

test("app bootstrap never returns a blank screen while auth is loading", () => {
  assert.doesNotMatch(dashboard, /if \(authLoading\) return null/);
  assert.match(dashboard, /app-boot-screen/);
  assert.match(dashboard, /Opening your workspace/);
  assert.match(loading, /app-boot-screen/);
});

test("app bootstrap reuses the authenticated session instead of waiting for getUser", () => {
  const initialiseStart = dashboard.indexOf("async function initialise()");
  const initialiseEnd = dashboard.indexOf("initialise();", initialiseStart);
  const initialise = dashboard.slice(initialiseStart, initialiseEnd);
  assert.match(initialise, /auth\.getSession\(\)/);
  assert.doesNotMatch(initialise, /auth\.getUser\(\)/);
});

test("workspace bootstrap separates core access from heavy operational hydration", () => {
  assert.match(workspace, /export async function loadWorkspaceCore/);
  assert.match(workspace, /export async function hydrateWorkspaceData/);
  assert.match(dashboard, /fetchWorkspaceContextForUser\([\s\S]*\{ hydrate: false \}/);
  assert.match(dashboard, /refreshWorkspacePerformance\(supabase, organizationId\)/);
  assert.match(dashboard, /setWorkspaceHydrating\(false\)/);
});

test("login screen prefetches the app route", () => {
  assert.match(login, /router\.prefetch\("\/app"\)/);
});

test("bootstrap and background hydration have visible responsive states", () => {
  assert.match(css, /MetrixIQ app bootstrap/);
  assert.match(css, /\.app-boot-screen/);
  assert.match(css, /\.app-hydration-banner/);
  assert.match(dashboard, /Loading operational data/);
});
