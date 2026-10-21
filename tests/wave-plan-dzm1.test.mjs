import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dzm1ImageBands, dzm1RouteCode, dzm1Lane } from "../lib/data/dzm1WaveImage.js";

const view = () => readFileSync(new URL("../components/sites/WavePlanView.jsx",import.meta.url),"utf8");

test("DZM1 OCR repairs route prefix and separated underscore characters", () => {
  assert.equal(dzm1RouteCode("CA_A153"),"CA_A153");
  assert.equal(dzm1RouteCode("CA A 146"),"CA_A146");
  assert.equal(dzm1RouteCode("C4_A155"),"CA_A155");
  assert.equal(dzm1RouteCode("CA_AI51"),"CA_A151");
  assert.equal(dzm1RouteCode("CA_AO38"),"CA_A038");
  assert.equal(dzm1RouteCode("Lane"),"");
  assert.equal(dzm1RouteCode("11:40"),"");
});
test("DZM1 screenshot lane identifiers are normalized without introducing staging guesses", () => {
  assert.equal(dzm1Lane("A.1"),"A.1");
  assert.equal(dzm1Lane("B..4"),"B.4");
  assert.equal(dzm1Lane("B.12"),"B.12");
  assert.equal(dzm1Lane(""),"");
});
test("DZM1 striping detects 19 driver rows and the 11:40 / 12:05 wave section bands", () => {
  const width=954,height=1472;
  const pixels=new Uint8ClampedArray(width*height*4);
  const draw=(a,b,[r,g,blue])=>{
    const x=Math.floor(width*.50);
    for(let y=a;y<b;y++){
      const p=(y*width+x)*4;
      pixels[p]=r;pixels[p+1]=g;pixels[p+2]=blue;pixels[p+3]=255;
    }
  };
  draw(0,height,[255,255,255]);
  draw(14,192,[142,68,173]);  // DCSL header, never a wave time
  draw(192,239,[127,79,0]);   // 11:40 section header
  for(let i=0;i<16;i++)draw(240+i*57,240+i*57+55,i%2?[245,238,248]:[232,218,239]);
  draw(1152,1199,[26,58,92]); // 12:05 section header
  for(let i=0;i<3;i++)draw(1200+i*57,1200+i*57+55,i%2?[245,238,248]:[255,255,255]);
  draw(1370,1414,[74,35,90]);
  const result=dzm1ImageBands(pixels,width,height);
  assert.equal(result.rows.length,19);
  assert.equal(result.headers.length,2);
  assert.equal(result.rows.filter(r=>r.top<1152).length,16);
  assert.equal(result.rows.filter(r=>r.top>=1199).length,3);
  assert.ok(result.headers.every(h=>h.top>150&&h.top<1250));
});
test("DZM1 uses cell-based OCR only at DZM1 and keeps existing DEH1/other sites", () => {
  const s=view();
  assert.ok(s.includes('norm(site)==="DZM1"&&canvasInfo'));
  assert.ok(s.includes("await parseDzm1WaveImage(worker,canvasInfo,data)"));
  assert.ok(s.includes('norm(site)==="DEH1"?await deh1ImageRows(file,setOcrProgress):await imageRows(file,setOcrProgress,site)'));
  assert.ok(s.includes('norm(site)==="DEH1"?await deh1ImageRows(file,progress):await imageRows(file,progress,site)'));
  assert.ok(s.includes('} finally { await worker.terminate(); }'));
  assert.ok(s.includes('const name=(trid&&driverByTrid.get(norm(trid)))||routeDrivers.get(norm(route))'));
});
test("DZM1 grid entries keep actual wave times without Amazon -20 adjustment", () => {
  const src=readFileSync(new URL("../lib/data/dzm1WaveImage.js",import.meta.url),"utf8");
  assert.ok(src.includes("directLoadTime:true"));
  assert.ok(src.includes('const wave="WAVE"+(timedHeaders.indexOf(header)+1)'));
  assert.ok(src.includes('cells:[route,time,lane?"STG-"+lane:"",wave]'));
  assert.ok(src.includes('if(!time)continue; // Never invent a missing Wave time.'));
});
