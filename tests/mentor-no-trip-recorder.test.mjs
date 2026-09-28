import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseMentorMatrix, parseMentorTripMatrix } from "../lib/analyzer/spreadsheet.js";

test("eMentor Shift Report keeps Trip = 0 drivers as No Trip Recorder evidence", () => {
  const matrix = [
    ["First Name","Last Name","Begin Route Time","End Route Time","Total Driver Miles","Trip","Station"],
    ["Marian","Tancos","6:18 am","","N/A",0,"DLS2"],
    ["Ionut","Ciuclaru","6:26 am","11:58 am",44.24,1,"DLS2"],
  ];

  const parsed = parseMentorTripMatrix(matrix, "Shift_Report_2026-09-27.xlsx", "Shift Report (VRM)");
  assert.ok(parsed);
  assert.equal(parsed.reportType, "mentor_trip");
  assert.equal(parsed.records.length, 2);

  const noTrip = parsed.records.find((row) => row.name === "Marian Tancos");
  assert.equal(noTrip.details.mentor.totalTrips, 0);
  assert.equal(noTrip.details.mentor.tripStatus, "NO_TRIP_REGISTERED");
  assert.equal(noTrip.details.mentor.tripStatusReason, "Trip started but not ended");
  assert.equal(noTrip.details.mentor.beginRouteTime, "6:18 am");
  assert.equal(noTrip.details.mentor.endRouteTime, null);
  assert.equal(noTrip.details.mentor.tripEvidenceSource, "ementor_shift_report");
});

test("eMentor Driver Report no longer discards explicit Total Driver Trips = 0 rows", () => {
  const matrix = [
    ["First Name","Last Name","FICO Safe Driving Score","Station","Total Driver Trips","Acceleration Rating"],
    ["Test","Driver",800,"DLS2",0,"Low Risk"],
  ];

  const parsed = parseMentorMatrix(matrix, "Driver Report_2026-09-27.xlsx", "Driver Report (VRM)");
  assert.ok(parsed);
  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.records[0].details.mentor.totalTrips, 0);
  assert.equal(parsed.records[0].details.mentor.tripStatus, "NO_TRIP_REGISTERED");
});

test("Daily eMentor No Trip Recorder is eMentor-only and never depends on Daily Dispatch", () => {
  const view = fs.readFileSync(new URL("../components/operations/MentorView.jsx", import.meta.url), "utf8");
  const persistence = fs.readFileSync(new URL("../lib/persistence/mentorDaily.js", import.meta.url), "utf8");

  assert.ok(view.includes("EMENTOR TRIP CHECK"));
  assert.ok(view.includes("eMentor Shift Report (VRM)"));
  assert.ok(view.includes("Daily Dispatch is not used"));
  assert.equal(view.includes("fetchDailyDispatchAssignments"), false);
  assert.equal(view.includes("dispatchLoad"), false);

  assert.ok(persistence.includes("hasTripEvidence"));
  assert.ok(persistence.includes("score == null && !hasTripEvidence"));
});
