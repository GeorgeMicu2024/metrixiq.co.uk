import test from "node:test";
import assert from "node:assert/strict";
import { mergeRouteAndWavePlans } from "../lib/ai-lab/merge-plans.mjs";

test("matches two independent reports by route and combines complementary fields", () => {
  const input = [{ route: " ca_a101 ", driver: "Driver A", trid: "T111" }];
  const waves = [{ route: "CA_A101", wave: "11", staging: "B2", loading: "12:30" }];
  const joined = mergeRouteAndWavePlans(input, waves);
  assert.equal(joined.matched, 1);
  assert.equal(joined.routeOnly, 0);
  assert.equal(joined.waveOnly, 0);
  assert.deepEqual([joined.rows[0].driver, joined.rows[0].staging, joined.rows[0].loading], ["Driver A", "B2", "12:30"]);
  assert.deepEqual(input, [{ route: " ca_a101 ", driver: "Driver A", trid: "T111" }]);
});

test("matches a split TRID only when the match is unique and routes do not contradict", () => {
  const result = mergeRouteAndWavePlans(
    [{ route: "CA_A200", trid: "DRIVER123" }],
    [{ trid: "OTHER / DRIVER123", wave: "12", loading: "13:00" }]
  );
  assert.equal(result.matched, 1);
  assert.equal(result.rows[0].wave, "12");
});

test("never silently joins conflicting Route ID and TRID", () => {
  const result = mergeRouteAndWavePlans(
    [{ route: "CA_A101", trid: "T2" }],
    [{ route: "CA_A101", trid: "T1" }, { route: "CA_A102", trid: "T2" }]
  );
  assert.equal(result.matched, 0);
  assert.equal(result.conflicts, 1);
  assert.equal(result.routeOnly, 1);
  assert.equal(result.waveOnly, 2);
});

test("rejects matching route ID when both reports have different TRIDs", () => {
  const result = mergeRouteAndWavePlans(
    [{ route: "CA_A101", trid: "T2" }],
    [{ route: "CA_A101", trid: "T1" }]
  );
  assert.equal(result.matched, 0);
  assert.equal(result.conflicts, 1);
});

test("duplicate route keys are flagged instead of choosing the first row", () => {
  const result = mergeRouteAndWavePlans(
    [{ route: "SA_A01" }],
    [{ route: "SA_A01", wave: "7" }, { route: "SA_A01", wave: "8" }]
  );
  assert.equal(result.matched, 0);
  assert.equal(result.ambiguous, 1);
  assert.equal(result.rows[0].matchStatus, "Review: duplicate route in Wave Plan");
});

test("unmatched rows from both files remain visible and no match is invented", () => {
  const result = mergeRouteAndWavePlans(
    [{ route: "CA_A900" }],
    [{ wave: "13", loading: "15:00" }]
  );
  assert.equal(result.matched, 0);
  assert.equal(result.rows.length, 2);
  assert.deepEqual(result.rows.map(row => row.matchStatus), ["Route only", "Wave only"]);
});
