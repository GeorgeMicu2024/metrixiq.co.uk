import test from "node:test";
import assert from "node:assert/strict";
import { prepareMentorAnalysis } from "../lib/imports/mentorPeriod.js";

function mentorFile(name, week, start, end) {
  return {
    name,
    recognized: true,
    reportType: "mentor",
    rows: 10,
    period: {
      key: "2026-" + week,
      weekLabel: week,
      year: 2026,
      week: Number(week.slice(1)),
      periodStart: start,
      periodEnd: end,
    },
  };
}

test("weekly eMentor multi-file batches preserve each filename-derived week", () => {
  const result = {
    fileResults: [
      mentorFile("Driver Report_2026-09-06.xlsx", "W36", "2026-08-31", "2026-09-06"),
      mentorFile("Driver Report_2026-09-13.xlsx", "W37", "2026-09-07", "2026-09-13"),
      mentorFile("Driver Report_2026-09-20.xlsx", "W38", "2026-09-14", "2026-09-20"),
    ],
    periods: [
      { key: "2026-W36", weekLabel: "W36", periodStart: "2026-08-31", periodEnd: "2026-09-06", drivers: [] },
      { key: "2026-W37", weekLabel: "W37", periodStart: "2026-09-07", periodEnd: "2026-09-13", drivers: [] },
      { key: "2026-W38", weekLabel: "W38", periodStart: "2026-09-14", periodEnd: "2026-09-20", drivers: [] },
    ],
  };

  const prepared = prepareMentorAnalysis(result, "weekly", "", "2026-W38");

  assert.equal(prepared.importContext.type, "mentor-weekly");
  assert.equal(prepared.importContext.autoWeekByFile, true);
  assert.deepEqual(prepared.periods.map((period) => period.weekLabel), ["W36", "W37", "W38"]);
  assert.deepEqual(prepared.fileResults.map((file) => file.period.weekLabel), ["W36", "W37", "W38"]);
});

test("single weekly eMentor report still respects the explicitly selected week", () => {
  const result = {
    fileResults: [
      mentorFile("Driver Report.xlsx", "W40", "2026-09-28", "2026-10-04"),
    ],
    periods: [
      { key: "2026-W40", weekLabel: "W40", periodStart: "2026-09-28", periodEnd: "2026-10-04", drivers: [] },
    ],
  };

  const prepared = prepareMentorAnalysis(result, "weekly", "", "2026-W41");

  assert.equal(prepared.importContext.targetWeek, "2026-W41");
  assert.equal(prepared.periods[0].weekLabel, "W41");
  assert.equal(prepared.fileResults[0].period.weekLabel, "W41");
});

test("daily eMentor imports remain unchanged", () => {
  const result = {
    fileResults: [
      mentorFile("Driver Report_2026-10-14.xlsx", "W42", "2026-10-12", "2026-10-18"),
    ],
    periods: [
      { key: "2026-W42", weekLabel: "W42", periodStart: "2026-10-12", periodEnd: "2026-10-18", drivers: [] },
    ],
  };

  const prepared = prepareMentorAnalysis(result, "daily", "2026-10-14", "");

  assert.equal(prepared.importContext.type, "mentor-daily");
  assert.equal(prepared.importContext.reportDate, "2026-10-14");
  assert.equal(prepared.periods[0].weekLabel, "W42");
});
