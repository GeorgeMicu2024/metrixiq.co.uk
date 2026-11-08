import test from "node:test";
import assert from "node:assert/strict";
import { ndnrRoute, ndnrTracking, parseNdnrReport, matchNdnrParcels, groupNdnrByRoute, isNdnrReturnScan } from "../lib/ndnr/ndnrMatching.mjs";
import { buildNdnrExportSvg } from "../lib/ndnr/ndnrPngExport.mjs";
import { NAV_GROUPS } from "../components/dashboard/navigation.js";

const slackText = `📦 NDNR Report — DCSL
Generated:: 07/11/2026 08:57 PM
NDNR Report
Please find below the Not Delivered Not Received parcels.
Total NDNR Parcels: 12
Route: CA__A174 (8 parcels)
• UK5039297671
• UK5048654360
• UK5052884584
• UK5068285578
• UK5043011263
• UK5067019014
• UK5068368034
• UK5068496523
Route: CA__A201 (4 parcels)
• UK5047254772
• UK5055174385
• UK5052656760
• UK5049831694
Today
This message is not a parcel.`;

const csvRow = (tracking, route, name, status = "Returned to station", scan = "2026-11-07 22:01:00") => ({
  "Scannable Id": tracking, "Route Code": route, "Transporter Name": name,
  "Package Status": status, "Time of last scan": scan, "Transporter Id": "AEXAMPLE1234",
});

test("NDNR screenshot parser extracts all UK IDs by route without Slack UI noise", () => {
  const report = parseNdnrReport(slackText);
  assert.equal(report.parcels.length, 12);
  assert.equal(report.generatedDate, "07/11/2026");
  assert.deepEqual(report.warnings, []);
  assert.equal(report.parcels.filter(item => item.report_route === "CA_A174").length, 8);
  assert.equal(report.parcels.filter(item => item.report_route === "CA_A201").length, 4);
  assert.equal(ndnrRoute("CA__A174"), "CA_A174");
  assert.equal(ndnrTracking("UK5O39297671"), "UK5039297671");
});

test("NDNR marks Amazon Returned to station + scan time as confirmed", () => {
  const report = parseNdnrReport(slackText);
  const packageRows = report.parcels.map(item => csvRow(item.tracking_id, item.report_route, item.report_route === "CA_A174" ? "Galin Grigorov" : "Vlad Padure"));
  // One unassigned parcel: only the route driver is inferred, never silently assumed.
  packageRows[9]["Transporter Name"] = "";
  const matched = matchNdnrParcels(report, packageRows);
  assert.equal(matched.length, 12);
  assert.equal(matched.filter(item => item.state === "returned").length, 12);
  assert.equal(matched.find(item => item.tracking_id === "UK5055174385").driver_name, "Vlad Padure");
  assert.equal(matched.find(item => item.tracking_id === "UK5055174385").driver_inferred, true);
  assert.deepEqual(groupNdnrByRoute(matched).map(group => [group.route, group.parcels.length]), [["CA_A174", 8], ["CA_A201", 4]]);
});

test("NDNR requires timestamp and latest status; no earlier RTS false positives", () => {
  const report = parseNdnrReport("Route: CA__A174 (3 parcels)\nUK5039297671\nUK5048654360\nUK5052884584");
  const packageRows = [
    csvRow("UK5039297671", "CA_A174", "One"),
    csvRow("UK5048654360", "CA_A174", "One", "Returned to station", ""),
    csvRow("UK5052884584", "CA_A174", "One", "Returned to station", "2026-11-07 18:00:00"),
    csvRow("UK5052884584", "CA_A174", "One", "Out for delivery", "2026-11-07 20:00:00"),
  ];
  const rows = matchNdnrParcels(report, packageRows);
  assert.deepEqual(rows.map(row => row.state), ["returned", "review", "awaiting"]);
  assert.equal(isNdnrReturnScan("Returned to station", ""), false);
  assert.equal(isNdnrReturnScan("Returned to station", "2026-11-07 20:00:00"), true);
});

test("NDNR export contains route groups, all parcels and escaped values", () => {
  const report = parseNdnrReport(slackText);
  const rows = matchNdnrParcels(report, report.parcels.map(item => csvRow(item.tracking_id, item.report_route, "Galin & <name>")));
  const { svg, height } = buildNdnrExportSvg(rows, { site: "DZM1", reportDate: "07/11/2026" });
  assert.ok(height > 1000);
  assert.match(svg, /NDNR  \/  RETURN STATUS/);
  assert.match(svg, /UK5039297671/);
  assert.match(svg, /UK5049831694/);
  assert.match(svg, /RTS SCANNED/);
  assert.match(svg, /Galin &amp; &lt;name&gt;/);
  assert.doesNotMatch(svg, /Galin & <name>/);
});

test("NDNR is a distinct quick-access tab immediately below CHECK LOR", () => {
  const quick = NAV_GROUPS.find(group => group.label === "QUICK ACCESS").items.map(item => item[0]);
  assert.equal(quick.indexOf("ndnr"), quick.indexOf("check-lor") + 1);
  assert.equal(NAV_GROUPS.flatMap(group => group.items).filter(item => item[0] === "ndnr").length, 1);
});
