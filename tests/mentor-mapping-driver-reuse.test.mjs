import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const data = readFileSync(new URL("../lib/data/mentorMapping.js", import.meta.url), "utf8");
const panel = readFileSync(new URL("../components/operations/MentorMappingPanel.jsx", import.meta.url), "utf8");

test("eMentor create flow reuses an existing TRID instead of inserting a duplicate driver", () => {
  assert.match(data, /\.eq\("organization_id", organizationId\)/);
  assert.match(data, /\.eq\("trid", trid\)/);
  assert.match(data, /reused_existing: true/);
  assert.match(data, /error\.code === "23505"/);
});

test("eMentor mapping modal explains when the TRID already belongs to a driver", () => {
  assert.match(panel, /existingDriverForNewTrid/);
  assert.match(panel, /Driver already exists/);
  assert.match(panel, /Link Existing/);
});


test("eMentor driver search tolerates spacing and partial-name token order", () => {
  assert.match(panel, /function normalizeDriverSearch/);
  assert.match(panel, /query\.split\(" "\)\.filter\(Boolean\)\.every/);
  assert.match(panel, /driverMatchesQuery\(driver, driverQueries\[row\.id\]\)/);
});
