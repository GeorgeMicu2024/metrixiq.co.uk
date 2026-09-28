import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  new URL("../components/sites/WavePlanView.jsx", import.meta.url),
  "utf8"
);

test("DDN1 Wave 3 is recognised as its own purple wave", () => {
  assert.ok(source.includes('WAVE3:"#a63db8"'));
  assert.ok(source.includes('const numbered=waveText.match(/\\bWAVE\\s*([1-9]\\d*)\\b/)'));
  assert.ok(source.includes('COLORS[`WAVE${numbered[1]}`]'));
  assert.ok(source.includes('return `WAVE${numbered[1]}`'));
});

test("numbered waves render as Wave N instead of colour fallback labels", () => {
  assert.ok(source.includes('/^WAVE\\d+$/.test(wave)'));
  assert.ok(source.includes('`Wave ${wave.slice(4)}`'));
  assert.ok(source.includes('{waveLabel(wave).toUpperCase()}'));
});
