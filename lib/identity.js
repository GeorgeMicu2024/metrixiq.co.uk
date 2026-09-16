export const TRID_RE = /^A[A-Z0-9]{8,}$/;

export function normalizeTrid(value) {
  return String(value ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

export function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(off[- ]?board(?:ed)?|inactive|same day|next day|driver|da)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function nameSignature(value) {
  const normalized = normalizeName(value);
  if (!normalized) return "";
  return normalized.split(" ").filter(Boolean).sort().join("|");
}

export function isValidTrid(value) {
  const raw = String(value ?? "").trim();
  if (!raw || /\s/.test(raw)) return false;
  return TRID_RE.test(raw.toUpperCase());
}

export function isUsablePersonName(value) {
  const raw = String(value ?? "").trim();
  const normalized = normalizeName(raw);
  if (!normalized || isValidTrid(raw)) return false;
  if (/^(same day|next day|unknown|unmatched|unresolved driver|unresolved identity)$/i.test(raw)) return false;
  if (/^dls\d+\s+dls\d+$/i.test(raw)) return false;
  const tokens = normalized.split(" ").filter(Boolean);
  const meaningful = tokens.filter((token) => !/^\d+$/.test(token));
  return meaningful.length >= 2 && meaningful[0].length >= 2 && meaningful[meaningful.length - 1].length >= 2;
}

export function displayDriverName(driver) {
  if (!driver) return "Unresolved identity";
  const name = String(driver.full_name ?? driver.name ?? "").trim();
  const trid = normalizeTrid(driver.trid ?? driver.id);
  if (!name || normalizeName(name) === normalizeName(trid) || /^unresolved/i.test(name)) {
    return "Unresolved identity";
  }
  return name;
}

function editDistanceAtMostOne(a, b) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i += 1; j += 1; continue; }
    edits += 1;
    if (edits > 1) return false;
    if (a.length > b.length) i += 1;
    else if (b.length > a.length) j += 1;
    else { i += 1; j += 1; }
  }
  if (i < a.length || j < b.length) edits += 1;
  return edits <= 1;
}

function tokenSimilarity(a, b) {
  if (a === b) return 1;
  if (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a))) return 0.90;
  if (Math.min(a.length, b.length) >= 5 && editDistanceAtMostOne(a, b)) return 0.78;
  return 0;
}

// Conservative fuzzy score used only after exact name/signature matching fails.
// It is intentionally strict: at least one token must match exactly and every
// source token must map to a unique candidate token.
export function nameMatchScore(sourceName, candidateName) {
  if (!isUsablePersonName(sourceName) || !isUsablePersonName(candidateName)) return 0;
  const source = normalizeName(sourceName);
  const candidate = normalizeName(candidateName);
  if (source === candidate) return 1;
  if (nameSignature(sourceName) === nameSignature(candidateName)) return 0.995;

  const sourceTokens = source.split(" ").filter(Boolean);
  const candidateTokens = candidate.split(" ").filter(Boolean);
  if (sourceTokens.length < 2 || candidateTokens.length < 2) return 0;

  const used = new Set();
  const similarities = [];
  let exactCount = 0;

  for (const token of sourceTokens) {
    let best = { score: 0, index: -1 };
    for (let i = 0; i < candidateTokens.length; i += 1) {
      if (used.has(i)) continue;
      const score = tokenSimilarity(token, candidateTokens[i]);
      if (score > best.score) best = { score, index: i };
    }
    if (best.index < 0 || best.score === 0) return 0;
    used.add(best.index);
    similarities.push(best.score);
    if (best.score === 1) exactCount += 1;
  }

  // Avoid mapping two entirely approximate tokens to a person by accident.
  if (exactCount === 0) return 0;

  const averageSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;
  const exactRatio = exactCount / sourceTokens.length;
  const coverage = Math.min(1, sourceTokens.length / candidateTokens.length);
  return 0.68 + 0.17 * averageSimilarity + 0.10 * exactRatio + 0.05 * coverage;
}

export function buildIdentityIndexes(drivers = [], aliases = []) {
  const byTrid = new Map();
  const byName = new Map();
  const bySignature = new Map();
  const byMentorHash = new Map();
  const nameCandidates = [];

  const addUnique = (map, key, driver) => {
    if (!key || !driver) return;
    if (!map.has(key)) map.set(key, driver);
    else if (map.get(key)?.id !== driver.id) map.set(key, null);
  };

  const addNameCandidate = (name, driver) => {
    if (!isUsablePersonName(name) || !driver) return;
    nameCandidates.push({ name: String(name).trim(), driver });
  };

  for (const driver of drivers) {
    const trid = normalizeTrid(driver.trid);
    if (trid) byTrid.set(trid, driver);
    if (isUsablePersonName(driver.full_name)) {
      addUnique(byName, normalizeName(driver.full_name), driver);
      addUnique(bySignature, nameSignature(driver.full_name), driver);
      addNameCandidate(driver.full_name, driver);
    }
  }

  for (const alias of aliases) {
    const driver = drivers.find((d) => d.id === alias.driver_id);
    if (!driver) continue;
    if (alias.alias_type === "trid") byTrid.set(normalizeTrid(alias.alias_value), driver);
    if (alias.alias_type === "mentor_hash") addUnique(byMentorHash, String(alias.alias_normalized || alias.alias_value || "").trim(), driver);
    if (alias.alias_type === "name") {
      addUnique(byName, alias.alias_normalized || normalizeName(alias.alias_value), driver);
      addNameCandidate(alias.alias_value, driver);
    }
    if (alias.alias_type === "mentor_name") {
      addUnique(bySignature, alias.alias_normalized || nameSignature(alias.alias_value), driver);
      addNameCandidate(alias.alias_value, driver);
    }
  }

  return { byTrid, byName, bySignature, byMentorHash, nameCandidates, drivers };
}

export function resolveIdentity(record, indexes) {
  const trid = normalizeTrid(record?.trid ?? record?.id);
  if (isValidTrid(trid) && indexes.byTrid.has(trid)) {
    return { driver: indexes.byTrid.get(trid), method: "trid", confidence: 1 };
  }

  const mentorHash = String(record?.mentor_hash ?? record?.mentorHash ?? record?.identityHint?.key ?? "").trim();
  if (mentorHash && indexes.byMentorHash?.has(mentorHash)) {
    const driver = indexes.byMentorHash.get(mentorHash);
    if (driver) return { driver, method: "mentor_hash", confidence: 1 };
  }

  const name = record?.name ?? record?.full_name;
  if (isUsablePersonName(name)) {
    const exact = indexes.byName.get(normalizeName(name));
    if (exact) return { driver: exact, method: "name", confidence: 0.99 };
    const signed = indexes.bySignature.get(nameSignature(name));
    if (signed) return { driver: signed, method: "name_signature", confidence: 0.97 };

    const bestByDriver = new Map();
    for (const candidate of indexes.nameCandidates || []) {
      const score = nameMatchScore(name, candidate.name);
      if (!score) continue;
      const current = bestByDriver.get(candidate.driver.id);
      if (!current || score > current.score) bestByDriver.set(candidate.driver.id, { score, driver: candidate.driver });
    }
    const ranked = [...bestByDriver.values()].sort((a, b) => b.score - a.score);
    const best = ranked[0];
    const second = ranked[1];
    if (best && best.score >= 0.90 && (!second || best.score - second.score >= 0.025)) {
      return { driver: best.driver, method: "name_fuzzy_unique", confidence: Math.min(0.96, best.score) };
    }
  }

  return { driver: null, method: null, confidence: 0 };
}
