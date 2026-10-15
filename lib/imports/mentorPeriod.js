import { isoWeekDetails, isoWeekFromDate } from "../analyzer/core.js";

export function dateFromFileName(name) {
  const match = String(name || "").match(/(?:^|[^0-9])(20\d{2})[-_.](\d{2})[-_.](\d{2})(?!\d)/);
  if (!match) return "";
  const value = match[1] + "-" + match[2] + "-" + match[3];
  const date = new Date(value + "T12:00:00Z");
  return Number.isNaN(date.getTime()) ? "" : value;
}

export function weekInputFromDate(value) {
  const date = new Date(String(value || "") + "T12:00:00Z");
  if (Number.isNaN(date.getTime())) return "";
  const period = isoWeekFromDate(date);
  return String(period.year) + "-W" + String(period.week).padStart(2, "0");
}

export function periodFromWeekInput(value) {
  const match = String(value || "").match(/^(20\d{2})-W(\d{2})$/i);
  if (!match) return null;
  const year = Number(match[1]);
  const week = Number(match[2]);
  return week >= 1 && week <= 53 ? isoWeekDetails(year, week) : null;
}

function reportTypes(item) {
  return String(item?.reportType || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function prepareMentorAnalysis(result, mode, reportDate, targetWeek) {
  const recognised = (result?.fileResults || []).filter((item) => item.recognized);
  const hasMentor = recognised.some((item) => reportTypes(item).some((type) => type.includes("mentor")));
  const nonMentor = recognised.filter((item) => {
    const types = reportTypes(item);
    return types.length && !types.some((type) => type.includes("mentor"));
  });

  if (!hasMentor) throw new Error("This import mode is for eMentor / Driver Report files only.");
  if (nonMentor.length) throw new Error("Upload eMentor files separately when using Daily or Weekly eMentor mode.");

  if (mode === "daily") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(reportDate || ""))) {
      throw new Error("Choose the date represented by this eMentor report.");
    }
    const period = isoWeekFromDate(new Date(reportDate + "T12:00:00Z"));
    return {
      ...result,
      fileResults: (result.fileResults || []).map((item) => item.recognized ? { ...item, period } : item),
      periods: (result.periods || []).map((item) => ({ ...item, ...period })),
      importContext: { type: "mentor-daily", reportDate, weekLabel: period.weekLabel },
    };
  }

  const mentorPerformanceFiles = recognised.filter((item) => reportTypes(item).includes("mentor"));
  const inferredWeeks = mentorPerformanceFiles
    .map((item) => item?.period)
    .filter((period) => period?.weekLabel && period?.periodStart && period?.periodEnd);
  const distinctWeeks = new Set(inferredWeeks.map((period) => period.key || period.weekLabel));
  const autoMultiWeek =
    mentorPerformanceFiles.length > 1 &&
    inferredWeeks.length === mentorPerformanceFiles.length &&
    distinctWeeks.size > 1;

  // A weekly batch can contain several dated Driver Reports. In that case the
  // filename-derived ISO week on each file is authoritative. Never collapse
  // all files onto the one week currently shown in the UI.
  if (autoMultiWeek) {
    return {
      ...result,
      importContext: {
        type: "mentor-weekly",
        targetWeek: null,
        weekLabel: null,
        autoWeekByFile: true,
        detectedWeeks: [...distinctWeeks],
      },
    };
  }

  const period = periodFromWeekInput(targetWeek);
  if (!period) throw new Error("Choose the scorecard week for this weekly eMentor report.");

  return {
    ...result,
    fileResults: (result.fileResults || []).map((item) => item.recognized ? { ...item, period } : item),
    periods: (result.periods || []).map((item) => ({ ...item, ...period })),
    importContext: { type: "mentor-weekly", targetWeek, weekLabel: period.weekLabel },
  };
}
