import { TARGETS } from "../config/performance.js";
import { displayDriverName } from "../identity.js";

export const num = (value) =>
  value == null || value === "" || Number.isNaN(Number(value))
    ? null
    : Number(value);

export const pct = (value, digits = 2) =>
  num(value) == null ? "—" : `${Number(value).toFixed(digits)}%`;

export const plain = (value, digits = 0) =>
  num(value) == null ? "—" : Number(value).toFixed(digits);

export const weekSort = (a, b) =>
  (Number(b.year || 0) * 100 + Number(b.week || 0)) -
  (Number(a.year || 0) * 100 + Number(a.week || 0));

export function indexFor(row) {
  const parts = [];

  if (num(row.dcr) != null) {
    parts.push(Math.min(105, (Number(row.dcr) / TARGETS.dcr) * 100));
  }
  if (num(row.pod) != null) {
    parts.push(Math.min(105, (Number(row.pod) / TARGETS.pod) * 100));
  }
  if (num(row.iadc) != null) {
    parts.push(Math.min(105, (Number(row.iadc) / TARGETS.iadc) * 100));
  }

  const mentor = num(row.mentor_score ?? row.ementor ?? row.fico);
  if (mentor != null) {
    parts.push(Math.min(105, (mentor / TARGETS.mentor) * 100));
  }

  return parts.length >= 2
    ? parts.reduce((sum, value) => sum + value, 0) / parts.length
    : num(row.performance);
}

export function tierForIndex(value) {
  const numeric = num(value);

  if (numeric == null) {
    return { label: "Insufficient data", cls: "neutral" };
  }
  if (numeric >= 100) return { label: "Strong", cls: "good" };
  if (numeric >= 96) return { label: "Stable", cls: "good" };
  if (numeric >= 90) return { label: "Watch", cls: "warn" };
  return { label: "Priority", cls: "bad" };
}

export function driverShape(row) {
  const driver = row.drivers || {};
  const mentor = num(row.mentor_score ?? row.ementor ?? row.fico);

  return {
    id: driver.trid,
    dbId: row.driver_id,
    name: displayDriverName(driver),
    site: driver.site,
    status: driver.status || "active",
    performance: num(row.performance),
    dcr: num(row.dcr),
    pod: num(row.pod),
    iadc: num(row.iadc),
    cc: num(row.cc),
    fico: mentor,
    ementor: mentor,
    mentor_score: mentor,
    concessions: num(row.concessions),
    lor: num(row.lor),
    psb: num(row.psb),
    risk: row.risk || "Low",
    issue: row.issue || "No active concern",
    weekLabel: row.week_label,
    dataConfidence: num(row.data_confidence),
  };
}
