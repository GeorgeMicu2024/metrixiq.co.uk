import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fetchConcessionSnapshots } from "../lib/data/concessions.js";
import {
  buildSingleWeekConcessionRows,
  buildMultiWeekConcessionRows,
  concessionExportPages,
  concessionImageRows,
  weeklyConcessionTone,
} from "../lib/data/concessionsWeeklyView.js";

const snapshots = [
  {site:"DLS2",week_label:"W41",driver_trid:"A111",driver_name:"Driver One",driver_id:"db-1",dnr:6},
  {site:"DLS2",week_label:"W41",driver_trid:"A222",driver_name:"Driver Two",driver_id:"db-2",dnr:1},
  {site:"DLS2",week_label:"W40",driver_trid:"A111",driver_name:"Driver One",driver_id:"db-1",dnr:2},
  {site:"DDN1",week_label:"W41",driver_trid:"C333",driver_name:"Other Site",driver_id:"db-3",dnr:4},
];
const latestRoster = [
  {id:"A111",dbId:"db-1",name:"Driver One Corrected"},
  {id:"A444",dbId:"db-4",name:"Zero Driver"},
];

test("a selected week includes affected snapshot drivers even if missing from latest roster", () => {
  const result = buildSingleWeekConcessionRows(snapshots,"DLS2","W41",latestRoster);
  assert.equal(result.length,3);
  assert.deepEqual(result.map(row=>[row.driver_trid,row.byWeek.W41]), [["A111",6],["A222",1],["A444",0]]);
  assert.equal(result[0].driver_name,"Driver One Corrected");
});

test("zero-concession drivers are retained from roster, not fabricated for other sites", () => {
  const result = buildSingleWeekConcessionRows(snapshots,"DLS2","W41",latestRoster);
  assert.equal(result.filter(row=>row.byWeek.W41===0).length,1);
  assert.equal(result.some(row=>row.driver_trid==="C333"),false);
});

test("selected week excludes DNR totals from another week", () => {
  const [row] = buildSingleWeekConcessionRows(snapshots,"DLS2","W40",[{id:"A111",name:"Driver One"}]);
  assert.equal(row.byWeek.W40,2);
  assert.equal(row.total,2);
});

test("falls back to driver roster if a site-specific latest roster is unavailable", () => {
  const result = buildSingleWeekConcessionRows(snapshots,"DLS2","W41",[],[{id:"A444",name:"Zero Driver"}]);
  assert.equal(result.length,3);
  assert.ok(result.find(row=>row.driver_trid==="A444"));
});

test("a missing week or site produces no fabricated report", () => {
  assert.deepEqual(buildSingleWeekConcessionRows(snapshots,"","W41",latestRoster),[]);
  assert.deepEqual(buildSingleWeekConcessionRows(snapshots,"DLS2","",latestRoster),[]);
});

test("25 drivers per export image and stable page order", () => {
  const drivers=Array.from({length:82},(_,i)=>({driver_trid:`A${i}`}));
  const pages=concessionExportPages(drivers);
  assert.deepEqual(pages.map(page=>page.length),[25,25,25,7]);
  assert.equal(pages[3][0].driver_trid,"A75");
  assert.equal(pages[3][6].driver_trid,"A81");
  assert.deepEqual(concessionExportPages([]),[]);
});

test("weekly DNR colour thresholds distinguish zero/yellow/orange/red", () => {
  assert.deepEqual([0,1,2,3,4,5,8].map(weeklyConcessionTone),["zero","one","one","two","two","high","high"]);
});

test("weekly aggregation does not mutate source records", () => {
  const original=JSON.stringify(snapshots);
  buildSingleWeekConcessionRows(snapshots,"DLS2","W41",latestRoster);
  assert.equal(JSON.stringify(snapshots),original);
});

test("8-week view keeps former drivers with DNR even when absent from the latest roster", () => {
  const rows = buildMultiWeekConcessionRows(snapshots, "DLS2", ["W40", "W41"], latestRoster);
  assert.deepEqual(rows.map((row) => [row.driver_trid, row.total]), [
    ["A111", 8],
    ["A222", 1],
    ["A444", 0],
  ]);
  assert.equal(rows.find((row) => row.driver_trid === "A111").driver_name, "Driver One Corrected");
  assert.equal(rows.find((row) => row.driver_trid === "A222").driver_name, "Driver Two");
});

test("unique affected excludes zero-concession roster and repeat drivers count across weeks", () => {
  const rows = buildMultiWeekConcessionRows(snapshots, "DLS2", ["W40", "W41"], latestRoster);
  assert.equal(rows.filter((row) => row.total > 0).length, 2);
  assert.equal(rows.filter((row) => row.affectedWeeks >= 2).length, 1);
  assert.equal(rows.reduce((sum, row) => sum + row.total, 0), 9);
});

test("4-week view limits affected counts and DNR totals to the selected weeks", () => {
  const rows = buildMultiWeekConcessionRows(snapshots, "DLS2", ["W41"], latestRoster);
  assert.equal(rows.find((row) => row.driver_trid === "A111").total, 6);
  assert.equal(rows.filter((row) => row.affectedWeeks >= 2).length, 0);
  assert.equal(rows.reduce((sum, row) => sum + row.total, 0), 7);
});

test("historical affected drivers survive when latest roster is empty", () => {
  const rows = buildMultiWeekConcessionRows(snapshots, "DLS2", ["W40", "W41"], []);
  assert.equal(rows.length, 2);
  assert.ok(rows.some((row) => row.driver_trid === "A222"));
});

test("fallback roster contributes zero-concession drivers without removing former affected drivers", () => {
  const rows = buildMultiWeekConcessionRows(snapshots, "DLS2", ["W41"], [], [{ id: "A555", name: "New Driver" }]);
  assert.equal(rows.length, 3);
  assert.equal(rows.find((row) => row.driver_trid === "A555").total, 0);
  assert.equal(rows.filter((row) => row.total > 0).length, 2);
});

test("multi-week report is site-isolated and does not mutate uploaded concession snapshots", () => {
  const before = JSON.stringify(snapshots);
  const rows = buildMultiWeekConcessionRows(snapshots, "DLS2", ["W40", "W41"], latestRoster);
  assert.equal(rows.some((row) => row.driver_trid === "C333"), false);
  assert.equal(JSON.stringify(snapshots), before);
});

test("25-driver PNG pagination includes affected drivers after merging history and roster", () => {
  const affected = Array.from({ length: 82 }, (_, index) => ({
    site: "DLS2", week_label: "W42", driver_trid: "A" + index,
    driver_name: "Former Driver " + index, dnr: 1
  }));
  const roster = [{id: "Z999", name:"Current zero-concession driver"}];
  const rows = buildMultiWeekConcessionRows(affected, "DLS2", ["W42"], roster);
  assert.equal(rows.length, 83);
  assert.deepEqual(concessionExportPages(rows).map((page) => page.length), [25, 25, 25, 8]);
  assert.equal(rows.filter((row) => row.total > 0).length, 82);
});

const concessionsViewSource = () =>
  readFileSync(new URL("../components/operations/ConcessionsSimpleView.jsx", import.meta.url), "utf8");

test("off-screen PNG image source never overlaps the iPhone viewport", () => {
  const view = concessionsViewSource();
  assert.match(view, /\.cx5-export-stack\{position:fixed;left:-20000px;top:0;transform:none/);
  assert.ok(!view.includes('translateX(-140vw)'), "Viewport-based translation is too small for fixed-width PNG pages");
  assert.ok(view.includes('exportPageRefs.current[pageIndex] = node'), "Image export refs must be preserved");
  assert.ok(view.includes('await toBlob(node'), "Existing PNG generation must remain available");
});

test("mobile driver cards render the same paginated rows and filter state as desktop", () => {
  const view = concessionsViewSource();
  assert.ok(view.includes('className="cx5-mobile-cards"'));
  assert.equal(view.split("pagedFiltered.map((row, index)").length - 1, 2);
  assert.ok(view.includes('className="cx5-mobile-week-grid"'));
  assert.ok(view.includes("weeks.map((week) => {"));
  assert.ok(view.includes("Number(row.byWeek?.[week] || 0)"));
  assert.ok(view.includes('className="cx5-mobile-total"'));
  assert.ok(view.includes('showTrid && <code>{row.driver_trid}</code>'));
});

test("mobile cards preserve the existing open-driver action and numeric meaning", () => {
  const view = concessionsViewSource();
  const cardStart = view.indexOf('className="cx5-mobile-cards"');
  const end = view.indexOf('{filtered.length > 0 && (', cardStart);
  const card = view.slice(cardStart, end);
  assert.ok(card.includes('disabled={!row.driver_id}'));
  assert.ok(card.includes('onOpenDriver?.({'));
  assert.ok(card.includes('concessions: range === 1 ? Number(row.byWeek?.[latestWeek] || 0) : row.total'));
  assert.ok(card.includes('historic.total'));
  assert.ok(card.includes('average.toFixed(1)'));
  assert.ok(card.includes('historic.affectedWeeks'));
});

test("mobile-only CSS hides the desktop table and keeps card and filter widths contained", () => {
  const view = concessionsViewSource();
  assert.ok(view.includes('.cx5-mobile-cards{display:none}'));
  assert.ok(view.includes('@media(max-width:760px){'));
  assert.ok(view.includes('.cx5-table-wrap{display:none}'));
  assert.ok(view.includes('.cx5-mobile-cards{display:grid'));
  assert.ok(view.includes('.cx5-filterbar{display:grid'));
  assert.ok(view.includes('.cx5-pagination{grid-template-columns:1fr'));
  assert.ok(view.includes('.cx5-summary{grid-template-columns:repeat(2,minmax(0,1fr))}'));
});

function mockConcessionSnapshotQuery(records) {
  const filters = [];
  const query = {
    select() { return this; },
    eq(column, value) { filters.push({ operator: "eq", column, value }); return this; },
    gt(column, value) { filters.push({ operator: "gt", column, value }); return this; },
    order() { return this; },
    limit() { return this; },
    then(resolve, reject) {
      const matching = records.filter((row) =>
        filters.every(({ operator, column, value }) =>
          operator === "eq" ? row[column] === value : Number(row[column]) > value
        )
      );
      return Promise.resolve({ data: matching, error: null }).then(resolve, reject);
    },
  };
  return {
    filters,
    client: {
      from(table) {
        assert.equal(table, "concessions_weekly_snapshots");
        return query;
      },
    },
  };
}

const dxp1W41Dnr = [12, 4, 3, 3, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const dxp1W42Dnr = [24, 8, 6, 6, 4, 2, 2, 2, 1];

function makeDxp1SnapshotFixture() {
  const row = (i, week_label, dnr) => ({
    organization_id: "org-dxp1",
    site: "DXP1",
    week_label,
    driver_trid: `DXP1-DRIVER-${String(i + 1).padStart(2, "0")}`,
    driver_name: `Test Driver ${i + 1}`,
    driver_id: null,
    dnr,
  });
  return [
    ...dxp1W41Dnr.map((dnr, i) => row(i, "W41", dnr)),
    ...dxp1W42Dnr.map((dnr, i) => row(i, "W42", dnr)),
    { ...row(0, "W42", 99), site: "DLS2" },
  ];
}

test("DXP1 two-week PNG retains W41 zero-DNR drivers absent from W42", async () => {
  const records = makeDxp1SnapshotFixture();
  const db = mockConcessionSnapshotQuery(records);
  const rows = await fetchConcessionSnapshots(db.client, "org-dxp1", "DXP1", true);
  assert.equal(rows.length, 25, "all 16 W41 + 9 W42 snapshot records must load");
  assert.equal(db.filters.some((f) => f.operator === "gt" && f.column === "dnr"), false);
  const result = buildMultiWeekConcessionRows(rows, "DXP1", ["W41", "W42"]);
  assert.equal(result.length, 16, "all 16 distinct DXP1 drivers in the selected weeks must appear");
  assert.equal(result.reduce((sum, x) => sum + x.total, 0), 80);
  assert.equal(result.filter((x) => x.total === 0).length, 7);
  assert.equal(result.filter((x) => x.byWeek.W42 === 0).length, 7);
  assert.deepEqual(concessionExportPages(result).map((page) => page.length), [16]);
  assert.equal(result.every((x) => x.byWeek.W41 >= 0 && x.byWeek.W42 >= 0), true);
});

test("legacy consumers of concessions snapshots still receive positive DNR rows only", async () => {
  const db = mockConcessionSnapshotQuery(makeDxp1SnapshotFixture());
  const rows = await fetchConcessionSnapshots(db.client, "org-dxp1", "DXP1");
  assert.equal(rows.length, 16);
  assert.equal(db.filters.some((f) => f.operator === "gt" && f.column === "dnr" && f.value === 0), true);
  assert.equal(buildMultiWeekConcessionRows(rows, "DXP1", ["W41", "W42"]).length, 9);
});

test("only the Concessions page explicitly requests zero-DNR snapshot rows", () => {
  const view = readFileSync(new URL("../components/operations/ConcessionsSimpleView.jsx", import.meta.url), "utf8");
  assert.match(view, /fetchConcessionSnapshots\(\s*getSupabaseBrowserClient\(\),\s*organizationId,\s*siteFilter,\s*true/);
});

test("Hide affects PNG rows only; DXP1 snapshot totals and table rows stay untouched", () => {
  const records = makeDxp1SnapshotFixture().filter((row) => row.site === "DXP1");
  const tableRows = buildMultiWeekConcessionRows(records, "DXP1", ["W41", "W42"]);
  const before = JSON.stringify(tableRows);
  const hidden = new Set([tableRows[0].driver_trid, tableRows[13].driver_trid]);
  const imageRows = concessionImageRows(tableRows, hidden);
  assert.equal(tableRows.length, 16);
  assert.equal(imageRows.length, 14);
  assert.equal(imageRows.some((row) => hidden.has(row.driver_trid)), false);
  assert.equal(tableRows.reduce((sum, row) => sum + row.total, 0), 80);
  assert.equal(JSON.stringify(tableRows), before, "the original report and DNR must not be mutated");
  assert.deepEqual(concessionExportPages(imageRows).map((page) => page.length), [14]);
  assert.equal(concessionImageRows(tableRows, new Set()).length, 16, "Show all restores full image");
});

test("PNG pagination remains contiguous after hiding drivers across image pages", () => {
  const rows = Array.from({ length: 55 }, (_, i) => ({ driver_trid: "DXP1-" + i, total: i + 1 }));
  const hidden = new Set(rows.slice(17, 24).map((row) => row.driver_trid));
  const visible = concessionImageRows(rows, hidden);
  assert.deepEqual(concessionExportPages(visible).map((page) => page.length), [25, 23]);
  assert.deepEqual(visible.map((row) => row.driver_trid), rows.filter((row) => !hidden.has(row.driver_trid)).map((row) => row.driver_trid));
  assert.equal(rows.length, 55);
  assert.equal(concessionImageRows(rows).length, 55);
});

test("desktop mobile and weekly image preview expose reversible PNG-only Hide controls", () => {
  const view = concessionsViewSource();
  assert.ok(view.includes('const [hiddenImageDrivers, setHiddenImageDrivers] = useState'));
  assert.ok(view.includes('const imageScope = '), "hide state must be scoped by site, week range, and organization");
  assert.ok(view.includes('hiddenImageDrivers.scope === imageScope'));
  assert.ok(view.includes('const exportRows = useMemo('));
  assert.ok(view.includes('concessionImageRows(filtered, hiddenTrids)'));
  assert.ok(view.includes('concessionExportPages(exportRows, CONCESSIONS_PAGE_SIZE)'));
  assert.ok(view.includes('if (!exportRows.length || !exportPages.length) return'));
  assert.ok(view.includes('restoreAllImageDrivers'));
  assert.ok(view.includes('↶ Show all ({hiddenCount})'));
  assert.ok(view.includes('aria-label={`Hide ${row.driver_name} from image`'));
  assert.equal(view.split('onClick={() => toggleImageDriver(row.driver_trid)}').length - 1, 3, "weekly preview, desktop and mobile must have Hide controls");
  assert.equal(view.split('aria-pressed={hiddenTrids.has(row.driver_trid)}').length - 1, 2);
  assert.ok(view.includes('disabled={!exportRows.length}'));
  assert.ok(view.includes('disabled={!previewReady || !exportRows.length}'));
  assert.ok(view.includes('const selectedTotal = weekly.reduce('), "verified KPI remains independent of hidden rows");
  assert.ok(view.includes('const uniqueAffected = matrix.filter('), "driver totals must remain independent of image hide");
  assert.ok(view.includes('const pagedFiltered = filtered.slice('), "the main list must preserve undo visibility");
});


test("Concessions allows 10, 25, 50 or 100 visible drivers per page on desktop and mobile", () => {
  const view = concessionsViewSource();
  assert.ok(view.includes("const TABLE_PAGE_SIZE_OPTIONS = [10, 25, 50, 100]"));
  assert.ok(view.includes("const [pageSize, setPageSize] = useState(25)"));
  assert.ok(view.includes('aria-label="Concessions drivers per page"'));
  assert.ok(view.includes("TABLE_PAGE_SIZE_OPTIONS.map((count) => ("));
  assert.ok(view.includes("onChange={(event) => setPageSize(Number(event.target.value))}"));
  assert.ok(view.includes("Math.ceil(filtered.length / pageSize)"));
  assert.ok(view.includes("const pageStart = (currentPage - 1) * pageSize"));
  assert.ok(view.includes("const pagedFiltered = filtered.slice(pageStart, pageStart + pageSize)"));
  assert.ok(view.includes("Showing {pageStart + 1}–{Math.min(pageStart + pageSize, filtered.length)} of {filtered.length} drivers"));
  assert.ok(view.includes("[query, show, range, site, effectiveWeek, pageSize]"), "page change must reset to first page");
  assert.ok(view.includes('.cx5-page-size{justify-self:start}'), "selector should stay visible on mobile");
  assert.equal(view.split("pagedFiltered.map((row, index)").length - 1, 2, "desktop/mobile both display selected page rows");
});

test("Table page-size selector does not alter PNG exports or image-only Hide", () => {
  const view = concessionsViewSource();
  assert.ok(view.includes("concessionExportPages(exportRows, CONCESSIONS_PAGE_SIZE)"));
  assert.ok(view.includes("const CONCESSIONS_PAGE_SIZE = 25"));
  assert.ok(view.includes('onClick={() => toggleImageDriver(row.driver_trid)}'));
  assert.ok(view.includes('onClick={restoreAllImageDrivers}'));
  assert.ok(view.includes("const selectedTotal = weekly.reduce("));
  assert.ok(view.includes("const uniqueAffected = matrix.filter("));
  assert.ok(!view.includes("concessionExportPages(exportRows, pageSize)"));
  const drivers = Array.from({ length: 52 }, (_, i) => ({ driver_trid: `T${i}` }));
  for (const visiblePageSize of [10, 25, 50, 100]) {
    const visibleCount = Math.ceil(drivers.length / visiblePageSize);
    const pieces = Array.from({ length: visibleCount }, (_, i) => drivers.slice(i * visiblePageSize, (i + 1) * visiblePageSize));
    assert.equal(pieces.flat().length, drivers.length);
    assert.deepEqual(pieces.flat(), drivers);
  }
  assert.deepEqual(concessionExportPages(drivers).map((page) => page.length), [25, 25, 2]);
});
