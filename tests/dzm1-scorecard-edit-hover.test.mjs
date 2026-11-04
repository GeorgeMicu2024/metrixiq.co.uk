import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../app/scorecards-v22.css", import.meta.url), "utf8");
const component = readFileSync(new URL("../components/scorecards/DriverScorecardsV22.jsx", import.meta.url), "utf8");
const section = css.slice(css.indexOf("/* DZM1 desktop: inline Concessions edit"));

test("DZM1 Concessions Edit is visible on hover and keyboard focus only", () => {
  assert.match(section, /^\/\* DZM1 desktop: inline Concessions edit/);
  assert.match(section, /@media \(min-width:1024px\) and \(hover:hover\) and \(pointer:fine\)/);
  assert.match(section, /\.scorex3-concession-edit\{[\s\S]*?opacity:0!important/);
  assert.match(section, /td:hover \.scorex3-concession-edit/);
  assert.match(section, /\.scorex3-concession-edit:focus-visible/);
  assert.match(section, /opacity:1!important/);
});

test("concessions and FICO still use their original save handlers", () => {
  assert.match(component, /className="scorex3-concession-edit" onClick=\{\(\) => openConcessionsEditor\(row\)\}/);
  assert.match(component, /onClick=\{\(\) => openFicoEditor\(row\)\}/);
});
