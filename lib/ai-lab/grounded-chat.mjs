// Browser-side evidence preview. It never calls an AI provider or grants data access.
const SITE = /^[A-Z0-9]{3,6}$/;
const METRICS = [
  ["dcr", "DCR"], ["iadc", "IADC"], ["pod", "POD"], ["psb", "PSB"],
  ["lor", "Lost on Road"], ["cdf_dpmo", "CDF DPMO"],
];

export function connectedEvidence(raw) {
  if (typeof raw !== "string" || raw.length > 6500) return null;
  let value;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!value || !String(value.source || "").startsWith("Super Admin-approved Connected 360°") ||
      !SITE.test(value.site || "") || !Number.isInteger(value.year) ||
      !Number.isInteger(value.week) || value.week < 1 || value.week > 53) return null;
  const score = value.official?.overallScore;
  const parsedScore = score == null || score === "" ? null : Number(score);
  const prior = value.previousOfficial;
  const priorScore = prior?.overallScore == null ? null : Number(prior.overallScore);
  const metricChanges = METRICS.flatMap(([key, name]) => {
    const currentRaw = value.official?.metrics?.[key]?.value;
    const previousRaw = prior?.metrics?.[key]?.value;
    if (currentRaw == null || previousRaw == null || currentRaw === "" || previousRaw === "") return [];
    const current = Number(currentRaw), previousValue = Number(previousRaw);
    if (!Number.isFinite(current) || !Number.isFinite(previousValue) || current === previousValue) return [];
    return [{ name, before: previousValue, after: current,
      delta: Math.round((current - previousValue) * 100) / 100,
      unit: key === "dcr" || key === "iadc" || key === "pod" ? "pp" : key === "lor" || key === "cdf_dpmo" ? "DPMO" : "" }];
  });
  const previous = prior && Number.isInteger(prior.year) && Number.isInteger(prior.week) &&
    Number.isFinite(priorScore) ? { year: prior.year, week: prior.week, score: priorScore } : null;
  return {
    site: value.site, year: value.year, week: value.week,
    score: Number.isFinite(parsedScore) ? parsedScore : null,
    tier: String(value.official?.tier || "").slice(0, 35),
    previous, metricChanges,
    metrics: METRICS.flatMap(([key, name]) => {
      const entry = value.official?.metrics?.[key];
      return entry?.value == null || entry.value === "" ? [] : [{ name, value: String(entry.value).slice(0, 24) }];
    }),
    priorities: (Array.isArray(value.priorities) ? value.priorities : []).slice(0, 3)
      .map(row => ({ title: String(row.title || "").slice(0, 90), evidence: String(row.evidence || "").slice(0, 220) }))
      .filter(row => row.title && row.evidence),
    partial: value.coverage?.partial === true,
  };
}

export function needsStationEvidence(question) {
  const q = String(question || "").trim();
  if (!q) return false;
  const personal = /\b(my|our|ours|we|us|at our|for us|for my)\b/i.test(q);
  const station = /\b(?:D[A-Z0-9]{3,4})\b/i.test(q);
  const time = /\b(today|tonight|this week|last week|latest|current|yesterday|recent|W\d{1,2}|week\s*\d{1,2})\b/i.test(q);
  const focus = /\b(scorecard|score|standing|performance|trend|drop|decline|increase|improvement|ranking|rank|DCR|POD|IADC|CDF|PSB|LoR|lost on road|concession|DNR|metric|priority|priorities|issue|problem|risk|result|report|briefing|status|summary)\b/i.test(q) ||
    /\b(how many drivers|drivers below|drivers under|no trip recorded)\b/i.test(q) ||
    /\b(what happened|what's happening|how is|how's|tell me about|give me an update|what should we do|anything wrong)\b/i.test(q);
  if (/^\s*(what (?:is|does|are)|define|explain (?:the )?meaning of)\b/i.test(q) && !personal && !station && !time) return false;
  return focus && (personal || station || time || /\b(compare|why|analyse|analyze|investigate|show me|how many|how much)\b/i.test(q)) ||
    /\b(what should i focus on|what needs attention|how are we doing|how did we do|give me an action plan|prioritise fixes|based on our last performance|based on these figures)\b/i.test(q);
}

export function localEvidenceAnswer(raw) {
  const data = connectedEvidence(raw);
  if (!data) return "I don't have a verified station report attached. Open Intelligence → Daily Briefing and select an authorised station and official reporting week. I won't guess your results.";
  const score = data.score == null ? "not available" : `${data.score.toFixed(2)} (${data.tier || "tier unavailable"})`;
  const lines = [`**Verified MetrixIQ data · ${data.site} · W${data.week} ${data.year}**`,
    `Official DSP score: ${score}.`];
  if (data.previous && data.score != null) {
    const delta = Math.round((data.score - data.previous.score) * 100) / 100;
    lines.push(`Previous available scorecard: W${data.previous.week} ${data.previous.year} — ${data.previous.score.toFixed(2)}. Change: ${delta > 0 ? "+" : ""}${delta.toFixed(2)} points.`);
  }
  if (data.previous && data.metricChanges.length) lines.push("Comparable official metric changes vs W" + data.previous.week + ": " +
    data.metricChanges.slice(0, 5).map(item => `${item.name} ${item.before} → ${item.after} (${item.delta > 0 ? "+" : ""}${item.delta}${item.unit ? " " + item.unit : ""})`).join(" · ") + ". These are observed changes, not a calculated attribution of the overall score.");
  if (data.metrics.length) lines.push(`Official metrics in this report: ${data.metrics.slice(0, 6).map(item => `${item.name} ${item.value}`).join(" · ")}.`);
  if (data.priorities.length) lines.push("Evidence-backed checks:\n" + data.priorities.slice(0, 2).map(item => `• ${item.title}: ${item.evidence}`).join("\n"));
  if (data.partial) lines.push("Source coverage is partial; do not treat missing records as zeros.");
  lines.push("This summary stays inside MetrixIQ. To discuss these figures with IQ, enable **Use verified report data in IQ answers** below the chat, then press Send again. Your question is still in the message box.");
  return lines.join("\n\n");
}
