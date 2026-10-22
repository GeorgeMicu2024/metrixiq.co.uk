import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dzm1DCSLWaveRows,dzm1FullWavePlanHeaders} from "../lib/data/dzm1FullWavePlan.js";
import {dzm1ParkingForWave,dzm1WaveStart24} from "../lib/data/dzm1Parking.js";

const cols=["Launch PAD","DSP","Route Code","Service Type","Wave Start","Wave Finish","Holding Lane","Wave Number","Staging Location","Late Arrival","No show"];
// Real DCSL route order / staging from uploaded 22 Oct depot workbook.
const routes=["221","224","209","236","218","222","220","228","223","227","229","226","217","230","215","214","213","212","205"];
const actual=routes.map((suffix,i)=>({
 sheet:"Sheet1",row:234+i,
 cells:["","DCSL","CA_A"+suffix,"Standard Parcel - Large Van","12:40 PM","13:05 PM",i<9?"D":"C","12","STG-B"+String(i+2).padStart(2,"0"),"",""]
}));
const unrelated=[
 {sheet:"Sheet1",row:2,cells:["A","NWFL","CA_A84","Standard Parcel","10:25 AM","10:50 AM","E","1","STG-C01","",""]},
 {sheet:"Sheet1",row:23,cells:["B","UKED","CA_A5","Standard Parcel","10:35 AM","11:00 AM","D","2","STG-B01","",""]},
 {sheet:"Sheet1",row:233,cells:["B","JHAL","CA_A120","Remote Debrief","12:40 PM","13:05 PM","D","12","STG-B01","",""]},
 {sheet:"Sheet1",row:253,cells:["B","DTTD","CA_A279","Standard Parcel","12:40 PM","13:05 PM","C","12","STG-B21","",""]},
];
const sheet=[{sheet:"Sheet1",row:1,cells:cols},...unrelated,...actual];
const app=()=>readFileSync(new URL("../components/sites/WavePlanView.jsx",import.meta.url),"utf8");

test("DZM1 recognises full-site Excel Wave Plan by named columns",()=>{
  const hdr=dzm1FullWavePlanHeaders(sheet);
  assert.equal(hdr.index,0);
  assert.equal(hdr.col["DSP"],1);
  assert.equal(hdr.col["WAVE START"],4);
  assert.equal(hdr.col["WAVE FINISH"],5);
  assert.equal(hdr.col["WAVE NUMBER"],7);
});
test("DZM1 selects exactly 19 DCSL routes from mixed-DSP sheet, in original staging order",()=>{
  const selected=dzm1DCSLWaveRows(sheet);
  assert.equal(selected.length,19);
  assert.deepEqual(selected.map(x=>x.cells[0]),routes.map(n=>"CA_A"+n));
  assert.deepEqual(selected.map(x=>x.stagingCode),routes.map((_,i)=>"STG-B"+String(i+2).padStart(2,"0")));
  assert.ok(selected.every(x=>x.cells[1]==="12:40 PM"&&x.waveFinish==="13:05 PM"&&x.explicitWave==="WAVE12"));
  assert.ok(selected.every(x=>x.directLoadTime&&x.dcslHint));
  assert.ok(selected.every(x=>x.row>=234&&x.row<=252));
  assert.ok(selected.every(x=>x.cells[4]==="DCSL"));
  assert.equal(new Set(selected.map(x=>x.cells[0])).size,19);
});
test("DZM1 matches 19 DCSL Wave Plan routes against 35 Routes XLSX routes",()=>{
  const roster=new Set(Array.from({length:35},(_,i)=>"CA_A"+(202+i)));
  const selected=dzm1DCSLWaveRows(sheet);
  const matched=selected.filter(x=>roster.has(x.cells[0]));
  assert.equal(matched.length,19);
  assert.equal(roster.size-matched.length,16);
});
test("DZM1 never imports other DSPs when full-site workbook has no DCSL",()=>{
  assert.deepEqual(dzm1DCSLWaveRows([sheet[0],...unrelated]),[]);
  assert.equal(dzm1DCSLWaveRows([{sheet:"Image",row:1,cells:["CA_A153","11:40","A.1","WAVE1"]}]),null);
  assert.equal(dzm1DCSLWaveRows([...sheet,...actual]).length,19);
});
test("DZM1 Wave 12: 12:40 load, 12:25 holding, 12:15 1st Floor",()=>{
  assert.equal(dzm1WaveStart24("12:40 PM"),"12:40");
  assert.equal(dzm1WaveStart24("1:05 PM"),"13:05");
  assert.equal(dzm1WaveStart24("11:40 AM"),"11:40");
  assert.equal(dzm1WaveStart24("13:05 PM"),"13:05");
  assert.deepEqual(dzm1ParkingForWave("WAVE12",{},"12:40 PM"),{
    time:"12:15",holdingTime:"12:25",loadTime:"12:40",area:"UPSTAIRS PARKING"
  });
  assert.equal(dzm1ParkingForWave("WAVE12",{},""),null);
});
test("Wave 12 remains editable; historical Wave 1/2 defaults remain unchanged",()=>{
  const wave=dzm1ParkingForWave("WAVE12",{WAVE12:{time:"12:30"}},"12:40 PM");
  assert.deepEqual([wave.time,wave.holdingTime,wave.loadTime],["12:30","12:40","12:55"]);
  assert.equal(dzm1ParkingForWave("WAVE1").loadTime,"11:45");
  assert.equal(dzm1ParkingForWave("WAVE2").loadTime,"12:05");
});
test("Only DZM1 uses XLSX DCSL filter; existing image OCR and other sites preserved",()=>{
  const s=app();
  assert.ok(s.includes('norm(site)==="DZM1"?dzm1DCSLWaveRows(raw)??raw:raw'));
  assert.ok(s.includes('norm(site)==="DZM1"&&setFile===setWaveFile?dzm1DCSLWaveRows(raw)??raw:raw'));
  assert.ok(s.includes('staging=norm(site)==="DZM1"&&x.stagingCode?x.stagingCode'));
  assert.ok(s.includes('dzm1ParkingForWave(wave,dzm1ParkingOverrides,time)'));
  assert.ok(s.includes('dzm1ParkingForWave(selectedDehWave.wave,dzm1ParkingOverrides,selectedDehWave.time)'));
  assert.ok(s.includes('norm(site)==="DEH1"?await deh1ImageRows'));
  assert.ok(s.includes('await imageRows(file,progress,site)'));
});
