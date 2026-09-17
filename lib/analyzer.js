
import {
  buildIdentityIndexes,
  isUsablePersonName,
  isValidTrid,
  nameSignature,
  normalizeName,
  normalizeTrid,
  resolveIdentity,
} from "./identity";

const metricAliases = {
  dcr: ["dcr", "delivery completion rate", "delivery completion", "completion rate"],
  pod: ["pod", "photo on delivery", "photo-on-delivery", "pod quality"],
  iadc: ["iadc", "iadc %", "in app delivery workflow", "in-app delivery workflow"],
  dwc: ["dwc", "dwc %", "delivery workflow compliance"],
  cc: ["cc", "contact compliance", "contact compliance %"],
  mentor_score: ["mentor score", "ementor score", "e mentor score", "fico", "fico score"],
  concessions: ["concessions", "concession count", "concessions count", "total concessions", "total concession"],
  delivered: ["delivered", "delivered packages"],
  dnr: ["dnr", "packages delivered not received", "delivered not received", "dnr count"],
  dnr_dpmo: ["dnr dpmo", "delivered not received dpmo"],
  rts: ["rts", "packages returned to station", "returned to station", "rts count"],
  dsc_dpmo: ["dsc", "dsc dpmo", "delivery success conditions", "delivery success conditions dpmo"],
  lor: ["lor", "lor dpmo", "lost on road", "lost on road dpmo", "loss on route"],
  ce_dpmo: ["ce", "ce dpmo", "customer escalation", "customer escalation dpmo", "customer escalations"],
  cdf_dpmo: ["cdf", "cdf dpmo", "customer delivery feedback", "customer delivery feedback dpmo"],
  psb: ["psb", "pickup success behaviours", "pickup success behaviors", "pickup success"],
  phr: ["phr", "preference honour rate", "preference honor rate"],
  reattempts: ["reattempts", "reattempt compliance", "reattempt"],
  podFails: ["pod fails", "pod fail", "pod rejects"],
  ccFails: ["cc fails", "cc fail", "contact failures"],
};

const percentMetrics = new Set(["dcr", "pod", "iadc", "dwc", "cc", "phr", "reattempts"]);
const spreadsheetExts = new Set(["xlsx", "xls", "xlsm", "xlsb", "ods", "fods", "csv", "tsv"]);
const textExts = new Set(["txt"]);
const htmlExts = new Set(["html", "htm"]);

function clean(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&nbsp;/g, " ")
    .replace(/[®™©]/g, " ")
    .replace(/[._\-/%()]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function numeric(value, key) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw || raw === "-" || /^n\/a$/i.test(raw) || /^none$/i.test(raw)) return null;
  let n = typeof value === "number" ? value : Number(raw.replace(/,/g, "").replace(/%/g, ""));
  if (!Number.isFinite(n)) return null;
  if (percentMetrics.has(key) && n <= 1.01) n *= 100;
  return n;
}

function uniqueHeaders(headers) {
  const seen = new Map();
  return (headers || []).map((value, index) => {
    const base = String(value || `Column ${index + 1}`).trim() || `Column ${index + 1}`;
    const count = (seen.get(base) || 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base} ${count}`;
  });
}

function exactIndex(headers, aliases) {
  const c = (headers || []).map(clean);
  for (const alias of aliases) {
    const index = c.indexOf(clean(alias));
    if (index >= 0) return index;
  }
  return -1;
}

function fuzzyIndex(headers, aliases) {
  let best = { index: -1, score: 0 };
  (headers || []).forEach((header, index) => {
    const h = clean(header);
    for (const alias of aliases) {
      const a = clean(alias);
      let score = 0;
      if (h === a) score = 100;
      else if (h.includes(a) || a.includes(h)) score = 85;
      else {
        const hs = new Set(h.split(" "));
        const parts = a.split(" ");
        const overlap = parts.filter((p) => hs.has(p)).length;
        score = overlap ? 55 + (overlap / parts.length) * 25 : 0;
      }
      if (score > best.score) best = { index, score };
    }
  });
  return best.score >= 72 ? best.index : -1;
}


function looksEncryptedNameToken(value) {
  const raw = String(value ?? "").trim();
  if (raw.length < 16 || raw.length > 100) return false;
  return /^[A-Za-z0-9+/]+={0,2}$/.test(raw) && /[+=/]/.test(raw);
}

function mentorHashKey(first, last) {
  const a = String(first ?? "").trim();
  const b = String(last ?? "").trim();
  return a && b ? `${a}::${b}` : "";
}

function buildMentorAliasResolver(aliases = []) {
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
      if (firstName && lastName) return `${firstName} ${lastName}`.replace(/\s+/g, " ").trim();
      return "";
    },
  };
}

function isoWeekDetails(year, week) {
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

function isoWeekFromDate(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const year = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return isoWeekDetails(year, week);
}

function inferPeriod(fileName, fallbackText = "") {
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
    const year = Number(match[1]), week = Number(match[2]);
    if (week >= 1 && week <= 53) return isoWeekDetails(year, week);
  }

  match = file.match(/(?:^|[^0-9])(20\d{2})[\-_](\d{2})[\-_](\d{2})(?!\d)/);
  if (match) {
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    if (!Number.isNaN(date.getTime())) return isoWeekFromDate(date);
  }

  const text = String(fallbackText || "");
  match = text.match(/Week\s+(\d{1,2})\s*[-–]\s*(20\d{2})/i) || text.match(/Week\s+(\d{1,2})[\s\S]{0,30}\b(20\d{2})\b/i);
  if (match) {
    const week = Number(match[1]), year = Number(match[2]);
    if (week >= 1 && week <= 53) return isoWeekDetails(year, week);
  }

  return isoWeekFromDate(new Date());
}

function targetPerformance(metrics) {
  const values = [];
  if (metrics.dcr != null) values.push(Math.min(105, metrics.dcr / 99.2 * 100));
  if (metrics.pod != null) values.push(Math.min(105, metrics.pod / 99.6 * 100));
  if (metrics.iadc != null) values.push(Math.min(105, metrics.iadc / 80 * 100));
  if (metrics.mentor_score != null) values.push(Math.min(105, metrics.mentor_score / 815 * 100));
  return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
}

function riskFor(metrics) {
  let points = 0;
  if (metrics.dcr != null && metrics.dcr < 99.2) points += 2;
  if (metrics.pod != null && metrics.pod < 99.6) points += 2;
  if (metrics.iadc != null && metrics.iadc < 80) points += 2;
  if (metrics.mentor_score != null && metrics.mentor_score < 815) points += 1;
  if (metrics.concessions != null && metrics.concessions >= 3) points += 2;
  if (metrics.cc != null && metrics.cc < 99) points += 1;
  return points >= 4 ? "High" : points >= 2 ? "Medium" : "Low";
}

function issueFor(metrics) {
  if (metrics.dcr != null && metrics.dcr < 99.2) return "DCR below 99.20% target";
  if (metrics.pod != null && metrics.pod < 99.6) return "POD below 99.60% target";
  if (metrics.iadc != null && metrics.iadc < 80) return "IADC below 80% target";
  if (metrics.mentor_score != null && metrics.mentor_score < 815) return "Mentor score below 815";
  if (metrics.cc != null && metrics.cc < 99) return "Contact Compliance below 99%";
  if (metrics.concessions != null && metrics.concessions >= 3) return "Repeated concessions";
  return "No active concern";
}


function makeRecord({ trid = "", name = "", site = "", metrics = {}, details = {}, priorities = {}, source = "", period = null, identityHint = null }) {
  return {
    trid: normalizeTrid(trid),
    name: String(name || "").trim(),
    site: String(site || "").trim(),
    metrics,
    details,
    priorities,
    source,
    period,
    identityHint,
  };
}

function tableMatrix(table) {
  return Array.from(table.querySelectorAll("tr"))
    .map((tr) => Array.from(tr.querySelectorAll(":scope > th, :scope > td")).map((cell) => cell.textContent.replace(/\s+/g, " ").trim()))
    .filter((row) => row.length);
}

function findHeaderRow(matrix, required = []) {
  for (let i = 0; i < Math.min(matrix.length, 40); i++) {
    const row = matrix[i] || [];
    const cleaned = row.map(clean);
    if (required.every((aliases) => aliases.some((alias) => cleaned.includes(clean(alias))))) return i;
  }
  return -1;
}


function parseGeorgeIadcMatrix(matrix, fileName, sheetName) {
  if (!matrix?.length) return null;
  let best = null;
  for (let h = 0; h < Math.min(matrix.length, 12); h += 1) {
    const headers = matrix[h] || [];
    const nameIndex = fuzzyIndex(headers, ["name", "driver name", "full name", "associate name"]);
    const idIndex = fuzzyIndex(headers, ["transporter id", "trid", "tr id", "driver id"]);
    const iadcIndex = fuzzyIndex(headers, ["iadc %", "iadc", "in app delivery compliance", "in-app delivery compliance"]);
    if (idIndex < 0 || iadcIndex < 0) continue;
    const score = (nameIndex >= 0 ? 2 : 0) + (/iadc/i.test(String(sheetName)) ? 3 : 0);
    if (!best || score > best.score) best = { h, nameIndex, idIndex, iadcIndex, score };
  }
  if (!best) return null;
  const period = inferPeriod(fileName, sheetName);
  const site = (String(fileName).match(/\b(D[A-Z]{2,4}\d{1,3})\b/i) || [])[1]?.toUpperCase() || "DLS2";
  const records = [], identities = [];
  for (const cells of matrix.slice(best.h + 1)) {
    const trid = normalizeTrid(cells[best.idIndex]);
    const name = best.nameIndex >= 0 ? String(cells[best.nameIndex] ?? "").trim() : "";
    const iadc = numeric(cells[best.iadcIndex], "iadc");
    if (!isValidTrid(trid) || iadc == null) continue;
    if (isUsablePersonName(name)) identities.push({ trid, name, site, source: fileName, confidence: 1 });
    records.push(makeRecord({ trid, name: isUsablePersonName(name) ? name : "", site, metrics: { iadc }, priorities: { iadc: 120 }, source: fileName, period, details: { iadc: { sourceSheet: sheetName } } }));
  }
  return records.length ? { reportType: "iadc_spreadsheet", records, identities, rows: records.length, label: sheetName } : null;
}

function parseMentorAliasMatrix(matrix, fileName, sheetName) {
  if (!matrix?.length) return null;

  let headerIndex = -1;
  for (let h = 0; h < Math.min(matrix.length, 20); h += 1) {
    const row = matrix[h] || [];
    if (row.length < 4) continue;
    const c = row.slice(0, 4).map(clean);
    const firstLooksName = c[0] === "name" || c[0] === "first name";
    const firstLooksSurname = c[1] === "sure name" || c[1] === "surname" || c[1] === "last name";
    const clearLooksName = c[2] === "name" || c[2] === "first name";
    const clearLooksSurname = c[3] === "sure name" || c[3] === "surname" || c[3] === "last name";
    if (firstLooksName && firstLooksSurname && clearLooksName && clearLooksSurname) {
      headerIndex = h;
      break;
    }
  }
  // headerless mentor alias dictionary: encrypted first/last + clear first/last.
  if (headerIndex < 0) {
    const sample = matrix.slice(0, Math.min(matrix.length, 25));
    const valid = sample.filter((cells) => looksEncryptedNameToken(cells?.[0]) && looksEncryptedNameToken(cells?.[1]) && isUsablePersonName(`${String(cells?.[2] ?? "").trim()} ${String(cells?.[3] ?? "").trim()}`));
    if (valid.length >= 3) headerIndex = -1; else return null;
  }

  const aliases = [];
  const seen = new Set();
  for (const cells of matrix.slice(headerIndex >= 0 ? headerIndex + 1 : 0)) {
    const firstHash = String(cells[0] ?? "").trim();
    const lastHash = String(cells[1] ?? "").trim();
    const firstName = String(cells[2] ?? "").trim();
    const lastName = String(cells[3] ?? "").trim();
    const name = `${firstName} ${lastName}`.replace(/\s+/g, " ").trim();
    const key = mentorHashKey(firstHash, lastHash);
    if (!looksEncryptedNameToken(firstHash) || !looksEncryptedNameToken(lastHash) || !isUsablePersonName(name) || !key || seen.has(key)) continue;
    seen.add(key);
    aliases.push({ key, firstHash, lastHash, firstName, lastName, name, source: fileName, confidence: 1 });
  }

  // The eMentor alias workbook is a dictionary, not a performance report.
  // Require several valid mappings to avoid misclassifying a normal 4-column sheet.
  if (aliases.length < 3) return null;
  return {
    reportType: "mentor_alias_master",
    records: [],
    identities: [],
    mentorAliases: aliases,
    rows: aliases.length,
    label: sheetName,
  };
}

function parseMentorMatrix(matrix, fileName, sheetName) {
  if (!matrix?.length) return null;

  const firstAliases = ["first name", "firstname", "forename", "given name"];
  const lastAliases = ["last name", "lastname", "surname", "sure name", "family name"];
  const nameAliases = [
    "driver name", "full name", "name", "driver", "delivery associate name",
    "delivery associate", "associate name", "employee name", "courier name",
  ];
  const idAliases = [
    "trid", "tr id", "transporter id", "transporterid", "driver id", "delivery associate id",
    "delivery associate identifier", "da id", "associate id", "courier id",
  ];
  const scoreAliases = [
    "score", "mentor score", "ementor score", "e mentor score", "fico", "fico score",
    "fico safe driving score", "safe driving metric fico", "safe driving score",
    "driving score", "driver score", "safety score",
  ];

  let best = null;
  for (let h = 0; h < Math.min(matrix.length, 100); h++) {
    const row = uniqueHeaders(matrix[h] || []);
    const first = fuzzyIndex(row, firstAliases);
    const last = fuzzyIndex(row, lastAliases);
    const name = exactIndex(row, nameAliases);
    const id = fuzzyIndex(row, idAliases);
    const score = fuzzyIndex(row, scoreAliases);
    const acceleration = fuzzyIndex(row, ["acceleration", "acceleration rating", "harsh acceleration"]);
    const braking = fuzzyIndex(row, ["braking", "braking rating", "harsh braking"]);
    const cornering = fuzzyIndex(row, ["cornering", "cornering rating", "harsh cornering"]);
    const distraction = fuzzyIndex(row, ["distraction", "distraction rating", "phone distraction", "cell phone distraction"]);
    const speedingIndexes = row.map((value, i) => clean(value).includes("speeding") ? i : -1).filter((i) => i >= 0);
    const behaviourSignals = [acceleration, braking, cornering, distraction, ...speedingIndexes].filter((i) => i >= 0).length;
    const hasName = name >= 0 || (first >= 0 && last >= 0);
    if (score < 0 || !hasName) continue;

    const sourceLooksMentor = /mentor|ementor|e-mentor|edriving|driver.?report|vrm|safety/i.test(`${fileName} ${sheetName}`);
    let evidence = 0;
    if (sourceLooksMentor) evidence += 3;
    if (behaviourSignals >= 1) evidence += 2;
    if (behaviourSignals >= 3) evidence += 2;
    if (id >= 0) evidence += 1;
    const cleanScore = clean(row[score]);
    if (cleanScore.includes("mentor") || cleanScore.includes("fico") || cleanScore.includes("safe driving")) evidence += 3;
    if (evidence < 2) continue;

    const candidate = { h, row, first, last, name, id, score, acceleration, braking, cornering, distraction, speedingIndexes, evidence };
    if (!best || candidate.evidence > best.evidence) best = candidate;
  }
  if (!best) return null;

  const headers = best.row;
  const training = fuzzyIndex(headers, ["training", "training assigned", "assigned training"]);
  const completed = fuzzyIndex(headers, ["completed", "training completed", "completed training"]);
  const records = [];
  const identities = [];

  for (const cells of matrix.slice(best.h + 1)) {
    const rawFirst = best.first >= 0 ? String(cells[best.first] ?? "").trim() : "";
    const rawLast = best.last >= 0 ? String(cells[best.last] ?? "").trim() : "";
    const combinedName = best.name >= 0
      ? String(cells[best.name] ?? "").trim()
      : `${rawFirst} ${rawLast}`.replace(/\s+/g, " ").trim();
    const trid = best.id >= 0 ? normalizeTrid(cells[best.id]) : "";
    const mentor = numeric(cells[best.score], "mentor_score");
    const encryptedPair = looksEncryptedNameToken(rawFirst) && looksEncryptedNameToken(rawLast);
    const usableName = !encryptedPair && isUsablePersonName(combinedName);
    let identityHint = encryptedPair ? {
      key: mentorHashKey(rawFirst, rawLast),
      firstHash: rawFirst,
      lastHash: rawLast,
    } : null;
    // secondary encrypted Mentor identity pair: George workbook keeps readable names in cols A/B and hashes in C/D.
    if (!identityHint) {
      const encryptedCells = (cells || []).map((value) => String(value ?? "").trim()).filter(looksEncryptedNameToken);
      if (encryptedCells.length >= 2) identityHint = { key: mentorHashKey(encryptedCells[0], encryptedCells[1]), firstHash: encryptedCells[0], lastHash: encryptedCells[1] };
    }

    if (mentor == null || (!usableName && !isValidTrid(trid) && !identityHint?.key)) continue;
    if (isValidTrid(trid) && usableName) {
      identities.push({ trid, name: combinedName, source: fileName, confidence: 1 });
    }

    records.push(makeRecord({
      trid,
      name: usableName ? combinedName : "",
      metrics: { mentor_score: mentor },
      priorities: { mentor_score: 100 },
      identityHint,
      details: {
        mentor: {
          identityKey: identityHint?.key || null,
          acceleration: best.acceleration >= 0 ? String(cells[best.acceleration] ?? "").trim() : "",
          braking: best.braking >= 0 ? String(cells[best.braking] ?? "").trim() : "",
          cornering: best.cornering >= 0 ? String(cells[best.cornering] ?? "").trim() : "",
          distraction: best.distraction >= 0 ? String(cells[best.distraction] ?? "").trim() : "",
          speedingRisk: best.speedingIndexes[0] != null ? String(cells[best.speedingIndexes[0]] ?? "").trim() : "",
          speedingEvents: best.speedingIndexes[1] != null ? numeric(cells[best.speedingIndexes[1]], "speeding") : null,
          training: training >= 0 ? numeric(cells[training], "training") : null,
          completed: completed >= 0 ? numeric(cells[completed], "completed") : null,
        },
      },
      source: fileName,
    }));
  }

  return records.length ? { reportType: "mentor", records, identities, rows: records.length, label: sheetName } : null;
}

function parseIdentityMasterMatrix(matrix, fileName, sheetName) {
  if (!matrix?.length) return null;

  let defaultSite = "";
  for (let r = 0; r < Math.min(matrix.length - 1, 10); r += 1) {
    const row = matrix[r] || [];
    const stationIndex = row.findIndex((cell) => clean(cell) === "station");
    if (stationIndex >= 0) {
      const candidate = String(matrix[r + 1]?.[stationIndex] ?? "").trim();
      if (/^[A-Z]{2,5}\d+$/i.test(candidate)) defaultSite = candidate.toUpperCase();
    }
  }

  const idAliases = [
    "trid", "tr id", "transporter id", "transporterid", "driver id", "delivery associate id",
    "delivery associate identifier", "da id", "associate id", "courier id", "amazon id",
  ];
  const nameAliases = [
    "driver name", "delivery associate name", "full name", "name", "delivery associate",
    "da name", "associate name", "courier name", "employee name",
  ];
  const firstAliases = ["first name", "firstname", "forename", "given name"];
  const lastAliases = ["last name", "lastname", "surname", "family name"];
  const siteAliases = ["site", "station", "depot", "delivery station", "service area"];

  let best = null;
  for (let h = 0; h < Math.min(matrix.length, 100); h++) {
    const headers = uniqueHeaders(matrix[h] || []);
    const id = fuzzyIndex(headers, idAliases);
    const name = exactIndex(headers, nameAliases);
    const first = fuzzyIndex(headers, firstAliases);
    const last = fuzzyIndex(headers, lastAliases);
    const site = fuzzyIndex(headers, siteAliases);
    if (id < 0 || (name < 0 && !(first >= 0 && last >= 0))) continue;

    let score = 3;
    if (/master|roster|schedule|driver.?list|trid|associate/i.test(`${fileName} ${sheetName}`)) score += 3;
    if (site >= 0) score += 1;
    const candidate = { h, headers, id, name, first, last, site, score };
    if (!best || candidate.score > best.score) best = candidate;
  }
  if (!best) return null;

  const identities = [];
  const seen = new Set();
  for (const cells of matrix.slice(best.h + 1)) {
    const trid = normalizeTrid(cells[best.id]);
    const fullName = best.name >= 0
      ? String(cells[best.name] ?? "").trim()
      : `${String(cells[best.first] ?? "").trim()} ${String(cells[best.last] ?? "").trim()}`.replace(/\s+/g, " ").trim();
    const site = best.site >= 0 ? String(cells[best.site] ?? "").trim() : defaultSite;
    if (!isValidTrid(trid) || !isUsablePersonName(fullName) || seen.has(trid)) continue;
    seen.add(trid);
    identities.push({ trid, name: fullName, site, source: fileName, confidence: 1 });
  }

  return identities.length ? {
    reportType: "identity_master",
    records: [],
    identities,
    rows: identities.length,
    label: sheetName,
  } : null;
}


function parseWeeklyConcessionMatrix(matrix, fileName, sheetName) {
  if (!matrix?.length) return null;
  const looksLikeSummary = /dnr\s+by\s+transporter\s+id/i.test(sheetName) || /concession/i.test(fileName);
  if (!looksLikeSummary) return null;

  let best = null;
  for (let h = 0; h < Math.min(matrix.length, 30); h += 1) {
    const headers = matrix[h] || [];
    const idIndex = fuzzyIndex(headers, ["transporter id", "trid", "tr id", "delivery associate id"]);
    if (idIndex < 0) continue;
    const weekly = [];
    headers.forEach((header, index) => {
      const raw = String(header ?? "").trim();
      const match = raw.match(/^(20\d{2})[-_](\d{1,2})_DNR$/i);
      if (!match) return;
      const year = Number(match[1]);
      const week = Number(match[2]);
      if (week >= 1 && week <= 53) weekly.push({ index, period: isoWeekDetails(year, week), header: raw });
    });
    if (weekly.length && (!best || weekly.length > best.weekly.length)) best = { h, idIndex, weekly };
  }
  if (!best) return null;

  const records = [];
  for (const cells of matrix.slice(best.h + 1)) {
    const trid = normalizeTrid(cells[best.idIndex]);
    if (!isValidTrid(trid)) continue;
    for (const column of best.weekly) {
      const count = numeric(cells[column.index], "concessions");
      if (count == null) continue;
      records.push(makeRecord({
        trid,
        metrics: { concessions: count },
        priorities: { concessions: 110 },
        source: fileName,
        period: column.period,
        details: { concessions: { sourceColumn: column.header } },
      }));
    }
  }

  return records.length ? {
    reportType: "concessions_weekly",
    records,
    identities: [],
    rows: records.length,
    label: sheetName,
  } : null;
}

function parseConcessionMatrix(matrix, fileName, sheetName) {
  const looksConcession = /concession/i.test(fileName) || matrix.some((row) => row.some((cell) => /concession/i.test(String(cell))));
  if (!looksConcession) return null;

  const idAliases = ["transporter id", "transporterid", "delivery associate id", "delivery associate identifier", "da", "driver id", "associate id"];
  const nameAliases = ["delivery associate name", "driver name", "full name", "delivery associate"];
  const directAliases = ["concessions", "concession count", "concessions count", "total concessions", "total concession"];
  const trackingAliases = ["tracking number", "tracking id", "package id"];

  let best = null;
  for (let h = 0; h < Math.min(matrix.length, 40); h++) {
    const headers = matrix[h] || [];
    const id = exactIndex(headers, idAliases);
    const name = exactIndex(headers, nameAliases);
    const direct = exactIndex(headers, directAliases);
    const tracking = exactIndex(headers, trackingAliases);
    let priority = 0;
    if (direct >= 0 && (id >= 0 || name >= 0)) priority = 100;
    else if (tracking >= 0 && (id >= 0 || name >= 0)) priority = 80;
    if (priority && (!best || priority > best.priority)) best = { h, headers, id, name, direct, tracking, priority };
  }
  if (!best) return null;

  const grouped = new Map();
  const identities = [];
  for (const cells of matrix.slice(best.h + 1)) {
    const trid = best.id >= 0 ? normalizeTrid(cells[best.id]) : "";
    const name = best.name >= 0 ? String(cells[best.name] ?? "").trim() : "";
    if (!isValidTrid(trid) && !isUsablePersonName(name)) continue;
    const key = isValidTrid(trid) ? trid : `NAME:${nameSignature(name)}`;
    const current = grouped.get(key) || { trid, name, count: 0, seen: false };
    if (best.direct >= 0) {
      const value = numeric(cells[best.direct], "concessions");
      if (value != null) { current.count += value; current.seen = true; }
    } else if (best.tracking >= 0 && String(cells[best.tracking] ?? "").trim()) {
      current.count += 1;
      current.seen = true;
    }
    if (isValidTrid(trid) && isUsablePersonName(name)) identities.push({ trid, name, source: fileName, confidence: 1 });
    grouped.set(key, current);
  }

  const records = [...grouped.values()].filter((x) => x.seen).map((x) => makeRecord({
    trid: x.trid,
    name: x.name,
    metrics: { concessions: x.count },
    priorities: { concessions: 100 },
    source: fileName,
  }));

  return records.length ? { reportType: "concessions", records, identities, rows: records.length, label: sheetName } : null;
}

function parseGenericMatrix(matrix, fileName, sheetName) {
  if (!matrix?.length) return null;

  const idAliases = [
    "trid", "transporter id", "transporterid", "driver id", "associate id",
    "delivery associate id", "delivery associate identifier", "da id", "courier id", "amazon id",
  ];
  const nameAliases = [
    "driver name", "delivery associate name", "full name", "delivery associate", "da name",
    "associate name", "courier name", "employee name", "name",
  ];
  const firstAliases = ["first name", "firstname", "forename", "given name"];
  const lastAliases = ["last name", "lastname", "surname", "family name"];
  const siteAliases = ["site", "station", "depot", "delivery station", "service area"];

  let headerIndex = -1;
  for (let i = 0; i < Math.min(matrix.length, 100); i++) {
    const row = matrix[i] || [];
    const hasId = fuzzyIndex(row, idAliases) >= 0;
    const hasName = exactIndex(row, nameAliases) >= 0;
    const hasSplitName = fuzzyIndex(row, firstAliases) >= 0 && fuzzyIndex(row, lastAliases) >= 0;
    if (hasId || hasName || hasSplitName) {
      headerIndex = i;
      break;
    }
  }
  if (headerIndex < 0) return null;

  const headers = uniqueHeaders(matrix[headerIndex]);
  const idIndex = fuzzyIndex(headers, idAliases);
  const nameIndex = exactIndex(headers, nameAliases);
  const firstIndex = fuzzyIndex(headers, firstAliases);
  const lastIndex = fuzzyIndex(headers, lastAliases);
  const siteIndex = fuzzyIndex(headers, siteAliases);

  const metricIndex = {};
  for (const [key, aliases] of Object.entries(metricAliases)) {
    metricIndex[key] = fuzzyIndex(headers, aliases);
  }

  // A generic column called just "Score" is treated as Mentor only when the source itself
  // clearly looks like Mentor/eDriving. This prevents accidental score misclassification.
  if (metricIndex.mentor_score < 0 && /mentor|ementor|e-mentor|edriving|driver.?report|safety/i.test(`${fileName} ${sheetName}`)) {
    metricIndex.mentor_score = fuzzyIndex(headers, ["score", "driver score", "safety score"]);
  }

  const metricKeys = Object.entries(metricIndex).filter(([, index]) => index >= 0).map(([key]) => key);
  const records = [];
  const identities = [];

  for (const cells of matrix.slice(headerIndex + 1)) {
    const trid = idIndex >= 0 ? normalizeTrid(cells[idIndex]) : "";
    const name = nameIndex >= 0
      ? String(cells[nameIndex] ?? "").trim()
      : (firstIndex >= 0 && lastIndex >= 0
          ? `${String(cells[firstIndex] ?? "").trim()} ${String(cells[lastIndex] ?? "").trim()}`.replace(/\s+/g, " ").trim()
          : "");
    const site = siteIndex >= 0 ? String(cells[siteIndex] ?? "").trim() : "";
    if (!isValidTrid(trid) && !isUsablePersonName(name)) continue;

    if (isValidTrid(trid) && isUsablePersonName(name)) {
      identities.push({ trid, name, site, source: fileName, confidence: 1 });
    }

    const metrics = {};
    const priorities = {};
    for (const key of metricKeys) {
      const value = numeric(cells[metricIndex[key]], key);
      if (value != null) {
        metrics[key] = value;
        priorities[key] = key === "mentor_score" ? 95 : 60;
      }
    }
    if (Object.keys(metrics).length) records.push(makeRecord({ trid, name, site, metrics, priorities, source: fileName }));
  }

  if (!records.length && !identities.length) return null;
  const lower = `${fileName} ${sheetName}`.toLowerCase();
  const reportType = /schedule|roster|master|driver.?list|trid/.test(lower) && !records.length ? "identity_master" : "spreadsheet";
  return { reportType, records, identities, rows: Math.max(records.length, identities.length), label: sheetName };
}


async function parseSpreadsheet(file) {
  const XLSX = await import("xlsx");
  const ext = file.name.split(".").pop()?.toLowerCase();
  let workbook;
  if (ext === "csv" || ext === "tsv") {
    workbook = XLSX.read(await file.text(), { type: "string", cellDates: true, FS: ext === "tsv" ? "\t" : undefined });
  } else {
    workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  }

  const outputs = [];
  const weeklyConcessionSheet = workbook.SheetNames.find((name) => /dnr\s+by\s+transporter\s+id/i.test(name));
  const concessionWorkbook = /concession/i.test(file.name) && !!weeklyConcessionSheet;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false, blankrows: false });

    // Concessions workbooks contain both raw rows and an auditable weekly summary.
    // Prefer exactly one source of truth so the same DNR is never counted twice.
    if (concessionWorkbook) {
      if (sheetName !== weeklyConcessionSheet) continue;
      const weekly = parseWeeklyConcessionMatrix(matrix, file.name, sheetName);
      if (weekly) outputs.push(weekly);
      continue;
    }

    const iadcSheet = parseGeorgeIadcMatrix(matrix, file.name, sheetName);
    if (iadcSheet) { outputs.push(iadcSheet); continue; }
    const mentorAliases = parseMentorAliasMatrix(matrix, file.name, sheetName);
    if (mentorAliases) { outputs.push(mentorAliases); continue; }
    const mentor = parseMentorMatrix(matrix, file.name, sheetName);
    if (mentor) { outputs.push(mentor); continue; }
    const weeklyConcessions = parseWeeklyConcessionMatrix(matrix, file.name, sheetName);
    if (weeklyConcessions) { outputs.push(weeklyConcessions); continue; }
    const concessions = parseConcessionMatrix(matrix, file.name, sheetName);
    if (concessions) { outputs.push(concessions); continue; }
    const identityMaster = parseIdentityMasterMatrix(matrix, file.name, sheetName);
    if (identityMaster) { outputs.push(identityMaster); continue; }
    const generic = parseGenericMatrix(matrix, file.name, sheetName);
    if (generic) outputs.push(generic);
  }

  return outputs;
}

function findIadcSummaryTable(section) {
  for (const table of section.querySelectorAll("table")) {
    const rows = tableMatrix(table);
    for (let i = 0; i < Math.min(rows.length, 8); i++) {
      const c = rows[i].map(clean);
      if (c.includes("transporter id") && c.includes("dwc") && c.includes("iadc")) {
        return { table, rows, headerIndex: i };
      }
    }
  }
  return null;
}

function parseIadcHtml(doc, fileName, period) {
  const section =
    doc.querySelector(`section[data-tab="week_${period.year}${String(period.week).padStart(2, "0")}"]`) ||
    doc.querySelector(`section[data-tab*="${period.year}${String(period.week).padStart(2, "0")}"]`) ||
    doc;
  const summary = findIadcSummaryTable(section);
  if (!summary) return null;

  const header = summary.rows[summary.headerIndex];
  const idIndex = exactIndex(header, ["Transporter ID"]);
  const dwcIndex = exactIndex(header, ["DWC %", "DWC"]);
  const iadcIndex = exactIndex(header, ["IADC %", "IADC"]);
  if (idIndex < 0 || iadcIndex < 0) return null;

  const records = [];
  for (const cells of summary.rows.slice(summary.headerIndex + 1)) {
    const trid = normalizeTrid(cells[idIndex]);
    if (!isValidTrid(trid)) continue;
    const iadc = numeric(cells[iadcIndex], "iadc");
    const dwc = dwcIndex >= 0 ? numeric(cells[dwcIndex], "dwc") : null;
    if (iadc == null && dwc == null) continue;
    const metrics = {};
    const priorities = {};
    if (iadc != null) { metrics.iadc = iadc; priorities.iadc = 100; }
    if (dwc != null) { metrics.dwc = dwc; priorities.dwc = 100; }
    records.push(makeRecord({ trid, metrics, priorities, source: fileName, period }));
  }
  return records.length ? { reportType: "iadc", records, identities: [], rows: records.length, period } : null;
}

function parseCdfHtml(doc, fileName, period) {
  const section = doc.querySelector('section[data-tab="negative_feedback_tracking_ids"]');
  if (!section) return null;
  const table = section.querySelector("table");
  if (!table) return null;
  const matrix = tableMatrix(table);
  const headerIndex = matrix.findIndex((row) => row.map(clean).includes("tracking id") && row.map(clean).includes("transporter id"));
  if (headerIndex < 0) return null;

  const headers = matrix[headerIndex];
  const index = (name) => exactIndex(headers, [name]);
  const iTracking = index("Tracking ID");
  const iTrid = index("Transporter ID");
  const iL0 = index("Feedback L0");
  const iL1 = index("Feedback L1");
  const iL2 = index("Feedback L2");
  const iDate = index("Feedback Date");
  const iDelivery = index("Delivery Time");
  const iCity = index("City");
  const iPost = index("Postal Code");
  const iCc = index("Contact Compliance");
  const iPhrC = index("PHR - Compliance");
  const iPhrSafe = index("PHR - Safe Place");
  const iPhrLoc = index("PHR - Delivery Location");
  const iDistance = index("Package Scanned > 25m Distance");
  const iDnr = index("DNR Concession");

  const events = [];
  const perDriver = new Map();
  for (const cells of matrix.slice(headerIndex + 1)) {
    const trackingId = String(cells[iTracking] ?? "").trim();
    const trid = normalizeTrid(cells[iTrid]);
    if (!trackingId || !isValidTrid(trid)) continue;
    const event = {
      trackingId,
      trid,
      feedbackL0: String(cells[iL0] ?? "").trim(),
      feedbackL1: String(cells[iL1] ?? "").trim(),
      feedbackL2: String(cells[iL2] ?? "").trim(),
      feedbackDate: String(cells[iDate] ?? "").slice(0, 10) || null,
      deliveryTime: String(cells[iDelivery] ?? "").trim() || null,
      city: String(cells[iCity] ?? "").trim(),
      postalCode: String(cells[iPost] ?? "").trim(),
      contactCompliance: String(cells[iCc] ?? "").trim(),
      phrCompliance: String(cells[iPhrC] ?? "").trim(),
      phrSafePlace: String(cells[iPhrSafe] ?? "").trim(),
      phrDeliveryLocation: String(cells[iPhrLoc] ?? "").trim(),
      scannedOver25m: /^y(es)?$/i.test(String(cells[iDistance] ?? "").trim()),
      dnrConcession: /^y(es)?$/i.test(String(cells[iDnr] ?? "").trim()),
      source: fileName,
      period,
    };
    events.push(event);
    perDriver.set(trid, (perDriver.get(trid) || 0) + 1);
  }

  const records = [...perDriver.entries()].map(([trid, count]) => makeRecord({
    trid,
    details: { cdfFeedbackCount: count },
    source: fileName,
  }));

  return events.length ? { reportType: "cdf", records, identities: [], feedbackEvents: events, rows: events.length } : null;
}

function parseKnownHtmlTable(doc, fileName, reportType, requiredNames, metricMap, priority = 100) {
  for (const table of doc.querySelectorAll("table")) {
    const matrix = tableMatrix(table);
    for (let h = 0; h < Math.min(matrix.length, 10); h++) {
      const headers = matrix[h];
      const idIndex = exactIndex(headers, ["Transporter ID", "TRID"]);
      if (idIndex < 0) continue;
      const indexes = {};
      let found = true;
      for (const [metric, aliases] of Object.entries(metricMap)) {
        indexes[metric] = fuzzyIndex(headers, aliases);
        if (requiredNames.includes(metric) && indexes[metric] < 0) found = false;
      }
      if (!found) continue;
      const records = [];
      for (const cells of matrix.slice(h + 1)) {
        const trid = normalizeTrid(cells[idIndex]);
        if (!isValidTrid(trid)) continue;
        const metrics = {}, priorities = {};
        for (const [metric, index] of Object.entries(indexes)) {
          if (index < 0) continue;
          const value = numeric(cells[index], metric);
          if (value != null) { metrics[metric] = value; priorities[metric] = priority; }
        }
        if (Object.keys(metrics).length) records.push(makeRecord({ trid, metrics, priorities, source: fileName }));
      }
      if (records.length) return { reportType, records, identities: [], rows: records.length };
    }
  }
  return null;
}

async function parseHtml(file) {
  const text = await file.text();
  const doc = new DOMParser().parseFromString(text, "text/html");
  const period = inferPeriod(file.name, doc.title || "");
  const lower = file.name.toLowerCase();

  if (lower.includes("dwc-iadc") || clean(doc.body?.textContent).includes("in app delivery workflow compliance")) {
    const output = parseIadcHtml(doc, file.name, period);
    if (output) return [output];
  }

  if (lower.includes("cdf") || doc.querySelector('section[data-tab="negative_feedback_tracking_ids"]')) {
    const output = parseCdfHtml(doc, file.name, period);
    if (output) return [output];
  }

  if (lower.includes("contact-compliance")) {
    const output = parseKnownHtmlTable(doc, file.name, "contact_compliance", ["cc"], { cc: metricAliases.cc }, 100);
    if (output) return [output];
  }

  if (lower.includes("phr")) {
    const output = parseKnownHtmlTable(doc, file.name, "phr", ["phr"], { phr: metricAliases.phr }, 100);
    if (output) return [output];
  }

  if (lower.includes("daily-report")) {
    const output = parseKnownHtmlTable(doc, file.name, "daily_report", [], {
      dnr: metricAliases.dnr,
      rts: metricAliases.rts,
      podFails: metricAliases.podFails,
      ccFails: metricAliases.ccFails,
    }, 70);
    if (output) return [output];
  }

  const outputs = [];
  for (const [i, table] of Array.from(doc.querySelectorAll("table")).entries()) {
    const generic = parseGenericMatrix(tableMatrix(table), file.name, `HTML table ${i + 1}`);
    if (generic) outputs.push(generic);
  }
  return outputs;
}

async function extractPdf(file) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (pdfjs.GlobalWorkerOptions) pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const document = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pageTexts = [];
  for (let i = 1; i <= Math.min(document.numPages, 35); i++) {
    const page = await document.getPage(i);
    const content = await page.getTextContent();
    let text = "", lastY = null;
    for (const item of content.items) {
      const y = item.transform?.[5];
      if (lastY != null && y != null && Math.abs(y - lastY) > 2.5) text += "\n";
      else if (text && !text.endsWith("\n")) text += " ";
      text += item.str || "";
      lastY = y;
      if (item.hasEOL) text += "\n";
    }
    pageTexts.push(text.replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim());
  }
  return { pages: document.numPages, pageTexts, text: pageTexts.join("\n") };
}

function parseRatingValue(raw) {
  const text = String(raw || "").trim();
  if (!text || /^n\/a$/i.test(text) || /^none$/i.test(text) || /^in compliance$/i.test(text)) return text || null;
  const number = Number(text.replace(/,/g, "").replace(/%/g, ""));
  return Number.isFinite(number) ? number : text;
}

function metricFromText(text, labelPattern) {
  const re = new RegExp(`(?:\\?|•)?\\s*(?:${labelPattern})\\s*\\n?\\s*([^\\n|]+?)(?:\\|([^\\n]+))?(?:\\n|$)`, "i");
  const match = text.match(re);
  if (!match) return null;
  return {
    value: parseRatingValue(match[1]),
    standing: match[2]?.trim() || null,
  };
}

function scorecardSiteSummary(fileName, text, period) {
  const site = (text.match(/\bDCSL at ([A-Z0-9]+)/i) || fileName.match(/DCSL[-_ ]([A-Z0-9]+)/i))?.[1] || "Unknown";
  const rankMatch = text.match(/Rank at [^:]+:\s*(\d+)\s*\(\s*([+-]?\d+)\s*WoW/i);
  const overallMatch = text.match(/Overall Score:\s*\n?\s*([\d.]+)\s*\|\s*([A-Za-z+ ]+)/i);
  const standing = overallMatch?.[2]?.trim() || (text.match(/Overall Standing\s*\n\s*([A-Za-z+ ]+)/i)?.[1]?.trim() || null);

  const metrics = {
    mentor_score: metricFromText(text, "Safe Driving Metric \\(FICO\\)"),
    speeding_event_rate: metricFromText(text, "Speeding Event Rate(?: \\(Per 100 Trips\\))?"),
    mentor_adoption_rate: metricFromText(text, "Mentor Adoption Rate"),
    vsa: metricFromText(text, "Vehicle Audit \\(VSA\\) Compliance"),
    boc: metricFromText(text, "Breach of Contract \\(BOC\\)"),
    whc: metricFromText(text, "Working Hours Compliance \\(WHC\\)"),
    cas: metricFromText(text, "Comprehensive Audit Score \\(CAS\\)"),
    ce_dpmo: metricFromText(text, "Customer Escalation DPMO"),
    cdf_dpmo: metricFromText(text, "Customer Delivery Feedback"),
    pod: metricFromText(text, "Photo-On-Delivery"),
    cc: metricFromText(text, "Contact Compliance"),
    dcr: metricFromText(text, "Delivery Completion Rate \\(DCR\\)"),
    dnr_dpmo: metricFromText(text, "Delivered Not Received\\s*\\(DNR DPMO\\)"),
    lor: metricFromText(text, "Lost on Road \\(LoR\\) DPMO"),
    dsc_dpmo: metricFromText(text, "Delivery Success Conditions \\(DSC DPMO\\)"),
    capacity_reliability: metricFromText(text, "Capacity Reliability"),
    psb: metricFromText(text, "Pickup Success Behaviours"),
  };

  const focus = [];
  const focusBlock = text.match(/Recommended Focus Areas([\s\S]{0,500}?)(?:Current Week Tips|Page \d+|$)/i)?.[1] || "";
  for (const match of focusBlock.matchAll(/\d+\.\s*([^\n]+)/g)) focus.push(match[1].trim());

  return {
    site,
    year: period.year,
    week: period.week,
    weekLabel: period.weekLabel,
    overallScore: overallMatch ? Number(overallMatch[1]) : null,
    standing,
    siteRank: rankMatch ? Number(rankMatch[1]) : null,
    rankDelta: rankMatch ? Number(rankMatch[2]) : null,
    safetyStanding: text.match(/Compliance and Safety:\s*\n?\s*([A-Za-z+ ]+)/i)?.[1]?.trim() || null,
    deliveryQualityStanding: text.match(/Delivery Quality & SWC:\s*\n?\s*([A-Za-z+ ]+)/i)?.[1]?.trim() || null,
    capacityStanding: text.match(/Capacity:\s*\n?\s*([A-Za-z+ ]+)/i)?.[1]?.trim() || null,
    pickupQualityStanding: text.match(/Pickup Quality:\s*\n?\s*([A-Za-z+ ]+)/i)?.[1]?.trim() || null,
    metrics,
    focusAreas: focus,
    sourceFile: fileName,
  };
}

function parseScorecardDriverRows(fileName, text) {
  const flattened = text.replace(/\s+/g, " ");
  const re = /\b(A[A-Z0-9]{8,})\s+(\d+)\s+([\d.]+%)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+%|-|N\/A)\s+([\d.-]+%|-|N\/A)\s+([\d.-]+|-)\s+([\d.-]+|-|N\/A)\s+([\d.-]+|-)/g;
  const byTrid = new Map();
  let match;
  while ((match = re.exec(flattened))) {
    const trid = normalizeTrid(match[1]);
    if (!isValidTrid(trid)) continue;
    const metrics = {
      delivered: numeric(match[2], "delivered"),
      dcr: numeric(match[3], "dcr"),
      dsc_dpmo: numeric(match[4], "dsc_dpmo"),
      lor: numeric(match[5], "lor"),
      pod: numeric(match[6], "pod"),
      cc: numeric(match[7], "cc"),
      ce_dpmo: numeric(match[8], "ce_dpmo"),
      cdf_dpmo: numeric(match[9], "cdf_dpmo"),
      psb: numeric(match[10], "psb"),
    };
    const priorities = {};
    Object.keys(metrics).forEach((key) => { if (metrics[key] != null) priorities[key] = key === "pod" ? 85 : 95; });
    const record = makeRecord({ trid, metrics, priorities, source: fileName });
    const existing = byTrid.get(trid);
    if (!existing || Object.values(metrics).filter((v) => v != null).length > Object.values(existing.metrics).filter((v) => v != null).length) {
      byTrid.set(trid, record);
    }
  }
  return [...byTrid.values()];
}

function parsePodPdf(fileName, text) {
  const rows = [];
  const re = /\b(A[A-Z0-9]{8,})\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)(?:\s+\d+){0,8}\b/g;
  let match;
  while ((match = re.exec(text.replace(/\s+/g, " ")))) {
    const opportunities = Number(match[2]), success = Number(match[3]);
    if (!opportunities || success > opportunities) continue;
    rows.push(makeRecord({
      trid: match[1],
      metrics: { pod: Number((success / opportunities * 100).toFixed(4)) },
      priorities: { pod: 100 },
      details: { pod: { opportunities, success, bypass: Number(match[4]), rejects: Number(match[5]) } },
      source: fileName,
    }));
  }
  const unique = new Map();
  for (const row of rows) unique.set(row.trid, row);
  return [...unique.values()];
}

function parseEscalationPdf(fileName, text) {
  const counts = new Map();
  for (const match of text.matchAll(/\b(A[A-Z0-9]{8,})\b/g)) {
    const trid = normalizeTrid(match[1]);
    counts.set(trid, (counts.get(trid) || 0) + 1);
  }
  return [...counts.entries()].map(([trid, count]) => makeRecord({
    trid,
    details: { customerEscalationIncidents: count },
    source: fileName,
  }));
}

async function parsePdf(file) {
  const extracted = await extractPdf(file);
  const period = inferPeriod(file.name, extracted.pageTexts.slice(0, 2).join("\n"));
  const lower = file.name.toLowerCase();
  const outputs = [];

  if (lower.includes("scorecard") || /DSP WEEKLY SCORECARD/i.test(extracted.text)) {
    const records = parseScorecardDriverRows(file.name, extracted.text);
    outputs.push({
      reportType: "scorecard",
      records,
      identities: [],
      siteScorecard: scorecardSiteSummary(file.name, extracted.pageTexts?.[1] || extracted.text, period),
      rows: records.length,
      pdfPreview: extracted.text.replace(/\s+/g, " ").slice(0, 500),
    });
  } else if (lower.includes("pod") || /POD Summary|Photo On Delivery Quality/i.test(extracted.text)) {
    const records = parsePodPdf(file.name, extracted.text);
    outputs.push({ reportType: "pod", records, identities: [], rows: records.length, pdfPreview: extracted.text.replace(/\s+/g, " ").slice(0, 500) });
  } else if (lower.includes("escalation") || /Weekly Customer Escalations/i.test(extracted.text)) {
    const records = parseEscalationPdf(file.name, extracted.text);
    outputs.push({ reportType: "customer_escalation", records, identities: [], rows: records.length, pdfPreview: extracted.text.replace(/\s+/g, " ").slice(0, 500) });
  } else {
    outputs.push({ reportType: "pdf", records: [], identities: [], rows: 0, pdfPreview: extracted.text.replace(/\s+/g, " ").slice(0, 500) });
  }
  return outputs;
}

async function parseJson(file) {
  const object = JSON.parse(await file.text());
  const arrays = [];
  function visit(value, label = "JSON") {
    if (Array.isArray(value) && value.length && value.every((item) => item && typeof item === "object" && !Array.isArray(item))) arrays.push({ label, rows: value });
    else if (value && typeof value === "object") Object.entries(value).forEach(([key, child]) => visit(child, key));
  }
  visit(object);
  const outputs = [];
  for (const item of arrays) {
    const headers = item.rows[0] ? Object.keys(item.rows[0]) : [];
    const matrix = [headers, ...item.rows.map((row) => headers.map((header) => row[header]))];
    const generic = parseGenericMatrix(matrix, file.name, item.label);
    if (generic) outputs.push(generic);
  }
  return outputs;
}

async function parseXml(file) {
  const doc = new DOMParser().parseFromString(await file.text(), "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("Invalid XML document");
  const rows = Array.from(doc.documentElement.children).map((element) => {
    const row = {};
    Array.from(element.children).forEach((child) => { row[child.tagName] = child.textContent.trim(); });
    return row;
  }).filter((row) => Object.keys(row).length);
  if (!rows.length) return [];
  const headers = Object.keys(rows[0]);
  const matrix = [headers, ...rows.map((row) => headers.map((header) => row[header]))];
  const generic = parseGenericMatrix(matrix, file.name, "XML");
  return generic ? [generic] : [];
}

async function parseText(file) {
  const text = await file.text();
  if (!text.trim()) return [];
  const XLSX = await import("xlsx");
  const delimiter = text.includes("\t") ? "\t" : text.includes(";") ? ";" : ",";
  const workbook = XLSX.read(text, { type: "string", FS: delimiter });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false, blankrows: false });
  const generic = parseGenericMatrix(matrix, file.name, "Text table");
  return generic ? [generic] : [];
}

async function parseFile(file) {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  if (spreadsheetExts.has(ext)) return parseSpreadsheet(file);
  if (htmlExts.has(ext)) return parseHtml(file);
  if (ext === "pdf") return parsePdf(file);
  if (ext === "json") return parseJson(file);
  if (ext === "xml") return parseXml(file);
  if (textExts.has(ext)) return parseText(file);
  return null;
}

function metricWinner(current, value, priority, source) {
  if (value == null) return current;
  if (!current || priority > current.priority) return { value, priority, source };
  if (priority === current.priority && source === current.source) return { value, priority, source };
  return current;
}


function mergeDriverRecord(map, record) {
  const trid = normalizeTrid(record.trid);
  const mentorKey = String(record.identityHint?.key || record.details?.mentor?.identityKey || "").trim();
  const key = isValidTrid(trid)
    ? trid
    : isUsablePersonName(record.name)
      ? `NAME:${nameSignature(record.name)}`
      : mentorKey
        ? `MENTOR:${mentorKey}`
        : null;
  if (!key) return;

  const current = map.get(key) || {
    id: isValidTrid(trid) ? trid : key,
    trid: isValidTrid(trid) ? trid : "",
    name: record.name || "",
    site: record.site || "",
    selected: {},
    details: {},
    identityHint: record.identityHint || null,
    sources: new Set(),
  };

  if (isUsablePersonName(record.name) && !isUsablePersonName(current.name)) current.name = record.name;
  if (record.site && !current.site) current.site = record.site;
  if (record.identityHint?.key) current.identityHint = record.identityHint;

  for (const [metric, value] of Object.entries(record.metrics || {})) {
    if (value == null) continue;
    const priority = record.priorities?.[metric] ?? 50;
    const winner = metricWinner(current.selected[metric], value, priority, record.source);
    if (winner) current.selected[metric] = winner;
  }
  current.details = { ...current.details, ...(record.details || {}) };
  if (record.source) current.sources.add(record.source);
  map.set(key, current);
}


function finalDriver(record) {
  const rawMetrics = {};
  Object.entries(record.selected || {}).forEach(([metric, selected]) => {
    if (selected && selected.value != null) rawMetrics[metric] = selected.value;
  });
  const performance = targetPerformance(rawMetrics);
  const risk = riskFor(rawMetrics);
  const mentorHash = String(record.identityHint?.key || record.details?.mentor?.identityKey || "").trim() || null;
  return {
    id: record.trid || record.id,
    name: isUsablePersonName(record.name) ? record.name : (record.trid || "Unresolved"),
    site: record.site || "Unknown",
    performance,
    risk,
    issue: issueFor(rawMetrics),
    dcr: rawMetrics.dcr ?? null,
    pod: rawMetrics.pod ?? null,
    iadc: rawMetrics.iadc ?? null,
    cc: rawMetrics.cc ?? null,
    mentor_score: rawMetrics.mentor_score ?? null,
    fico: rawMetrics.mentor_score ?? null,
    ementor: rawMetrics.mentor_score ?? null,
    concessions: rawMetrics.concessions ?? null,
    lor: rawMetrics.lor ?? null,
    psb: rawMetrics.psb ?? null,
    reattempts: rawMetrics.reattempts ?? null,
    delivered: rawMetrics.delivered ?? null,
    dnr_dpmo: rawMetrics.dnr_dpmo ?? null,
    dsc_dpmo: rawMetrics.dsc_dpmo ?? null,
    ce_dpmo: rawMetrics.ce_dpmo ?? null,
    cdf_dpmo: rawMetrics.cdf_dpmo ?? null,
    dwc: rawMetrics.dwc ?? null,
    phr: rawMetrics.phr ?? null,
    mentorHash,
    details: record.details || {},
    sources: [...record.sources],
    rawMetrics,
  };
}


function mergeIdentityRecords(records) {
  const byTrid = new Map();
  for (const record of records) {
    const trid = normalizeTrid(record.trid);
    if (!isValidTrid(trid) || !isUsablePersonName(record.name)) continue;
    const existing = byTrid.get(trid);
    const confidence = record.confidence ?? 0;
    const existingConfidence = existing?.confidence ?? -1;
    const richerName = normalizeName(record.name).length > normalizeName(existing?.name || "").length;
    if (!existing || confidence > existingConfidence || (confidence === existingConfidence && richerName)) {
      byTrid.set(trid, { ...record, trid });
    }
  }
  return [...byTrid.values()];
}


export async function analyseFiles(files) {
  const fileResults = [];
  const periodBuckets = new Map();
  const identityRecords = [];
  const mentorAliasRecords = [];
  const feedbackEvents = [];
  const siteScorecards = [];
  const pendingRecords = [];

  for (const file of files) {
    const filePeriod = inferPeriod(file.name);
    try {
      const outputs = await parseFile(file);
      if (outputs === null) {
        fileResults.push({ name: file.name, type: file.name.split(".").pop()?.toLowerCase() || "unknown", status: "unsupported", recognized: false, rows: 0, period: filePeriod });
        continue;
      }

      let rows = 0;
      let recognized = false;
      const reportTypes = new Set();

      for (const output of outputs) {
        rows += output.rows || 0;
        reportTypes.add(output.reportType || "unknown");
        recognized ||= !!(output.rows || output.siteScorecard || output.feedbackEvents?.length || output.mentorAliases?.length);
        identityRecords.push(...(output.identities || []));
        mentorAliasRecords.push(...(output.mentorAliases || []));
        feedbackEvents.push(...(output.feedbackEvents || []));
        if (output.siteScorecard) siteScorecards.push({ ...output.siteScorecard, period: filePeriod });

        for (const record of output.records || []) {
          pendingRecords.push({ record, period: record.period || filePeriod });
        }
      }

      fileResults.push({
        name: file.name,
        type: file.name.split(".").pop()?.toLowerCase() || "unknown",
        reportType: [...reportTypes].join(", "),
        status: recognized ? "parsed" : "read",
        recognized,
        rows,
        period: filePeriod,
      });
    } catch (error) {
      fileResults.push({
        name: file.name,
        type: file.name.split(".").pop()?.toLowerCase() || "unknown",
        reportType: null,
        status: "error",
        recognized: false,
        rows: 0,
        error: error?.message || "Could not parse file",
        period: filePeriod,
      });
    }
  }

  const identities = mergeIdentityRecords(identityRecords);
  const identityDrivers = identities.map((record) => ({
    id: record.trid,
    trid: record.trid,
    full_name: record.name,
    site: record.site || "",
    status: "active",
  }));
  const identityIndexes = buildIdentityIndexes(identityDrivers, []);
  const identityByTrid = new Map(identities.map((record) => [record.trid, record]));
  const mentorResolver = buildMentorAliasResolver(mentorAliasRecords);

  const enrichedMentorAliases = mentorAliasRecords.map((alias) => {
    const resolved = resolveIdentity({ name: alias.name }, identityIndexes);
    return {
      ...alias,
      trid: resolved.driver?.trid || "",
      matchMethod: resolved.method || null,
      matchConfidence: resolved.confidence || 0,
    };
  });

  for (const item of pendingRecords) {
    const record = { ...item.record, details: { ...(item.record.details || {}) } };
    let trid = normalizeTrid(record.trid);
    let name = record.name;

    if (!isUsablePersonName(name) && record.identityHint?.key) {
      const resolvedName = mentorResolver.resolve(record.identityHint);
      if (isUsablePersonName(resolvedName)) name = resolvedName;
    }

    if (!isValidTrid(trid) && isUsablePersonName(name)) {
      const resolved = resolveIdentity({ name }, identityIndexes);
      if (resolved.driver) {
        trid = normalizeTrid(resolved.driver.trid);
        record.site = record.site || resolved.driver.site || "";
      }
    }

    if (isValidTrid(trid) && !isUsablePersonName(name) && identityByTrid.has(trid)) {
      const identity = identityByTrid.get(trid);
      name = identity.name;
      record.site = record.site || identity.site || "";
    }

    record.trid = trid;
    record.name = isUsablePersonName(name) ? name : "";

    const period = item.period || inferPeriod(record.source || "");
    if (!periodBuckets.has(period.key)) {
      periodBuckets.set(period.key, {
        ...period,
        sourceFiles: new Set(),
        records: new Map(),
      });
    }
    const bucket = periodBuckets.get(period.key);
    if (record.source) bucket.sourceFiles.add(record.source);
    mergeDriverRecord(bucket.records, record);
  }

  const periods = [...periodBuckets.values()].map((bucket) => {
    const drivers = [...bucket.records.values()].map((record) => {
      if (record.trid && identityByTrid.has(record.trid) && !isUsablePersonName(record.name)) {
        const identity = identityByTrid.get(record.trid);
        record.name = identity.name;
        record.site = record.site || identity.site || "";
      }
      return finalDriver(record);
    });
    return {
      key: bucket.key,
      weekLabel: bucket.weekLabel,
      year: bucket.year,
      week: bucket.week,
      periodStart: bucket.periodStart,
      periodEnd: bucket.periodEnd,
      sourceFiles: [...bucket.sourceFiles],
      driverCount: drivers.length,
      drivers,
    };
  }).sort((a, b) => String(a.periodStart).localeCompare(String(b.periodStart)));

  const latestByDriver = new Map();
  for (const period of periods) {
    for (const driver of period.drivers) latestByDriver.set(driver.id, driver);
  }
  const drivers = [...latestByDriver.values()].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  const identityTrids = new Set(identities.map((identity) => identity.trid));
  const metricTrids = new Set(drivers.map((driver) => normalizeTrid(driver.id)).filter(isValidTrid));
  const matchedByTrid = new Set([...identityTrids, ...metricTrids]).size;
  const unmatchedDrivers = drivers.filter((driver) => !isValidTrid(driver.id)).length;

  return {
    sourceFiles: files.map((file) => file.name),
    fileResults,
    recognizedFiles: fileResults.filter((result) => result.recognized).length,
    unsupportedFiles: fileResults.filter((result) => result.status === "unsupported").length,
    errorFiles: fileResults.filter((result) => result.status === "error").length,
    identityRecords: identities,
    mentorAliases: enrichedMentorAliases,
    mentorAliasCount: enrichedMentorAliases.length,
    feedbackEvents,
    siteScorecards,
    periods,
    drivers,
    driverCount: new Set([...identityTrids, ...metricTrids]).size || drivers.length,
    matchedByTrid,
    unmatchedDrivers,
  };
}

export async function inspectPdf(file) {
  try {
    const output = await extractPdf(file);
    return { pages: output.pages, preview: output.text.replace(/\s+/g, " ").slice(0, 500) };
  } catch {
    return { pages: 0, preview: "PDF detected. Text preview unavailable in this browser." };
  }
}
