import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFourWeekConcessionMatrix,
  latestFourConcessionWeeks,
} from "../lib/data/concessions.js";
import { concessionSnapshotFromDriver } from "../lib/persistence/concessions.js";

test("last-four-week concessions matrix stays site isolated", () => {
  const rows = [
    { site: "DLS2", week_label: "W36", driver_trid: "A1", driver_name: "One", dnr: 2 },
    { site: "DLS2", week_label: "W37", driver_trid: "A1", driver_name: "One", dnr: 1 },
    { site: "DLS2", week_label: "W38", driver_trid: "A2", driver_name: "Two", dnr: 3 },
    { site: "DLS2", week_label: "W39", driver_trid: "A1", driver_name: "One", dnr: 4 },
    { site: "DDN1", week_label: "W39", driver_trid: "A1", driver_name: "One", dnr: 99 },
    { site: "DLS2", week_label: "W35", driver_trid: "A3", driver_name: "Old", dnr: 50 },
  ];

  const weeks = latestFourConcessionWeeks(rows, "DLS2");
  assert.deepEqual(weeks, ["W36", "W37", "W38", "W39"]);

  const matrix = buildFourWeekConcessionMatrix(rows, "DLS2", weeks);
  assert.equal(matrix.length, 2);
  assert.equal(matrix[0].driver_trid, "A1");
  assert.equal(matrix[0].total, 7);
  assert.equal(matrix[0].affectedWeeks, 3);
  assert.deepEqual(matrix[0].byWeek, { W36: 2, W37: 1, W38: 0, W39: 4 });
});

test("canonical Associates CSV becomes an isolated concessions snapshot", () => {
  const row = concessionSnapshotFromDriver({
    organizationId: "org-1",
    driverId: "driver-1",
    driver: {
      id: "A123",
      name: "Driver One",
      sources: ["DSP_Associates_Concessions_DLS2_2026-W39.csv"],
      rawMetrics: { concessions: 3 },
    },
  });

  assert.equal(row.site, "DLS2");
  assert.equal(row.week_label, "W39");
  assert.equal(row.driver_trid, "A123");
  assert.equal(row.dnr, 3);

  const rejected = concessionSnapshotFromDriver({
    organizationId: "org-1",
    driverId: "driver-1",
    driver: {
      id: "A123",
      name: "Driver One",
      sources: ["UK-DCSL-DLS2-Week39-DSP-Scorecard-3.0.pdf"],
      rawMetrics: { concessions: 99 },
    },
  });
  assert.equal(rejected, null);
});
