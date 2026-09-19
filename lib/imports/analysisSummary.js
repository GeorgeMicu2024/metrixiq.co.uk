function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function uniqueReportTypes(fileResults = []) {
  const result = new Set();

  for (const file of fileResults) {
    for (const type of String(file?.reportType || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)) {
      if (type !== "unknown") result.add(type);
    }
  }

  return [...result];
}

export function buildImportIntelligence(analysis) {
  if (!analysis) {
    return {
      readiness: 0,
      tone: "neutral",
      label: "No analysis yet",
      reportTypes: [],
      strengths: [],
      actions: [],
    };
  }

  const files = analysis.fileResults || [];
  const totalFiles = Math.max(1, files.length);
  const recognised = Number(analysis.recognizedFiles || 0);
  const errors = Number(analysis.errorFiles || 0);
  const unsupported = Number(analysis.unsupportedFiles || 0);
  const driverCount = Number(analysis.driverCount || 0);
  const unmatched = Number(analysis.unmatchedDrivers || 0);
  const periods = analysis.periods?.length || 0;

  const recognisedScore = (recognised / totalFiles) * 45;
  const cleanScore = ((totalFiles - errors - unsupported) / totalFiles) * 20;
  const identityScore = driverCount
    ? ((driverCount - unmatched) / driverCount) * 25
    : recognised
      ? 10
      : 0;
  const historyScore = periods >= 2 ? 10 : periods === 1 ? 6 : 0;

  const readiness = Math.round(clamp(
    recognisedScore + cleanScore + identityScore + historyScore
  ));

  const reportTypes = uniqueReportTypes(files);
  const strengths = [];
  const actions = [];

  if (recognised === totalFiles && totalFiles > 0) {
    strengths.push("All selected files were recognised.");
  } else if (recognised > 0) {
    strengths.push(`${recognised} of ${totalFiles} files were recognised.`);
  }

  if (unmatched === 0 && driverCount > 0) {
    strengths.push("Driver identity coverage is complete.");
  }

  if (periods >= 2) {
    strengths.push(`${periods} reporting periods are available for trend analysis.`);
  }

  if (errors > 0) {
    actions.push(`Review ${errors} file${errors === 1 ? "" : "s"} that failed to parse.`);
  }

  if (unsupported > 0) {
    actions.push(`Replace or convert ${unsupported} unsupported file${unsupported === 1 ? "" : "s"}.`);
  }

  if (unmatched > 0) {
    actions.push(`Resolve ${unmatched} unmatched driver identit${unmatched === 1 ? "y" : "ies"} in Data Quality.`);
  }

  if (periods < 2 && recognised > 0) {
    actions.push("Import another reporting period to unlock meaningful trend analysis.");
  }

  if (!actions.length && recognised > 0) {
    actions.push("Data is ready for scorecards, coaching and performance review.");
  }

  const tone = readiness >= 85 ? "good" : readiness >= 65 ? "warn" : "bad";
  const label = readiness >= 85
    ? "High confidence"
    : readiness >= 65
      ? "Usable with review"
      : "Needs attention";

  return {
    readiness,
    tone,
    label,
    reportTypes,
    strengths,
    actions,
  };
}
