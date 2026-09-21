import {
  inferPeriod,
  inferSiteCode,
  makeRecord,
  numeric,
  scorecardTierFromTotal,
} from "./core.js";
import {
  isUsablePersonName,
  isValidTrid,
  normalizeTrid,
} from "../identity.js";

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
  // POD Quality export: TRID, opportunities, success, bypass, rejects,
  // then the five Amazon reject-reason counters.
  const re = /\b(A[A-Z0-9]{8,})\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\b/g;
  let match;
  while ((match = re.exec(text.replace(/\s+/g, " ")))) {
    const opportunities = Number(match[2]), success = Number(match[3]);
    if (!opportunities || success > opportunities) continue;
    const pod = {
      opportunities, success,
      bypass: Number(match[4]), rejects: Number(match[5]),
      reasons: {
        noPackageDetected: Number(match[6]),
        blurryPhoto: Number(match[7]),
        photoTooDark: Number(match[8]),
        packageInCar: Number(match[9]),
        packageTooClose: Number(match[10]),
      },
    };
    rows.push(makeRecord({
      trid: match[1],
      metrics: { pod: Number((success / opportunities * 100).toFixed(4)) },
      priorities: { pod: 100 },
      details: { pod },
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

export async function parsePdf(file) {
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

export async function inspectPdf(file) {
  try {
    const output = await extractPdf(file);
    return {
      pages: output.pages,
      preview: output.text.replace(/\s+/g, " ").slice(0, 500),
    };
  } catch {
    return {
      pages: 0,
      preview: "PDF detected. Text preview unavailable in this browser.",
    };
  }
}
