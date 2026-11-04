import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../app/scorecards-v22.css", import.meta.url), "utf8");
const scoped = css.slice(css.indexOf("/* DZM1 desktop legibility:"));

test("DZM1 desktop text is enlarged without changing other station styles", () => {
  assert.match(scoped, /^\/\* DZM1 desktop legibility:/);
  assert.match(scoped, /@media \(min-width:1024px\)/);
  assert.match(scoped, /scorex3-root\.scorex3-dzm1-readability \.scorex3-table\{[\s\S]*?min-width:2100px!important/);
  assert.match(scoped, /font-medium td\{height:55px!important;font-size:14\.5px!important/);
  assert.match(scoped, /font-large td\{height:61px!important;font-size:16px!important/);
});

test("DZM1 driver names and values have high-contrast, bold typography", () => {
  assert.match(scoped, /scorex3-driver-row \.scorex3-name-cell button,[\s\S]*?color:#080e16!important/);
  assert.match(scoped, /scorex3-driver-row \.scorex3-value-pill,[\s\S]*?color:#111!important/);
  assert.match(scoped, /font-medium th\{height:50px!important;font-size:13px!important;color:#111!important/);
});
