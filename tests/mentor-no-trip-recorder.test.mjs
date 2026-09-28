import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) =>
  fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Daily Dispatch persists a dated roster for eMentor reconciliation", () => {
  const wave = read("components/sites/WavePlanView.jsx");
  const helper = read("lib/data/dailyDispatch.js");
  const migration = read("supabase/migrations/20260928074500_daily_dispatch_mentor_reconciliation.sql");

  assert.ok(wave.includes("replaceDailyDispatchAssignments"));
  assert.ok(wave.includes("dispatchAssignments"));
  assert.ok(wave.includes("Daily Dispatch roster saved"));
  assert.ok(helper.includes("fetchDailyDispatchAssignments"));
  assert.ok(migration.includes("daily_dispatch_assignments"));
  assert.ok(migration.includes("replace_daily_dispatch_assignments"));
});

test("Daily eMentor exposes site mismatch and No Trip Recorder reconciliation", () => {
  const mentor = read("components/operations/MentorView.jsx");

  assert.ok(mentor.includes("siteMismatch"));
  assert.ok(mentor.includes("Latest daily eMentor upload"));
  assert.ok(mentor.includes("No Trip Recorder"));
  assert.ok(mentor.includes("fetchDailyDispatchAssignments"));
  assert.ok(mentor.includes("noTripRows"));
  assert.ok(mentor.includes("Recorded"));
  assert.ok(mentor.includes("Unmatched"));
});
