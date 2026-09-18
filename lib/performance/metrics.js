import { displayDriverName } from "../identity.js";
import { TARGETS } from "../config/performance.js";

export const n = (value) =>
  value == null || value === "" || Number.isNaN(Number(value))
    ? null
    : Number(value);

export const fmtPct = (value, digits = 2) =>
  n(value) == null ? "—" : `${Number(value).toFixed(digits)}%`;

export const fmtNum = (value, digits = 0) =>
  n(value) == null ? "—" : Number(value).toFixed(digits);

export const weekNumber = (label) =>
  Number(String(label || "").replace(/\D/g, "")) || 0;

export const periodKey = (row) =>
  row.week_label || row.period_end || row.period_start || "Unknown";

export function resolvedName(driver) {
  const name = displayDriverName(driver);
  return name === "Unresolved identity" ? "Unresolved driver" : name;
}

export function mentorScore(row) {
  return n(row?.mentor_score) ?? n(row?.ementor) ?? n(row?.fico);
}

export function targetFor(metric) {
  if (metric === "dcr") return TARGETS.dcr;
  if (metric === "pod") return TARGETS.pod;
  if (metric === "iadc") return TARGETS.iadc;
  if (metric === "mentor") return TARGETS.mentor;
  if (metric === "cc") return TARGETS.cc;
  return null;
}

export function average(values) {
  const clean = values.map(n).filter((value) => value != null);
  return clean.length
    ? clean.reduce((sum, value) => sum + value, 0) / clean.length
    : null;
}

export function driverIndex(row) {
  const values = [];

  if (n(row.dcr) != null) {
    values.push(Math.min(105, (Number(row.dcr) / TARGETS.dcr) * 100));
  }
  if (n(row.pod) != null) {
    values.push(Math.min(105, (Number(row.pod) / TARGETS.pod) * 100));
  }
  if (n(row.iadc) != null) {
    values.push(Math.min(105, (Number(row.iadc) / TARGETS.iadc) * 100));
  }

  const mentor = mentorScore(row);
  if (mentor != null) {
    values.push(Math.min(105, (mentor / TARGETS.mentor) * 100));
  }

  return values.length >= 2
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : n(row.performance);
}

export function metricStatus(metric, value) {
  const numericValue = n(value);
  if (numericValue == null) return "neutral";

  const target = targetFor(metric);
  if (target == null) return "neutral";

  return numericValue >= target
    ? "good"
    : numericValue >= target * 0.97
      ? "warn"
      : "bad";
}
