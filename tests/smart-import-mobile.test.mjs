import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const component = readFileSync(new URL("../components/imports/SmartImportLab.jsx", import.meta.url), "utf8");
const importCenter = readFileSync(new URL("../components/imports/ImportCenterV2.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/manager-intelligence-v3.css", import.meta.url), "utf8");

test("Smart Import detection rows expose mobile labels", () => {
  for (const label of ["File", "Report", "Site", "Period", "Confidence", "Status"]) {
    assert.match(component, new RegExp(`data-label=["']${label}["']`));
  }
  assert.match(component, /smartlab-detection-table/);
});

test("Smart Import mobile CSS converts detection table into cards", () => {
  assert.match(css, /Smart Import Lab mobile hardening/);
  assert.match(css, /\.smartlab-detection-table thead\{display:none\}/);
  assert.match(css, /\.smartlab-detection-table tr\{display:block/);
  assert.match(css, /content:attr\(data-label\)/);
});

test("Import Center does not render escaped newline text between tabs", () => {
  assert.doesNotMatch(importCenter, /SmartImportLab sites=\{sites\}\/>\}\\n\\n/);
});

test("mobile staging action uses compact copy", () => {
  assert.match(component, />Discard stage<\/button>/);
  assert.doesNotMatch(component, />Discard dry-run stage<\/button>/);
});
