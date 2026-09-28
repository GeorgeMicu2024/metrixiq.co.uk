import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  isStructuralPersonLabel,
  isUsablePersonName,
} from "../lib/identity.js";

test("table headers and summary labels are never accepted as person names", () => {
  const blocked = [
    "Transporter ID",
    "Driver ID",
    "Delivery Associate Name",
    "Total DSC Count",
    "Total DNR Count",
    "Grand Total",
    "Concession Count",
  ];

  for (const value of blocked) {
    assert.equal(isStructuralPersonLabel(value), true, value);
    assert.equal(isUsablePersonName(value), false, value);
  }
});

test("real person names remain usable", () => {
  for (const value of ["Ana Popescu", "George Micu", "John Smith", "Maria-Jose Silva"]) {
    assert.equal(isStructuralPersonLabel(value), false, value);
    assert.equal(isUsablePersonName(value), true, value);
  }
});

test("concession parser explicitly rejects structural labels before NAME fallback", () => {
  const source = readFileSync(new URL("../lib/analyzer/spreadsheet.js", import.meta.url), "utf8");
  assert.match(source, /if \(isStructuralPersonLabel\(name\)\) continue/);
  assert.match(source, /Never promote those labels to NAME:\* driver identities/);
});
