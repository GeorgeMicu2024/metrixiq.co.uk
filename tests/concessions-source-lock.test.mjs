import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseTrustedConcessionsFile } from "../lib/data/concessions.js";

test("canonical concessions file encodes site and week", () => {
  assert.deepEqual(
    parseTrustedConcessionsFile("DSP_Associates_Concessions_DLS2_2026-W39.csv"),
    {
      fileName: "DSP_Associates_Concessions_DLS2_2026-W39.csv",
      site: "DLS2",
      year: 2026,
      week: "W39",
    }
  );

  assert.equal(parseTrustedConcessionsFile("DDN1.xlsx"), null);
  assert.equal(parseTrustedConcessionsFile("UK-DCSL-DLS2-DWC-IADC-Report_2026-39.html"), null);
  assert.equal(parseTrustedConcessionsFile("UK-DCSL-DLS2-Week39-DSP-Scorecard-3.0.pdf"), null);
});

test("spreadsheet parser refuses concession inference from generic workbooks", () => {
  const source = fs.readFileSync(
    new URL("../lib/analyzer/spreadsheet.js", import.meta.url),
    "utf8"
  );

  assert.ok(source.includes("Only dedicated concession/DNR files may create the concessions metric"));
  assert.ok(source.includes("const looksConcession = /concession|dnr/i.test(fileName)"));
  assert.ok(source.includes("const looksLikeSummary = /concession|dnr/i.test(fileName)"));
});
