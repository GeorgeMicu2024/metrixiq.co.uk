import { findIadcHeader } from "../parsers/iadc.js";
import {
  isUsablePersonName,
  isValidTrid,
  nameSignature,
  normalizeTrid,
} from "../identity.js";
import {
  clean,
  exactIndex,
  fuzzyIndex,
  inferPeriod,
  inferSiteCode,
  isoWeekDetails,
  looksEncryptedNameToken,
  makeRecord,
  mentorHashKey,
  normalizeSiteCode,
  numeric,
  scorecardTierFromTotal,
  uniqueHeaders,
} from "./core.js";
import { metricAliases } from "./definitions.js";

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
  const site = inferSiteCode(fileName, sheetName);
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
    const site = best.site >= 0 ? normalizeSiteCode(cells[best.site]) : defaultSite;
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
  if (!matrix?.length) return null;

  const looksConcession =
    /concession|dnr/i.test(fileName) ||
    matrix.some(row =>
      row.some(cell => /concession|delivered not received|packages delivered not received/i.test(String(cell)))
    );

  if (!looksConcession) return null;

  const idAliases = [
    "transporter id",
    "trid",
    "tr id",
    "delivery associate id",
    "delivery associate identifier",
    "driver id",
    "associate id",
    "da id"
  ];

  const nameAliases = [
    "delivery associate name",
    "driver name",
    "full name",
    "associate name",
    "delivery associate",
    "name"
  ];

  const dnrAliases = [
    "packages delivered not received",
    "packages delivered not received dnr",
    "delivered not received",
    "delivered not received dnr",
    "dnr concessions",
    "dnr concession",
    "dnr count",
    "dnr"
  ];

  const rtsAliases = [
    "packages returned to station",
    "packages returned to station rts",
    "returned to station",
    "returned to station rts",
    "rts concessions",
    "rts concession",
    "rts count",
    "rts"
  ];

  const totalAliases = [
    "total concessions",
    "total concession",
    "concession count",
    "concessions count"
  ];

  const trackingAliases = [
    "tracking number",
    "tracking id",
    "package id"
  ];

  const countColumnIndex = (headers, aliases) => {
    let best = { index: -1, score: 0 };

    headers.forEach((header, index) => {
      const raw = String(header ?? "").trim();

      // Never treat DPMO / percentage / rate columns as a count.
      if (!raw || /dpmo|%|percent|percentage|rate/i.test(raw)) return;

      const h = clean(raw);

      for (const alias of aliases) {
        const a = clean(alias);

        let score = 0;

        if (h === a) score = 100;
        else if (h.includes(a)) score = 90;
        else if (a.includes(h) && h.length >= 4) score = 80;
        else {
          const hParts = new Set(h.split(" "));
          const aParts = a.split(" ");
          const overlap = aParts.filter(part => hParts.has(part)).length;

          if (overlap) {
            score = 50 + (overlap / aParts.length) * 30;
          }
        }

        if (score > best.score) {
          best = { index, score };
        }
      }
    });

    return best.score >= 70 ? best.index : -1;
  };

  let best = null;

  for (let h = 0; h < Math.min(matrix.length, 50); h++) {
    const headers = matrix[h] || [];

    const id = fuzzyIndex(headers, idAliases);
    const name = fuzzyIndex(headers, nameAliases);

    if (id < 0 && name < 0) continue;

    const dnr = countColumnIndex(headers, dnrAliases);
    const rts = countColumnIndex(headers, rtsAliases);
    const total = countColumnIndex(headers, totalAliases);
    const tracking = fuzzyIndex(headers, trackingAliases);

    let priority = 0;

    if (dnr >= 0) priority = 150;
    else if (total >= 0) priority = 120;
    else if (tracking >= 0) priority = 80;

    if (priority && (!best || priority > best.priority)) {
      best = {
        h,
        headers,
        id,
        name,
        dnr,
        rts,
        total,
        tracking,
        priority
      };
    }
  }

  if (!best) return null;

  const period = inferPeriod(fileName, sheetName);
  const grouped = new Map();
  const identities = [];

  for (const cells of matrix.slice(best.h + 1)) {
    const trid =
      best.id >= 0
        ? normalizeTrid(cells[best.id])
        : "";

    const name =
      best.name >= 0
        ? String(cells[best.name] ?? "").trim()
        : "";

    if (!isValidTrid(trid) && !isUsablePersonName(name)) {
      continue;
    }

    const key = isValidTrid(trid)
      ? trid
      : `NAME:${nameSignature(name)}`;

    const current = grouped.get(key) || {
      trid,
      name,
      concessions: 0,
      dnr: 0,
      rts: 0,
      seen: false
    };

    if (best.dnr >= 0) {
      const raw = String(cells[best.dnr] ?? "").trim();
      const value = raw === "" ? 0 : numeric(cells[best.dnr], "concessions");

      if (value != null) {
        current.dnr += value;
        current.concessions += value;
        current.seen = true;
      }
    } else if (best.total >= 0) {
      const raw = String(cells[best.total] ?? "").trim();
      const value = raw === "" ? 0 : numeric(cells[best.total], "concessions");

      if (value != null) {
        current.concessions += value;
        current.seen = true;
      }
    } else if (
      best.tracking >= 0 &&
      String(cells[best.tracking] ?? "").trim()
    ) {
      current.concessions += 1;
      current.dnr += 1;
      current.seen = true;
    }

    if (best.rts >= 0) {
      const rawRts = String(cells[best.rts] ?? "").trim();
      const rts = rawRts === "" ? 0 : numeric(cells[best.rts], "concessions");

      if (rts != null) current.rts += rts;
    }

    if (isValidTrid(trid) && isUsablePersonName(name)) {
      identities.push({
        trid,
        name,
        source: fileName,
        confidence: 1
      });
    }

    grouped.set(key, current);
  }

  const records = [...grouped.values()]
    .filter(x => x.seen)
    .map(x =>
      makeRecord({
        trid: x.trid,
        name: x.name,
        metrics: {
          concessions: x.concessions
        },
        priorities: {
          concessions: 150
        },
        details: {
          concessions: {
            dnr: x.dnr,
            rts: x.rts,
            sourceSheet: sheetName
          }
        },
        source: fileName,
        period
      })
    );

  return records.length
    ? {
        reportType: "concessions",
        records,
        identities,
        rows: records.length,
        label: sheetName
      }
    : null;
}
function parseScorecardMatrix(matrix, fileName, sheetName) {
  if (!matrix?.length) return null;

  const period = inferPeriod(fileName, sheetName);
  const site = inferSiteCode(fileName);
  const records = [];
  const identities = [];
  let indexes = null;

  const headerIndexFor = (row, aliases) => fuzzyIndex(row, aliases);

  for (const cells of matrix) {
    const cleanRow = cells.map(clean);
    const looksHeader =
      cleanRow.some((value) => value === "transporter id" || value === "trid") &&
      cleanRow.some((value) => value === "total score" || value === "scorecard score") &&
      cleanRow.some((value) => value === "name" || value === "driver name");

    if (looksHeader) {
      indexes = {
        trid: headerIndexFor(cells, ["transporter id", "trid", "driver id"]),
        rank: headerIndexFor(cells, ["rank", "standing", "tier"]),
        name: headerIndexFor(cells, ["name", "driver name", "delivery associate name"]),
        concessions: headerIndexFor(cells, ["concessions", "concession count"]),
        score: headerIndexFor(cells, ["total score", "scorecard score", "total scorecard score"]),
        fico: headerIndexFor(cells, ["fico", "fico score", "mentor score"]),
        delivered: headerIndexFor(cells, ["delivered", "delivered packages"]),
        dcr: headerIndexFor(cells, ["dcr", "delivery completion rate"]),
        dsc: headerIndexFor(cells, ["dsc dpmo", "dsc", "delivery success conditions dpmo"]),
        lor: headerIndexFor(cells, ["lor dpmo", "lor", "lost on road dpmo"]),
        pod: headerIndexFor(cells, ["pod", "photo on delivery"]),
        cc: headerIndexFor(cells, ["cc", "contact compliance"]),
        ce: headerIndexFor(cells, ["ce", "ce dpmo", "customer escalation"]),
        cdf: headerIndexFor(cells, ["cdf dpmo", "cdf", "customer delivery feedback"]),
        psb: headerIndexFor(cells, ["psb", "pickup success behaviours", "pickup success behaviors"]),
      };
      continue;
    }

    if (!indexes) continue;

    const trid = indexes.trid >= 0 ? normalizeTrid(cells[indexes.trid]) : "";
    if (!isValidTrid(trid)) continue;

    const name = indexes.name >= 0 ? String(cells[indexes.name] ?? "").trim() : "";
    const totalScore = indexes.score >= 0 ? numeric(cells[indexes.score], "scorecard_score") : null;
    const sourceRank = indexes.rank >= 0 ? String(cells[indexes.rank] ?? "").trim() : "";
    const tier = scorecardTierFromTotal(totalScore) || sourceRank;

    const metrics = {
      concessions: indexes.concessions >= 0 ? numeric(cells[indexes.concessions], "concessions") : null,
      scorecard_score: totalScore,
      tier,
      mentor_score: indexes.fico >= 0 ? numeric(cells[indexes.fico], "mentor_score") : null,
      delivered: indexes.delivered >= 0 ? numeric(cells[indexes.delivered], "delivered") : null,
      dcr: indexes.dcr >= 0 ? numeric(cells[indexes.dcr], "dcr") : null,
      dsc_dpmo: indexes.dsc >= 0 ? numeric(cells[indexes.dsc], "dsc_dpmo") : null,
      lor: indexes.lor >= 0 ? numeric(cells[indexes.lor], "lor") : null,
      pod: indexes.pod >= 0 ? numeric(cells[indexes.pod], "pod") : null,
      cc: indexes.cc >= 0 ? numeric(cells[indexes.cc], "cc") : null,
      ce_dpmo: indexes.ce >= 0 ? numeric(cells[indexes.ce], "ce_dpmo") : null,
      cdf_dpmo: indexes.cdf >= 0 ? numeric(cells[indexes.cdf], "cdf_dpmo") : null,
      psb: indexes.psb >= 0 ? numeric(cells[indexes.psb], "psb") : null,
    };

    Object.keys(metrics).forEach((key) => {
      if (metrics[key] == null || metrics[key] === "") delete metrics[key];
    });

    if (isUsablePersonName(name)) {
      identities.push({ trid, name, site, source: fileName, confidence: 1 });
    }

    const priorities = {};
    Object.keys(metrics).forEach((key) => { priorities[key] = 180; });

    records.push(makeRecord({
      trid,
      name: isUsablePersonName(name) ? name : "",
      site,
      metrics,
      priorities,
      source: fileName,
      period,
      details: {
        scorecard: {
          sourceRank,
          computedTier: tier,
          sourceSheet: sheetName,
        },
      },
    }));
  }

  if (!records.length) return null;

  const titleText = matrix
    .slice(0, 12)
    .flat()
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");

  const titleMatch = titleText.match(/WEEK\s*(\d{1,2})\s*[-–]\s*(FANTASTIC\s+PLUS|FANTASTIC|GREAT|FAIR|POOR)\s*[-–]\s*([\d.]+)%/i);
  const titleScore = titleMatch ? Number(titleMatch[3]) : null;
  const titleStanding = titleMatch
    ? titleMatch[2].replace(/\s+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : null;

  return {
    reportType: "scorecard_spreadsheet",
    records,
    identities,
    rows: records.length,
    label: sheetName,
    siteScorecard: titleMatch ? {
      site,
      year: period.year,
      week: period.week,
      weekLabel: period.weekLabel,
      overallScore: titleScore,
      standing: titleStanding,
      siteRank: null,
      rankDelta: null,
      safetyStanding: null,
      deliveryQualityStanding: null,
      capacityStanding: null,
      pickupQualityStanding: null,
      metrics: {},
      focusAreas: [],
      sourceFile: fileName,
    } : null,
  };
}


export function parseGenericMatrix(matrix, fileName, sheetName) {
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
    const site = siteIndex >= 0 ? normalizeSiteCode(cells[siteIndex]) : "";
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


export async function parseSpreadsheet(file) {
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

    const scorecardSheet = parseScorecardMatrix(matrix, file.name, sheetName);
    if (scorecardSheet) { outputs.push(scorecardSheet); continue; }
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
