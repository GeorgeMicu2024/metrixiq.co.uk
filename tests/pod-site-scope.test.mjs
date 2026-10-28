import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  POD_EXPORT_PAGE_SIZE,
  POD_EXPORT_SITE,
  paginatePodRows,
  podRejectReasons,
} from "../lib/pod/exportReport.mjs";

const read = (path) =>
  fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("POD workspace and imports are isolated to DZM1", () => {
  const view = read("components/operations/PodQualityView.jsx");

  assert.ok(view.includes("inferSiteFromFile"));
  assert.equal(POD_EXPORT_SITE, "DZM1");
  assert.ok(view.includes("filterRowsBySite(load.rows, POD_EXPORT_SITE)"));
  assert.ok(view.includes("driverSite === POD_EXPORT_SITE"));
  assert.ok(view.includes("filenameSite !== POD_EXPORT_SITE"));
  assert.ok(view.includes("const importSite = POD_EXPORT_SITE"));
  assert.ok(view.includes("onImported?.(result, [file], importSite)"));
  assert.ok(view.includes("no driver-level POD Quality rows were saved"));
});

test("POD image export pages contain at most 25 drivers without losing the sort order", () => {
  const rows = Array.from({ length: 56 }, (_, i) => ({ driver_id: i }));
  const pages = paginatePodRows(rows);
  assert.equal(POD_EXPORT_PAGE_SIZE, 25);
  assert.deepEqual(pages.map((page) => page.length), [25, 25, 6]);
  assert.deepEqual(pages.flat(), rows);
  assert.deepEqual(paginatePodRows([]), []);
  assert.deepEqual(paginatePodRows(rows.slice(0, 25)).map((page) => page.length), [25]);

  const view = read("components/operations/PodQualityView.jsx");
  assert.ok(view.includes("Save Page as Image"));
  assert.ok(view.includes("Export All PNGs"));
  assert.ok(view.includes("data-pod-image-page"));
  assert.ok(view.includes('await import("html-to-image")'));
});

test("POD images contain every available rejection category and count", () => {
  const labels = [
    ["blurryPhoto", "Blurry Photo"],
    ["photoTooDark", "Photo Too Dark"],
    ["noPackageDetected", "No Package Detected"],
  ];
  assert.equal(
    podRejectReasons(
      { rejects: 5, reasons: { blurryPhoto: 2, photoTooDark: 3 } },
      labels
    ),
    "Photo Too Dark (3) · Blurry Photo (2)"
  );
  assert.equal(podRejectReasons({ rejects: 2 }, labels), "Reason unavailable");
  assert.equal(podRejectReasons({ bypass: 3 }, labels), "Bypass (3)");
  assert.equal(podRejectReasons({ rejects: 0 }, labels), "No issues");
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


test("operational site resolver accepts Amazon station codes such as DLS2", () => {
  const shared = read("components/operations/OperationalShared.jsx");

  assert.ok(shared.includes('/^[A-Z]{2,5}\\d{1,3}$/'));
  assert.equal(shared.includes('/^[A-Z]{2,5}\\\\d{1,3}$/'), false);
});
