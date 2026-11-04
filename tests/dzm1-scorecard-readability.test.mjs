import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const component = readFileSync(new URL("../components/scorecards/DriverScorecardsV22.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../app/scorecards-v22.css", import.meta.url), "utf8");

test("desktop scorecard readability opt-in is isolated to DZM1", () => {
  assert.match(component, /String\(period\?\.site \|\| ""\)\.trim\(\)\.toUpperCase\(\) === "DZM1"/);
  assert.match(component, /scorex3-dzm1-readability/);
  assert.match(styles, /@media \(min-width: 1024px\) \{\s*\.scorex3-root\.scorex3-dzm1-readability/);
  assert.match(styles, /\.scorex3-root\.scorex3-dzm1-readability \.scorex3-table\{min-width:1650px!important/);
});

test("DZM1 text controls remain supported independently of compact row spacing", () => {
  assert.match(styles, /\.scorex3-table\.font-medium \.scorex3-name-cell button,\s*\.scorex3-root\.scorex3-dzm1-readability/);
  assert.match(styles, /\.scorex3-table\.font-large \.scorex3-score-cell b\{font-size:14px!important/);
  assert.match(styles, /\.scorex3-table\.font-small\{--score-header-height:36px\}/);
});
