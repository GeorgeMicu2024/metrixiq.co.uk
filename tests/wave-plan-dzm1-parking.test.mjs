import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DZM1_PARKING_AREAS, DZM1_PARKING_DEFAULTS, dzm1ParkingForWave } from "../lib/data/dzm1Parking.js";

const view=()=>readFileSync(new URL("../components/sites/WavePlanView.jsx",import.meta.url),"utf8");

test("DZM1: Wave 1 parks upstairs at 11:20, Wave 2 parks in downstairs holding at 11:40",()=>{
  assert.deepEqual(dzm1ParkingForWave("WAVE1"),{time:"11:20",area:"UPSTAIRS PARKING"});
  assert.deepEqual(dzm1ParkingForWave("WAVE2"),{time:"11:40",area:"DOWNSTAIRS HOLDING"});
  assert.equal(Object.keys(DZM1_PARKING_DEFAULTS).length,2);
  assert.deepEqual(DZM1_PARKING_AREAS,["UPSTAIRS PARKING","DOWNSTAIRS HOLDING"]);
});
test("DZM1 parking times and locations can be edited without changing the underlying wave load times",()=>{
  const custom={WAVE1:{time:"11:25",area:"DOWNSTAIRS HOLDING"},WAVE2:{time:"11:35",area:"UPSTAIRS PARKING"}};
  assert.deepEqual(dzm1ParkingForWave("WAVE1",custom),{time:"11:25",area:"DOWNSTAIRS HOLDING"});
  assert.deepEqual(dzm1ParkingForWave("WAVE2",custom),{time:"11:35",area:"UPSTAIRS PARKING"});
  assert.equal(DZM1_PARKING_DEFAULTS.WAVE1.time,"11:20");
  assert.equal(dzm1ParkingForWave("WAVE1",{WAVE1:{time:"invalid",area:"UNKNOWN"}}).time,"11:20");
  assert.equal(dzm1ParkingForWave("WAVE2",{WAVE2:{time:"99:99",area:"UNKNOWN"}}).area,"DOWNSTAIRS HOLDING");
  assert.equal(dzm1ParkingForWave("WAVE3"),null,"new waves must not receive invented parking times");
});
test("DZM1 edit controls and per-wave PNG display include parking instructions",()=>{
  const source=view();
  assert.ok(source.includes('norm(site)==="DZM1"&&dzm1ParkingForWave(selectedDehWave.wave,dzm1ParkingOverrides)'));
  assert.ok(source.includes('aria-label={`Parking time for ${waveLabel(selectedDehWave.wave)}`}'));
  assert.ok(source.includes('aria-label={`Parking area for ${waveLabel(selectedDehWave.wave)}`}'));
  assert.ok(source.includes('changeDzm1Parking(selectedDehWave.wave,"time",e.target.value)'));
  assert.ok(source.includes('changeDzm1Parking(selectedDehWave.wave,"area",e.target.value)'));
  assert.ok(source.includes('PARK {parking.time} · {parking.area}'));
  assert.ok(source.includes('const [')===false||source.includes('[dzm1ParkingOverrides,setDzm1ParkingOverrides]=useState({})'));
  assert.ok(source.includes('setDzm1ParkingOverrides({})'),"parking edits should reset on site change / clear");
});
test("DZM1 parking is independent of route lanes, loading time and other stations",()=>{
  const source=view();
  assert.ok(source.includes('norm(site)==="DZM1"?dzm1ParkingForWave(wave,dzm1ParkingOverrides):null'));
  assert.ok(source.includes('shownLoad=dehDisplayTime(wave,"load",time)'));
  assert.ok(source.includes('r.staging?.replace(/^STG-/i,"")'));
  assert.ok(source.includes('const stg=norm(site)==="DZM1"?"NO-STAGING"'));
  assert.ok(source.includes('direct?amazon:adjustTime(amazon,adjust)'));
  assert.ok(source.includes('norm(site)==="DEH1"?await deh1ImageRows'));
  assert.equal(source.includes("supabase.from(\"dzm1Parking\""),false,"the parking settings must remain local only");
});
