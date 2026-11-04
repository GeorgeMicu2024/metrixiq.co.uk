// Merge private server-side semantic results with the local bilingual keyword fallback.
// Only render lessons already RLS-loaded for this user and current site.
export function mergeApprovedKnowledge(approved, lexical, semantic, site = "") {
  const allowed = new Map((Array.isArray(approved) ? approved : [])
    .filter(item => item?.id && typeof item.lesson === "string"
      && (!item.site || item.site === site))
    .map(item => [item.id, item]));
  const results = [];
  const seen = new Set();
  for (const item of Array.isArray(semantic) ? semantic : []) {
    if (!allowed.has(item?.id) || seen.has(item.id) || !Number.isFinite(item.similarity)
      || item.similarity < 0.35 || item.similarity > 1) continue;
    const note = allowed.get(item.id);
    results.push({ id: item.id, site: note.site || "General", lesson: note.lesson,
      method: "semantic", relevance: Math.round(item.similarity * 100) });
    seen.add(item.id);
    if (results.length >= 8) return results;
  }
  for (const item of Array.isArray(lexical) ? lexical : []) {
    if (!allowed.has(item?.id) || seen.has(item.id)) continue;
    const note = allowed.get(item.id);
    results.push({ id: item.id, site: note.site || "General", lesson: note.lesson,
      method: "keyword", relevance: item.relevance });
    seen.add(item.id);
    if (results.length >= 8) return results;
  }
  return results;
}
