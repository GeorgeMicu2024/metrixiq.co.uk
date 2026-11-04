import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const styles = readFileSync(new URL("../app/scorecards-v22.css", import.meta.url), "utf8");
const premium = styles.slice(styles.indexOf("/* DZM1-only Premium Dashboard:"));

test("premium cells apply only to DZM1 desktop and preserve metric classifications", () => {
  assert.match(premium, /^\/\* DZM1-only Premium Dashboard:/);
  assert.match(premium, /@media \(min-width:1024px\)/);
  assert.doesNotMatch(premium, /DZM1 desktop contrast pass/);
  for (const tone of ["good", "warn", "bad", "neutral"]) {
    assert.match(premium, new RegExp(`scorex3-root\\.scorex3-dzm1-readability[\\s\\S]+?scorex3-metric\\.${tone}[\\s\\S]+?scorex3-value-pill`));
  }
  for (const tier of ["fantastic-plus", "fantastic", "great", "fair", "poor"]) {
    assert.match(premium, new RegExp(`scorex3-score-cell\\.${tier}\\{`));
  }
});

test("premium DZM1 table retains row separators and bold driver names", () => {
  assert.match(premium, /border-right:1px solid #dae4ec!important/);
  assert.match(premium, /border-bottom:1px solid #d1dce6!important/);
  assert.match(premium, /scorex3-name-cell button\{[\s\S]*?font-weight:950!important/);
});
