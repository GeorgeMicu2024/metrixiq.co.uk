import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildSingleWeekConcessionRows,
  buildMultiWeekConcessionRows,
  concessionExportPages,
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
