import test from "node:test";
import assert from "node:assert/strict";
import { buildLorDriverNames, collectLorTransporterIds } from "../lib/lor/driverMatching.mjs";

test("CHECK LOR links cross-station and unassigned-site drivers using their TRID", () => {
  const scorecardDrivers = [{ id: "A2RMWF9D3DPQV6", name: "Old scorecard name", site: "DLS2" }];
  const masterDrivers = [
    { trid: "A2RMWF9D3DPQV6", full_name: "Damian Zbigniew Kowalski", site: null },
    { trid: "AO693ONOELB1B", full_name: "Daniel Aaron Claypole", site: null },
    { trid: "ABLAG428P6Q2O", full_name: "Adam James Watson", site: "DZM1" },
  ];
  const lookup = buildLorDriverNames(scorecardDrivers, masterDrivers);
  assert.equal(lookup.get("A2RMWF9D3DPQV6"), "Damian Zbigniew Kowalski");
  assert.equal(lookup.get("AO693ONOELB1B"), "Daniel Aaron Claypole");
  assert.equal(lookup.get("ABLAG428P6Q2O"), "Adam James Watson");
});

test("collects distinct IDs across Amazon risk and package exports", () => {
  const risk = [{ trid: " ao693onoelb1b " }, { trid: "A2RMWF9D3DPQV6" }];
  const packages = [{ trid: "UNASSIGNED" }, { trid: "AO693ONOELB1B" }, { trid: "ABLAG428P6Q2O" }];
  assert.deepEqual(collectLorTransporterIds(risk, packages, row => row.trid), [
    "AO693ONOELB1B", "A2RMWF9D3DPQV6", "ABLAG428P6Q2O",
  ]);
});
