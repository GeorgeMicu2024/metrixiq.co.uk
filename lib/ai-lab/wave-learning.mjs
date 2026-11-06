// Explicitly approved AI Lab mapping corrections, never source rows or raw names.
const FIELDS = new Set(["route", "driver", "trid", "wave", "staging", "parking", "holding", "loading"]);
export function captureWaveLearning(suggested, approved) {
  const changes = [];
  const allowed = new Set();
  for (const [field, value] of Object.entries(approved || {})) {
    if (!FIELDS.has(field) || !Number.isInteger(value) || value < 0 || value >= 50 || allowed.has(value)) continue;
    allowed.add(value);
    const before = suggested?.[field];
    if (before !== value) changes.push({ field, from: Number.isInteger(before) && before >= 0 && before < 50 ? before : null, to: value });
  }
  return { correctedFields: changes.length, corrections: changes.slice(0, 8),
    reviewed: true, learningMethod: "Human-approved column mapping" };
}
