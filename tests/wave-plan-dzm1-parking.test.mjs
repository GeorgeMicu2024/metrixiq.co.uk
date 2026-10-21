import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DZM1_PARKING_AREAS, DZM1_PARKING_DEFAULTS, dzm1ShiftTime, dzm1ParkingStartFromEditedTime, dzm1ParkingForWave } from "../lib/data/dzm1Parking.js";

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
  assert.ok(src.includes('editDzm1Time(selectedDehWave.wave,"holding",e.target.value)'),"holding must be editable");
  assert.ok(src.includes('editDzm1Time(selectedDehWave.wave,"load",e.target.value)'),"load must be editable");
  assert.ok(src.includes('editDzm1Time(selectedDehWave.wave,"parking",e.target.value)'),"parking must be editable");
  assert.ok(!src.includes('readOnly title="10 minutes after 1st Floor parking"'));
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

test("DZM1: each of the three editable time controls recalculates the same +10/+15 sequence",()=>{
  const changedParking=dzm1ParkingStartFromEditedTime("parking","12:00");
  const changedHolding=dzm1ParkingStartFromEditedTime("holding","12:10");
  const changedLoad=dzm1ParkingStartFromEditedTime("load","12:25");
  assert.equal(changedParking,"12:00");
  assert.equal(changedHolding,"12:00");
  assert.equal(changedLoad,"12:00");
  for (const start of [changedParking,changedHolding,changedLoad]) {
    const wave=dzm1ParkingForWave("WAVE1",{WAVE1:{time:start}});
    assert.deepEqual([wave.time,wave.holdingTime,wave.loadTime],["12:00","12:10","12:25"]);
  }
  assert.equal(dzm1ParkingForWave("WAVE2").time,"11:40","editing Wave 1 must not modify Wave 2");
  assert.equal(dzm1ParkingStartFromEditedTime("holding","00:05"),"23:55");
  assert.equal(dzm1ParkingStartFromEditedTime("load","00:05"),"23:40");
  assert.equal(dzm1ParkingStartFromEditedTime("parking",""),"");
  assert.equal(dzm1ParkingStartFromEditedTime("load","12:"),"");
  assert.equal(dzm1ParkingStartFromEditedTime("holding","25:00"),"");
  assert.equal(dzm1ParkingStartFromEditedTime("unknown","12:00"),"");
});
test("DZM1: native time picker retains draft during partial edits and commits valid HH:MM",()=>{
  const src=view();
  assert.ok(src.includes('[dzm1TimeDraft,setDzm1TimeDraft]=useState(null)'));
  assert.ok(src.includes('setDzm1TimeDraft({wave,field,value})'));
  assert.ok(src.includes('const parkingStart=dzm1ParkingStartFromEditedTime(field,value)'));
  assert.ok(src.includes('if(parkingStart)changeDzm1Parking(wave,"time",parkingStart)'));
  assert.ok(src.includes('dzm1TimeDraft?.wave===wave&&dzm1TimeDraft.field===field?dzm1TimeDraft.value:derived'));
  assert.ok(src.includes('onFocus={e=>setDzm1TimeDraft({wave:selectedDehWave.wave,field:"holding",value:e.target.value})}'));
  assert.ok(src.includes('onBlur={()=>setDzm1TimeDraft(null)} title="Edit holding time; parking and load times update automatically"'));
  assert.ok(src.includes('onBlur={()=>{if(norm(site)==="DZM1")setDzm1TimeDraft(null);}'));
  assert.ok(src.includes('setDzm1TimeDraft(null);setDehEditorWave(e.target.value);'),"changing wave resets partial input state");
  assert.equal(src.split('setDzm1ParkingOverrides({});setDzm1TimeDraft(null);').length-1,2,"Clear and station change clear edits");
  assert.ok(!src.includes('readOnly title="10 minutes after 1st Floor parking"'));
});
