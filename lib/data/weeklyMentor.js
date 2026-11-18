// One shared source of weekly FICO. Never use daily or another site's evidence.
export function weeklyMentorEvidence(row) {
  if (!row || !/^W\d{1,2}$/i.test(String(row.week_label || ""))) return null;
  const raw = row.raw_data || {};
  if (String(raw.metric_granularity || "").toLowerCase() === "daily") return null;
  const explicit = raw.weekly_mentor;
  const site = String(row.site || "").trim().toUpperCase();
  const year = String(row.period_end || row.period_start || "").slice(0,4);
  if (!site || !/^\d{4}$/.test(year)) return null;
  if (explicit) {
    if (explicit.site !== site || explicit.week !== row.week_label || String(explicit.year)!==year || explicit.conflict) return null;
    const score = Number(explicit.score);
    return explicit.score != null && Number.isFinite(score) && score >= 0 && score <= 850 ? explicit : null;
  }
  const details = raw.mentor;
  const hasDetails = details && typeof details === "object" && (details.identityKey || details.acceleration || details.braking || details.cornering || details.distraction || details.speedingRisk);
  if (!hasDetails) return null;
  const station = String(details.station || "").trim().toUpperCase();
  if (station && station !== site) return null;
  const value = row.mentor_score ?? row.ementor ?? row.fico;
  const score = Number(value);
  if (value == null || !Number.isFinite(score) || score < 0 || score > 850) return null;
  return {score,site,year,week:row.week_label,details};
}

export function applyWeeklyMentor(row) {
  const evidence = weeklyMentorEvidence(row);
  if (!evidence) return row;
  return {...row,mentor_score:evidence.score,ementor:evidence.score,fico:evidence.score,raw_data:{...row.raw_data,mentor:evidence.details||row.raw_data?.mentor}};
}
