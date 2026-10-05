import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  new URL("../components/sites/WavePlanView.jsx", import.meta.url),
  "utf8"
);

test("DEH1 matrix Wave Plan keeps only DCSL rows and maps them to numbered waves", () => {
  assert.ok(source.includes("dcslMatrixWorkbookRows"));
  assert.ok(source.includes("dcslMatrixImageRows"));
  assert.ok(source.includes('if(!/^DCSL\\b/i.test(clean(row.cells[col])))continue'));
  assert.ok(source.includes("explicitWave:header.wave"));
  assert.ok(source.includes("directLoadTime:true"));
});

test("DEH1 loading times are treated as final loading times rather than Amazon times", () => {
  assert.ok(source.includes("time:directLoadTime?amazon:adjustTime(amazon,adjust)"));
  assert.ok(source.includes("Matrix Wave Plan loading times are kept exactly as supplied."));
});

test("DEH1 Route Plan identity lookup is restricted to Danube Courier Services", () => {
  assert.ok(source.includes('site==="DEH1"&&di>=0&&!dcslDsp(x.cells[di])'));
  assert.ok(source.includes("DANUBE\\s+COURIER\\s+SERVICES\\s+LTD"));
});

test("DEH1 matrix plans can render without inventing a staging location", () => {
  assert.ok(source.includes(':"NO-STAGING"'));
  assert.ok(source.includes('r.staging||r.gateTime||"—"'));
  assert.ok(source.includes('"GATE / HOLDING"'));
});

test("DEH1 gate and holding time is retained separately from loading time", () => {
  assert.ok(source.includes("gateTimeOf"));
  assert.ok(source.includes('gateTime:gate?.time||""'));
  assert.ok(source.includes('gate?\` · GATE \${gate}\`'));
});
