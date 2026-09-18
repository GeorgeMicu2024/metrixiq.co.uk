import { TARGETS } from "../config/performance";
import {
  isUsablePersonName,
  normalizeTrid,
} from "../identity";

const percentMetrics = new Set([
  "dcr",
  "pod",
  "iadc",
  "dwc",
  "cc",
  "phr",
  "reattempts",
]);

export function clean(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&nbsp;/g, " ")
    .replace(/[®™©]/g, " ")
    .replace(/[._\-/%()]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeSiteCode(value) {
  const raw = String(value ?? "").trim().toUpperCase();
  if (!raw) return "";
  return /^[A-Z]{2,5}\d{1,3}$/.test(raw) ? raw : "";
}

export function numeric(value, key) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw || raw === "-" || /^n\/a$/i.test(raw) || /^none$/i.test(raw)) return null;
  let result = typeof value === "number"
    ? value
    : Number(raw.replace(/,/g, "").replace(/%/g, ""));
  if (!Number.isFinite(result)) return null;
  if (percentMetrics.has(key) && result <= 1.01) result *= 100;
  return result;
}

export function uniqueHeaders(headers) {
  const seen = new Map();
  return (headers || []).map((value, index) => {
    const base = String(value || `Column ${index + 1}`).trim() || `Column ${index + 1}`;
    const count = (seen.get(base) || 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base} ${count}`;
  });
}

export function exactIndex(headers, aliases) {
  const cleaned = (headers || []).map(clean);
  for (const alias of aliases) {
    const index = cleaned.indexOf(clean(alias));
    if (index >= 0) return index;
  }
  return -1;
}

export function fuzzyIndex(headers, aliases) {
  let best = { index: -1, score: 0 };

  (headers || []).forEach((header, index) => {
    const normalizedHeader = clean(header);

    for (const alias of aliases) {
      const normalizedAlias = clean(alias);
      let score = 0;

      if (normalizedHeader === normalizedAlias) score = 100;
      else if (
        normalizedHeader.includes(normalizedAlias) ||
        normalizedAlias.includes(normalizedHeader)
      ) {
        score = 85;
      } else {
        const words = new Set(normalizedHeader.split(" "));
        const parts = normalizedAlias.split(" ");
        const overlap = parts.filter((part) => words.has(part)).length;
        score = overlap ? 55 + (overlap / parts.length) * 25 : 0;
      }

      if (score > best.score) best = { index, score };
    }
  });

  return best.score >= 72 ? best.index : -1;
}

export function looksEncryptedNameToken(value) {
  const raw = String(value ?? "").trim();
  if (raw.length < 16 || raw.length > 100) return false;
  return /^[A-Za-z0-9+/]+={0,2}$/.test(raw) && /[+=/]/.test(raw);
}

export function mentorHashKey(first, last) {
  const firstValue = String(first ?? "").trim();
  const lastValue = String(last ?? "").trim();
  return firstValue && lastValue ? `${firstValue}::${lastValue}` : "";
}

export function buildMentorAliasResolver(aliases = []) {
  const pair = new Map();
  const first = new Map();
  const last = new Map();

  const addUnique = (map, key, value) => {
    if (!key || !value) return;
    if (!map.has(key)) map.set(key, value);
    else if (map.get(key) !== value) map.set(key, null);
  };

  for (const alias of aliases) {
    if (!alias?.key || !isUsablePersonName(alias.name)) continue;
    addUnique(pair, alias.key, alias.name);
    addUnique(first, alias.firstHash, alias.firstName);
    addUnique(last, alias.lastHash, alias.lastName);
  }

  return {
    resolve(hint) {
      if (!hint?.key) return "";
      const exact = pair.get(hint.key);
      if (exact) return exact;

      const firstName = first.get(hint.firstHash);
      const lastName = last.get(hint.lastHash);

      if (firstName && lastName) {
        return `${firstName} ${lastName}`.replace(/\s+/g, " ").trim();
      }

      return "";
    },
  };
}

export function inferSiteCode(fileName, fallbackText = "") {
  const match = `${String(fileName || "")} ${String(fallbackText || "")}`
    .match(/\b(D[A-Z]{1,4}\d{1,3})\b/i);
  return normalizeSiteCode(match?.[1] || "");
}

export function isoWeekDetails(year, week) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1) + (week - 1) * 7);

  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  return {
    key: `${year}-W${String(week).padStart(2, "0")}`,
    weekLabel: `W${String(week).padStart(2, "0")}`,
    year,
    week,
    periodStart: monday.toISOString().slice(0, 10),
    periodEnd: sunday.toISOString().slice(0, 10),
  };
}

export function isoWeekFromDate(date) {
  const current = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  ));
  const day = current.getUTCDay() || 7;
  current.setUTCDate(current.getUTCDate() + 4 - day);

  const year = current.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil((((current - yearStart) / 86400000) + 1) / 7);

  return isoWeekDetails(year, week);
}

export function inferPeriod(fileName, fallbackText = "") {
  const file = String(fileName || "");
  let match = file.match(/(?:week|wk|w)[\s_\-]*(\d{1,2})/i);

  if (match) {
    const week = Number(match[1]);
    const yearMatch = file.match(/(?:^|[^0-9])(20\d{2})(?!\d)/);
    const year = yearMatch ? Number(yearMatch[1]) : new Date().getUTCFullYear();
    if (week >= 1 && week <= 53) return isoWeekDetails(year, week);
  }

  match = file.match(/(?:^|[^0-9])(20\d{2})[\-_](?:w)?(\d{1,2})(?![\-_]\d{1,2})\b/i);
  if (match) {
    const year = Number(match[1]);
    const week = Number(match[2]);
    if (week >= 1 && week <= 53) return isoWeekDetails(year, week);
  }

  match = file.match(/(?:^|[^0-9])(20\d{2})[\-_](\d{2})[\-_](\d{2})(?!\d)/);
  if (match) {
    const date = new Date(Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3])
    ));
    if (!Number.isNaN(date.getTime())) return isoWeekFromDate(date);
  }

  const text = String(fallbackText || "");
  match =
    text.match(/Week\s+(\d{1,2})\s*[-–]\s*(20\d{2})/i) ||
    text.match(/Week\s+(\d{1,2})[\s\S]{0,30}\b(20\d{2})\b/i);

  if (match) {
    const week = Number(match[1]);
    const year = Number(match[2]);
    if (week >= 1 && week <= 53) return isoWeekDetails(year, week);
  }

  return isoWeekFromDate(new Date());
}

export function targetPerformance(metrics) {
  const values = [];

  if (metrics.dcr != null) {
    values.push(Math.min(105, (metrics.dcr / TARGETS.dcr) * 100));
  }
  if (metrics.pod != null) {
    values.push(Math.min(105, (metrics.pod / TARGETS.pod) * 100));
  }
  if (metrics.iadc != null) {
    values.push(Math.min(105, (metrics.iadc / TARGETS.iadc) * 100));
  }
  if (metrics.mentor_score != null) {
    values.push(Math.min(105, (metrics.mentor_score / TARGETS.mentor) * 100));
  }

  return values.length
    ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
    : null;
}

export function riskFor(metrics) {
  let points = 0;

  if (metrics.dcr != null && metrics.dcr < TARGETS.dcr) points += 2;
  if (metrics.pod != null && metrics.pod < TARGETS.pod) points += 2;
  if (metrics.iadc != null && metrics.iadc < TARGETS.iadc) points += 2;
  if (metrics.mentor_score != null && metrics.mentor_score < TARGETS.mentor) points += 1;
  if (metrics.concessions != null && metrics.concessions >= 3) points += 2;
  if (metrics.cc != null && metrics.cc < TARGETS.cc) points += 1;

  return points >= 4 ? "High" : points >= 2 ? "Medium" : "Low";
}

export function issueFor(metrics) {
  if (metrics.dcr != null && metrics.dcr < TARGETS.dcr) {
    return `DCR below ${TARGETS.dcr.toFixed(2)}% target`;
  }
  if (metrics.pod != null && metrics.pod < TARGETS.pod) {
    return `POD below ${TARGETS.pod.toFixed(2)}% target`;
  }
  if (metrics.iadc != null && metrics.iadc < TARGETS.iadc) {
    return `IADC below ${TARGETS.iadc}% target`;
  }
  if (metrics.mentor_score != null && metrics.mentor_score < TARGETS.mentor) {
    return `Mentor score below ${TARGETS.mentor}`;
  }
  if (metrics.cc != null && metrics.cc < TARGETS.cc) {
    return `Contact Compliance below ${TARGETS.cc.toFixed(2)}% target`;
  }
  if (metrics.concessions != null && metrics.concessions >= 3) {
    return "Repeated concessions";
  }

  return "No active concern";
}

export function makeRecord({
  trid = "",
  name = "",
  site = "",
  metrics = {},
  details = {},
  priorities = {},
  source = "",
  period = null,
  identityHint = null,
}) {
  return {
    trid: normalizeTrid(trid),
    name: String(name || "").trim(),
    site: normalizeSiteCode(site),
    metrics,
    details,
    priorities,
    source,
    period,
    identityHint,
  };
}
