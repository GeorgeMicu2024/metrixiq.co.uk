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

  assert.ok(router.includes('if(metric==="iadc") return <IadcComplianceView'));
  assert.ok(router.includes("<IadcComplianceView"));
});


test("IADC workspace can export a WhatsApp-ready PNG", () => {
  const view = read("components/operations/IadcComplianceView.jsx");

  assert.ok(view.includes('import { toBlob } from "html-to-image"'));
  assert.ok(view.includes("Save PNG"));
  assert.ok(view.includes("Send WhatsApp"));
  assert.ok(view.includes("createShareImage"));
  assert.ok(view.includes("navigator.share"));
  assert.ok(view.includes("https://wa.me/?text="));
  assert.ok(view.includes("iadc-share-card"));
  assert.ok(view.includes("IADC Performance"));
});
