import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const component = readFileSync(new URL("../components/scorecards/DriverScorecardsV22.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../app/scorecards-v22.css", import.meta.url), "utf8");

test("DZM1 Recent Weeks prefers the stored official site score and standing", () => {
  const section = component.slice(component.indexOf("<div className=\"scorex3-history-scroll\">"));
  assert.match(section, /item\.site === "DZM1" \? num\(item\.card\?\.overall_score\) : null/);
  assert.match(section, /const score = officialScore \?\? average/);
  assert.match(section, /sourceTier\(null, item\.card\.standing\)/);
  assert.match(section, /const cls = hasOfficialTier \? officialTier\.cls/);
});

test("the fallback is clearly labelled estimated for DZM1 and other stations retain old behavior", () => {
  assert.match(component, /item\.site === "DZM1" \? " \(est\.\)" : ""/);
  assert.match(styles, /scorex3-root\.scorex3-dzm1-readability \.scorex3-history-scroll button\{\s*min-width:145px/);
});
