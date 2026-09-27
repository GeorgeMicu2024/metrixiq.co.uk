import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) =>
  fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("POD direct import preserves selected or filename site scope", () => {
  const view = read("components/operations/PodQualityView.jsx");

  assert.ok(view.includes("inferSiteFromFile"));
  assert.ok(view.includes('selectedSite&&selectedSite!=="ALL"'));
  assert.ok(view.includes("inferSiteFromFile(file.name)||null"));
  assert.ok(view.includes("onImported?.(result,[file],importSite)"));
  assert.ok(view.includes("no POD metrics were saved"));
});
