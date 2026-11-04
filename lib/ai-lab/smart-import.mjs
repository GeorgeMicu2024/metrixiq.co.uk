// Browser-only classification hints. Never approves or rewrites a layout automatically.
function heading(value) {
  return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const HINTS = [
  ["route", [["trid", 4], ["transporter id", 4], ["driver name", 4], ["da name", 3], ["route code", 2], ["route id", 2], ["route plan", 3]]],
  ["wave", [["wave", 4], ["wave number", 4], ["staging", 4], ["loading", 3], ["load time", 3], ["holding", 3], ["parking", 3]]],
  ["performance", [["dcr", 4], ["iadc", 4], ["pod", 4], ["cdf", 4], ["concession", 4], ["scorecard", 4]]],
];

export function classifyAmazonReport(matrix, filename = "") {
  const headers = (Array.isArray(matrix) ? matrix.slice(0, 24) : [])
    .flatMap(row => Array.isArray(row) ? row.slice(0, 40) : []).map(heading).filter(Boolean);
  const name = heading(filename);
  const scores = Object.fromEntries(HINTS.map(([kind]) => [kind, 0]));
  const reasons = Object.fromEntries(HINTS.map(([kind]) => [kind, []]));

  for (const [kind, hints] of HINTS) {
    for (const [phrase, points] of hints) {
      const found = headers.some(header => header === phrase || header.startsWith(phrase + " ") || header.endsWith(" " + phrase));
      if (found) { scores[kind] += points; reasons[kind].push(phrase); }
    }
    if (name.includes(kind === "performance" ? "scorecard" : kind + " plan")) {
      scores[kind] += 2;
      reasons[kind].push("filename");
    }
  }
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [best, score] = ranked[0];
  const second = ranked[1][1];
  if (score < 4 || score - second < 2) return {
    kind: "unknown", confidence: 0, suggestedSlot: null, reasons: [],
    message: "Format not recognised confidently. Verify the columns manually.",
  };
  return {
    kind: best, confidence: score >= 9 && score - second >= 4 ? 90 : 70,
    suggestedSlot: best === "route" || best === "wave" ? best : null,
    reasons: reasons[best].slice(0, 5),
    message: best === "performance" ? "Performance report detected; use the AI chat performance uploader."
      : best === "route" ? "Likely Route Plan. Verify Route ID / TRID mappings before approval."
      : "Likely Wave Plan. Verify wave, staging and loading columns before approval.",
  };
}
