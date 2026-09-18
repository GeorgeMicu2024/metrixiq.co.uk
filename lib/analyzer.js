
import { findIadcHeader } from "./parsers/iadc";
import { metricAliases } from "./analyzer/definitions";
import { parseSpreadsheet } from "./analyzer/spreadsheet";
import { tableMatrix } from "./analyzer/table";
import {
  buildMentorAliasResolver,
  clean,
  exactIndex,
  fuzzyIndex,
  inferPeriod,
  inferSiteCode,
  isoWeekDetails,
  issueFor,
  looksEncryptedNameToken,
  makeRecord,
  mentorHashKey,
  normalizeSiteCode,
  numeric,
  riskFor,
  targetPerformance,
  uniqueHeaders,
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

const percentMetrics = new Set(["dcr", "pod", "iadc", "dwc", "cc", "phr", "reattempts"]);
const spreadsheetExts = new Set(["xlsx", "xls", "xlsm", "xlsb", "ods", "fods", "csv", "tsv"]);
const textExts = new Set(["txt"]);
const htmlExts = new Set(["html", "htm"]);

function findIadcSummaryTable(section) {
  for (const table of section.querySelectorAll("table")) {
    const rows = tableMatrix(table);
    const header = findIadcHeader(rows);
    if (header) return { table, rows, headerIndex: header.rowIndex, ...header };
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

  const { idIndex, dwcIndex, iadcIndex } = summary;
  if (idIndex < 0 || iadcIndex < 0) return null;

  const site = inferSiteCode(fileName, doc.title || "");
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
    records.push(makeRecord({ trid, site, metrics, priorities, source: fileName, period }));
  }
  return records.length ? { reportType: "iadc", records, identities: [], rows: records.length, period, site } : null;
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
  const byTrid = new Map();
  const site = inferSiteCode(fileName);

  // Rich row when PDF extraction keeps the scorecard row together.
  const richPattern = new RegExp(
    "\\b(A[A-Z0-9]{8,})\\s+" +
    "(Fantastic\\s+Plus|Fantastic|Great|Fair|Poor)\\s+" +
    "(.+?)\\s+" +
    "(-?\\d+(?:\\.\\d+)?%?)\\s+" +  // concessions
    "(-?\\d+(?:\\.\\d+)?%?)\\s+" +  // total score
    "(-?\\d+(?:\\.\\d+)?%?)\\s+" +  // FICO
    "(-?\\d+(?:\\.\\d+)?%?)\\s+" +  // delivered
    "(-?\\d+(?:\\.\\d+)?%?)\\s+" +  // DCR
    "(-?\\d+(?:\\.\\d+)?%?)\\s+" +  // DSC
    "(-?\\d+(?:\\.\\d+)?%?)\\s+" +  // LoR
    "(-?\\d+(?:\\.\\d+)?%?)\\s+" +  // POD
    "(-?\\d+(?:\\.\\d+)?%?)\\s+" +  // CC
    "(-?\\d+(?:\\.\\d+)?%?)\\s+" +  // CE
    "(-?\\d+(?:\\.\\d+)?%?)\\s+" +  // CDF
    "(-?\\d+(?:\\.\\d+)?%?)",       // PSB
    "gi"
  );

  let match;
  while ((match = richPattern.exec(flattened))) {
    const trid = normalizeTrid(match[1]);
    if (!isValidTrid(trid)) continue;

    const totalScore = numeric(match[5], "scorecard_score");
    const tier = scorecardTierFromTotal(totalScore) || String(match[2] || "").trim();
    const metrics = {
      concessions: numeric(match[4], "concessions"),
      scorecard_score: totalScore,
      tier,
      mentor_score: numeric(match[6], "mentor_score"),
      delivered: numeric(match[7], "delivered"),
      dcr: numeric(match[8], "dcr"),
      dsc_dpmo: numeric(match[9], "dsc_dpmo"),
      lor: numeric(match[10], "lor"),
      pod: numeric(match[11], "pod"),
      cc: numeric(match[12], "cc"),
      ce_dpmo: numeric(match[13], "ce_dpmo"),
      cdf_dpmo: numeric(match[14], "cdf_dpmo"),
      psb: numeric(match[15], "psb"),
    };

    const priorities = {};
    Object.keys(metrics).forEach((key) => {
      if (metrics[key] != null) priorities[key] = 180;
    });

    const name = String(match[3] || "").trim();
    byTrid.set(trid, makeRecord({
      trid,
      name: isUsablePersonName(name) ? name : "",
      site,
      metrics,
      priorities,
      source: fileName,
      details: { scorecard: { sourceRank: match[2], computedTier: tier } },
    }));
  }

  // Existing Amazon PDF fallback: keeps core quality metrics even when the PDF
  // splits Rank / Name / TOTAL SCORE into a different text order.
  const fallback = new RegExp(
    "\\b(A[A-Z0-9]{8,})\\s+" +
    "(\\d+)\\s+" +
    "([\\d.]+%)\\s+" +
    "([\\d.-]+)\\s+" +
    "([\\d.-]+)\\s+" +
    "([\\d.-]+%|-|N\\/A)\\s+" +
    "([\\d.-]+%|-|N\\/A)\\s+" +
    "([\\d.-]+|-)\\s+" +
    "([\\d.-]+|-|N\\/A)\\s+" +
    "([\\d.-]+|-)",
    "g"
  );

  while ((match = fallback.exec(flattened))) {
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
    Object.keys(metrics).forEach((key) => {
      if (metrics[key] != null) priorities[key] = key === "pod" ? 85 : 95;
    });

    const existing = byTrid.get(trid);
    if (!existing) {
      byTrid.set(trid, makeRecord({ trid, site, metrics, priorities, source: fileName }));
    } else {
      existing.metrics = { ...(metrics || {}), ...(existing.metrics || {}) };
      existing.priorities = { ...(priorities || {}), ...(existing.priorities || {}) };
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
      siteScorecard: scorecardSiteSummary(file.name, extracted.text, period),
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
  try {
    const output = await extractPdf(file);
    return { pages: output.pages, preview: output.text.replace(/\s+/g, " ").slice(0, 500) };
  } catch {
    return { pages: 0, preview: "PDF detected. Text preview unavailable in this browser." };
  }
}
