import { isUsablePersonName } from "../identity";

const numberOrNull = (value) =>
  value == null || value === "" || Number.isNaN(Number(value)) ? null : Number(value);

function initials(name = "") {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "DA"
  );
}

export function mapScorecardRow(row) {
  const mentor = numberOrNull(row.mentor_score ?? row.ementor ?? row.fico);
  const name = isUsablePersonName(row.full_name) ? row.full_name : "Unresolved identity";

  return {
    id: row.trid,
    dbId: row.driver_id,
    name,
    initials: initials(name),
    site: row.site,
    status: row.status,
    performance: numberOrNull(row.performance),
    dcr: numberOrNull(row.dcr),
    pod: numberOrNull(row.pod),
    iadc: numberOrNull(row.iadc),
    cc: numberOrNull(row.cc),
    fico: mentor,
    ementor: mentor,
    mentor_score: mentor,
    psb: numberOrNull(row.psb),
    reattempts: numberOrNull(row.reattempts),
    concessions: numberOrNull(row.concessions),
    lor: numberOrNull(row.lor),
    delivered: numberOrNull(row.delivered),
    dnr_dpmo: numberOrNull(row.dnr_dpmo),
    dsc_dpmo: numberOrNull(row.dsc_dpmo),
    ce_dpmo: numberOrNull(row.ce_dpmo),
    cdf_dpmo: numberOrNull(row.cdf_dpmo),
    scorecard_score: numberOrNull(row.scorecard_score),
    tier: row.tier,
    risk: row.risk || "Low",
    issue: row.issue || "No active concern",
    dataConfidence: numberOrNull(row.data_confidence),
    weekLabel: row.week_label,
    rawData: row.raw_data || {},
  };
}
