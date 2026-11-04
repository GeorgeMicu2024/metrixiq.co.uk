import test from "node:test";
import assert from "node:assert/strict";
import { classifyAmazonReport } from "../lib/ai-lab/smart-import.mjs";

test("recognises a Route Plan with driver/transport headers", () => {
  const result = classifyAmazonReport([["Route Code", "Driver Name", "TRID"]], "Routes_DZM1.xlsx");
  assert.equal(result.kind, "route");
  assert.equal(result.suggestedSlot, "route");
  assert.ok(result.confidence >= 70);
});

test("recognises Wave Plan columns even when the filename is generic", () => {
  const result = classifyAmazonReport([["Wave", "Staging lane", "Loading Time", "Parking", "Holding"]], "report1.xlsx");
  assert.equal(result.kind, "wave");
  assert.equal(result.suggestedSlot, "wave");
});

test("performance report is not silently treated as a Route Plan", () => {
  const result = classifyAmazonReport([["DCR", "POD", "IADC", "CDF DPMO", "Concessions"]]);
  assert.equal(result.kind, "performance");
  assert.equal(result.suggestedSlot, null);
});

test("ambiguous reports never trigger an automatic reassignment", () => {
  const result = classifyAmazonReport([["Route", "Reference", "Status"]], "random.xlsx");
  assert.equal(result.kind, "unknown");
  assert.equal(result.suggestedSlot, null);
});

test("classification explanations do not echo potentially sensitive cell contents", () => {
  const result = classifyAmazonReport([["Wave", "Staging", "Loading"], ["PRIVATE_DRIVER", "SECRET_TRID"]]);
  assert.equal(JSON.stringify(result).includes("PRIVATE_DRIVER"), false);
  assert.equal(JSON.stringify(result).includes("SECRET_TRID"), false);
});
