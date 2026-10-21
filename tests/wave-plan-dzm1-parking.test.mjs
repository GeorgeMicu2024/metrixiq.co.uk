import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DZM1_PARKING_AREAS, DZM1_PARKING_DEFAULTS, dzm1ShiftTime, dzm1ParkingForWave } from "../lib/data/dzm1Parking.js";

const view=()=>readFileSync(new URL("../components/sites/WavePlanView.jsx",import.meta.url),"utf8");
const styles=()=>readFileSync(new URL("../app/globals.css",import.meta.url),"utf8");

test("DZM1 Wave 1: 11:20 on 1st Floor, 11:30 holding 0 Floor, 11:45 load",()=>{
  assert.deepEqual(dzm1ParkingForWave("WAVE1"),{
    time:"11:20",holdingTime:"11:30",loadTime:"11:45",area:"UPSTAIRS PARKING"
  });
  assert.equal(DZM1_PARKING_DEFAULTS.WAVE1.time,"11:20");
});
test("DZM1 Wave 2: 11:40 on 1st Floor, 11:50 holding 0 Floor, 12:05 load",()=>{
  assert.deepEqual(dzm1ParkingForWave("WAVE2"),{
    time:"11:40",holdingTime:"11:50",loadTime:"12:05",area:"DOWNSTAIRS HOLDING"
  });
  assert.equal(DZM1_PARKING_DEFAULTS.WAVE2.time,"11:40");
  assert.equal(Object.keys(DZM1_PARKING_DEFAULTS).length,2);
  assert.deepEqual(DZM1_PARKING_AREAS,["UPSTAIRS PARKING","DOWNSTAIRS HOLDING"]);
});
test("Time intervals are always +10 minutes to holding and +15 more to load",()=>{
  assert.equal(dzm1ShiftTime("11:20",10),"11:30");
  assert.equal(dzm1ShiftTime("11:30",15),"11:45");
  assert.equal(dzm1ShiftTime("11:45",-25),"11:20");
  assert.equal(dzm1ShiftTime("11:40",25),"12:05");
  assert.equal(dzm1ShiftTime("23:50",25),"00:15");
  assert.equal(dzm1ShiftTime("invalid",10),"");
});
test("DZM1 times remain consistent when editing 1st Floor parking or Load Time",()=>{
  const s=dzm1ParkingForWave("WAVE1",{WAVE1:{time:"12:15"}});
  assert.equal(s.holdingTime,"12:25");
  assert.equal(s.loadTime,"12:40");
  const inputLoadTime="12:40";
  const inputParking=dzm1ShiftTime(inputLoadTime,-25);
  assert.equal(dzm1ParkingForWave("WAVE1",{WAVE1:{time:inputParking}}).loadTime,inputLoadTime);
  assert.equal(dzm1ParkingForWave("WAVE1",{WAVE1:{time:"invalid"}}).time,"11:20");
  assert.equal(dzm1ParkingForWave("WAVE3"),null,"unknown future wave receives no fabricated parking time");
});
test("DZM1 has six aligned columns: route, driver, 1st Floor, 0 Floor Holding, load, staging",()=>{
  const src=view();
  assert.ok(src.includes('className={"dcsl-sheet font-"+planFontSize+(norm(site)==="DEH1"?" deh1-polished":norm(site)==="DZM1"?" dzm1-parking-grid":"")}'));
  assert.ok(src.includes('PARKING TIME<small>1ST FLOOR</small>'));
  assert.ok(src.includes('HOLDING LANE<small>0 FLOOR</small>'));
  assert.ok(src.includes('<b>STAGING LANE</b>'));
  assert.ok(src.includes('<span>{parking?.time||"—"}</span><span>{parking?.holdingTime||"—"}</span><span className="dzm1-load-time">{shownLoad}</span>'));
  assert.ok(src.includes('r.staging?.replace(/^STG-/i,"")'),"individual staging lane must stay");
  const css=styles();
  assert.ok(css.includes('.daily-dispatch .dcsl-sheet.dzm1-parking-grid .dcsl-columns,'));
  assert.ok(css.includes('grid-template-columns:138px minmax(0,1fr) 144px 154px 130px 145px!important'));
  assert.ok(css.includes('.daily-dispatch .dcsl-sheet.dzm1-parking-grid .dcsl-wave>div'));
});
test("Wave 1 has 16 and Wave 2 has 3 original routes; no change to routing or OCR logic",()=>{
  const s=view();
  assert.ok(s.includes('const groups=useMemo('));
  assert.ok(s.includes('const stg=norm(site)==="DZM1"?"NO-STAGING"'));
  assert.ok(s.includes('const visibleGroups=useMemo('));
  assert.ok(s.includes('norm(site)==="DZM1"?dzm1ParkingForWave(wave,dzm1ParkingOverrides):null'));
  assert.ok(s.includes('norm(site)==="DEH1"?await deh1ImageRows'));
  assert.ok(s.includes('const plan=useMemo('));
});
test("DZM1 parking control shows the two floors, while other sites keep original Load Time",()=>{
  const src=view();
  assert.ok(src.includes('aria-label={`1st Floor parking time for ${waveLabel(selectedDehWave.wave)}`}'));
  assert.ok(src.includes('aria-label={`0 Floor holding time for ${waveLabel(selectedDehWave.wave)}`}'));
  assert.ok(src.includes('readOnly title="10 minutes after 1st Floor parking"'));
  assert.ok(src.includes('dzm1ShiftTime(e.target.value,-25)'));
  assert.ok(src.includes('dehDisplayTime(selectedDehWave.wave,"load",selectedDehWave.time)'));
  assert.ok(src.includes('setDzm1ParkingOverrides({})'));
  assert.ok(!src.includes('supabase.from("dzm1Parking"'));
  assert.ok(src.includes('dzm1-wave-timeline'));
  assert.ok(src.includes('className="dzm1-stage-time"'),"parking and holding remain separate");
  assert.ok(src.includes('className="dzm1-wave-load"'),"load time gets a distinct callout");
  assert.ok(!src.includes('+10 MIN →') && !src.includes('+15 MIN →'),"intervals are kept in calculations, not repeated in the header");
});

test("DZM1 variant 2 highlights LOAD TIME without changing times, stages or six-column order",()=>{
  const source=view(),css=styles();
  assert.ok(source.includes('PARKING <b>{parking.time}</b>'));
  assert.ok(source.includes('HOLDING <b>{parking.holdingTime}</b>'));
  assert.ok(source.includes('className="dzm1-wave-load">LOAD <b>{shownLoad}</b>'));
  assert.ok(source.includes('<span className="dzm1-load-time">{shownLoad}</span>'));
  assert.ok(source.includes('PARKING TIME<small>1ST FLOOR</small>'));
  assert.ok(source.includes('HOLDING LANE<small>0 FLOOR</small>'));
  assert.ok(source.includes('<b>STAGING LANE</b>'));
  assert.ok(css.includes('.daily-dispatch .dcsl-sheet.dzm1-parking-grid .dcsl-columns>b:nth-child(5)'));
  assert.ok(css.includes('.daily-dispatch .dcsl-sheet.dzm1-parking-grid .dcsl-wave>div>.dzm1-load-time'));
  assert.ok(css.includes('.daily-dispatch .dcsl-sheet.dzm1-parking-grid .dzm1-wave-load'));
  assert.equal(dzm1ParkingForWave("WAVE1").loadTime,"11:45");
  assert.equal(dzm1ParkingForWave("WAVE2").loadTime,"12:05");
  assert.equal(dzm1ParkingForWave("WAVE1").holdingTime,"11:30");
  assert.equal(dzm1ParkingForWave("WAVE2").holdingTime,"11:50");
});
