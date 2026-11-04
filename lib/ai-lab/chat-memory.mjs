import { sanitizeLearningNote } from "./brain-insights.mjs";
import { searchApprovedLessons } from "./ai-v2.mjs";
import { mergeApprovedKnowledge } from "./semantic-memory.mjs";

// Read-only retrieval for the private AI Lab chat. No raw report rows or user
// identifiers are included in the resulting model context.
export function memoryStation(input, question = "") {
  const supplied = String(input || "").trim().toUpperCase();
  if (/^[A-Z0-9]{3,6}$/.test(supplied)) return supplied;
  const detected = String(question || "").toUpperCase().match(/\b[A-Z]{2,4}\d{1,2}\b/);
  return detected?.[0] || "";
}

export function retrievalQuery(question) {
  return String(question || "")
    .replace(/\bUK\d{8,}\b/gi, "parcel")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Z]{2,}/gi, "email")
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, "identifier")
    .replace(/\b\+?\d{9,}\b/g, "number")
    .replace(/[\u0000-\u001f]/g, " ")
    .trim().slice(0, 160);
}

export function approvedChatMemory(notes, question, site = "", semantic = []) {
  const safeNotes = (Array.isArray(notes) ? notes : []).filter(item => {
    try { return Boolean(item?.id && sanitizeLearningNote(item.lesson)); }
    catch { return false; }
  });
  const query = retrievalQuery(question);
  if (query.length < 3) return { matches: [], context: "" };
  const scope = memoryStation(site, question);
  const lexical = searchApprovedLessons(safeNotes, query, scope);
  const matches = mergeApprovedKnowledge(safeNotes, lexical, semantic, scope).slice(0, 5);
  const context = matches.map((item, index) => JSON.stringify({
    reference: "Approved memory " + (index + 1),
    station: item.site,
    rule: item.lesson.slice(0, 350),
  })).join("\n").slice(0, 1900);
  return { matches, context };
}
