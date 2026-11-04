import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const styles = readFileSync(new URL("../app/scorecards-v22.css", import.meta.url), "utf8");
const contrast = styles.slice(styles.indexOf("/* DZM1 desktop contrast pass:"));

test("vivid cells apply only to DZM1 desktop and preserve existing metrics", () => {
  assert.match(contrast, /^\/\* DZM1 desktop contrast pass:/);
  assert.match(contrast, /@media \(min-width:1024px\)/);
  for (const tone of ["good", "warn", "bad", "neutral"]) {
    assert.match(contrast, new RegExp(`scorex3-root\\.scorex3-dzm1-readability[\\s\\S]+?scorex3-metric\\.${tone}\\{`));
  }
  for (const tier of ["fantastic-plus", "fantastic", "great", "fair", "poor"]) {
    assert.match(contrast, new RegExp(`scorex3-score-cell\\.${tier}\\{`));
  }
});

test("DZM1 highlighting keeps distinct row and column boundaries", () => {
  assert.match(contrast, /border-right:1px solid #36483f!important/);
  assert.match(contrast, /border-bottom:1px solid #36483f!important/);
  assert.match(contrast, /scorex3-name-cell button,[\s\S]*font-weight:950!important/);
});
