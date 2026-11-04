// Isolated AI Lab V2 helpers. No database access, network calls, arbitrary code execution or writes.

const METRICS = Object.freeze({
  dcr: { label: "DCR", aliases: ["dcr", "delivery completion", "completion rate"], higherBetter: true, unit: "%" },
  pod: { label: "POD", aliases: ["pod", "photo on delivery", "photo"], higherBetter: true, unit: "%" },
  iadc: { label: "IADC", aliases: ["iadc", "in app", "in-app"], higherBetter: true, unit: "%" },
  cdf_dpmo: { label: "CDF DPMO", aliases: ["cdf", "customer delivery feedback", "feedback", "customer complaints"], higherBetter: false, unit: " DPMO" },
  concessions: { label: "Concessions", aliases: ["concessions", "concesii", "concesiile", "dnr", "did not receive"], higherBetter: false, unit: "" },
});

const safe = value => String(value || "").replace(/[\u0000-\u001f]/g, " ").trim();
const flatten = value => safe(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const pName = value => /^W(?:[1-9]|[1-4][0-9]|5[0-3])(?::20\d{2}-\d{2}-\d{2})?$/.test(value);

export function investigateBrain(snapshot, question) {
  if (!snapshot || !Array.isArray(snapshot.series) || !snapshot.series.length) throw new Error("Analyse your authorised reports first.");
  const query = flatten(question);
  if (query.length < 5 || query.length > 500) throw new Error("Ask a question between 5 and 500 characters.");
  const requested = Object.keys(METRICS).filter(key => METRICS[key].aliases.some(alias => query.includes(alias)));
  const keys = requested.length ? requested : Object.keys(METRICS);
  const matches = [...safe(question).toUpperCase().matchAll(/\bW(?:[1-9]|[1-4][0-9]|5[0-3])\b/g)].map(row => row[0]);
  const driverQuestion = /\bcine\b|\bsofer|\bdriver|\bwho\b/.test(query);
  const comparisonQuestion = /de ce|why|scaz|cresc|trend|compara|difference|changed|evolut|worse|improv/.test(query);
  let periods = matches.length ? snapshot.series.filter(item => matches.includes(item.period)) : snapshot.series;
  if (!periods.length) return { title: "Period not loaded", answer: "The requested Amazon week is not among the authorised periods currently loaded.", evidence: [], limitations: "Load that week in AI Brain first.", context: "" };
  if (comparisonQuestion && matches.length === 1 && periods.length === 1) {
    const index = snapshot.series.indexOf(periods[0]);
    if (index > 0) periods = [snapshot.series[index - 1], periods[0]];
  }
  const evidence = [];
  for (const key of keys) {
    const metric = METRICS[key];
    for (const item of periods) {
      const value = item.metrics?.[key];
      if (value?.mean === null || !Number.isFinite(value?.mean) || !Number.isInteger(value.rows) || value.rows < 1) continue;
      evidence.push({ metric: metric.label, period: item.period, mean: value.mean, numericRows: value.rows,
        source: "driver_metrics · RLS-scoped", unit: metric.unit });
    }
  }
  const changes = [];
  for (const key of keys) {
    const values = evidence.filter(item => item.metric === METRICS[key].label);
    if (values.length < 2) continue;
    const before = values.at(-2), after = values.at(-1);
    const delta = Math.round((after.mean - before.mean) * 100) / 100;
    const worse = METRICS[key].higherBetter ? delta < 0 : delta > 0;
    changes.push(`${METRICS[key].label}: ${before.period} ${before.mean}${before.unit} → ${after.period} ${after.mean}${after.unit} (${delta > 0 ? "+" : ""}${delta}${before.unit === "%" ? " pp" : before.unit}; ${worse ? "deterioration" : delta === 0 ? "unchanged" : "improvement"})`);
  }
  let answer = changes.length && comparisonQuestion ? changes.join(". ") + "." : evidence.length
    ? evidence.slice(-9).map(item => `${item.metric} ${item.period}: ${item.mean}${item.unit} from ${item.numericRows} numeric source records`).join(". ") + "."
    : "No matching numeric records were found in the selected period(s).";
  if (driverQuestion) {
    const flagged = (snapshot.driverSignals || []).filter(item => requested.length === 0 || item.signals?.some(signal => keys.some(key => signal.toLowerCase().includes(METRICS[key].label.toLowerCase().split(" ")[0]))));
    answer += ` ${flagged.length} candidate driver signal(s) were found among the comparable flagged records.`;
    answer += " This is NOT a complete driver roster or proof of fault.";
  }
  const limitations = "Descriptive unweighted record means only, not official scores. Repeated imports/periods may overlap; a missing row is not a zero. Trends are association, not proven causes." + (snapshot.truncated ? " Source was truncated." : "");
  // Never pass free-text questions, names, driver IDs or parcel IDs to the model as background evidence.
  const context = JSON.stringify({ site: snapshot.site, requestedMetrics: keys.map(key => METRICS[key].label), periods: periods.map(item => item.period), evidence, changes, limitations }).slice(0, 4900);
  return { title: `${snapshot.site} · ${requested.length ? requested.map(key => METRICS[key].label).join(" + ") : "all metrics"}`, answer, evidence: evidence.slice(-24), limitations, context };
}

const SYNONYMS = {
  staging: ["lane", "lanes", "loading", "wave", "yard"],
  dcr: ["missing", "return", "delivery", "delivered", "station"],
  cdf: ["feedback", "complaint", "customer"],
  iadc: ["noa", "app", "contact", "customer"],
  parcel: ["package", "colet", "locker", "return"],
};
const STOP = new Set(["and", "the", "for", "with", "from", "are", "what", "this", "that", "cum", "care", "pentru", "este", "si", "din", "sau", "la", "in", "un", "o", "de", "cu", "a", "do", "eu", "my", "can", "you"]);

export function searchApprovedLessons(lessons, query, site = "") {
  const words = flatten(query).split(/[^a-z0-9]+/).filter(token => token.length >= 2 && !STOP.has(token));
  if (!Array.isArray(lessons) || !words.length) return [];
  const expanded = new Set(words);
  for (const word of words) for (const [key, aliases] of Object.entries(SYNONYMS)) {
    if (word === key || aliases.includes(word)) { expanded.add(key); for (const alias of aliases) expanded.add(alias); }
  }
  return lessons.filter(item => item && typeof item.lesson === "string" && (!item.site || item.site === site))
    .map(item => { const text = flatten(item.lesson);const relevance = [...expanded].reduce((sum, token) => sum + (text.includes(token) ? (words.includes(token) ? 3 : 1) : 0), 0);return { id: item.id, site: item.site || "General", lesson: safe(item.lesson).slice(0, 350), relevance }; })
    .filter(item => item.relevance > 0).sort((a, b) => b.relevance - a.relevance).slice(0, 8);
}

export function buildProactiveDigest(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.series)) return null;
  const high = (snapshot.alerts || []).filter(item => item.severity === "high").slice(0, 5);
  const review = (snapshot.alerts || []).filter(item => item.severity !== "high").slice(0, 5);
  const latest = snapshot.series.at(-1);
  return { site: snapshot.site, period: latest?.period, high, review, driverCandidates: snapshot.driverSignalsTotal || 0,
    sourceRows: latest?.coverage?.metricRecords || 0, partial: Boolean(snapshot.truncated),
    note: "Early-warning digest from authorised RLS-scoped records. Not a verified forecast, driver judgment or official Amazon score." };
}

export function buildCopilotDraft(snapshot, mode = "tips", language = "en") {
  if (!snapshot || !Array.isArray(snapshot.series) || !snapshot.series.length) throw new Error("Load an authorised analysis first.");
  if (!["tips", "briefing", "checklist"].includes(mode) || !["ro", "en"].includes(language)) throw new Error("Invalid draft options.");
  const latest = snapshot.series.at(-1);
  const title = `MetrixIQ ${snapshot.site} ${latest.period}`;
  const priority = (snapshot.alerts || []).filter(a => a.category === "trend").slice(0, 3);
  if (mode === "tips") {
    const metric = priority[0]?.title?.split(" · ")[0] || "customer experience";
    return language === "ro" ? `📌 ${title}\nVă rugăm să acordați atenție ${metric} în fiecare livrare. Respectați instrucțiunile aplicației și verificați dovezile înainte de finalizare. Siguranța rămâne prioritară. Mulțumim!`
      : `📌 ${title}\nPlease pay extra attention to ${metric} on every delivery. Follow the app instructions and check the evidence before completing each delivery. Safety comes first. Thank you!`;
  }
  if (mode === "briefing") return [title, ...priority.map(a => `• ${a.title}: ${a.evidence}`), `• ${snapshot.driverSignalsTotal || 0} candidate driver signals require private verification.`, "Note: diagnostic source means, not official scores."].join("\n");
  return [title, "1. Check imported period coverage and duplicates.", ...priority.map((a, index) => `${index + 2}. Validate ${a.title} against the Amazon source report.`), `${priority.length + 2}. Review affected drivers privately; do not assign blame from aggregates.`, "No data has been modified."].join("\n");
}

export function proposeFormatSandbox(documents = {}) {
  const slots = ["route", "wave"].map(kind => {
    const doc = documents[kind];
    if (!doc || !Array.isArray(doc.matrix)) return { kind, missing: true };
    const headerIndex = Number.isInteger(doc.headerRow) ? doc.headerRow : -1;
    const headers = headerIndex >= 0 ? doc.matrix[headerIndex] || [] : [];
    const fields = Object.fromEntries(Object.entries(doc.mapping || {}).filter(([field, index]) => /^[a-z]+$/.test(field) && Number.isInteger(index) && index >= 0 && index < headers.length && index < 80).map(([field, index]) => [field, { sourceHeader: safe(headers[index]).slice(0, 100), columnIndex: index }]));
    const preview = doc.matrix.slice(headerIndex + 1, headerIndex + 4).map(row => Object.fromEntries(Object.entries(fields).map(([field, info]) => [field, safe(row?.[info.columnIndex]).slice(0, 60)])));
    return { kind, fileType: safe(doc.mode).slice(0, 55), columns: headers.slice(0, 50).map(x => safe(x).slice(0, 100)), fields, preview, missing: false };
  });
  const missing = slots.filter(item => item.missing).map(item => item.kind);
  const warnings = [];
  if (missing.length) warnings.push("Missing input: " + missing.join(" + "));
  for (const slot of slots.filter(item => !item.missing)) {
    if (!slot.fields.route && !slot.fields.trid) warnings.push(slot.kind + " plan has no mapped Route or TRID field.");
    if (slot.kind === "wave" && !slot.fields.loading) warnings.push("Wave Plan has no mapped Loading time field.");
  }
  const specification = { version: 1, scope: "AI Lab proposal only", mutation: "none", slots: slots.map(({ preview, ...publicSlot }) => publicSlot) };
  return { slots, warnings, specification,
    tests: [
      { name: "Both independent plans uploaded", pass: missing.length === 0 },
      { name: "A Route/TRID match is mapped in each input", pass: slots.every(slot => !slot.missing && (slot.fields.route || slot.fields.trid)) },
      { name: "Loading time is mapped", pass: Boolean(slots[1].fields?.loading) },
      { name: "Only declarative column mappings proposed", pass: true },
    ],
    disclaimer: "No generated code is executed, no repository PR is opened, and operational Wave Plan modules remain untouched." };
}

export function exportFormatSpec(sandbox) {
  if (!sandbox?.specification || sandbox.specification.mutation !== "none") throw new Error("Invalid sandbox proposal.");
  return JSON.stringify(sandbox.specification, null, 2);
}
