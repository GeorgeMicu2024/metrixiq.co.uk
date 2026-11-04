import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../app/scorecards-v22.css", import.meta.url), "utf8");
const section = css.slice(css.indexOf("/* DZM1 desktop: Concessions counts as legible"));

test("DZM1 concessions count is large, bold and black without affecting other stations", () => {
  assert.match(section, /^\/\* DZM1 desktop: Concessions counts as legible/);
  assert.match(section, /@media \(min-width:1024px\)/);
  assert.match(section, /scorex3-root\.scorex3-dzm1-readability[\s\S]*?scorex3-concession-badge\{/);
  assert.match(section, /min-width:48px!important/);
  assert.match(section, /font-size:15px!important/);
  assert.match(section, /font-weight:950!important/);
  assert.match(section, /color:#111!important/);
});

test("concession warning colours remain distinct for zero, active and high counts", () => {
  for (const tone of ["zero", "active", "high"]) {
    assert.match(section, new RegExp(`scorex3-concession-badge\\.${tone}\\{`));
  }
});
