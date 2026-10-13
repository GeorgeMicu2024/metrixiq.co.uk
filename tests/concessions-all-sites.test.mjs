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
  assert.ok(view.includes("pageRows.map((row, rowIndex)"));
  assert.ok(view.includes("Showing {pageStart + 1}"));
  assert.ok(view.includes("25 per page"));
  assert.ok(view.includes("Page {pageIndex + 1} of {exportPages.length}"));
  assert.ok(view.includes("Site: {site}"));
});


test("Concessions includes current site drivers with zero DNR", () => {
  const view = read("components/operations/ConcessionsSimpleView.jsx");
  const dashboard = read("components/DashboardClient.jsx");

  assert.ok(dashboard.includes('refreshKey={operationalRefreshKey} drivers={drivers}'));
  assert.ok(view.includes("drivers = []"));
  assert.ok(view.includes("const snapshotMatrix = buildFourWeekConcessionMatrix"));
  assert.ok(view.includes("const snapshotByTrid = new Map"));
  assert.ok(view.includes("byWeek: Object.fromEntries(weeks.map((week) => [week, 0]))"));
  assert.ok(view.includes("total: 0"));
  assert.ok(view.includes("affectedWeeks: 0"));
});


test("Concessions PNG is compact and phone-readable", () => {
  const view = read("components/operations/ConcessionsSimpleView.jsx");

  assert.ok(view.includes('style={{ width: Math.max(820, 570 + weeks.length * 125) + "px" }}'));
  assert.ok(view.includes("pageRows.map((row, rowIndex)"));
  assert.equal(view.includes('className="cx5-export-row placeholder"'), false);
  assert.ok(view.includes("font-size:16px;line-height:1.15"));
  assert.ok(view.includes("min-width:54px;height:34px"));
  assert.ok(view.includes("min-width:58px;height:35px"));
  assert.ok(view.includes("56px minmax(300px,1fr)"));
});


test("Concessions uses simplified title and severity colours", () => {
  const view = read("components/operations/ConcessionsSimpleView.jsx");

  assert.equal(view.includes("Driver concession matrix · last"), false);
  assert.ok(view.includes("Driver concessions · last {weeks.length} weeks"));
  assert.ok(view.includes(".cx5-cell.zero{background:#cdf4de;color:#08683f}"));
  assert.ok(view.includes(".cx5-cell.one{background:#fff0a8;color:#725000}"));
  assert.ok(view.includes(".cx5-cell.two{background:#ffc58f;color:#a43b00}"));
  assert.ok(view.includes(".cx5-cell.high{background:#ffb3b3;color:#a31313}"));
  assert.ok(view.includes(".cx5-export-cell.zero{background:#cdf4de;color:#08683f}"));
  assert.ok(view.includes(".cx5-export-cell.one{background:#fff0a8;color:#725000}"));
  assert.ok(view.includes(".cx5-export-cell.two{background:#ffc58f;color:#a43b00}"));
  assert.ok(view.includes(".cx5-export-cell.high{background:#ffb3b3;color:#a31313}"));
});
