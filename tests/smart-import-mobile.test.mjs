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

test("mobile staging actions separate local dry run from isolated test DB", () => {
  assert.match(component, />Discard dry run<\/button>/);
  assert.match(component, /Stage to Test DB/);
  assert.match(component, /PRODUCTION OFF/);
  assert.doesNotMatch(component, />Discard dry-run stage<\/button>/);
});


test("unavailable files can be removed without clearing the whole batch", () => {
  assert.match(component, /0 B \/ unavailable on this device/);
  assert.match(component, /smartlab-remove-file/);
  assert.match(component, />Remove<\/button>/);
  assert.match(css, /Smart Import unavailable file state/);
});
