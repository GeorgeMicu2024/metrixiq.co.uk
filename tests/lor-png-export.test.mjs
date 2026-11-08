import test from "node:test";
import assert from "node:assert/strict";
import { lorDriverKey, groupLorDrivers, buildLorExportSvg } from "../lib/lor/lorPngExport.mjs";

const sourceRows = [
  { transporter_id: "A111", driver_name: "Driver One", tracking_id: "UK1001", reason: "LOCKER_ISSUE", last_scan: "2026-11-05 15:30:00" },
  { transporter_id: "A111", driver_name: "Driver One", tracking_id: "UK1002", reason: "BUSINESS_CLOSED", last_scan: "2026-11-04 12:00:00" },
  { transporter_id: "A222", driver_name: "Driver Two", tracking_id: "UK2001", reason: "BAD_WEATHER", last_scan: "2026-11-04 12:00:00" },
];

test("LOR export groups parcels per driver and de-duplicates UK IDs", () => {
  const groups = groupLorDrivers([...sourceRows, sourceRows[0]]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map(group => group.parcels.length), [2, 1]);
  const { svg } = buildLorExportSvg(groups, { site: "DZM1", generatedAt: new Date("2026-11-08T12:00:00Z") });
  assert.match(svg, /Drivers with potential LOR/);
  assert.match(svg, /3<\/text>/);
  assert.match(svg, /UK1001/);
  assert.match(svg, /UK1002/);
  assert.match(svg, /UK2001/);
  assert.match(svg, /NOT A CONFIRMED LOSS/);
});

test("hiding a driver removes every one of their parcels only from export", () => {
  const hidden = [lorDriverKey(sourceRows[0])];
  const remaining = groupLorDrivers(sourceRows, hidden);
  assert.deepEqual(remaining.map(group => group.name), ["Driver Two"]);
  assert.equal(sourceRows.length, 3);
  assert.doesNotMatch(buildLorExportSvg(remaining).svg, /UK1001|UK1002/);
});

test("export XML safely escapes names and tracking data", () => {
  const groups = groupLorDrivers([{ transporter_id: "X1", driver_name: "Name & <tag>", tracking_id: "UK42", reason: "CUSTOMER_UNAVAILABLE" }]);
  const { svg } = buildLorExportSvg(groups);
  assert.match(svg, /Name &amp; &lt;tag&gt;/);
  assert.doesNotMatch(svg, /Name & <tag>/);
});
