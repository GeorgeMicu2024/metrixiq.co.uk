import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dzm1ImageBands, dzm1RouteCode, dzm1Lane, dzm1RepairLaneSequence, dzm1VerifiedScreenshotRows } from "../lib/data/dzm1WaveImage.js";

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

test("DZM1 LF2 original: all 19 verified route, lane, wave and time pairs survive noisy OCR", () => {
  const reference=[
    ["CA_A153","A.1"],["CA_A146","A.2"],["CA_A151","A.3"],
    ["CA_A150","A.4"],["CA_A155","A.5"],["CA_A142","A.6"],
    ["CA_A154","A.7"],["CA_A144","B.4"],["CA_A147","B.5"],
    ["CA_A148","B.6"],["CA_A139","B.7"],["CA_A149","B.8"],
    ["CA_A141","B.9"],["CA_A152","B.10"],["CA_A160","B.11"],
    ["CA_A143","B.12"],["CA_A138","B.1"],["CA_A145","B.2"],
    ["CA_A156","B.3"]
  ];
  const rows=reference.map(([route,lane],i)=>({
    route, lane, time:i<16?"11:40":"12:05",wave:i<16?"WAVE1":"WAVE2"
  }));
  // Actual first-day failures seen on screenshots:
  for(const i of [1,2,3,4,5])rows[i].lane="";
  rows[9].lane="B.0";
  rows[12].lane="B.49";
  rows[17].route="CA_A14";
  assert.equal(rows.filter((r,i)=>r.route===reference[i][0]).length,18);
  const corrected=dzm1VerifiedScreenshotRows(rows);
  assert.ok(corrected,"the exact verified screenshot fingerprint should be recognized");
  assert.deepEqual(corrected.map(r=>[r.route,r.lane]),reference);
  assert.equal(corrected.filter(r=>r.wave==="WAVE1"&&r.time==="11:40").length,16);
  assert.equal(corrected.filter(r=>r.wave==="WAVE2"&&r.time==="12:05").length,3);
  assert.equal(new Set(corrected.map(r=>r.route)).size,19);
});
test("DZM1 screenshot fingerprint never assigns yesterday's lane to an unrelated route set", () => {
  const routes=[
    "153","146","151","150","155","142","154","144","147","148",
    "139","149","141","152","160","143","138","145","156"
  ];
  const rows=routes.map((n,i)=>({route:"CA_A"+n,lane:"",time:i<16?"11:40":"12:05",wave:i<16?"WAVE1":"WAVE2"}));
  for(const index of [1,2,3])rows[index].route="CA_A900";
  assert.equal(dzm1VerifiedScreenshotRows(rows),null);
  assert.equal(dzm1VerifiedScreenshotRows(rows.slice(0,18)),null);
  assert.equal(dzm1VerifiedScreenshotRows(rows.map(r=>({...r,time:"10:30"}))),null);
});
test("DZM1 lane interpolation uses two aligned anchors, not arbitrary guessing", () => {
  const base=[
    {wave:"WAVE1",time:"11:40",lane:"A.1"},
    {wave:"WAVE1",time:"11:40",lane:""},
    {wave:"WAVE1",time:"11:40",lane:""},
    {wave:"WAVE1",time:"11:40",lane:"A.4"},
    {wave:"WAVE1",time:"11:40",lane:"B.4"},
    {wave:"WAVE1",time:"11:40",lane:"B.0"},
    {wave:"WAVE1",time:"11:40",lane:"B.6"},
    {wave:"WAVE2",time:"12:05",lane:"B.1"},
    {wave:"WAVE2",time:"12:05",lane:""},
    {wave:"WAVE2",time:"12:05",lane:"B.3"},
  ];
  const result=dzm1RepairLaneSequence(base);
  assert.deepEqual(result.map(r=>r.lane),["A.1","A.2","A.3","A.4","B.4","B.5","B.6","B.1","B.2","B.3"]);
  assert.equal(base[1].lane,"","original OCR results are never mutated");
  const sparse=[{wave:"WAVE1",time:"11:40",lane:""},{wave:"WAVE1",time:"11:40",lane:"A.7"}];
  assert.equal(dzm1RepairLaneSequence(sparse)[0].lane,"","one anchor is not enough");
});
test("DZM1 groups same-time drivers together while keeping each staging lane", () => {
  const src=view();
  assert.ok(src.includes('norm(site)==="DZM1"?"NO-STAGING"'),"DZM1 may not split a wave by staging letters");
  assert.ok(src.includes('const groups=useMemo('));
  assert.ok(src.includes('},[plan,site]);'));
  assert.ok(src.includes('r.staging||r.gateTime||"—"'),"driver rows continue to display their own staging lane");
});
