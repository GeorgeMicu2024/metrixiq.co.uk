import { normalizeApprovedFormats } from "./user-state.mjs";
import { WAVE_FIELDS, normaliseHeading } from "./wave-plan.mjs";

// Structural drift detection confined to AI Lab browser data. Only field names,
// column positions and counts leave this module; never source rows or raw headers.
const ALIASES = Object.fromEntries(WAVE_FIELDS.map(field =>
  [field.id, new Set(field.aliases.map(normaliseHeading))]));
const FIELDS = new Set(WAVE_FIELDS.map(field => field.id));

function headersFor(doc) {
  if (!doc || !Array.isArray(doc.matrix) || !Number.isInteger(doc.headerRow) || doc.headerRow < 0) return null;
  const row = doc.matrix[doc.headerRow];
  return Array.isArray(row) ? row.slice(0, 50).map(normaliseHeading) : null;
}

function candidateScore(template, headers, kind) {
  const known = template.signature.split("|").slice(0, 50);
  const overlap = known.filter(header => header && headers.includes(header)).length;
  const ratio = overlap / Math.max(known.filter(Boolean).length, headers.filter(Boolean).length, 1);
  const relevant = kind === "wave"
    ? ["wave", "staging", "parking", "holding", "loading"]
    : ["route", "trid", "driver"];
  const role = relevant.filter(field => Object.hasOwn(template.columns, field)).length;
  return { overlap, ratio, score: ratio * 100 + role * 4 };
}

function oneSource(kind, doc, templates) {
  const headers = headersFor(doc);
  if (!doc) return { kind, state: "missing", issues: ["Upload the " + kind + " plan in AI Lab."], changes: [], proposedMapping: {} };
  if (!headers?.some(Boolean)) return { kind, state: "no_header", issues: ["Choose a valid header row before comparing."], changes: [], proposedMapping: {} };
  if (!templates.length) return { kind, state: "untrained", issues: ["No approved format is available yet. Approve a verified layout first."], changes: [], proposedMapping: {} };

  const candidates = templates.map(template => ({ template, ...candidateScore(template, headers, kind) }))
    .filter(item => item.overlap >= 2 && item.ratio >= 0.45)
    .sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best) return { kind, state: "new", confidence: 0, issues: ["Unrecognised structure. Map the columns manually and review before approval."], changes: [], proposedMapping: {} };
  const old = best.template.signature.split("|").slice(0, 50);
  const proposedMapping = {};
  const used = new Set();
  const issues = [];
  const changes = [];
  for (const [field, priorIndex] of Object.entries(best.template.columns)) {
    if (!FIELDS.has(field) || !Number.isInteger(priorIndex) || priorIndex >= old.length) continue;
    const before = old[priorIndex];
    const exact = headers.flatMap((label, index) => label && label === before ? [index] : []);
    let matches = exact;
    let renamed = false;
    if (!matches.length && ALIASES[field]?.has(before)) {
      matches = headers.flatMap((label, index) => ALIASES[field].has(label) ? [index] : []);
      renamed = matches.length === 1;
    }
    if (matches.length !== 1 || used.has(matches[0])) {
      issues.push(field + ": " + (matches.length > 1 || used.has(matches[0]) ? "ambiguous duplicate header" : "approved header missing"));
      continue;
    }
    const nextIndex = matches[0];
    used.add(nextIndex);
    proposedMapping[field] = nextIndex;
    if (renamed) changes.push({ field, type: "renamed", fromColumn: priorIndex + 1, toColumn: nextIndex + 1 });
    else if (nextIndex !== priorIndex) changes.push({ field, type: "moved", fromColumn: priorIndex + 1, toColumn: nextIndex + 1 });
  }
  const addedColumns = headers.filter(h => h && !old.includes(h)).length;
  const removedColumns = old.filter(h => h && !headers.includes(h)).length;
  const state = issues.length ? "blocked"
    : best.template.signature === headers.join("|") ? "unchanged" : "review";
  if (addedColumns) issues.push(addedColumns + " additional or renamed header(s) require review.");
  if (removedColumns) issues.push(removedColumns + " prior header(s) are not identical.");
  if (state === "review" && !changes.length && !issues.length) issues.push("Header order or column set changed; validate the proposal.");
  return { kind, state, confidence: Math.round(best.ratio * 100), issues: issues.slice(0, 12),
    changes: changes.slice(0, 20), addedColumns, removedColumns, proposedMapping,
    reviewed: false, mutation: "none" };
}

export function detectFormatDrift(documents = {}, savedFormats = []) {
  const templates = normalizeApprovedFormats(savedFormats);
  const results = ["route", "wave"].map(kind => oneSource(kind, documents?.[kind], templates));
  return { scope: "AI Lab review only", mutation: "none", approvedCount: templates.length, results,
    hasChanges: results.some(item => item.state === "review" || item.state === "blocked" || item.state === "new") };
}

// Safe, deterministic proposal for the existing review-only JS generator.
// Never executes generated code or modifies documents, templates or station data.
export function driftAdapterDraft(report) {
  const sources = report?.results;
  if (!Array.isArray(sources) || sources.length !== 2 || report.mutation !== "none") return null;
  if (sources.some(item => !["unchanged", "review"].includes(item.state))) return null;
  const slots = sources.map(item => ({
    kind: item.kind,
    fields: Object.fromEntries(Object.entries(item.proposedMapping || {})
      .filter(([field, index]) => FIELDS.has(field) && Number.isInteger(index) && index >= 0 && index < 50)
      .map(([field, columnIndex]) => [field, { columnIndex }])),
  }));
  if (slots.some(slot => !slot.fields.route && !slot.fields.trid) || !slots[1].fields.loading) return null;
  return { specification: { version: 1, scope: "AI Lab drift review only", mutation: "none", slots } };
}
