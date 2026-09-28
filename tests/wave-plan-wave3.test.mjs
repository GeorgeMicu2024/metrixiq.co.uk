import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  new URL("../components/sites/WavePlanView.jsx", import.meta.url),
  "utf8"
);
const css = fs.readFileSync(
  new URL("../app/globals.css", import.meta.url),
  "utf8"
);

test("numbered waves are unlimited and no longer capped by a fixed palette", () => {
  assert.ok(source.includes('const numbered=waveText.match(/\\bWAVE\\s*([1-9]\\d*)\\b/)'));
  assert.ok(source.includes('if(numbered)return `WAVE${numbered[1]}`'));
  assert.equal(source.includes('if(numbered&&COLORS[`WAVE${numbered[1]}`])'), false);
});

test("Wave Plan reads row colours from both Excel styles and image pixels", () => {
  assert.ok(source.includes("excelRowColour"));
  assert.ok(source.includes("cellStyles:true"));
  assert.ok(source.includes("rowColour:excelRowColour"));
  assert.ok(source.includes("worker.recognize(file,{}, {text:true,blocks:true})"));
  assert.ok(source.includes("ocrRouteColours"));
  assert.ok(source.includes("sampledRowColour"));
});

test("detected source colours drive summary, hide controls and final preview", () => {
  assert.ok(source.includes("colourForRows(wave,rows)"));
  assert.ok(source.includes('"--wave":waveColour'));
  assert.ok(source.includes('"--wave-text":textColour'));
  assert.ok(css.includes("source fill wins over legacy fixed palette"));
  assert.ok(css.includes("background:var(--wave)!important"));
});

test("neutral future colours are accepted as long as they are visible fills", () => {
  assert.ok(source.includes("stats.luma>=.12&&stats.luma<=.94"));
  assert.equal(source.includes("stats.sat>=.14"), false);
});
