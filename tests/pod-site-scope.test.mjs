import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  POD_EXPORT_PAGE_SIZE,
  POD_EXPORT_SITE,
  paginatePodRows,
  podRejectReasons,
} from "../lib/pod/exportReport.mjs";
import { createPodPageImage, wrapPodImageText } from "../lib/pod/renderImage.mjs";

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
  assert.ok(view.includes("Save Page to Photos"));
  assert.ok(view.includes("Save All to Photos"));
  assert.ok(view.includes("createPodPageImage("));
  assert.ok(view.includes("navigator.share({ files"));
  assert.ok(view.includes("navigator.canShare?.({ files })"));
  assert.ok(view.includes("Touch and hold"));
  assert.equal(view.includes('await import("html-to-image")'), false);
});

test("POD PNG renderer draws every driver and returns a shareable PNG File", () => {
  assert.deepEqual(
    wrapPodImageText({ measureText: (text) => ({ width: text.length * 10 }) }, "Alpha Beta Gamma", 55),
    ["Alpha", "Beta", "Gamma"]
  );

  const originalDocument = globalThis.document;
  const originalFile = globalThis.File;
  const drawn = [];
  const context = {
    measureText: (text) => ({ width: String(text).length * 11 }),
    beginPath() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    closePath() {},
    fill() {},
    fillRect() {},
    fillText(value) { drawn.push(String(value)); },
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    toDataURL: () => `data:image/png;base64,${Buffer.from("test-png").toString("base64")}`,
  };
  globalThis.document = { createElement: () => canvas };
  if (!globalThis.File) {
    globalThis.File = class extends Blob {
      constructor(parts, name, options) { super(parts, options); this.name = name; }
    };
  }

  try {
    const drivers = Array.from({ length: 25 }, (_, index) => ({
      name: `Test Driver ${index + 1}`,
      score: 96.25,
      opportunities: 200,
      rejects: 7,
      reasons: "Blurry Photo (4) · Package In Car (3)",
    }));
    const image = createPodPageImage({
      drivers,
      week: "W43",
      pageNumber: 1,
      pageCount: 2,
      totalDrivers: 48,
      podScore: 99.39,
      rejectedPhotos: 48,
    });
    assert.equal(image.file.type, "image/png");
    assert.match(image.filename, /DZM1_W43_Page_1_of_2\.png$/);
    assert.equal(canvas.width, 1320);
    assert.ok(canvas.height > 2000 && canvas.height < 8000);
    assert.equal(drawn.filter((value) => /^Test Driver \d+$/.test(value)).length, 25);
    assert.ok(drawn.some((value) => value.includes("Package In Car")));
  } finally {
    globalThis.document = originalDocument;
    globalThis.File = originalFile;
  }
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
