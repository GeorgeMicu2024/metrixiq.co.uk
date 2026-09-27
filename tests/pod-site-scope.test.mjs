import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) =>
  fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("POD direct import preserves selected or filename site scope", () => {
  const view = read("components/operations/PodQualityView.jsx");

  assert.ok(view.includes("inferSiteFromFile"));
  assert.ok(view.includes('selectedSite && selectedSite !== "ALL"'));
  assert.ok(view.includes("inferSiteFromFile(file.name) || null"));
  assert.ok(view.includes("onImported?.(result, [file], importSite)"));
  assert.ok(view.includes("no driver-level POD Quality rows were saved"));
});

test("POD workspace uses detailed POD evidence and never renders a blank unlabeled week control", () => {
  const view = read("components/operations/PodQualityView.jsx");
  const data = read("lib/data/directOperational.js");

  assert.ok(data.includes('if (kind === "pod")'));
  assert.ok(data.includes('query.contains("raw_data", { pod_detail: {} })'));
  assert.ok(data.includes("raw_data?.pod_detail"));
  assert.ok(data.includes('typeof detail === "object"'));
  assert.equal(data.includes("row.pod != null ||"), false);

  assert.ok(view.includes('<span>WEEK</span>'));
  assert.ok(view.includes("No detailed POD weeks"));
  assert.ok(view.includes("No detailed POD Quality report for this site"));
  assert.equal(view.includes("Clear page"), false);
  assert.equal(view.includes("setCleared"), false);
});
