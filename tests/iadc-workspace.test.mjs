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


test("IADC PNG omits MetrixIQ from the export header", () => {
  const view = read("components/operations/IadcComplianceView.jsx");

  assert.equal(view.includes("METRIXIQ · WORKFLOW COMPLIANCE"), false);
  assert.ok(view.includes("<span>WORKFLOW COMPLIANCE</span>"));
});


test("IADC PNG export paginates at 25 drivers per image without changing the card design", () => {
  const view = read("components/operations/IadcComplianceView.jsx");

  assert.ok(view.includes("const IADC_EXPORT_PAGE_SIZE = 25"));
  assert.ok(view.includes("const sharePages = useMemo"));
  assert.ok(view.includes("visible.slice(index, index + IADC_EXPORT_PAGE_SIZE)"));
  assert.ok(view.includes("const shareCardRefs = useRef([])"));
  assert.ok(view.includes("shareCardRefs.current[pageIndex] = node"));
  assert.ok(view.includes("pageIndex * IADC_EXPORT_PAGE_SIZE + index"));
  assert.ok(view.includes('shareFileName.replace(/\\.png$/i, "-p" + (pageIndex + 1) + ".png")'));
  assert.ok(view.includes('" · " + (pageIndex + 1) + "/" + sharePages.length'));
  assert.ok(view.includes("for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1)"));
});


test("IADC final PNG page keeps the same 25-row layout", () => {
  const view = read("components/operations/IadcComplianceView.jsx");

  assert.ok(view.includes('Array.from({ length: IADC_EXPORT_PAGE_SIZE }'));
  assert.ok(view.includes('const row = pageRows[index] || null'));
  assert.ok(view.includes('iadc-share-row-placeholder'));
  assert.ok(view.includes('placeholder-" + pageIndex + "-" + index'));
  assert.ok(view.includes('color:transparent!important'));
  assert.ok(view.includes('background:transparent!important'));
});
