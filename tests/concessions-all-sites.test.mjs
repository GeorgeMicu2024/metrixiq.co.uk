import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) =>
  fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Concessions resolves All Sites through the global selector without rendering a second site control", () => {
  const view = read("components/operations/ConcessionsSimpleView.jsx");
  const dashboard = read("components/DashboardClient.jsx");

  assert.ok(view.includes('globalSite === "ALL"'));
  assert.ok(view.includes("onSiteFilterChange(availableSites[0])"));
  assert.equal(view.includes("<span>Site</span>"), false);
  assert.equal(view.includes("setLocalSite"), false);
  assert.ok(dashboard.includes("onSiteFilterChange={setSiteFilter}"));
});

test("Concessions hooks are declared before loading and error returns", () => {
  const view = read("components/operations/ConcessionsSimpleView.jsx");

  const filteredHook = view.indexOf("const filtered = useMemo");
  const loadingReturn = view.indexOf('if (load.loading) return <Loading');
  const errorReturn = view.indexOf('if (load.error) return <ErrorBox');

  assert.ok(filteredHook >= 0);
  assert.ok(loadingReturn > filteredHook);
  assert.ok(errorReturn > filteredHook);
});


test("Concessions has 25-driver pagination and PNG export for every site", () => {
  const view = read("components/operations/ConcessionsSimpleView.jsx");

  assert.ok(view.includes('import { toBlob } from "html-to-image"'));
  assert.ok(view.includes("const CONCESSIONS_PAGE_SIZE = 25"));
  assert.ok(view.includes("const pagedFiltered = filtered.slice"));
  assert.ok(view.includes("Save Image"));
  assert.ok(view.includes("saveConcessionsImages"));
  assert.ok(view.includes("exportPageRefs.current[pageIndex] = node"));
  assert.ok(view.includes("Array.from({ length: CONCESSIONS_PAGE_SIZE }"));
  assert.ok(view.includes("Showing {pageStart + 1}"));
  assert.ok(view.includes("25 per page"));
  assert.ok(view.includes("Page {pageIndex + 1} of {exportPages.length}"));
  assert.ok(view.includes("Site: {site}"));
});
