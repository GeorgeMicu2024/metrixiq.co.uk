import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) =>
  fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("IADC workspace uses a focused database loader and preserves daily/weekly evidence", () => {
  const data = read("lib/data/iadc.js");
  const view = read("components/operations/IadcComplianceView.jsx");
  const router = read("components/operations/IadcView.jsx");

  assert.ok(data.includes('.not("iadc", "is", null)'));
  assert.ok(data.includes('.eq("site", wantedSite)'));
  assert.ok(data.includes(".range(from, from + pageSize - 1)"));

  assert.ok(view.includes('granularity(row) === "daily"'));
  assert.ok(view.includes('granularity(row) === "weekly"'));
  assert.ok(view.includes("fetchIadcWorkspaceRows"));
  assert.ok(view.includes("Import Report"));
  assert.ok(view.includes("Driver Performance"));
  assert.ok(view.includes("Vs previous"));
  assert.ok(view.includes("Open Driver 360"));

  assert.ok(router.includes('if((props?.metric||"iadc")==="iadc")'));
  assert.ok(router.includes("<IadcComplianceView"));
});
