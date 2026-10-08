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




test("IADC workspace can save a share-ready PNG without WhatsApp integration", () => {
  const view = read("components/operations/IadcComplianceView.jsx");

  assert.ok(view.includes('import { toBlob } from "html-to-image"'));
  assert.ok(view.includes("Save PNG"));
  assert.ok(view.includes("createShareImage"));
  assert.ok(view.includes('document.fonts?.ready'));
  assert.ok(view.includes('transform: "none"'));
  assert.ok(view.includes('visibility: "visible"'));
  assert.ok(view.includes('blob.size < 5000'));
  assert.ok(view.includes("iadc-share-card"));

  assert.equal(view.includes("Send WhatsApp"), false);
  assert.equal(view.includes("sendIadcWhatsApp"), false);
  assert.equal(view.includes("web.whatsapp.com"), false);
  assert.equal(view.includes("wa.me"), false);
  assert.equal(view.includes("navigator.share"), false);
});


test("IADC PNG omits top-right MetrixIQ brand block", () => {
  const view = read("components/operations/IadcComplianceView.jsx");

  assert.equal(view.includes('className="iadc-share-brand"'), false);
  assert.equal(view.includes("Driver Performance Intelligence"), false);
  assert.ok(view.includes("justify-content:flex-start"));
});
