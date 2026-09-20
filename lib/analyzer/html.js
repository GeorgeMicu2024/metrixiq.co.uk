import { findDwcErrorIndexes, findIadcHeader } from "../parsers/iadc.js";
import { metricAliases } from "./definitions.js";
import { parseGenericMatrix } from "./spreadsheet.js";
import { tableMatrix } from "./table.js";
import {
  clean,
  exactIndex,
  fuzzyIndex,
  inferPeriod,
  inferSiteCode,
  makeRecord,
  numeric,
} from "./core.js";
import {
  isValidTrid,
  normalizeTrid,
} from "../identity.js";

function findIadcSummaryTable(section) {
  for (const table of section.querySelectorAll("table")) {
    const rows = tableMatrix(table);
    const header = findIadcHeader(rows);
    if (header) return { table, rows, headerIndex: header.rowIndex, ...header };
  }
  return null;
}

function datePeriod(date, weeklyPeriod) {
  return {
    key: `day-${date}`,
    weekLabel: weeklyPeriod.weekLabel,
    year: weeklyPeriod.year,
    week: weeklyPeriod.week,
    periodStart: date,
    periodEnd: date,
    granularity: "daily",
  };
}

function rollingSeries(text, label, keyPattern) {
  const start = text.indexOf(label);
  if (start < 0) return {};
  const chunk = text.slice(start + label.length, start + label.length + 500);
  const keys = chunk.match(keyPattern) || [];
  const values = chunk.match(/\\d+(?:\\.\\d+)?%/g) || [];
  return Object.fromEntries(keys.slice(0, values.length).map((key, i) => [key, Number(values[i].replace("%",""))]));
}

function parseComplianceTrends(doc) {
  const text = String(doc.body?.textContent || "").replace(/\\s+/g, " ");
  return {
    dailyDwc: rollingSeries(text, "7 Day Rolling DWC", /\\d{4}-\\d{2}-\\d{2}/g),
    weeklyDwc: rollingSeries(text, "7 Week Rolling DWC", /\\d{4}-\\d{2}/g),
    dailyIadc: rollingSeries(text, "7 Day Rolling IADC", /\\d{4}-\\d{2}-\\d{2}/g),
    weeklyIadc: rollingSeries(text, "7 Week Rolling IADC", /\\d{4}-\\d{2}/g),
  };
}

function parseIadcSection(section, fileName, period, site, complianceSummary = null) {
  const summary = findIadcSummaryTable(section);
  if (!summary) return [];
  const { idIndex, dwcIndex, iadcIndex } = summary;
  const headers = summary.rows[summary.headerIndex] || [];
  const dwcErrorIndexes = findDwcErrorIndexes(headers);
  if (idIndex < 0 || (iadcIndex < 0 && dwcIndex < 0)) return [];

  const records = [];
  for (const cells of summary.rows.slice(summary.headerIndex + 1)) {
    const trid = normalizeTrid(cells[idIndex]);
    if (!isValidTrid(trid)) continue;
    const iadc = iadcIndex >= 0 ? numeric(cells[iadcIndex], "iadc") : null;
    const dwc = dwcIndex >= 0 ? numeric(cells[dwcIndex], "dwc") : null;
    if (iadc == null && dwc == null) continue;
    const metrics = {}, priorities = {};
    if (iadc != null) { metrics.iadc = iadc; priorities.iadc = 100; }
    if (dwc != null) { metrics.dwc = dwc; priorities.dwc = 100; }
    const dwcErrors = Object.fromEntries(
      Object.entries(dwcErrorIndexes)
        .map(([key,index]) => [key,index >= 0 ? numeric(cells[index], key) : null])
        .filter(([,value]) => value != null)
    );
    records.push(makeRecord({
      trid, site, metrics, priorities, source: fileName, period,
      details: { dwc: { errors: dwcErrors }, complianceSummary },
    }));
  }
  return records;
}

function parseIadcHtml(doc, fileName, period) {
  const site = inferSiteCode(fileName, doc.title || "");
  const outputs = [];
  const trends = parseComplianceTrends(doc);
  const weekToken = `${period.year}${String(period.week).padStart(2, "0")}`;
  const weekSection =
    doc.querySelector(`section[data-tab="week_${weekToken}"]`) ||
    doc.querySelector(`section[data-tab*="${weekToken}"]`);

  if (weekSection) {
    const weekKey = `${period.year}-${String(period.week).padStart(2, "0")}`;
    const summary = { iadc: trends.weeklyIadc[weekKey] ?? null, dwc: trends.weeklyDwc[weekKey] ?? null };
    const records = parseIadcSection(weekSection, fileName, { ...period, granularity: "weekly" }, site, summary);
    if (records.length) outputs.push({ reportType: "iadc-weekly", records, identities: [], rows: records.length, period: { ...period, granularity: "weekly" }, site });
  }

  for (const section of doc.querySelectorAll('section[data-tab^="day_"]')) {
    const token = String(section.getAttribute("data-tab") || "").match(/^day_(\d{4})(\d{2})(\d{2})$/);
    if (!token) continue;
    const date = `${token[1]}-${token[2]}-${token[3]}`;
    const dailyPeriod = datePeriod(date, period);
    const summary = { iadc: trends.dailyIadc[date] ?? null, dwc: trends.dailyDwc[date] ?? null };
    const records = parseIadcSection(section, fileName, dailyPeriod, site, summary);
    if (records.length) outputs.push({ reportType: "iadc-daily", records, identities: [], rows: records.length, period: dailyPeriod, site });
  }

  if (!outputs.length) {
    const records = parseIadcSection(doc, fileName, { ...period, granularity: "weekly" }, site);
    if (records.length) outputs.push({ reportType: "iadc-weekly", records, identities: [], rows: records.length, period: { ...period, granularity: "weekly" }, site });
  }
  return outputs;
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

export async function parseHtml(file) {
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
