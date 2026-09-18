export const numberOrNull = (value) =>
  value == null || value === "" || Number.isNaN(Number(value)) ? null : Number(value);

export function fmt(value, key) {
  const v = numberOrNull(value);
  if (v == null) return "—";
  if (["dcr", "pod", "iadc", "cc", "psb", "reattempts"].includes(key)) return `${v.toFixed(1)}%`;
  if (["concessions", "lor"].includes(key)) return v.toFixed(2);
  return Math.round(v).toString();
}

export function tone(risk) {
  return risk === "High" ? "risk-high" : risk === "Medium" ? "risk-medium" : "risk-low";
}

export function initials(name = "") {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "DA";
}

export function avg(rows, key) {
  const values = rows.map((row) => numberOrNull(row[key])).filter((value) => value != null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}
