import { normalizeApprovedFormats } from "./user-state.mjs";
import { WAVE_FIELDS, normaliseHeading } from "./wave-plan.mjs";

// AI Lab-only representation of approved Excel layouts. Never copy file names,
// raw header text, source rows, driver names, TRIDs or user identifiers to LLMs.
const FIELD_ALIASES = Object.fromEntries(WAVE_FIELDS.map(field => [field.id, new Set(field.aliases)]));
const WAVE = new Set(["wave", "staging", "parking", "holding", "loading"]);
const ROUTE = new Set(["route", "driver", "trid"]);

export function isFormatQuestion(question) {
  const text = normaliseHeading(question);
  return /\b(waves?|staging|loading|load|holding|parking|lane|routes?|trid|dispatch|formats?|templates?|layouts?|columns?|excel|xlsx|csv|import|plan|schema|mapping|coloan[a-z]*|fisier[a-z]*|incarcar[a-z]*|ruta|rute|valuri|valul)\b/.test(text);
}

function ranked(format, question) {
  const q = normaliseHeading(question);
  const columns = Object.keys(format.columns);
  const wave = /\b(waves?|staging|loading|load|holding|parking|lane|dispatch|valuri|valul|incarcar[a-z]*)\b/.test(q);
  const route = /\b(routes?|trid|driver|ruta|rute)\b/.test(q);
  return columns.length + (wave && format.sourceType === "wave" ? 12 : 0) +
    (route && format.sourceType === "route" ? 12 : 0) + columns.reduce((score, field) =>
    score + (wave && WAVE.has(field) ? 3 : 0) + (route && ROUTE.has(field) ? 3 : 0), 0);
}

export function approvedFormatContext(rawFormats, question) {
  if (!isFormatQuestion(question)) return { context: "", formats: [] };
  const formats = normalizeApprovedFormats(rawFormats)
    .sort((a, b) => ranked(b, question) - ranked(a, question))
    .slice(0, 3)
    .map((format, index) => {
      const headers = format.signature.split("|");
      const fields = Object.fromEntries(Object.entries(format.columns).sort((a, b) => a[1] - b[1])
        .map(([field, columnIndex]) => {
          const header = normaliseHeading(headers[columnIndex] || "");
          return [field, {
            columnNumber: columnIndex + 1,
            header: FIELD_ALIASES[field]?.has(header) ? header : "not safely verified",
          }];
        }));
      return {
        source: "Approved layout " + (index + 1),
        suggestedType: (format.sourceType || (Object.keys(fields).some(key => WAVE.has(key)) ? "wave" : "route")) === "wave"
          ? "Wave Plan candidate" : "Route Plan candidate",
        fields,
        station: "not recorded; validate station before operational use",
      };
    });
  return { formats, context: formats.map(item => JSON.stringify(item)).join("\n").slice(0, 1850) };
}
