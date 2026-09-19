function n(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildConcessionsSignals({
  ranking = [],
  weeks = [],
  presentSet = new Set(),
  weekTotals = [],
}) {
  const importedWeeks = weeks.filter((week) => presentSet.has(week));
  const latestWeek = importedWeeks.at(-1) || "";
  const previousWeek = importedWeeks.at(-2) || "";
  const latestIndex = weeks.indexOf(latestWeek);
  const previousIndex = weeks.indexOf(previousWeek);
  const latestTotal = latestIndex >= 0 ? n(weekTotals[latestIndex]) : null;
  const previousTotal = previousIndex >= 0 ? n(weekTotals[previousIndex]) : null;
  const wow = latestTotal != null && previousTotal != null ? latestTotal - previousTotal : null;
  const wowPct = wow != null && previousTotal > 0 ? Math.round((wow / previousTotal) * 100) : null;

  const repeatOffenders = ranking
    .filter((item) => Number(item?.affected || 0) >= 2 && Number(item?.total || 0) > 0)
    .sort((a, b) =>
      Number(b.affected || 0) - Number(a.affected || 0) ||
      Number(b.total || 0) - Number(a.total || 0)
    );

  const missingWeeks = weeks.filter((week) => !presentSet.has(week));
  const latestAffected = latestWeek
    ? ranking.filter((item) => Number(item?.byWeek?.[latestWeek] || 0) > 0).length
    : 0;

  const managementActions = [];

  if (repeatOffenders.length) {
    managementActions.push({
      id: "repeat",
      severity: "high",
      title: "Coach " + repeatOffenders.length + " repeat concession driver" + (repeatOffenders.length === 1 ? "" : "s"),
      text: "Prioritise drivers affected in two or more imported weeks and review recurring POD/customer-contact patterns.",
    });
  }

  if (wow != null && wow > 0) {
    managementActions.push({
      id: "increase",
      severity: "high",
      title: "Investigate " + latestWeek + " concession increase",
      text: latestWeek + " increased by " + wow + (wowPct == null ? "" : " (" + wowPct + "%)") + " versus " + previousWeek + ". Review the highest contributors first.",
    });
  } else if (wow != null && wow < 0) {
    managementActions.push({
      id: "improving",
      severity: "good",
      title: "Protect the improving weekly trend",
      text: latestWeek + " improved by " + Math.abs(wow) + " concessions versus " + previousWeek + ". Reinforce the workflows used by the strongest drivers.",
    });
  }

  if (missingWeeks.length) {
    managementActions.push({
      id: "missing",
      severity: "medium",
      title: "Close " + missingWeeks.length + " reporting gap" + (missingWeeks.length === 1 ? "" : "s"),
      text: "Missing concession evidence: " + missingWeeks.join(", ") + ". Import the missing report before making period-level comparisons.",
    });
  }

  if (!managementActions.length) {
    managementActions.push({
      id: "stable",
      severity: "good",
      title: "Maintain current concession control",
      text: "No repeat-driver escalation, weekly increase or reporting gap is active in the selected period.",
    });
  }

  return {
    importedWeeks,
    latestWeek,
    previousWeek,
    latestTotal,
    previousTotal,
    latestAffected,
    wow,
    wowPct,
    trend: wow == null ? "insufficient" : wow > 0 ? "worse" : wow < 0 ? "improving" : "stable",
    repeatOffenders,
    missingWeeks,
    managementActions,
  };
}