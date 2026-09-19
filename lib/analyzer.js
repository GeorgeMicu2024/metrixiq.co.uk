
import { parseGenericMatrix, parseSpreadsheet } from "./analyzer/spreadsheet";
import { parseHtml } from "./analyzer/html";
import { inspectPdf as inspectPdfFile, parsePdf } from "./analyzer/pdf";
import {
  buildMentorAliasResolver,
  inferPeriod,
  issueFor,
  riskFor,
  targetPerformance,
} from "./analyzer/core";

import {
  buildIdentityIndexes,
  isUsablePersonName,
  isValidTrid,
  nameSignature,
  normalizeName,
  normalizeTrid,
  resolveIdentity,
} from "./identity";

const spreadsheetExts = new Set(["xlsx", "xls", "xlsm", "xlsb", "ods", "fods", "csv", "tsv"]);
const textExts = new Set(["txt"]);
const htmlExts = new Set(["html", "htm"]);

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
    scorecard_score: rawMetrics.scorecard_score ?? null,
    tier: rawMetrics.tier ?? null,
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
  return inspectPdfFile(file);
}
