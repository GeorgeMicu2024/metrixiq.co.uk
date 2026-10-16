import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSingleWeekConcessionRows,
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
