import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../app/scorecards-v22.css", import.meta.url), "utf8");
const jsx = readFileSync(new URL("../components/scorecards/DriverScorecardsV22.jsx", import.meta.url), "utf8");

test("DZM1 desktop hides only the inline total-score delta", () => {
  const block = css.slice(css.indexOf("/* DZM1 desktop: hide the tiny score-delta"));
  assert.match(block, /@media \(min-width:1024px\)/);
  assert.match(block, /\.scorex3-root\.scorex3-dzm1-readability \.scorex3-table tbody tr\.scorex3-driver-row \.scorex3-score-cell button>em\{\s*display:none!important/);
});

test("the original score and score breakdown remain functional", () => {
  assert.match(jsx, /<b>\{formatDriverScore\(row\.displayScore\)\}<\/b>/);
  assert.match(jsx, /onClick=\{\(\) => setBreakdownRow\(row\)\}/);
  assert.match(jsx, /scoreDeltaLabel\(row\.scoreDelta\)/);
});
