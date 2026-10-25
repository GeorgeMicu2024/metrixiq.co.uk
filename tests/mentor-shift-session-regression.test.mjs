import test from "node:test";
import assert from "node:assert/strict";
import { parseMentorTripMatrix } from "../lib/analyzer/spreadsheet.js";
import { mentorDailyActivitySite, mentorDailySourceIdentityKey } from "../lib/persistence/mentorDailyIdentity.js";

// Synthetic data shaped like the eMentor Shift Report dated 15 Oct 2026.
// Customer names/identifiers and source reports are not committed to the repo.
const filename = "Shift Report_2026-10-15.xlsx";
const sheet = "Shift Report (VRM)";
const matrix = [
  ["First Name", "Last Name", "Begin Route Time", "End Route Time", "Trip"],
  ["George", "Micu1", "05:00", "12:00", 1],
  ["George", "Micu2", "06:00", "13:00", 1],
  ["George", "Micu3", "07:00", "14:00", 1],
  ["Steve", "Krucinsky", "07:00", "11:00", 1],
  ["Steve", "Krucinsky", "12:00", "16:00", 1],
  ["Dan", "Surdu", "07:00", "10:00", 0],
  ["Dan", "Surdu", "11:00", "16:00", 1],
  ["Iosif", "Afloarei", "07:00", "14:00", 0],
  ["Jake", "Dodsworth", "08:00", "16:00", 0],
];

const parse = () => {
  const parsed = parseMentorTripMatrix(matrix, filename, sheet);
  assert.ok(parsed, "Shift Report parser should recognize this workbook structure");
  return parsed.records;
};
const sourceId = (row) => mentorDailySourceIdentityKey(
  { details: row.details, id: row.trid, name: row.name },
  filename,
  "canonical-driver-uuid"
);

test("Shift Report parser keeps every input trip session, including repeated names", () => {
  const records = parse();
  assert.equal(records.length, 9);
  assert.equal(records.filter((r) => r.details.mentor.totalTrips >= 1).length, 6);
  assert.equal(records.filter((r) => r.details.mentor.totalTrips === 0).length, 3);
  assert.equal(new Set(records.map(sourceId)).size, 9);
});

test("three accounts mapped to the same canonical driver still have different source IDs", () => {
  const george = parse().filter((row) => row.name.startsWith("George "));
  assert.equal(george.length, 3);
  assert.equal(new Set(george.map(sourceId)).size, 3);
});

test("two Shift Report sessions under the same name never overwrite each other", () => {
  const steve = parse().filter((row) => row.name === "Steve Krucinsky");
  assert.equal(steve.length, 2);
  assert.notEqual(sourceId(steve[0]), sourceId(steve[1]));
});

test("same Shift Report reimport derives stable IDs and does not create new identities", () => {
  assert.deepEqual(parse().map(sourceId), parse().map(sourceId));
});

test("source-account zero trip is not a No Trip when its other session has Trip 1", () => {
  const rows = parse();
  const namesWithPositive = new Set(rows.filter((r) => r.details.mentor.totalTrips >= 1).map((r) => r.details.mentor.sourceAccountName.toLowerCase()));
  const onlyNoTrip = rows.filter((r) => r.details.mentor.totalTrips === 0 && !namesWithPositive.has(r.details.mentor.sourceAccountName.toLowerCase()));
  assert.deepEqual(onlyNoTrip.map((r) => r.name).sort(), ["Iosif Afloarei", "Jake Dodsworth"]);
});

test("resolved and unresolved eMentor identities get the selected Activity Site", () => {
  assert.equal(mentorDailyActivitySite({ site: "Unknown", details: { mentor: {} } }, "DLS2"), "DLS2");
  assert.equal(mentorDailyActivitySite({ site: "", details: { mentor: {} } }, "DLS2"), "DLS2");
  assert.equal(mentorDailyActivitySite({ site: "DDN1", details: { mentor: {} } }, "DLS2"), "DDN1");
  assert.equal(mentorDailyActivitySite({ site: "", details: { mentor: { station: "DEH1" } } }, "DLS2"), "DEH1");
});

test("normal Driver Report mentor hashes remain the source identity", () => {
  const driver = { mentorHash: "HASH_A::HASH_B", details: { mentor: { identityKey: "HASH_A::HASH_B" } } };
  assert.equal(mentorDailySourceIdentityKey(driver, "Driver Report_2026-10-15.xlsx", "uuid"), "HASH_A::HASH_B");
});

test("Shift Report source-row key wins over a mapped driver or mentor hash", () => {
  const driver = {
    mentorHash: "HASH_A::HASH_B",
    details: { mentor: { tripEvidenceSource: "ementor_shift_report", sourceRowKey: "Shift Report (VRM):23" } }
  };
  assert.equal(mentorDailySourceIdentityKey(driver, filename, "uuid"), "SHIFT:Shift Report_2026-10-15.xlsx:Shift Report (VRM):23");
});
