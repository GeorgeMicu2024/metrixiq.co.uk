// DZM1 has two parking / holding areas. These are meeting times, distinct
// from Amazon's Wave Plan LOAD TIME and from individual route lane codes.
export const DZM1_PARKING_DEFAULTS = Object.freeze({
  WAVE1: Object.freeze({ time: "11:20", area: "UPSTAIRS PARKING" }),
  WAVE2: Object.freeze({ time: "11:40", area: "DOWNSTAIRS HOLDING" }),
});

export const DZM1_PARKING_AREAS = Object.freeze([
  "UPSTAIRS PARKING",
  "DOWNSTAIRS HOLDING",
]);

// The approved DZM1 sequence: 1st Floor -> 10 min -> 0 Floor Holding
// -> 15 min -> Load. These are dispatch display times, not imported route data.
export function dzm1ShiftTime(time, deltaMinutes) {
  const match=String(time||"").match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if(!match)return "";
  const total=(Number(match[1])*60+Number(match[2])+deltaMinutes+1440)%1440;
  return String(Math.floor(total/60)).padStart(2,"0")+":"+String(total%60).padStart(2,"0");
}

// Convert whichever editable DZM1 stage was changed back to the shared
// 1st-floor meeting time. Never commit incomplete/invalid native time input.
export function dzm1ParkingStartFromEditedTime(field, time) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(time || ""))) return "";
  const offset = field === "parking" ? 0 : field === "holding" ? -10 : field === "load" ? -25 : null;
  return offset === null ? "" : dzm1ShiftTime(time, offset);
}

// A full-site XLSX may use real Wave 12 (or other wave numbers).
// Derive its default parking from its actual Wave Start, not a fixed or
// invented schedule. Old WAVE1/WAVE2 defaults remain unchanged.
export function dzm1WaveStart24(value) {
  const s=String(value||"").trim().toUpperCase();
  const m=/^([01]?\d|2[0-3]):([0-5]\d)(?:\s*(AM|PM))?$/.exec(s);
  if(!m)return "";
  let hours=Number(m[1]);
  if(m[3]){
    if(hours<1||hours>12)return "";
    if(m[3]==="PM"&&hours<12)hours+=12;
    if(m[3]==="AM"&&hours===12)hours=0;
  }
  return String(hours).padStart(2,"0")+":"+m[2];
}
export function dzm1ParkingForWave(wave, overrides = {}, sourceWaveStart = "") {
  const canonical=String(wave||"").toUpperCase();
  const sourceStart=dzm1WaveStart24(sourceWaveStart);
  const derivedStart=sourceStart?dzm1ShiftTime(sourceStart,-25):"";
  const defaults = DZM1_PARKING_DEFAULTS[canonical]||(derivedStart?{time:derivedStart,area:"UPSTAIRS PARKING"}:null);
  if (!defaults) return null;
  const current = overrides[String(wave).toUpperCase()] || {};
  const validTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(current.time || "");
  const time=validTime ? current.time : defaults.time;
  return {
    time,
    holdingTime: dzm1ShiftTime(time, 10),
    loadTime: dzm1ShiftTime(time, 25),
    area: DZM1_PARKING_AREAS.includes(current.area) ? current.area : defaults.area,
  };
}
