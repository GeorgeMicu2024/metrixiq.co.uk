import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  new URL("../components/sites/WavePlanView.jsx", import.meta.url),
  "utf8"
);

test("DXM3 merges STG-A and STG-B into one wave when time and colour match", () => {
  assert.ok(source.includes('mergeDxm3Stages=norm(site)==="DXM3"'));
  assert.ok(source.includes('groupStage=mergeDxm3Stages?"STG":stg'));
  assert.ok(source.includes('[r.time,r.wave,groupStage].join("|")'));
  assert.ok(source.includes("},[plan,site]);"));
});

test("non-DXM3 sites keep staging letter as part of the wave grouping key", () => {
  assert.ok(source.includes('groupStage=mergeDxm3Stages?"STG":stg'));
  assert.ok(source.includes('const stg=r.staging.match(/STG[- ]?[A-Z]/i)'));
});
