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

// Do not assign a guessed parking time to a new/unknown wave.
export function dzm1ParkingForWave(wave, overrides = {}) {
  const defaults = DZM1_PARKING_DEFAULTS[String(wave || "").toUpperCase()];
  if (!defaults) return null;
  const current = overrides[String(wave).toUpperCase()] || {};
  const validTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(current.time || "");
  return {
    time: validTime ? current.time : defaults.time,
    area: DZM1_PARKING_AREAS.includes(current.area) ? current.area : defaults.area,
  };
}
