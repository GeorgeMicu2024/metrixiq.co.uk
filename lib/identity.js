
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
  return TRID_RE.test(normalizeTrid(value));
}

export function isUsablePersonName(value) {
  const raw = String(value ?? "").trim();
  const normalized = normalizeName(raw);
  if (!normalized || isValidTrid(raw)) return false;
  if (/^(same day|next day|unknown|unmatched|unresolved driver|unresolved identity)$/i.test(raw)) return false;
  const tokens = normalized.split(" ").filter(Boolean);
  return tokens.length >= 2 && tokens.every((token) => token.length >= 2);
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

export function buildIdentityIndexes(drivers = [], aliases = []) {
  const byTrid = new Map();
  const byName = new Map();
  const bySignature = new Map();

  const addUnique = (map, key, driver) => {
    if (!key || !driver) return;
    if (!map.has(key)) map.set(key, driver);
    else if (map.get(key)?.id !== driver.id) map.set(key, null);
  };

  for (const driver of drivers) {
    const trid = normalizeTrid(driver.trid);
    if (trid) byTrid.set(trid, driver);
    if (isUsablePersonName(driver.full_name)) {
      addUnique(byName, normalizeName(driver.full_name), driver);
      addUnique(bySignature, nameSignature(driver.full_name), driver);
    }
  }

  for (const alias of aliases) {
    const driver = drivers.find((d) => d.id === alias.driver_id);
    if (!driver) continue;
    if (alias.alias_type === "trid") byTrid.set(normalizeTrid(alias.alias_value), driver);
    if (alias.alias_type === "name") addUnique(byName, alias.alias_normalized || normalizeName(alias.alias_value), driver);
    if (alias.alias_type === "mentor_name") addUnique(bySignature, alias.alias_normalized || nameSignature(alias.alias_value), driver);
  }

  return { byTrid, byName, bySignature };
}

export function resolveIdentity(record, indexes) {
  const trid = normalizeTrid(record?.trid ?? record?.id);
  if (isValidTrid(trid) && indexes.byTrid.has(trid)) {
    return { driver: indexes.byTrid.get(trid), method: "trid", confidence: 1 };
  }

  const name = record?.name ?? record?.full_name;
  if (isUsablePersonName(name)) {
    const exact = indexes.byName.get(normalizeName(name));
    if (exact) return { driver: exact, method: "name", confidence: 0.99 };
    const signed = indexes.bySignature.get(nameSignature(name));
    if (signed) return { driver: signed, method: "name_signature", confidence: 0.97 };
  }

  return { driver: null, method: null, confidence: 0 };
}
