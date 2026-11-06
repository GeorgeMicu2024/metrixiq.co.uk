// Local-on-open Morning Briefing. No background messages or scheduled writes.
import { buildDataDoctor } from "./data-doctor.mjs";

export function buildMorningBriefing(snapshot) {
  const doctor = buildDataDoctor(snapshot);
  const notes = [];
  if (snapshot.mismatch) notes.push({ id: "lor", severity: "review",
    title: "Review the Lost on Road discrepancy",
    evidence: "The available individual weekly LoR values do not align with the positive DSP Scorecard metric.",
    next: "Compare official Amazon metric definitions and source reports." });
  const dcr = snapshot.official?.metrics?.dcr;
  const iadc = snapshot.driverMetrics?.stats?.iadc;
  if (iadc?.mean !== null && iadc?.mean !== undefined && iadc.mean < 80 && iadc.numericRows > 0) notes.push({
    id: "iadc", severity: "review", title: "Check IADC against the 80% coaching reference",
    evidence: `Unweighted weekly IADC mean ${iadc.mean}% across ${iadc.numericRows} records.`,
    next: "Inspect customer contact instructions and Notify on Arrival evidence; not an official score." });
  if (dcr?.value !== null && dcr?.value !== undefined && dcr.value < 99.2) notes.push({
    id: "dcr", severity: "review", title: "Verify DCR source eligibility",
    evidence: `Official DSP DCR ${dcr.value}%. The 99.2% level is a review reference, not a score recalculation.`,
    next: "Review missing/OOR shipments, return classification and approved site exceptions." });
  notes.push(...doctor.issues.filter(issue => issue.severity === "high").map(issue => ({
    id: "quality_" + issue.code, severity: "high", title: issue.title,
    evidence: issue.evidence, next: issue.action })));
  if (!notes.length) notes.push({ id: "review", severity: "info", title: "Check the latest source reports",
    evidence: "No supported high-priority signal was found in this selected imported reporting week.",
    next: "Review the official Scorecard and latest station operational updates manually." });
  return { title: "Morning Operations Briefing", site: snapshot.site, period: `W${snapshot.week}`, year: snapshot.year,
    sourceLabel: "Latest selected imported weekly records · generated on opening AI Lab · not live dispatch",
    priorities: notes.slice(0, 4), quality: doctor.counts,
    caution: "Never interpret an absent signal as an all-clear. No alerts are sent or operational changes made." };
}
