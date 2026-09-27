import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) =>
  fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("DCR workspace is weekly and scorecard-backed", () => {
  const data = read("lib/data/dcr.js");
  const view = read("components/operations/DcrScorecardView.jsx");
  const router = read("components/operations/IadcView.jsx");

  assert.ok(data.includes('.not("dcr", "is", null)'));
  assert.ok(data.includes('granularity === "weekly"'));
  assert.ok(data.includes('.eq("site", wantedSite)'));

  assert.ok(view.includes("fetchDcrScorecardRows"));
  assert.ok(view.includes("Source: DSP Scorecard"));
  assert.ok(view.includes("Daily operational records are excluded"));
  assert.ok(view.includes("DCR Driver Ranking"));
  assert.ok(view.includes("Gap to target"));

  assert.ok(router.includes('if(metric==="dcr") return <DcrScorecardView'));
});
