"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { fetchDriverScorecardData } from "../../lib/data/scorecardData";
import { displayDriverName } from "../../lib/identity";
import { TARGETS } from "../../lib/config/performance";
import { driverShape, num, plain } from "../../lib/scorecards/metrics";
import { calculateDriverScorecard } from "../../lib/scorecards/driverScoreFormula";
import { compareDriverScorecardRank, splitScorecardPhotoPages } from "../../lib/scorecards/driverRanking";
import { applyMetricOverrides, fetchMetricOverrides, setMetricOverride } from "../../lib/data/governanceV2";
import {
  buildDriverScorecardConcessionMap,
  fetchDriverScorecardConcessionSnapshots,
} from "../../lib/data/concessions";
import { EmptyPanel, ErrorPanel, LoadingPanel, useLoad } from "./ScorecardPrimitives";

// Keep the precision from the MyDCSL calculation (e.g. 85.33 and 70.67).
// Do not add trailing decimals to whole-number scores.
const formatDriverScore = (value) => {
  const score = num(value);
  if (score == null) return "—";
  return score.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
};


// Canvas-based export avoids SVG foreignObject rendering and delayed download
// issues found on mobile Safari and in-app browsers.
function drawMobileScorecardPng({
  site, week, year, officialScore, standing, category, pageRows,
  totalDrivers, groupCount, page, pageCount,
}) {
  const width = 1080;
  const height = 310 + Math.max(pageRows.length, 1) * 47 + 55;
  const ratio = 2;
  const canvas = document.createElement("canvas");
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot create an image.");
  ctx.scale(ratio, ratio);
  const fill = (color, x, y, w, h) => { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); };
  const round = (color, x, y, w, h, radius = 8) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fill();
  };
  const draw = (value, x, y, color = "#142f4e", font = "bold 14px Arial", align = "left") => {
    ctx.fillStyle = color;
    ctx.font = font;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillText(String(value ?? "—"), x, y);
  };
  const truncated = (value, maxWidth, font) => {
    ctx.font = font;
    let result = String(value ?? "—");
    while (result.length > 2 && ctx.measureText(result).width > maxWidth) {
      result = result.slice(0, -2) + "…";
    }
    return result;
  };
  const tierColors = {
    "fantastic-plus": ["#e7f2fa", "#184e85"],
    fantastic: ["#eaf5ff", "#2671a7"],
    great: ["#edf8f0", "#327852"],
    fair: ["#fff5df", "#94691f"],
    poor: ["#ffebee", "#a84656"],
  };
  const toneColors = {
    good: ["#ffffff", "#216849"],
    warn: ["#fff2d8", "#865d21"],
    bad: ["#ffe8ec", "#9a3546"],
    neutral: ["#f4f6f9", "#798797"],
  };

  fill("#ffffff", 0, 0, width, height);
  fill("#102b49", 0, 0, width, 163);
  fill("#17446a", 755, 0, 325, 163);
  fill("#0b7f90", 0, 163, width, 5);
  draw("METRIXIQ · DRIVER SCORECARDS", 38, 35, "#81d8dd", "bold 13px Arial");
  draw(`${week} · ${site}`, 38, 83, "#ffffff", "bold 33px Arial");
  draw(`${year} · ${category}`, 38, 124, "#cadbe9", "14px Arial");
  draw(officialScore == null ? "—" : Number(officialScore).toFixed(2), 1035, 75, "#ffffff", "bold 44px Arial", "right");
  draw(standing || "DSP score unavailable", 1035, 112, "#aee1e6", "bold 15px Arial", "right");

  const stats = [
    ["DRIVERS", totalDrivers],
    ["CATEGORY", category],
    ["IN THIS RANK", groupCount],
  ];
  stats.forEach(([label, value], index) => {
    const x = 24 + index * 347;
    round("#f5f8fc", x, 188, 335, 75, 10);
    draw(label, x + 17, 210, "#74859a", "bold 11px Arial");
    draw(value, x + 17, 241, "#173858", "bold 23px Arial");
  });

  const widths = [45,137,272,76,78,60,105,105,100,82];
  const labels = ["#", "RANK", "DRIVER", "SCORE", "FICO", "CON", "DCR", "POD", "CC", "PSB"];
  const positions = [];
  let position = 10;
  widths.forEach((w) => { positions.push(position); position += w; });
  const headerY = 282;
  fill("#eef3f8", 10, headerY, 1060, 38);
  labels.forEach((label, i) => draw(label, positions[i] + (i === 2 ? 9 : widths[i] / 2), headerY + 19, "#425b73", "bold 11px Arial", i === 2 ? "left" : "center"));

  pageRows.forEach((row, index) => {
    const y = 320 + index * 47;
    fill(index % 2 ? "#fafbfd" : "#ffffff", 10, y, 1060, 47);
    fill("#e9eef4", 10, y + 46, 1060, 1);
    const colors = tierColors[row.tier] || toneColors.neutral;
    draw(row.rank, positions[0] + widths[0] / 2, y + 23, "#415b76", "bold 13px Arial", "center");
    round(colors[0], positions[1] + 4, y + 9, widths[1] - 8, 28, 6);
    draw(row.tierLabel, positions[1] + widths[1] / 2, y + 23, colors[1], "bold 12px Arial", "center");
    draw(truncated(row.name, widths[2] - 18, "bold 13px Arial"), positions[2] + 9, y + 23, "#173552", "bold 13px Arial");
    round("#eef5fc", positions[3] + 4, y + 9, widths[3] - 8, 28, 5);
    draw(row.score, positions[3] + widths[3] / 2, y + 23, "#245c92", "bold 13px Arial", "center");
    const metrics = [
      [row.fico, row.ficoTone], [row.concessions, row.conTone], [row.dcr, row.dcrTone],
      [row.pod, row.podTone], [row.cc, row.ccTone], [row.psb, row.psbTone],
    ];
    metrics.forEach(([value, tone], m) => {
      const idx = m + 4;
      const palette = toneColors[tone] || toneColors.neutral;
      if (tone === "warn" || tone === "bad") {
        round(palette[0], positions[idx] + 4, y + 9, widths[idx] - 8, 28, 5);
      }
      draw(value, positions[idx] + widths[idx] / 2, y + 23, palette[1], "bold 12px Arial", "center");
    });
  });
  const footerY = 320 + pageRows.length * 47;
  fill("#f6f9fc", 0, footerY, width, height - footerY);
  draw(`${category} · Page ${page}/${pageCount} · ${groupCount} in this category`, 29, footerY + 28, "#607891", "bold 12px Arial");
  draw("MetrixIQ", 1050, footerY + 28, "#0b8d96", "bold 14px Arial", "right");
  return canvas.toDataURL("image/png");
}


/**
 * Clear portrait PNG for WhatsApp. This is a presentation-only summary: all
 * scorecard data remains available in the app and complete PDF export.
 * Show the score prominently, with six delivery metrics in two legible rows.
 */
function drawFullScorecardPhotoPng({
  site, week, year, headlineScore, standing, pageRows,
  totalDrivers, page, pageCount, firstRank, lastRank,
}) {
  // Preserve the card layout and all drivers per photo, with a slightly
  // more compact WhatsApp image to avoid stretched text and oversized cards.
  const width = 1200;
  const outputWidth = 1530;
  // Reserve extra header space: WhatsApp overlays its controls at the top
  // when a photo is opened, so driver #1 starts below that overlay.
  const headerHeight = 430;
  const cardHeight = 194;
  const footerHeight = 58;
  const height = headerHeight + pageRows.length * cardHeight + footerHeight;
  const outputHeight = Math.round(height * 0.95);
  // Keep long 21-driver pages within mobile Safari's canvas area limits.
  const pixelRatio = Math.min(2, Math.sqrt(15000000 / (outputWidth * outputHeight)));
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(outputWidth * pixelRatio);
  canvas.height = Math.floor(outputHeight * pixelRatio);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your device cannot create scorecard photos.");
  ctx.scale(pixelRatio * (outputWidth / width), pixelRatio * (outputHeight / height));
  ctx.textBaseline = "middle";

  const rectangle = (color, x, y, w, h) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };
  const rounded = (color, x, y, w, h, radius = 8) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.closePath();
    ctx.fill();
  };
  const draw = (value, x, y, color, size = 20, weight = "700", align = "left") => {
    ctx.fillStyle = color;
    ctx.font = weight + " " + size + "px Arial, sans-serif";
    ctx.textAlign = align;
    ctx.fillText(String(value ?? "—"), x, y);
  };
  const fitName = (value, x, y, maxWidth) => {
    const name = String(value ?? "—");
    let size = 27;
    ctx.font = "700 " + size + "px Arial, sans-serif";
    while (ctx.measureText(name).width > maxWidth && size > 19) {
      size -= 1;
      ctx.font = "700 " + size + "px Arial, sans-serif";
    }
    if (ctx.measureText(name).width <= maxWidth) {
      draw(name, x, y, "#193651", size);
      return;
    }
    let shortened = name;
    while (shortened.length > 1 && ctx.measureText(shortened + "…").width > maxWidth) {
      shortened = shortened.slice(0, -1);
    }
    draw(shortened + "…", x, y, "#193651", size);
  };
  // Each tier uses its own accessible score-box colour and a subtle card tint.
  // Keep the original score values and metric warning colours unchanged.
  const rankPalettes = {
    "fantastic-plus": { accent: "#175aa8", badge: "#e6f1ff", score: "#175aa8", ink: "#ffffff", hint: "#d7eaff", card: "#dceafd", metric: "#c7defa" },
    fantastic: { accent: "#1687c8", badge: "#e6f7ff", score: "#7accf4", ink: "#163957", hint: "#285876", card: "#d9f0ff", metric: "#c6e8fa" },
    great: { accent: "#238857", badge: "#e5f7ed", score: "#218452", ink: "#ffffff", hint: "#ffffff", card: "#daf0e3", metric: "#c5e7d2" },
    fair: { accent: "#b56a14", badge: "#fff0d8", score: "#f5a735", ink: "#263a50", hint: "#263a50", card: "#ffedcb", metric: "#ffdfaa" },
    poor: { accent: "#b52e45", badge: "#ffe7ec", score: "#c5374d", ink: "#ffffff", hint: "#ffffff", card: "#ffe0e5", metric: "#fac5d0" },
  };
  const metricColors = {
    good: "#206449",
    warn: "#a36a15",
    bad: "#a43e50",
    neutral: "#506d82",
  };
  // Two rows keep all six requested metrics readable on WhatsApp.
  // CE, CDF and PSB remain in the full PDF.
  const quickMetrics = [
    ["CON", "concessions", "conTone"],
    ["DCR", "dcr", "dcrTone"],
    ["POD", "pod", "podTone"],
    ["CC", "cc", "ccTone"],
    ["DSC", "dsc", "dscTone"],
    ["LoR", "lor", "lorTone"],
  ];

  rectangle("#ffffff", 0, 0, width, height);
  // Dark safe banner intentionally absorbs WhatsApp's top overlay without
  // hiding the first driver. Header content starts below the top controls.
  rectangle("#102d4c", 0, 0, width, 374);
  rectangle("#0c9d9d", 0, 374, width, 6);
  rectangle("#f1f6fa", 0, 380, width, 50);
  draw("METRIXIQ  •  DRIVER RANKING", 28, 178, "#9fe8e4", 21, "800");
  draw(String(week) + "  ·  " + String(site), 28, 247, "#ffffff", 52, "800");
  draw(String(year) + "  •  Drivers " + firstRank + "–" + lastRank + " of " + totalDrivers, 29, 316, "#d1e2ef", 22, "700");
  if (headlineScore != null) {
    draw(Number(headlineScore).toFixed(2), 1166, 244, "#ffffff", 52, "800", "right");
    draw(standing || "DSP score", 1166, 303, "#b7e2e7", 21, "700", "right");
  }
  draw("PHOTO " + page + " / " + pageCount, 28, 407, "#45677e", 19, "800");
  draw("Score · FICO · Delivered · CON · DCR · POD · CC · DSC · LoR", 1171, 407, "#678196", 17, "600", "right");

  pageRows.forEach((row, index) => {
    const y = headerHeight + index * cardHeight;
    const palette = rankPalettes[row.tier] || rankPalettes.great;
    // Give each driver a separate card, a subtle lower shadow and a clear
    // 10px gap. Keep every score and metric in the same original positions.
    rectangle("#e1eaf2", 0, y, width, cardHeight);
    rounded("#c5d5e2", 14, y + 6, width - 28, 182, 12);
    rounded(palette.card, 12, y + 2, width - 24, 182, 12);
    rectangle(palette.accent, 12, y + 7, 7, 172);
    rectangle("#91aabe", 24, y + cardHeight - 4, width - 48, 2);

    draw(row.rank, 27, y + 55, "#516f86", 25, "800");
    rounded(palette.badge, 79, y + 30, 178, 48, 9);
    draw(row.tierLabel, 168, y + 54, palette.accent, 19, "800", "center");
    fitName(row.name, 275, y + 55, 501);

    // Total score is the primary result. Make it unmistakable on a phone.
    rounded(palette.score, 788, y + 15, 151, 78, 13);
    draw("SCORE", 864, y + 34, palette.hint, 16, "800", "center");
    draw(row.score, 864, y + 67, palette.ink, 41, "800", "center");

    draw("FICO", 1012, y + 34, "#6b8193", 16, "800", "center");
    draw(row.fico, 1012, y + 67, metricColors[row.ficoTone] || metricColors.neutral, 31, "800", "center");
    draw("DEL", 1135, y + 34, "#6b8193", 16, "800", "center");
    draw(row.delivered, 1135, y + 67, "#244963", 30, "800", "center");

    quickMetrics.forEach(([label, valueKey, toneKey], metricIndex) => {
      const chipX = 24 + (metricIndex % 3) * 392;
      const chipY = y + 100 + Math.floor(metricIndex / 3) * 42;
      rounded(palette.metric, chipX, chipY, 376, 36, 8);
      draw(label, chipX + 18, chipY + 18, "#183e5e", 23, "900");
      draw(row[valueKey], chipX + 356, chipY + 18, metricColors[row[toneKey]] || metricColors.neutral, 24, "800", "right");
    });
  });

  const footerY = headerHeight + pageRows.length * cardHeight;
  rectangle("#eaf2f8", 0, footerY, width, footerHeight);
  draw(String(site) + "  •  " + String(week) + "  •  Page " + page + " of " + pageCount, 28, footerY + 29, "#466980", 18);
  draw("MetrixIQ", 1173, footerY + 29, "#087d83", 21, "800", "right");
  return canvas.toDataURL("image/png");
}


// Minimal uncompressed ZIP writer for independent rank images (no third-party
// archive dependency). PNG is already compressed, so storing it is efficient.
function buildImageZip(files) {
  const encoder = new TextEncoder();
  const chunks = [];
  const directory = [];
  let offset = 0;
  const write16 = (view, position, value) => view.setUint16(position, value, true);
  const write32 = (view, position, value) => view.setUint32(position, value >>> 0, true);
  const crc32 = (data) => {
    let crc = 0xffffffff;
    for (const byte of data) {
      crc ^= byte;
      for (let i = 0; i < 8; i += 1) {
        crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  };

  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = file.bytes;
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length);
    const view = new DataView(local.buffer);
    write32(view, 0, 0x04034b50);
    write16(view, 4, 20);
    write16(view, 6, 0x0800);
    write16(view, 8, 0);
    write32(view, 14, crc);
    write32(view, 18, data.length);
    write32(view, 22, data.length);
    write16(view, 26, name.length);
    local.set(name, 30);
    chunks.push(local, data);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    write32(centralView, 0, 0x02014b50);
    write16(centralView, 4, 20);
    write16(centralView, 6, 20);
    write16(centralView, 8, 0x0800);
    write32(centralView, 16, crc);
    write32(centralView, 20, data.length);
    write32(centralView, 24, data.length);
    write16(centralView, 28, name.length);
    write32(centralView, 42, offset);
    central.set(name, 46);
    directory.push(central);
    offset += local.length + data.length;
  }

  const directorySize = directory.reduce((total, item) => total + item.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  write32(endView, 0, 0x06054b50);
  write16(endView, 8, files.length);
  write16(endView, 10, files.length);
  write32(endView, 12, directorySize);
  write32(endView, 16, offset);
  return new Blob([...chunks, ...directory, end], { type: "application/zip" });
}

const SCORECARD_COLUMNS = [
  { key: "rank", label: "Rank", width: 54, min: 48, max: 88 },
  { key: "name", label: "Driver Name", width: 165, min: 130, max: 320 },
  { key: "concessions", label: "Concessions", width: 84, min: 74, max: 145 },
  { key: "displayScore", label: "Total Score", width: 88, min: 82, max: 140 },
  { key: "fico", label: "FICO", width: 68, min: 60, max: 115 },
  { key: "delivered", label: "Delivered", width: 76, min: 68, max: 125 },
  { key: "dcr", label: "DCR", width: 74, min: 66, max: 120 },
  { key: "dsc_dpmo", label: "DSC DPMO", width: 82, min: 74, max: 138 },
  { key: "lor", label: "LoR DPMO", width: 78, min: 70, max: 132 },
  { key: "pod", label: "POD", width: 72, min: 64, max: 115 },
  { key: "cc", label: "CC", width: 68, min: 60, max: 110 },
  { key: "ce_dpmo", label: "CE", width: 62, min: 56, max: 105 },
  { key: "cdf_dpmo", label: "CDF DPMO", width: 84, min: 74, max: 138 },
  { key: "psb", label: "PSB", width: 62, min: 56, max: 105 },
];

const SCORECARD_DEFAULT_WIDTHS = Object.fromEntries(
  SCORECARD_COLUMNS.map((column) => [column.key, column.width])
);

const SCORECARD_COLUMN_STORAGE_KEY = "metrixiq.driver-scorecards.column-widths.v2";
const SCORECARD_DENSITY_STORAGE_KEY = "metrixiq.driver-scorecards.density.v1";
const SCORECARD_FONT_STORAGE_KEY = "metrixiq.driver-scorecards.font-size.v1";

export default function DriverScorecardsV22({
  organizationId,
  onOpenDriver,
  onImport,
  siteFilter = "all",
}) {
  const load = useLoad(async () => {
    const supabase = getSupabaseBrowserClient();
    const [scorecardData, overrides, concessionSnapshots] = await Promise.all([
      fetchDriverScorecardData(supabase, organizationId),
      fetchMetricOverrides(supabase, organizationId, "active"),
      fetchDriverScorecardConcessionSnapshots(supabase, organizationId),
    ]);
    return {
      ...scorecardData,
      rows: applyMetricOverrides(scorecardData.rows || [], overrides),
      overrides,
      concessionSnapshots,
    };
  }, [organizationId]);

  const rows = load.data?.rows || [];
  const cards = load.data?.cards || [];
  const concessionSnapshotMap = useMemo(
    () => buildDriverScorecardConcessionMap(load.data?.concessionSnapshots || []),
    [load.data?.concessionSnapshots]
  );
  const persistedConcessionOverrideMap = useMemo(() => {
    const map = new Map();
    for (const item of load.data?.overrides || []) {
      if (item.status === "active" && item.metric_key === "concessions") {
        map.set(`${item.driver_id}::${item.week_label}`, Number(item.override_value));
      }
    }
    return map;
  }, [load.data?.overrides]);

  const clamp = (value, min = 0, max = 100) =>
    Math.max(min, Math.min(max, Number(value)));

  const normalizePercent = (value) => {
    const valueNumber = num(value);
    if (valueNumber == null) return null;
    return valueNumber > 0 && valueNumber <= 1 ? valueNumber * 100 : valueNumber;
  };

  const fmtPercentFlexible = (value) => {
    const valueNumber = normalizePercent(value);
    return valueNumber == null ? "—" : `${valueNumber.toFixed(2)}%`;
  };

  const manualOverrideKey = (row) =>
    `${row?.driver_id || row?.drivers?.id || row?.drivers?.trid || "unknown"}::${row?.week_label || "unknown"}`;

  const effectiveFicoForRow = (row) => {
    const key = manualOverrideKey(row);
    if (Object.prototype.hasOwnProperty.call(manualFicoOverrides, key)) {
      return manualFicoOverrides[key];
    }
    return num(row.mentor_score ?? row.ementor ?? row.fico);
  };

  const withEffectiveFico = (row) => {
    const fico = effectiveFicoForRow(row);
    return fico == null
      ? row
      : { ...row, mentor_score: fico, ementor: fico, fico };
  };

  const scoreInputsForRow = (row) => {
    const scored = calculateDriverScorecard(row);
    const formatters = {
      fico: (value) => plain(value),
      dcr: (value) => fmtPercentFlexible(value),
      dsc_dpmo: (value) => plain(value),
      lor: (value) => plain(value),
      pod: (value) => fmtPercentFlexible(value),
      cc: (value) => fmtPercentFlexible(value),
      ce_dpmo: (value) => plain(value),
      cdf_dpmo: (value) => plain(value),
      psb: (value) => plain(value),
    };

    return scored.components.map((component) => ({
      ...component,
      weight: component.maxPoints,
      defaulted: component.missing,
      format: formatters[component.key] || ((value) => plain(value)),
    }));
  };

  const calculatedDriverScore = (row) => {
    const scored = calculateDriverScorecard(row);
    const inputs = scoreInputsForRow(row);
    const sourceReference = num(row.scorecard_score ?? row.raw_data?.scorecard_score);

    return {
      value: scored.value,
      origin: "formula",
      coverage: scored.coverage,
      components: inputs,
      sourceReference,
    };
  };

  const sourceTier = (score, sourceTierValue = "") => {
    const value = num(score);
    if (value != null) {
      if (value < 50) return { label: "Poor", cls: "poor" };
      if (value < 70) return { label: "Fair", cls: "fair" };
      if (value < 85) return { label: "Great", cls: "great" };
      if (value < 93) return { label: "Fantastic", cls: "fantastic" };
      return { label: "Fantastic Plus", cls: "fantastic-plus" };
    }

    const source = String(sourceTierValue || "").trim().toLowerCase();
    if (source.includes("fantastic plus")) return { label: "Fantastic Plus", cls: "fantastic-plus" };
    if (source === "fantastic") return { label: "Fantastic", cls: "fantastic" };
    if (source === "great") return { label: "Great", cls: "great" };
    if (source === "fair") return { label: "Fair", cls: "fair" };
    if (source === "poor") return { label: "Poor", cls: "poor" };
    return { label: "Unrated", cls: "unrated" };
  };

  const yearForRow = (row) => {
    const raw = String(row.period_end || row.period_start || "");
    const match = raw.match(/^(20\d{2})/);
    return match ? Number(match[1]) : null;
  };

  const siteForRow = (row) => {
    const value = String(
      row?.site ||
      row?.raw_data?.activity_site ||
      row?.drivers?.site ||
      ""
    ).trim().toUpperCase();
    return value || "UNASSIGNED";
  };

  const isScorecardCohortRow = (row) => {
    const files = Array.isArray(row?.raw_data?.source_files)
      ? row.raw_data.source_files
      : [];
    const rowSite = siteForRow(row);
    const scorecardFiles = files.filter((file) =>
      /score\s*card/i.test(String(file || ""))
    );

    // A weekly driver belongs to the scorecard cohort only when the evidence
    // includes that site's DSP scorecard. Other weekly files (driver masters,
    // concessions, POD, CC, CDF, etc.) may contain the same TRID and metrics,
    // but must never inflate the driver count.
    if (scorecardFiles.length) {
      return scorecardFiles.some((file) => {
        const sourceName = String(file || "").toUpperCase();
        return rowSite === "UNASSIGNED" || sourceName.includes(rowSite);
      });
    }

    // Legacy scorecard rows predate source_files lineage. Only allow the old
    // metric-shape fallback when no source file metadata exists at all.
    if (files.length) return false;

    const scorecardMetricCount = [
      row?.dcr,
      row?.dsc_dpmo,
      row?.lor,
      row?.pod,
      row?.cc,
      row?.ce_dpmo,
      row?.cdf_dpmo,
      row?.psb,
    ].filter((value) => num(value) != null).length;

    return (
      num(row?.scorecard_score ?? row?.raw_data?.scorecard_score) != null ||
      (num(row?.delivered) != null && scorecardMetricCount >= 5)
    );
  };

  const periodKeyForRow = (row) =>
    `${yearForRow(row) || "unknown"}-${row.week_label || "Unknown"}-${siteForRow(row)}`;

  const driverKey = (row) =>
    String(row?.driver_id || row?.drivers?.id || row?.drivers?.trid || "").trim();

  const periodMap = useMemo(() => {
    const map = new Map();

    for (const row of rows) {
      if (!row.week_label || !isScorecardCohortRow(row)) continue;
      const rowSite = siteForRow(row);
      if (siteFilter !== "all" && rowSite !== siteFilter) continue;

      const key = periodKeyForRow(row);
      const current = map.get(key) || {
        key,
        year: yearForRow(row),
        weekLabel: row.week_label,
        site: rowSite,
        periodEnd: row.period_end || "",
        rows: [],
      };
      current.rows.push(row);
      if (row.period_end && (!current.periodEnd || row.period_end > current.periodEnd)) {
        current.periodEnd = row.period_end;
      }
      map.set(key, current);
    }

    for (const card of cards) {
      const weekLabel = card.week_label || `W${String(card.week || "").padStart(2, "0")}`;
      const cardSite = String(card.site || "").trim().toUpperCase() || "UNASSIGNED";
      if (siteFilter !== "all" && cardSite !== siteFilter) continue;

      const key = `${card.year || "unknown"}-${weekLabel}-${cardSite}`;
      const current = map.get(key) || {
        key,
        year: card.year || null,
        weekLabel,
        site: cardSite,
        periodEnd: "",
        rows: [],
      };
      current.card = card;
      map.set(key, current);
    }

    return [...map.values()].sort((a, b) => {
      const yearDelta = Number(b.year || 0) - Number(a.year || 0);
      if (yearDelta) return yearDelta;

      const weekDelta =
        (Number(String(b.weekLabel || "").replace(/\D/g, "")) || 0) -
        (Number(String(a.weekLabel || "").replace(/\D/g, "")) || 0);
      if (weekDelta) return weekDelta;

      return String(a.site || "").localeCompare(String(b.site || ""));
    });
  }, [rows, cards, siteFilter]);

  const [periodKey, setPeriodKey] = useState("");
  const [query, setQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [scoreFilter, setScoreFilter] = useState("all");
  const [concessionFilter, setConcessionFilter] = useState("all");
  const [quickFilter, setQuickFilter] = useState("all");
  const [sort, setSort] = useState({ key: "rank", direction: "asc" });
  const [shareOpen, setShareOpen] = useState(false);
  const [shareScope, setShareScope] = useState("all");
  const [printAllDrivers, setPrintAllDrivers] = useState(false);
  const [breakdownRow, setBreakdownRow] = useState(null);
  const [copyStatus, setCopyStatus] = useState("");
  const [shareImageBusy, setShareImageBusy] = useState(false);
  const [shareImageError, setShareImageError] = useState("");
  const [shareImageProgress, setShareImageProgress] = useState("");
  const [mobilePhotoTier, setMobilePhotoTier] = useState("fantastic-plus");
  const [mobilePhotoPage, setMobilePhotoPage] = useState(1);
  const [fullPhotoPage, setFullPhotoPage] = useState(1);
  const [fullPhotoCount, setFullPhotoCount] = useState(4);
  const [mobilePhotoPreview, setMobilePhotoPreview] = useState(null);
  const [photoShareTip, setPhotoShareTip] = useState("");
  const [manualFicoOverrides, setManualFicoOverrides] = useState({});
  const [manualConcessionOverrides, setManualConcessionOverrides] = useState({});
  const [editMetric, setEditMetric] = useState("fico");
  const [editConcessions, setEditConcessions] = useState("");
  const [editRow, setEditRow] = useState(null);
  const [editFico, setEditFico] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editMessage, setEditMessage] = useState("");
  const [columnWidths, setColumnWidths] = useState(SCORECARD_DEFAULT_WIDTHS);
  const [tableDensity, setTableDensity] = useState("compact");
  const [tableFontSize, setTableFontSize] = useState("medium");
  const [tableFocus, setTableFocus] = useState(false);
  const [resizingColumn, setResizingColumn] = useState("");
  const resizeStateRef = useRef(null);

  useEffect(() => {
    try {
      const savedWidths = JSON.parse(window.localStorage.getItem(SCORECARD_COLUMN_STORAGE_KEY) || "null");
      if (savedWidths && typeof savedWidths === "object") {
        setColumnWidths((current) => ({ ...current, ...savedWidths }));
      }
      const savedDensity = window.localStorage.getItem(SCORECARD_DENSITY_STORAGE_KEY);
      if (savedDensity === "compact" || savedDensity === "comfortable") {
        setTableDensity(savedDensity);
      }
      const savedFontSize = window.localStorage.getItem(SCORECARD_FONT_STORAGE_KEY);
      if (["small", "medium", "large"].includes(savedFontSize)) {
        setTableFontSize(savedFontSize);
      }
    } catch {
      // Keep safe defaults if browser storage is unavailable or malformed.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(SCORECARD_COLUMN_STORAGE_KEY, JSON.stringify(columnWidths));
    } catch {
      // Column resizing still works for this session.
    }
  }, [columnWidths]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SCORECARD_DENSITY_STORAGE_KEY, tableDensity);
    } catch {
      // Density still works for this session.
    }
  }, [tableDensity]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SCORECARD_FONT_STORAGE_KEY, tableFontSize);
    } catch {
      // Font sizing still works for this session.
    }
  }, [tableFontSize]);

  const scorecardTableWidth = SCORECARD_COLUMNS.reduce(
    (total, column) => total + (columnWidths[column.key] || column.width),
    0
  );

  const resetColumnWidths = () => setColumnWidths(SCORECARD_DEFAULT_WIDTHS);

  const resetSingleColumnWidth = (columnKey) => {
    const defaultWidth = SCORECARD_DEFAULT_WIDTHS[columnKey];
    if (defaultWidth == null) return;
    setColumnWidths((current) => ({ ...current, [columnKey]: defaultWidth }));
  };

  const startColumnResize = (event, columnKey) => {
    const column = SCORECARD_COLUMNS.find((item) => item.key === columnKey);
    if (!column) return;

    event.preventDefault();
    event.stopPropagation();

    resizeStateRef.current = {
      columnKey,
      startX: event.clientX,
      startWidth: columnWidths[columnKey] || column.width,
      min: column.min,
      max: column.max,
    };
    setResizingColumn(columnKey);
    document.body.classList.add("scorex3-resizing-columns");

    const onPointerMove = (moveEvent) => {
      const state = resizeStateRef.current;
      if (!state) return;
      const nextWidth = Math.max(
        state.min,
        Math.min(state.max, Math.round(state.startWidth + moveEvent.clientX - state.startX))
      );
      setColumnWidths((current) =>
        current[state.columnKey] === nextWidth
          ? current
          : { ...current, [state.columnKey]: nextWidth }
      );
    };

    const onPointerUp = () => {
      resizeStateRef.current = null;
      setResizingColumn("");
      document.body.classList.remove("scorex3-resizing-columns");
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  useEffect(() => {
    if (periodMap.length && !periodMap.some((periodItem) => periodItem.key === periodKey)) {
      setPeriodKey(periodMap[0].key);
    }
  }, [periodMap, periodKey]);

  const period = periodMap.find((item) => item.key === periodKey) || periodMap[0] || null;
  const previousPeriod = useMemo(() => {
    if (!period) return null;
    const sameSite = periodMap.filter((item) => item.site === period.site);
    const index = sameSite.findIndex((item) => item.key === period.key);
    return index >= 0 ? sameSite[index + 1] || null : null;
  }, [period, periodMap]);

  const enrichBaseRows = (periodItem) => {
    if (!periodItem) return [];
    return periodItem.rows.map((sourceRow) => {
      const site = siteForRow(sourceRow);
      const week = sourceRow.week_label || periodItem.weekLabel;
      const trid = String(sourceRow?.drivers?.trid || "").trim().toUpperCase();
      const concessionKey = `${site}::${week}::${trid}`;
      const sameWeekConcessions = concessionSnapshotMap.get(concessionKey);
      const overrideKey = manualOverrideKey(sourceRow);
      const localConcessions = Object.prototype.hasOwnProperty.call(manualConcessionOverrides, overrideKey);
      const persistedConcessions = persistedConcessionOverrideMap.has(overrideKey);
      const effectiveConcessions = localConcessions
        ? manualConcessionOverrides[overrideKey]
        : persistedConcessions
          ? persistedConcessionOverrideMap.get(overrideKey)
          : sameWeekConcessions
            ? sameWeekConcessions.dnr
            : sourceRow.concessions;
      const row = withEffectiveFico({ ...sourceRow, concessions: effectiveConcessions });
      const score = calculatedDriverScore(row);
      const tier = sourceTier(
        score.value,
        row.tier ?? row.raw_data?.tier ?? row.raw_data?.scorecard_tier
      );
      return {
        ...row,
        displayScore: score.value,
        scoreOrigin: score.origin,
        scoreCoverage: score.coverage || 0,
        scoreComponents: score.components || [],
        sourceScoreReference: score.sourceReference,
        manualFicoOverride: Object.prototype.hasOwnProperty.call(
          manualFicoOverrides,
          manualOverrideKey(row)
        ),
        manualConcessionOverride: localConcessions || persistedConcessions,
        sourceRank: tier,
      };
    });
  };

  const previousRows = useMemo(
    () => enrichBaseRows(previousPeriod),
    [previousPeriod, manualFicoOverrides, manualConcessionOverrides, concessionSnapshotMap, persistedConcessionOverrideMap]
  );

  const previousByDriver = useMemo(() => {
    const map = new Map();
    previousRows.forEach((row) => {
      const key = driverKey(row);
      if (key) map.set(key, row);
    });
    return map;
  }, [previousRows]);

  const previousRankByDriver = useMemo(() => {
    const map = new Map();
    [...previousRows]
      .sort(compareDriverScorecardRank)
      .forEach((row, index) => {
        const key = driverKey(row);
        if (key) map.set(key, index + 1);
      });
    return map;
  }, [previousRows]);

  const performanceFlags = (row) => {
    const flags = [];
    const fico = num(row.mentor_score ?? row.ementor ?? row.fico);
    const dcr = normalizePercent(row.dcr);
    const pod = normalizePercent(row.pod);
    const cc = normalizePercent(row.cc);
    const concessionsValue = num(row.concessions);
    const dsc = num(row.dsc_dpmo);
    const cdf = num(row.cdf_dpmo);
    const ce = num(row.ce_dpmo);

    if (fico != null && fico < TARGETS.mentor) flags.push({ key: "fico", label: "FICO", severity: fico < 800 ? "bad" : "warn" });
    if (concessionsValue != null && concessionsValue > 0) flags.push({ key: "concessions", label: `CON ${Math.round(concessionsValue)}`, severity: concessionsValue >= 3 ? "bad" : "warn" });
    if (dcr != null && dcr < TARGETS.dcr) flags.push({ key: "dcr", label: "DCR", severity: dcr < 98 ? "bad" : "warn" });
    if (pod != null && pod < TARGETS.pod) flags.push({ key: "pod", label: "POD", severity: pod < 99 ? "bad" : "warn" });
    if (cc != null && cc < TARGETS.cc) flags.push({ key: "cc", label: "CC", severity: cc < Math.max(0, TARGETS.cc - 3) ? "bad" : "warn" });
    if (dsc != null && dsc >= 1000) flags.push({ key: "dsc", label: "DSC", severity: dsc >= 4000 ? "bad" : "warn" });
    if (cdf != null && cdf >= 8000) flags.push({ key: "cdf", label: "CDF", severity: cdf >= 12000 ? "bad" : "warn" });
    if (ce != null && ce > 0) flags.push({ key: "ce", label: "CE", severity: "bad" });
    if ((row.scoreCoverage || 0) < 9) flags.push({ key: "missing", label: `${row.scoreCoverage || 0}/9 DATA`, severity: "neutral" });

    return flags;
  };

  const enrichedRows = useMemo(() => {
    if (!period) return [];

    const base = enrichBaseRows(period);
    const sorted = [...base].sort(
      compareDriverScorecardRank
    );
    const currentRankByDriver = new Map();
    sorted.forEach((row, index) => {
      const key = driverKey(row);
      if (key) currentRankByDriver.set(key, index + 1);
    });

    return base.map((row) => {
      const key = driverKey(row);
      const previous = key ? previousByDriver.get(key) : null;
      const previousScore = num(previous?.displayScore);
      const currentScore = num(row.displayScore);
      const currentRank = key ? currentRankByDriver.get(key) || null : null;
      const previousRank = key ? previousRankByDriver.get(key) || null : null;
      const scoreDelta =
        currentScore != null && previousScore != null ? currentScore - previousScore : null;
      const rankDelta =
        currentRank != null && previousRank != null ? previousRank - currentRank : null;
      const merged = {
        ...row,
        previousScore,
        scoreDelta,
        currentRank,
        previousRank,
        rankDelta,
      };

      return {
        ...merged,
        flags: performanceFlags(merged),
      };
    });
  }, [period, previousByDriver, previousRankByDriver, manualFicoOverrides, manualConcessionOverrides, concessionSnapshotMap, persistedConcessionOverrideMap]);

  const groupOrder = [
    { label: "Fantastic Plus", cls: "fantastic-plus", min: "93+" },
    { label: "Fantastic", cls: "fantastic", min: "85–92.99" },
    { label: "Great", cls: "great", min: "70–84.99" },
    { label: "Fair", cls: "fair", min: "50–69.99" },
    { label: "Poor", cls: "poor", min: "≤49.99" },
  ];

  const groupCounts = groupOrder.reduce((acc, group) => {
    acc[group.cls] = enrichedRows.filter((row) => row.sourceRank.cls === group.cls).length;
    return acc;
  }, {});

  const totalDrivers = enrichedRows.length;
  const delivered = enrichedRows.reduce((sum, row) => sum + (num(row.delivered) || 0), 0);
  const concessions = enrichedRows.reduce((sum, row) => sum + (num(row.concessions) || 0), 0);
  const highConcessionDrivers = enrichedRows.filter((row) => (num(row.concessions) || 0) >= 3).length;
  const onTargetDrivers = enrichedRows.filter((row) => (num(row.displayScore) || 0) >= 80).length;
  const ficoLinked = enrichedRows.filter(
    (row) => num(row.mentor_score ?? row.ementor ?? row.fico) != null
  ).length;
  const calculatedScores = enrichedRows
    .map((row) => num(row.displayScore))
    .filter((value) => value != null);
  const averageDriverScore = calculatedScores.length
    ? calculatedScores.reduce((a, b) => a + b, 0) / calculatedScores.length
    : null;
  const previousScores = previousRows
    .map((row) => num(row.displayScore))
    .filter((value) => value != null);
  const previousAverage = previousScores.length
    ? previousScores.reduce((a, b) => a + b, 0) / previousScores.length
    : null;
  const officialScore = num(period?.card?.overall_score);
  const previousOfficialScore = num(previousPeriod?.card?.overall_score);
  const headlineScore = officialScore ?? averageDriverScore;
  const isOfficialHeadline = officialScore != null;
  const weekDelta = isOfficialHeadline
    ? (previousOfficialScore == null ? null : officialScore - previousOfficialScore)
    : (averageDriverScore != null && previousAverage != null
        ? averageDriverScore - previousAverage
        : null);
  const improvedCount = enrichedRows.filter((row) => num(row.scoreDelta) != null && row.scoreDelta > 0).length;
  const droppedCount = enrichedRows.filter((row) => num(row.scoreDelta) != null && row.scoreDelta < 0).length;
  const attentionCount = enrichedRows.filter(
    (row) => ["fair", "poor"].includes(row.sourceRank.cls) || row.flags.filter((flag) => flag.severity === "bad").length >= 2
  ).length;
  const formulaCount = enrichedRows.length;

  const overallStanding =
    headlineScore != null
      ? (isOfficialHeadline && period?.card?.standing
          ? sourceTier(null, period.card.standing).label
          : sourceTier(headlineScore).label)
      : "Not rated";
  const overallTier = sourceTier(headlineScore, overallStanding);

  const nextTierGap = (row) => {
    const score = num(row.displayScore);
    if (score == null || score >= 93) return null;
    const next = score < 50 ? 50 : score < 70 ? 70 : score < 85 ? 85 : 93;
    return next - score;
  };

  const nearPromotionCount = enrichedRows.filter((row) => {
    const gap = nextTierGap(row);
    return gap != null && gap > 0 && gap <= 3;
  }).length;

  const metricTone = (key, value) => {
    const raw = num(value);
    if (raw == null) return "neutral";
    const v = ["dcr", "pod", "cc"].includes(key) ? normalizePercent(raw) : raw;
    if (key === "concessions") return v === 0 ? "good" : v < 3 ? "warn" : "bad";
    if (key === "fico") return v >= TARGETS.mentor ? "good" : v >= 800 ? "warn" : "bad";
    if (key === "dcr") return v >= TARGETS.dcr ? "good" : v >= 98 ? "warn" : "bad";
    if (key === "pod") return v >= TARGETS.pod ? "good" : v >= 99 ? "warn" : "bad";
    if (key === "cc") {
      return v >= TARGETS.cc ? "good" : v >= Math.max(0, TARGETS.cc - 3) ? "warn" : "bad";
    }
    if (key === "dsc_dpmo") return v === 0 ? "good" : v < 1000 ? "warn" : "bad";
    if (key === "lor") return v === 0 ? "good" : "bad";
    if (key === "ce_dpmo") return v === 0 ? "good" : "bad";
    if (key === "cdf_dpmo") return v < 4000 ? "good" : v < 8000 ? "warn" : "bad";
    if (key === "psb") return v === 0 ? "good" : "bad";
    return "neutral";
  };

  const quickFilters = [
    { key: "all", label: "All", count: totalDrivers },
    {
      key: "attention",
      label: "Fair + Poor",
      count: enrichedRows.filter((row) => ["fair", "poor"].includes(row.sourceRank.cls)).length,
    },
    {
      key: "fico",
      label: `FICO < ${TARGETS.mentor}`,
      count: enrichedRows.filter((row) => {
        const value = num(row.mentor_score ?? row.ementor ?? row.fico);
        return value != null && value < TARGETS.mentor;
      }).length,
    },
    {
      key: "concessions",
      label: "Concessions",
      count: enrichedRows.filter((row) => (num(row.concessions) || 0) > 0).length,
    },
    {
      key: "pod",
      label: "POD below",
      count: enrichedRows.filter((row) => {
        const value = normalizePercent(row.pod);
        return value != null && value < TARGETS.pod;
      }).length,
    },
    {
      key: "cc",
      label: "CC below",
      count: enrichedRows.filter((row) => {
        const value = normalizePercent(row.cc);
        return value != null && value < TARGETS.cc;
      }).length,
    },
    {
      key: "missing",
      label: "Missing data",
      count: enrichedRows.filter((row) => (row.scoreCoverage || 0) < 9).length,
    },
    {
      key: "improved",
      label: "Most improved",
      count: enrichedRows.filter((row) => num(row.scoreDelta) != null && row.scoreDelta >= 3).length,
    },
    {
      key: "dropped",
      label: "Biggest drop",
      count: enrichedRows.filter((row) => num(row.scoreDelta) != null && row.scoreDelta <= -3).length,
    },
  ];

  const matchesQuickFilter = (row) => {
    if (quickFilter === "all") return true;
    if (quickFilter === "attention") return ["fair", "poor"].includes(row.sourceRank.cls);
    if (quickFilter === "fico") {
      const value = num(row.mentor_score ?? row.ementor ?? row.fico);
      return value != null && value < TARGETS.mentor;
    }
    if (quickFilter === "concessions") return (num(row.concessions) || 0) > 0;
    if (quickFilter === "pod") {
      const value = normalizePercent(row.pod);
      return value != null && value < TARGETS.pod;
    }
    if (quickFilter === "cc") {
      const value = normalizePercent(row.cc);
      return value != null && value < TARGETS.cc;
    }
    if (quickFilter === "missing") return (row.scoreCoverage || 0) < 9;
    if (quickFilter === "improved") return num(row.scoreDelta) != null && row.scoreDelta >= 3;
    if (quickFilter === "dropped") return num(row.scoreDelta) != null && row.scoreDelta <= -3;
    return true;
  };

  const valueForSort = (row, key) => {
    if (key === "trid") return String(row.drivers?.trid || "");
    if (key === "name") return displayDriverName(row.drivers);
    if (key === "rank") return row.currentRank ?? 9999;
    if (key === "displayScore") return num(row.displayScore);
    if (key === "scoreDelta") return num(row.scoreDelta);
    if (key === "fico") return num(row.mentor_score ?? row.ementor ?? row.fico);
    return num(row[key]);
  };

  const compareRows = (a, b) => {
    const av = valueForSort(a, sort.key);
    const bv = valueForSort(b, sort.key);
    const direction = sort.direction === "asc" ? 1 : -1;

    if (typeof av === "string" || typeof bv === "string") {
      return String(av ?? "").localeCompare(String(bv ?? ""), undefined, {
        numeric: true,
        sensitivity: "base",
      }) * direction;
    }

    if (av == null && bv == null) {
      return displayDriverName(a.drivers).localeCompare(displayDriverName(b.drivers));
    }
    if (av == null) return 1;
    if (bv == null) return -1;

    const an = Number(av);
    const bn = Number(bv);
    if (an === bn) {
      return displayDriverName(a.drivers).localeCompare(displayDriverName(b.drivers));
    }
    return (an - bn) * direction;
  };

  const periodRows = useMemo(() => {
    const q = query.toLowerCase().trim();

    return enrichedRows
      .filter((row) => {
        const text = `${row.drivers?.full_name || ""} ${row.drivers?.trid || ""} ${row.drivers?.site || ""}`.toLowerCase();
        return !q || text.includes(q);
      })
      .filter((row) => groupFilter === "all" || row.sourceRank.cls === groupFilter)
      .filter((row) => {
        const score = num(row.displayScore);
        if (scoreFilter === "all") return true;
        if (scoreFilter === "lt60") return score != null && score < 60;
        if (scoreFilter === "60-69") return score != null && score >= 60 && score < 70;
        if (scoreFilter === "70-79") return score != null && score >= 70 && score < 80;
        if (scoreFilter === "80-89") return score != null && score >= 80 && score < 90;
        if (scoreFilter === "90+") return score != null && score >= 90;
        return true;
      })
      .filter((row) => {
        const value = num(row.concessions) || 0;
        if (concessionFilter === "all") return true;
        if (concessionFilter === "0") return value === 0;
        if (concessionFilter === "1-2") return value >= 1 && value <= 2;
        if (concessionFilter === "3+") return value >= 3;
        return true;
      })
      .filter(matchesQuickFilter)
      .sort(compareRows);
  }, [enrichedRows, query, groupFilter, scoreFilter, concessionFilter, quickFilter, sort]);

  const toggleSort = (key) => {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: key === "name" || key === "trid" ? "asc" : "desc" }
    );
  };

  const selectQuickFilter = (key) => {
    setQuickFilter(key);
    if (key === "improved") {
      setSort({ key: "scoreDelta", direction: "desc" });
      return;
    }
    if (key === "dropped") {
      setSort({ key: "scoreDelta", direction: "asc" });
      return;
    }
    if (sort.key === "scoreDelta") {
      setSort({ key: "rank", direction: "asc" });
    }
  };

  const sortArrow = (key) =>
    sort.key !== key ? "↕" : sort.direction === "asc" ? "↑" : "↓";

  const sortLabels = {
    trid: "Transporter ID",
    rank: "Rank",
    name: "Name",
    concessions: "Concessions",
    displayScore: "Total Score",
    scoreDelta: "Week change",
    fico: "FICO",
    delivered: "Delivered",
    dcr: "DCR",
    dsc_dpmo: "DSC DPMO",
    lor: "LoR DPMO",
    pod: "POD",
    cc: "CC",
    ce_dpmo: "CE",
    cdf_dpmo: "CDF DPMO",
    psb: "PSB",
  };

  const SortHeader = ({ columnKey, children }) => (
    <th className={resizingColumn === columnKey ? "is-resizing" : ""}>
      <button type="button" onClick={() => toggleSort(columnKey)}>
        <span>{children}</span>
        <small>{sortArrow(columnKey)}</small>
      </button>
      <span
        className="scorex3-column-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize ${children} column`}
        title="Drag to resize · double-click to reset"
        onPointerDown={(event) => startColumnResize(event, columnKey)}
        onDoubleClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          resetSingleColumnWidth(columnKey);
        }}
      />
    </th>
  );

  const movementLabel = (row) => {
    if (row.previousRank == null || row.currentRank == null) return "NEW";
    if (row.rankDelta > 0) return `↑${row.rankDelta}`;
    if (row.rankDelta < 0) return `↓${Math.abs(row.rankDelta)}`;
    return "—";
  };

  const movementClass = (row) => {
    if (row.previousRank == null) return "new";
    if (row.rankDelta > 0) return "up";
    if (row.rankDelta < 0) return "down";
    return "flat";
  };

  const scoreDeltaLabel = (value) => {
    const delta = num(value);
    if (delta == null) return "";
    if (Math.abs(delta) < 0.05) return "0.0";
    return `${delta > 0 ? "+" : ""}${delta.toFixed(1)}`;
  };

  const scoreDeltaClass = (value) => {
    const delta = num(value);
    if (delta == null) return "neutral";
    if (delta > 0.05) return "up";
    if (delta < -0.05) return "down";
    return "flat";
  };

  const shareRows = useMemo(() => {
    const ranked = [...enrichedRows].sort(
      compareDriverScorecardRank
    );
    if (shareScope === "attention") {
      return ranked.filter(
        (row) => ["fair", "poor"].includes(row.sourceRank.cls) || row.flags.length >= 2
      );
    }
    if (shareScope === "top") return ranked.slice(0, 20);
    if (shareScope === "improved") {
      return ranked
        .filter((row) => num(row.scoreDelta) != null && row.scoreDelta > 0)
        .sort((a, b) => (b.scoreDelta || 0) - (a.scoreDelta || 0));
    }
    return ranked;
  }, [enrichedRows, shareScope]);

  // The PDF can contain the current share selection or the entire selected week.
  // The share modal is portalled to <body> so hidden dashboard content cannot
  // reserve blank pages in Chrome's print layout.
  const printShareRows = printAllDrivers
    ? [...enrichedRows].sort(compareDriverScorecardRank)
    : shareRows;

  const exportSharePdf = (allDrivers = false) => {
    setPrintAllDrivers(allDrivers);
    document.documentElement.classList.add("scorex3-printing-share");

    const finishPrint = () => {
      document.documentElement.classList.remove("scorex3-printing-share");
      setPrintAllDrivers(false);
      window.removeEventListener("afterprint", finishPrint);
    };

    window.addEventListener("afterprint", finishPrint);
    // Wait for React to render the complete row set before Chrome captures it.
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.print();
        // Fallback for browsers that do not dispatch afterprint reliably.
        window.setTimeout(finishPrint, 1500);
      });
    });
  };

  const rankedPhotoRows = [...enrichedRows].sort(
    (a, b) => (a.currentRank || Infinity) - (b.currentRank || Infinity)
  );
  const fullPhotoPages = splitScorecardPhotoPages(rankedPhotoRows, { preferredPages: fullPhotoCount });
  const rankPhotoGroups = groupOrder.map((group) => ({
    ...group,
    rows: rankedPhotoRows.filter((row) => row.sourceRank.cls === group.cls),
  }));
  const selectedPhotoGroup = rankPhotoGroups.find((group) => group.cls === mobilePhotoTier)
    || rankPhotoGroups[0];
  const selectedPhotoPages = Math.max(1, Math.ceil((selectedPhotoGroup?.rows.length || 0) / 12));

  const preparePhotoRows = (sourceRows) => sourceRows.map((row) => {
    const fico = num(row.mentor_score ?? row.ementor ?? row.fico);
    return {
      rank: `#${row.currentRank || "—"}`,
      tier: row.sourceRank.cls,
      tierLabel: row.sourceRank.label,
      name: displayDriverName(row.drivers),
      score: formatDriverScore(row.displayScore),
      fico: plain(fico),
      concessions: plain(row.concessions),
      dcr: fmtPercentFlexible(row.dcr),
      pod: fmtPercentFlexible(row.pod),
      cc: fmtPercentFlexible(row.cc),
      psb: plain(row.psb),
      ficoTone: metricTone("fico", fico),
      conTone: metricTone("concessions", row.concessions),
      dcrTone: metricTone("dcr", row.dcr),
      podTone: metricTone("pod", row.pod),
      ccTone: metricTone("cc", row.cc),
      psbTone: metricTone("psb", row.psb),
    };
  });
  const prepareFullPhotoRows = (sourceRows) => {
    const rows = preparePhotoRows(sourceRows);
    return rows.map((row, index) => {
      const source = sourceRows[index];
      return {
        ...row,
        delivered: plain(source.delivered),
        dsc: plain(source.dsc_dpmo),
        lor: plain(source.lor),
        ce: plain(source.ce_dpmo),
        cdf: plain(source.cdf_dpmo),
        dscTone: metricTone("dsc_dpmo", source.dsc_dpmo),
        lorTone: metricTone("lor", source.lor),
        ceTone: metricTone("ce_dpmo", source.ce_dpmo),
        cdfTone: metricTone("cdf_dpmo", source.cdf_dpmo),
      };
    });
  };
  const renderFullPhoto = (pageItem) => drawFullScorecardPhotoPng({
    site: period?.site || "All sites",
    week: period?.weekLabel || "Week",
    year: period?.year || "",
    headlineScore,
    standing: overallStanding,
    pageRows: prepareFullPhotoRows(pageItem.rows),
    totalDrivers,
    page: pageItem.page,
    pageCount: fullPhotoPages.length,
    firstRank: pageItem.start,
    lastRank: pageItem.end,
  });

  const renderPhoto = (items, category, total, page, pageCount) =>
    drawMobileScorecardPng({
      site: period?.site || "All sites",
      week: period?.weekLabel || "Week",
      year: period?.year || "",
      officialScore: headlineScore,
      standing: overallStanding,
      category,
      pageRows: preparePhotoRows(items),
      totalDrivers,
      groupCount: total,
      page,
      pageCount,
    });
  const photoBaseName = () => [
    "MetrixIQ",
    String(period?.site || "site").replace(/[^a-z0-9-]/gi, "-"),
    String(period?.weekLabel || "week").replace(/[^a-z0-9-]/gi, "-"),
  ].join("-");

  function previewFullScorecardPhoto(requestedPage = fullPhotoPage) {
    setPhotoShareTip("");
    if (!fullPhotoPages.length) {
      setShareImageError("No drivers are available for this week.");
      return;
    }
    try {
      const index = Math.min(Math.max(Number(requestedPage) - 1 || 0, 0), fullPhotoPages.length - 1);
      const selected = fullPhotoPages[index];
      const dataUrl = renderFullPhoto(selected);
      setFullPhotoPage(selected.page);
      setMobilePhotoPreview({
        dataUrl,
        fileName: photoBaseName() + "-Full-Scorecard-" + selected.page + "-of-" + fullPhotoPages.length + ".png",
        label: "Full scorecard · Photo " + selected.page + "/" + fullPhotoPages.length +
          " · Drivers " + selected.start + "–" + selected.end,
        kind: "full-scorecard",
        page: selected.page,
      });
      setShareImageError("");
    } catch (error) {
      setShareImageError(error?.message || "Unable to prepare the full scorecard photo.");
    }
  }

  async function exportFullScorecardPhotosZip() {
    if (shareImageBusy) return;
    if (!fullPhotoPages.length) {
      setShareImageError("No drivers are available for this week.");
      return;
    }
    setShareImageBusy(true);
    setShareImageError("");
    setShareImageProgress("Preparing all " + fullPhotoPages.length + " HD scorecard photos…");
    try {
      const files = [];
      for (const pageItem of fullPhotoPages) {
        const dataUrl = renderFullPhoto(pageItem);
        const binary = atob(dataUrl.split(",")[1]);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        files.push({
          name: photoBaseName() + "-Full-Scorecard-" +
            String(pageItem.page).padStart(2, "0") + "-of-" + fullPhotoPages.length + ".png",
          bytes,
        });
        setShareImageProgress("Created photo " + pageItem.page + " of " + fullPhotoPages.length + "…");
        // Release the browser event loop between large PNG canvases.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      const url = URL.createObjectURL(buildImageZip(files));
      const link = document.createElement("a");
      link.href = url;
      link.download = photoBaseName() + "-Full-Scorecard-" + files.length + "-Photos.zip";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      setShareImageProgress("Downloaded " + files.length + " HD PNG photos covering all " + totalDrivers +
        " drivers. On iPhone, use the photo preview and Share photo to save directly.");
    } catch (error) {
      setShareImageError(error?.message || "Unable to download full scorecard photos.");
      setShareImageProgress("");
    } finally {
      setShareImageBusy(false);
    }
  }

  async function shareAllFullScorecardPhotos() {
    if (shareImageBusy || !fullPhotoPages.length) return;
    setShareImageBusy(true);
    setShareImageError("");
    setShareImageProgress("Preparing photos for the phone share sheet…");
    try {
      // Keep preparation synchronous until navigator.share to preserve the
      // user's tap activation on Safari/iOS.
      const files = fullPhotoPages.map((pageItem) => {
        const dataUrl = renderFullPhoto(pageItem);
        const binary = atob(dataUrl.split(",")[1]);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        return new File(
          [bytes],
          photoBaseName() + "-Full-Scorecard-" + String(pageItem.page).padStart(2, "0") + ".png",
          { type: "image/png" }
        );
      });
      if (navigator.canShare?.({ files }) && navigator.share) {
        await navigator.share({
          files,
          title: String(period?.weekLabel || "Week") + " " + String(period?.site || "") + " Full Scorecard",
        });
        setShareImageProgress("All " + files.length + " photos were sent to the share sheet.");
      } else {
        setShareImageError("This browser cannot share multiple photos. Use Preview / Share photo for each image, or download the ZIP.");
        setShareImageProgress("");
      }
    } catch (error) {
      if (error?.name !== "AbortError") {
        setShareImageError("Sharing multiple photos is blocked. Use the individual photo previews or the ZIP download.");
      }
      setShareImageProgress("");
    } finally {
      setShareImageBusy(false);
    }
  }

  function previewRankPhoto() {
    setPhotoShareTip("");
    const group = selectedPhotoGroup;
    if (!group?.rows.length) {
      setShareImageError("No drivers in this rank for the selected week.");
      return;
    }
    try {
      const page = Math.min(Math.max(mobilePhotoPage, 1), selectedPhotoPages);
      const rows = group.rows.slice((page - 1) * 12, page * 12);
      const dataUrl = renderPhoto(rows, group.label, group.rows.length, page, selectedPhotoPages);
      setMobilePhotoPreview({
        dataUrl,
        fileName: `${photoBaseName()}-${group.cls}-${page}.png`,
        label: `${group.label} · Page ${page}/${selectedPhotoPages}`,
      });
      setShareImageError("");
    } catch (error) {
      setShareImageError(error?.message || "Unable to create a rank image on this device.");
    }
  }

  function savePreviewPhoto() {
    if (!mobilePhotoPreview) return;
    const anchor = document.createElement("a");
    anchor.href = mobilePhotoPreview.dataUrl;
    anchor.download = mobilePhotoPreview.fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  async function sharePreviewPhoto() {
    if (!mobilePhotoPreview) return;
    try {
      const data = mobilePhotoPreview.dataUrl;
      const bytes = atob(data.split(",")[1]);
      const buffer = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i += 1) buffer[i] = bytes.charCodeAt(i);
      const file = new File([buffer], mobilePhotoPreview.fileName, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] }) && navigator.share) {
        await navigator.share({ files: [file], title: mobilePhotoPreview.label });
      } else {
        setPhotoShareTip("This in-app browser cannot share files. Press and hold the image to save it, or open MetrixIQ directly in Safari.");
      }
    } catch (error) {
      if (error?.name !== "AbortError") {
        setPhotoShareTip("Sharing is blocked by this browser. Press and hold the image to save it, or open MetrixIQ in Safari.");
      }
    }
  }

  function exportWhatsAppPng() {
    try {
      setShareImageError("");
      const rows = shareRows.slice(0, 12);
      const dataUrl = renderPhoto(rows, "Team overview", shareRows.length, 1, Math.max(1, Math.ceil(shareRows.length / 12)));
      setMobilePhotoPreview({
        dataUrl, fileName: `${photoBaseName()}-overview.png`, label: "Team overview",
      });
    } catch (error) {
      setShareImageError(error?.message || "Unable to create the overview image.");
    }
  }

  async function exportRankImagesZip() {
    if (shareImageBusy) return;
    setShareImageBusy(true);
    setShareImageError("");
    setShareImageProgress("Preparing rank images…");
    try {
      const files = [];
      const groups = rankPhotoGroups.filter((group) => group.rows.length > 0);
      const totalPages = groups.reduce((sum, group) => sum + Math.ceil(group.rows.length / 12), 0);
      let count = 0;
      for (const group of groups) {
        const pageCount = Math.ceil(group.rows.length / 12);
        for (let page = 1; page <= pageCount; page += 1) {
          const rows = group.rows.slice((page - 1) * 12, page * 12);
          const dataUrl = renderPhoto(rows, group.label, group.rows.length, page, pageCount);
          const binary = atob(dataUrl.split(",")[1]);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
          files.push({
            name: `${String(group.label).replace(/[^a-z0-9]+/gi, "-")}-${String(page).padStart(2, "0")}.png`,
            bytes,
          });
          count += 1;
          setShareImageProgress(`Created ${count} of ${totalPages} images…`);
          // Yield between images to avoid freezing mobile browser UI.
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
      if (!files.length) throw new Error("No rank images for this week.");
      const url = URL.createObjectURL(buildImageZip(files));
      const link = document.createElement("a");
      link.href = url;
      link.download = `${photoBaseName()}-Rank-Photos.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      setShareImageProgress(`Prepared ${files.length} rank photos. On iPhone use individual photo preview if ZIP does not download.`);
    } catch (error) {
      setShareImageError(error?.message || "Rank image export failed.");
      setShareImageProgress("");
    } finally {
      setShareImageBusy(false);
    }
  }

  async function copyShareSummary() {
    const lines = [
      `${period?.weekLabel || "Week"} Driver Scorecard · ${period?.site || "All sites"}`,
      `${isOfficialHeadline ? "Official DSP score" : "Average driver score"}: ${headlineScore == null ? "—" : headlineScore.toFixed(2)} · ${overallStanding}`,
      `Drivers: ${totalDrivers} · Improved: ${improvedCount} · Attention: ${attentionCount}`,
      "",
      ...shareRows.slice(0, 30).map((row, index) => {
        const fico = num(row.mentor_score ?? row.ementor ?? row.fico);
        return `${index + 1}. ${displayDriverName(row.drivers)} — ${formatDriverScore(row.displayScore)} · FICO ${fico ?? "—"} · PSB ${plain(row.psb)}`;
      }),
    ];

    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopyStatus("Copied");
      window.setTimeout(() => setCopyStatus(""), 1800);
    } catch {
      setCopyStatus("Copy unavailable");
      window.setTimeout(() => setCopyStatus(""), 1800);
    }
  }

  const openConcessionsEditor = (row) => {
    setBreakdownRow(null);
    setEditMetric("concessions");
    setEditRow(row);
    setEditConcessions(row.concessions == null ? "0" : String(row.concessions));
    setEditMessage("");
  };

  async function saveConcessionsEdit() {
    if (!editRow) return;
    const raw = String(editConcessions).trim();
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value > 10000) {
      setEditMessage("Enter a whole number of concessions between 0 and 10,000.");
      return;
    }
    if (!organizationId || !editRow.driver_id || !editRow.week_label) {
      setEditMessage("This driver-week record cannot be updated yet.");
      return;
    }

    setEditSaving(true);
    setEditMessage("");
    try {
      await setMetricOverride(getSupabaseBrowserClient(), {
        organizationId,
        driverId: editRow.driver_id,
        weekLabel: editRow.week_label,
        metricKey: "concessions",
        value,
        reason: "Driver Scorecard manual concessions edit",
      });
      setManualConcessionOverrides((current) => ({
        ...current,
        [manualOverrideKey(editRow)]: value,
      }));
      setBreakdownRow(null);
      setEditMessage("Saved with audit trail");
      window.setTimeout(() => {
        setEditRow(null);
        setEditMessage("");
      }, 650);
    } catch (error) {
      setEditMessage(error?.message || "Could not save concessions.");
    } finally {
      setEditSaving(false);
    }
  }

  const openFicoEditor = (row) => {
    setEditMetric("fico");
    const currentFico = num(row.mentor_score ?? row.ementor ?? row.fico);
    setBreakdownRow(null);
    setEditRow(row);
    setEditFico(currentFico == null ? "" : String(currentFico));
    setEditMessage("");
  };

  const editFicoNumber = num(editFico);
  const editPreview =
    editRow && editFicoNumber != null
      ? calculatedDriverScore({
          ...editRow,
          mentor_score: editFicoNumber,
          ementor: editFicoNumber,
          fico: editFicoNumber,
        })
      : null;

  async function saveFicoEdit() {
    if (!editRow) return;
    const value = num(editFico);
    if (value == null || value < 0 || value > 850) {
      setEditMessage("Enter a valid FICO score between 0 and 850.");
      return;
    }
    if (!organizationId || !editRow.driver_id || !editRow.week_label) {
      setEditMessage("This driver-week record cannot be updated yet.");
      return;
    }

    setEditSaving(true);
    setEditMessage("");

    try {
      const supabase = getSupabaseBrowserClient();
      await setMetricOverride(supabase, {
        organizationId,
        driverId: editRow.driver_id,
        weekLabel: editRow.week_label,
        metricKey: "mentor_score",
        value,
        reason: "Driver Scorecard manual FICO edit",
      });

      setManualFicoOverrides((current) => ({
        ...current,
        [manualOverrideKey(editRow)]: value,
      }));
      setBreakdownRow(null);
      setEditMessage("Saved with audit trail");
      window.setTimeout(() => {
        setEditRow(null);
        setEditMessage("");
      }, 650);
    } catch (error) {
      setEditMessage(error?.message || "Could not save the FICO override.");
    } finally {
      setEditSaving(false);
    }
  }

  if (load.loading) return <LoadingPanel text="Loading weekly scorecard archive…" />;
  if (load.error) return <ErrorPanel error={load.error} />;

  if (!periodMap.length) {
    return <>
      <div className="page-heading">
        <div>
          <span className="page-kicker">SCORECARDS</span>
          <h1>Driver scorecards</h1>
          <p>Import an Amazon DSP scorecard to build the weekly driver ranking.</p>
        </div>
      </div>
      <EmptyPanel
        title="No scorecard history stored yet"
        text="Import a DSP Scorecard PDF. MetrixIQ will combine Transporter IDs with same-week FICO, concessions and delivery-quality evidence."
        action="Import scorecard"
        onAction={onImport}
      />
    </>;
  }

  return <div className={`scorex3-root ${tableFocus ? "scorex3-focus-mode" : ""}`}>
    <section className="scorex3-header">
      <div className="scorex3-title">
        <span className="page-kicker">DRIVER SCORECARDS</span>
        <h1>Driver Scorecards</h1>
        <p>
          {period?.site || "All sites"} · {period?.weekLabel || "Week"} · {period?.year || "—"} · Weekly ranking with FICO, delivery quality and concessions.
        </p>
      </div>

      <div className={`scorex3-station-score ${overallTier.cls}`}>
        <span>{isOfficialHeadline ? "Official DSP score" : "Avg. driver score"}</span>
        <div>
          <strong>{headlineScore == null ? "—" : `${headlineScore.toFixed(2)}%`}</strong>
          <em>{overallStanding}</em>
        </div>
        <small className={weekDelta == null ? "neutral" : weekDelta >= 0 ? "up" : "down"}>
          {weekDelta != null && previousPeriod
            ? `vs ${previousPeriod.weekLabel}: ${weekDelta >= 0 ? "+" : ""}${weekDelta.toFixed(1)} pts`
            : isOfficialHeadline && averageDriverScore != null
              ? `Driver average: ${averageDriverScore.toFixed(2)} · No prior DSP score`
              : "No previous week comparison"}
        </small>
      </div>
    </section>

    <section className="scorex3-kpi-cards">
      <article className="drivers"><span>Total drivers</span><strong>{totalDrivers}</strong><small>{period?.weekLabel}</small></article>
      <article className="attention"><span>Below target</span><strong>{attentionCount}</strong><small>Fair / Poor or multi-risk</small></article>
      <article className="concessions"><span>With 3+ concessions</span><strong>{highConcessionDrivers}</strong><small>Immediate attention</small></article>
      <article className="target"><span>On target ≥ 80</span><strong>{onTargetDrivers}</strong><small>{totalDrivers ? Math.round((onTargetDrivers / totalDrivers) * 100) : 0}% of drivers</small></article>
    </section>

    <section className="scorex3-toolbar">
      <label>
        <span>Week</span>
        <select
          aria-label="Select scorecard period"
          value={periodKey}
          onChange={(event) => setPeriodKey(event.target.value)}
        >
          {periodMap.map((item) =>
            <option key={item.key} value={item.key}>
              {item.year || "—"} · {item.weekLabel} · {item.site || "UNASSIGNED"}
            </option>
          )}
        </select>
      </label>

      <label>
        <span>Score</span>
        <select aria-label="Filter driver scorecards by score" value={scoreFilter} onChange={(event) => setScoreFilter(event.target.value)}>
          <option value="all">All scores</option><option value="lt60">Below 60</option><option value="60-69">60–69</option><option value="70-79">70–79</option><option value="80-89">80–89</option><option value="90+">90+</option>
        </select>
      </label>

      <label>
        <span>Concessions</span>
        <select aria-label="Filter driver scorecards by concessions" value={concessionFilter} onChange={(event) => setConcessionFilter(event.target.value)}>
          <option value="all">All</option><option value="0">0 only</option><option value="1-2">1–2</option><option value="3+">3+ high</option>
        </select>
      </label>

      <label>
        <span>Rank</span>
        <select
          aria-label="Filter driver scorecards by rank"
          value={groupFilter}
          onChange={(event) => setGroupFilter(event.target.value)}
        >
          <option value="all">All ranks</option>
          {groupOrder.map((group) =>
            <option key={group.cls} value={group.cls}>{group.label}</option>
          )}
        </select>
      </label>

      <label className="scorex3-search">
        <span>Search</span>
        <input
          aria-label="Search scorecards"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by driver name, Transporter ID…"
        />
      </label>

      <button type="button" className="btn ghost scorex3-reset-button" onClick={() => { setQuery(""); setGroupFilter("all"); setScoreFilter("all"); setConcessionFilter("all"); setQuickFilter("all"); setSort({ key: "displayScore", direction: "desc" }); }}>Reset filters</button>
      <button type="button" className="btn ghost scorex3-share-button" onClick={() => setShareOpen(true)}>
        Share view
      </button>
      <button type="button" className="btn primary scorex3-import" onClick={onImport}>
        Import scorecard
      </button>
    </section>

    <section className="scorex3-history">
      <div className="scorex3-history-label">
        <span>RECENT WEEKS</span>
        <small>{periodMap.length} stored period{periodMap.length === 1 ? "" : "s"}</small>
      </div>
      <div className="scorex3-history-scroll">
        {periodMap.slice(0, 10).map((item) => {
          const itemRows = item.rows
            .map((row) => calculatedDriverScore(withEffectiveFico(row)).value)
            .filter((value) => value != null);
          const average = itemRows.length
            ? itemRows.reduce((a, b) => a + b, 0) / itemRows.length
            : null;
          const score = average;
          const standing = score != null ? sourceTier(score).label : "Stored";
          const cls = sourceTier(score, standing).cls;

          return <button
            type="button"
            key={item.key}
            className={`${item.key === periodKey ? "active" : ""} ${cls}`}
            onClick={() => setPeriodKey(item.key)}
          >
            <span>{item.weekLabel}</span>
            <b>{score == null ? "—" : score.toFixed(2)}</b>
            <small>{standing}</small>
          </button>;
        })}
      </div>
    </section>

    <section className="scorex3-register">
      <div className="scorex3-register-head">
        <div>
          <span>SCORECARD REGISTER</span>
          <h2>{period?.weekLabel} driver ranking</h2>
        </div>
        <div className="scorex3-register-actions">
          <div className="scorex3-density-toggle" aria-label="Table density">
            <button
              type="button"
              className={tableDensity === "compact" ? "active" : ""}
              onClick={() => setTableDensity("compact")}
            >
              Compact
            </button>
            <button
              type="button"
              className={tableDensity === "comfortable" ? "active" : ""}
              onClick={() => setTableDensity("comfortable")}
            >
              Comfortable
            </button>
          </div>
          <div className="scorex3-font-toggle" aria-label="Table font size">
            <button
              type="button"
              className={tableFontSize === "small" ? "active" : ""}
              onClick={() => setTableFontSize("small")}
              title="Small text"
            >
              A−
            </button>
            <button
              type="button"
              className={tableFontSize === "medium" ? "active" : ""}
              onClick={() => setTableFontSize("medium")}
              title="Medium text"
            >
              A
            </button>
            <button
              type="button"
              className={tableFontSize === "large" ? "active" : ""}
              onClick={() => setTableFontSize("large")}
              title="Large text"
            >
              A+
            </button>
          </div>
          <button
            type="button"
            className={`scorex3-focus-button ${tableFocus ? "active" : ""}`}
            onClick={() => setTableFocus((value) => !value)}
            title={tableFocus ? "Exit table focus mode" : "Maximise scorecard visibility"}
          >
            {tableFocus ? "Exit focus" : "Focus table"}
          </button>
          <button type="button" className="scorex3-reset-columns" onClick={resetColumnWidths}>
            Reset columns
          </button>
          <div className="scorex3-register-count">
            <b>{periodRows.length}/{totalDrivers}</b>
            <span>
              Sorted by {sortLabels[sort.key] || "Score"} {sort.direction === "asc" ? "↑" : "↓"}
            </span>
          </div>
        </div>
      </div>

      <div className="scorex3-table-wrap">
        <table
          className={`scorex3-table density-${tableDensity} font-${tableFontSize}`}
          style={{
            width: "100%",
            minWidth: `${scorecardTableWidth}px`,
            "--score-col-rank": `${columnWidths.rank}px`,
            "--score-col-name": `${columnWidths.name}px`,
            "--score-col-concessions": `${columnWidths.concessions}px`,
            "--score-col-score": `${columnWidths.displayScore}px`,
            "--score-col-fico": `${columnWidths.fico}px`,
            "--score-col-delivered": `${columnWidths.delivered}px`,
            "--score-col-dcr": `${columnWidths.dcr}px`,
            "--score-col-dsc": `${columnWidths.dsc_dpmo}px`,
            "--score-col-lor": `${columnWidths.lor}px`,
            "--score-col-pod": `${columnWidths.pod}px`,
            "--score-col-cc": `${columnWidths.cc}px`,
            "--score-col-ce": `${columnWidths.ce_dpmo}px`,
            "--score-col-cdf": `${columnWidths.cdf_dpmo}px`,
            "--score-col-psb": `${columnWidths.psb}px`,
          }}
        >
          <colgroup>
            {SCORECARD_COLUMNS.map((column) => (
              <col key={column.key} style={{ width: `${columnWidths[column.key]}px` }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <SortHeader columnKey="rank">Rank</SortHeader>
              <SortHeader columnKey="name">Driver Name</SortHeader>
              <SortHeader columnKey="concessions">Concessions</SortHeader>
              <SortHeader columnKey="displayScore">Total Score</SortHeader>
              <SortHeader columnKey="fico">FICO</SortHeader>
              <SortHeader columnKey="delivered">Delivered</SortHeader>
              <SortHeader columnKey="dcr">DCR</SortHeader>
              <SortHeader columnKey="dsc_dpmo">DSC DPMO</SortHeader>
              <SortHeader columnKey="lor">LoR DPMO</SortHeader>
              <SortHeader columnKey="pod">POD</SortHeader>
              <SortHeader columnKey="cc">CC</SortHeader>
              <SortHeader columnKey="ce_dpmo">CE</SortHeader>
              <SortHeader columnKey="cdf_dpmo">CDF DPMO</SortHeader>
              <SortHeader columnKey="psb">PSB</SortHeader>
            </tr>
          </thead>

          <tbody>
            {groupOrder.map((group) => {
              const groupRows = periodRows.filter((row) => row.sourceRank.cls === group.cls);
              if (!groupRows.length) return null;

              return [
                <tr key={`${group.cls}-header`} className={`scorex3-tier-row ${group.cls}`}>
                  <td colSpan="14">
                    <div>
                      <b>{group.label}</b>
                      <span>{group.min} TOTAL SCORE</span>
                      <strong>{groupRows.length}</strong>
                    </div>
                  </td>
                </tr>,
                ...groupRows.map((row) => {
                  const driver = row.drivers || {};
                  const mentor = num(row.mentor_score ?? row.ementor ?? row.fico);
                  return <tr
                    key={`${row.driver_id}-${period?.key}`}
                    className={`scorex3-driver-row ${row.flags.filter((flag) => flag.severity === "bad").length >= 2 ? "multi-risk" : ""}`}
                  >
                    <td className={`scorex3-rank-cell ${row.sourceRank.cls}`}>
                      <b>#{row.currentRank || "—"}</b>
                    </td>
                    <td className="scorex3-name-cell">
                      <button
                        type="button"
                        onClick={() => onOpenDriver?.(driverShape(row))}
                        title={`${displayDriverName(driver)} · Open Driver 360`}
                      >
                        {displayDriverName(driver)}
                      </button>
                    </td>
                    <td className={`scorex3-metric ${metricTone("concessions", row.concessions)}`}>
                      <div className="scorex3-concessions-cell">
                        <span className={`scorex3-concession-badge ${(num(row.concessions) || 0) >= 3 ? "high" : (num(row.concessions) || 0) > 0 ? "active" : "zero"}`} title={row.manualConcessionOverride ? "Manually overridden · audited" : "Imported concessions"}>
                          {plain(row.concessions)}
                          {row.manualConcessionOverride && <small>M</small>}
                          {(num(row.concessions) || 0) >= 3 && <small>HIGH</small>}
                        </span>
                        <button type="button" className="scorex3-concession-edit" onClick={() => openConcessionsEditor(row)} aria-label={`Edit concessions for ${displayDriverName(driver)}`} title="Edit concessions">Edit</button>
                      </div>
                    </td>
                    <td className={`scorex3-score-cell ${row.sourceRank.cls}`}>
                      <button
                        type="button"
                        onClick={() => setBreakdownRow(row)}
                        title="Why this score?"
                      >
                        <b>{formatDriverScore(row.displayScore)}</b>
                        <small>FORMULA</small>
                        {row.scoreDelta != null &&
                          <em className={scoreDeltaClass(row.scoreDelta)}>{scoreDeltaLabel(row.scoreDelta)}</em>
                        }
                      </button>
                    </td>
                    <td className={`scorex3-metric ${metricTone("fico", mentor)}`}>
                      <div className="scorex3-fico-cell">
                        <span>{plain(mentor)}</span>
                        <button
                          type="button"
                          className={row.manualFicoOverride ? "active" : ""}
                          onClick={() => openFicoEditor(row)}
                          aria-label={`Edit FICO for ${displayDriverName(driver)}`}
                          title={row.manualFicoOverride ? "Edit manual FICO override" : "Edit FICO"}
                        >
                          Edit
                        </button>
                      </div>
                    </td>
                    <td className="scorex3-delivered-cell"><span className="scorex3-value-pill">{plain(row.delivered)}</span></td>
                    <td className={`scorex3-metric ${metricTone("dcr", row.dcr)}`}><span className="scorex3-value-pill">{fmtPercentFlexible(row.dcr)}</span></td>
                    <td className={`scorex3-metric ${metricTone("dsc_dpmo", row.dsc_dpmo)}`}><span className="scorex3-value-pill">{plain(row.dsc_dpmo)}</span></td>
                    <td className={`scorex3-metric ${metricTone("lor", row.lor)}`}><span className="scorex3-value-pill">{plain(row.lor)}</span></td>
                    <td className={`scorex3-metric ${metricTone("pod", row.pod)}`}><span className="scorex3-value-pill">{fmtPercentFlexible(row.pod)}</span></td>
                    <td className={`scorex3-metric ${metricTone("cc", row.cc)}`}><span className="scorex3-value-pill">{fmtPercentFlexible(row.cc)}</span></td>
                    <td className={`scorex3-metric ${metricTone("ce_dpmo", row.ce_dpmo)}`}><span className="scorex3-value-pill">{plain(row.ce_dpmo)}</span></td>
                    <td className={`scorex3-metric ${metricTone("cdf_dpmo", row.cdf_dpmo)}`}><span className="scorex3-value-pill">{plain(row.cdf_dpmo)}</span></td>
                    <td className={`scorex3-metric ${metricTone("psb", row.psb)}`}><span className="scorex3-value-pill">{plain(row.psb)}</span></td>
                  </tr>;
                }),
              ];
            })}

            {!periodRows.length &&
              <tr>
                <td colSpan="14">
                  <div className="scorex3-empty">No drivers match this selection.</div>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>

    {editRow && (
      <div className="scorex3-edit-overlay" role="dialog" aria-modal="true" onClick={() => !editSaving && setEditRow(null)}>
        <section className="scorex3-edit-card" onClick={(event) => event.stopPropagation()}>
          <header>
            <div>
              <span>EDIT SCORE INPUT</span>
              <h2>{displayDriverName(editRow.drivers)}</h2>
              <p>{editRow.drivers?.trid || "No Transporter ID"} · {editRow.week_label}</p>
            </div>
            <button type="button" onClick={() => !editSaving && setEditRow(null)} aria-label="Close metric editor">×</button>
          </header>

          <div className="scorex3-edit-formula">
            {editMetric === "fico" ? <>
              <span>Formula impact</span>
              <b>FICO = up to 17 points of Total Score</b>
              <small>The score preview below uses the current point-band formula.</small>
            </> : <>
              <span>Manual concession correction</span>
              <b>Count for this driver and this scorecard week</b>
              <small>Changes concession totals, filters and risk flags; concessions do not directly add or remove Total Score points.</small>
            </>}
          </div>

          <label className="scorex3-edit-field">
            <span>{editMetric === "fico" ? "FICO score" : "Number of concessions"}</span>
            <input
              type="number"
              min="0"
              max={editMetric === "fico" ? "850" : "10000"}
              step="1"
              value={editMetric === "fico" ? editFico : editConcessions}
              onChange={(event) => {
                if (editMetric === "fico") setEditFico(event.target.value);
                else setEditConcessions(event.target.value);
                setEditMessage("");
              }}
              autoFocus
            />
          </label>

          <div className="scorex3-edit-preview">
            <div>
              <span>{editMetric === "fico" ? "Current Total Score" : "Current concessions"}</span>
              <strong>{editMetric === "fico" ? (formatDriverScore(editRow.displayScore)) : plain(editRow.concessions)}</strong>
            </div>
            <div>
              <span>{editMetric === "fico" ? "Preview Total Score" : "New concessions"}</span>
              <strong>{editMetric === "fico" ? (editPreview?.value == null ? "—" : editPreview.value.toFixed(1)) : (/^\d+$/.test(String(editConcessions).trim()) ? editConcessions : "—")}</strong>
            </div>
            <div>
              <span>Change</span>
              <strong className={editMetric === "fico" ? (editPreview?.value == null || editRow.displayScore == null ? "neutral" : editPreview.value >= editRow.displayScore ? "up" : "down") : (Number(editConcessions) <= Number(editRow.concessions || 0) ? "up" : "down")}>
                {editMetric === "fico"
                  ? (editPreview?.value == null || editRow.displayScore == null ? "—" : (editPreview.value - editRow.displayScore >= 0 ? "+" : "") + (editPreview.value - editRow.displayScore).toFixed(1))
                  : (/^\d+$/.test(String(editConcessions).trim()) ? (Number(editConcessions) - Number(editRow.concessions || 0) >= 0 ? "+" : "") + (Number(editConcessions) - Number(editRow.concessions || 0)) : "—")}
              </strong>
            </div>
          </div>
          <div className="scorex3-edit-note">
            {editMetric === "fico" ? "Saving updates FICO for this driver and week only. Total Score and Rank recalculate from the point-band formula." : "Saving updates concessions for this driver and week only, with an audit trail. Imported source values stay unchanged; risk indicators update immediately."}
          </div>

          {editMessage && <div className={`scorex3-edit-message ${editMessage.startsWith("Saved") ? "success" : "error"}`}>{editMessage}</div>}

          <footer>
            <button type="button" className="btn ghost" disabled={editSaving} onClick={() => setEditRow(null)}>Cancel</button>
            <button type="button" className="btn primary" disabled={editSaving} onClick={editMetric === "fico" ? saveFicoEdit : saveConcessionsEdit}>
              {editSaving ? "Saving…" : editMetric === "fico" ? "Save FICO & recalculate" : "Save concessions"}
            </button>
          </footer>
        </section>
      </div>
    )}

    {breakdownRow && (
      <div className="scorex3-drawer-overlay" role="dialog" aria-modal="true" onClick={() => setBreakdownRow(null)}>
        <aside className="scorex3-drawer" onClick={(event) => event.stopPropagation()}>
          <header>
            <div>
              <span>WHY THIS SCORE?</span>
              <h2>{displayDriverName(breakdownRow.drivers)}</h2>
              <p>{breakdownRow.drivers?.trid || "No Transporter ID"} · {period?.weekLabel}</p>
            </div>
            <button type="button" onClick={() => setBreakdownRow(null)} aria-label="Close score breakdown">×</button>
          </header>

          <section className="scorex3-drawer-score">
            <div>
              <span>Total score</span>
              <strong>{formatDriverScore(breakdownRow.displayScore)}</strong>
              <em className={breakdownRow.sourceRank.cls}>{breakdownRow.sourceRank.label}</em>
            </div>
            <div>
              <span>Rank</span>
              <strong>#{breakdownRow.currentRank || "—"}</strong>
              <small className={movementClass(breakdownRow)}>{movementLabel(breakdownRow)}</small>
            </div>
            <div>
              <span>Week change</span>
              <strong className={scoreDeltaClass(breakdownRow.scoreDelta)}>
                {breakdownRow.scoreDelta == null ? "—" : scoreDeltaLabel(breakdownRow.scoreDelta)}
              </strong>
              <small>{previousPeriod?.weekLabel || "No previous week"}</small>
            </div>
          </section>

          <div className="scorex3-source-note">
            <b>Scorecard formula · point bands</b>
            <span>
              MyDCSL-verified point bands: FICO 17, DCR 17, DSC 17, LoR 6, POD 8, CC 8, CE 10, CDF 10, PSB 7. When FICO or CC is N/A, its maximum is excluded; N/A CDF receives full points. Scores are normalised to 100. Sparse imports never automatically receive N/A points. Coverage: {breakdownRow.scoreCoverage}/9 metrics.
            </span>
          </div>

          <section className="scorex3-breakdown-list">
            {breakdownRow.scoreComponents.map((component) => (
              <article key={component.key}>
                <div className="scorex3-breakdown-line">
                  <div>
                    <b>{component.label}</b>
                    <span>
                      {component.naMode === "excluded"
                        ? "N/A — excluded from maximum"
                        : component.naMode === "full"
                          ? "N/A — full points"
                          : component.defaulted
                            ? "Missing → 0 pts"
                            : component.format(component.value)}
                    </span>
                  </div>
                  <div>
                    <strong>{component.naMode === "excluded" ? "Excluded" : `${component.points}/${component.maxPoints}`}</strong>
                    <small>{component.naMode === "excluded" ? `${component.maxPoints} pts removed from maximum` : `${component.maxPoints} max · ${component.contribution.toFixed(0)} pts`}</small>
                  </div>
                </div>
                <div className="scorex3-breakdown-track">
                  <i style={{ width: `${clamp(component.component)}%` }} />
                </div>
              </article>
            ))}
          </section>

          <section className="scorex3-drawer-flags">
            <div className="scorex3-drawer-section-head">
              <b>Performance flags</b>
              <span>{breakdownRow.flags.length}</span>
            </div>
            {breakdownRow.flags.length ? (
              <div>
                {breakdownRow.flags.map((flag) => <span key={flag.key} className={flag.severity}>{flag.label}</span>)}
              </div>
            ) : (
              <p>No active performance flags for this week.</p>
            )}
          </section>

          <footer>
            <button type="button" className="btn ghost" onClick={() => setBreakdownRow(null)}>Close</button>
            <button type="button" className="btn ghost" onClick={() => openFicoEditor(breakdownRow)}>Edit FICO</button>
            <button type="button" className="btn primary" onClick={() => onOpenDriver?.(driverShape(breakdownRow))}>
              Open Driver 360
            </button>
          </footer>
        </aside>
      </div>
    )}

    {shareOpen && typeof document !== "undefined" && createPortal(
      <div className="scorex3-share-overlay" role="dialog" aria-modal="true" onClick={() => setShareOpen(false)}>
        <section className="scorex3-share-sheet" onClick={(event) => event.stopPropagation()}>
          <header className={`scorex3-share-head ${overallTier.cls}`}>
            <div>
              <span>METRIXIQ · DRIVER SCORECARD</span>
              <h2>{period?.weekLabel} · {period?.site || "All sites"}</h2>
              <p>{period?.year || "—"} weekly performance summary{isOfficialHeadline && averageDriverScore != null ? ` · Driver average: ${averageDriverScore.toFixed(2)}` : ""}</p>
            </div>
            <div>
              <strong>{headlineScore == null ? "—" : `${headlineScore.toFixed(2)}`}</strong>
              <em>{overallStanding} · {isOfficialHeadline ? "Official DSP score" : "Driver average"}</em>
            </div>
          </header>

          <section className="scorex3-share-kpis">
            <article className="drivers"><span>Drivers</span><strong>{totalDrivers}</strong></article>
            <article className="improved"><span>Improved</span><strong>{improvedCount}</strong></article>
            <article className="attention"><span>Attention</span><strong>{attentionCount}</strong></article>
          </section>

          <div className="scorex3-share-tabs">
            <div className="scorex3-share-scope-tabs">
            {[
              ["all", "Full team"],
              ["attention", "Needs improvement"],
              ["top", "Top performers"],
              ["improved", "Most improved"],
            ].map(([key, label]) => (
              <button
                type="button"
                key={key}
                className={shareScope === key ? "active" : ""}
                onClick={() => setShareScope(key)}
              >
                {label}
              </button>
            ))}
            </div>
            <div className="scorex3-share-actions">
              <button type="button" className="btn primary scorex3-ranks-export" onClick={exportRankImagesZip} disabled={shareImageBusy}>
                {shareImageBusy ? "Preparing…" : "Download rank photos ZIP"}
              </button>
              <button type="button" className="btn primary scorex3-full-png-export" onClick={exportFullScorecardPhotosZip} disabled={shareImageBusy || !fullPhotoPages.length}>
                {shareImageBusy ? "Preparing photos…" : "Download full team · " + fullPhotoPages.length + " PNGs"}
              </button>
              <button type="button" className="btn primary scorex3-whatsapp-export" onClick={exportWhatsAppPng} disabled={shareImageBusy}>
                {"Preview overview PNG"}
              </button>
              <button type="button" className="btn ghost scorex3-share-export" onClick={() => exportSharePdf(false)}>
                Export selection PDF
              </button>
              <button type="button" className="btn primary scorex3-share-export-all" onClick={() => exportSharePdf(true)}>
                Export entire scorecard PDF
              </button>
            </div>
          </div>

          <div className="scorex3-mobile-photo-tools">
            <div className="scorex3-mobile-photo-heading">
              <b>Photos for phone / WhatsApp</b>
              <span>Select a rank and page, then open the photo. On iPhone, use Share or press and hold to save.</span>
            </div>
            <label>
              <span>Rank</span>
              <select value={mobilePhotoTier} onChange={(event) => { setMobilePhotoTier(event.target.value); setMobilePhotoPage(1); }}>
                {rankPhotoGroups.map((group) => (
                  <option key={group.cls} value={group.cls} disabled={!group.rows.length}>
                    {group.label} ({group.rows.length})
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Page</span>
              <select value={Math.min(mobilePhotoPage, selectedPhotoPages)} onChange={(event) => setMobilePhotoPage(Number(event.target.value))}>
                {Array.from({ length: selectedPhotoPages }, (_, index) => (
                  <option key={index + 1} value={index + 1}>{index + 1} / {selectedPhotoPages}</option>
                ))}
              </select>
            </label>
            <button type="button" className="btn primary scorex3-mobile-photo-open" onClick={previewRankPhoto}>
              Show photo
            </button>
          </div>
          <div className="scorex3-full-photo-tools">
            <div className="scorex3-full-photo-intro">
              <b>WhatsApp scorecard · Clear HD photos</b>
              <span>
                {totalDrivers} drivers split into {fullPhotoPages.length} balanced PNGs
                {fullPhotoPages.length ? " (" + fullPhotoPages.map((item) => item.rows.length).join(" / ") + " drivers)" : ""}.
                Larger images for WhatsApp: Score, FICO, Delivered, CON, DCR, POD, CC, DSC and LoR. Full details stay in PDF.
              </span>
            </div>
            <label>
              <span>Image size for WhatsApp</span>
              <select value={fullPhotoCount} disabled={shareImageBusy} onChange={(event) => {
                setFullPhotoCount(Number(event.target.value));
                setFullPhotoPage(1);
                setMobilePhotoPreview(null);
                setShareImageError("");
              }}>
                <option value={3}>3 photos · compact</option>
                <option value={4}>4 photos · larger (recommended)</option>
                <option value={5}>5 photos · largest</option>
              </select>
            </label>
            <label>
              <span>Choose photo</span>
              <select value={Math.min(fullPhotoPage, Math.max(fullPhotoPages.length, 1))} onChange={(event) => setFullPhotoPage(Number(event.target.value))} disabled={!fullPhotoPages.length}>
                {fullPhotoPages.map((item) => (
                  <option key={item.page} value={item.page}>
                    {item.page} / {fullPhotoPages.length} · Drivers {item.start}–{item.end}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="btn primary scorex3-full-photo-preview" onClick={() => previewFullScorecardPhoto()} disabled={!fullPhotoPages.length || shareImageBusy}>
              Preview / Share photo
            </button>
            <button type="button" className="btn primary scorex3-full-photo-share-all" onClick={shareAllFullScorecardPhotos} disabled={!fullPhotoPages.length || shareImageBusy}>
              Share all {fullPhotoPages.length} photos
            </button>
            <button type="button" className="btn ghost scorex3-full-photo-download" onClick={exportFullScorecardPhotosZip} disabled={!fullPhotoPages.length || shareImageBusy}>
              {shareImageBusy ? "Preparing…" : "Download " + fullPhotoPages.length + " PNGs (ZIP)"}
            </button>
          </div>
          {shareImageError && <p className="scorex3-share-image-error" role="alert">{shareImageError}</p>}
          {shareImageProgress && <p className="scorex3-share-image-progress" role="status">{shareImageProgress}</p>}
          <div className="scorex3-share-table-wrap">
            <table className="scorex3-share-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Rank</th>
                  <th>Driver</th>
                  <th>Score</th>
                  <th>FICO</th>
                  <th>Con</th>
                  <th>Delivered</th>
                  <th>DCR</th>
                  <th>DSC</th>
                  <th>LoR</th>
                  <th>POD</th>
                  <th>CC</th>
                  <th>CE</th>
                  <th>CDF</th>
                  <th>PSB</th>
                </tr>
              </thead>
              <tbody>
                {printShareRows.map((row, index) => {
                  const fico = num(row.mentor_score ?? row.ementor ?? row.fico);
                  return (
                    <tr key={`share-${driverKey(row)}-${index}`} className={`share-tier-${row.sourceRank.cls}`}>
                      <td className="share-index">{index + 1}</td>
                      <td><span className={`share-rank-badge ${row.sourceRank.cls}`}>{row.sourceRank.label}</span></td>
                      <td className="share-driver"><b>{displayDriverName(row.drivers)}</b></td>
                      <td className={`share-score ${row.sourceRank.cls}`}><b>{formatDriverScore(row.displayScore)}</b></td>
                      <td className={`share-metric ${metricTone("fico", fico)}`}>{plain(fico)}</td>
                      <td className={`share-metric ${metricTone("concessions", row.concessions)}`}>{plain(row.concessions)}</td>
                      <td>{plain(row.delivered)}</td>
                      <td className={`share-metric ${metricTone("dcr", row.dcr)}`}>{fmtPercentFlexible(row.dcr)}</td>
                      <td className={`share-metric ${metricTone("dsc_dpmo", row.dsc_dpmo)}`}>{plain(row.dsc_dpmo)}</td>
                      <td className={`share-metric ${metricTone("lor", row.lor)}`}>{plain(row.lor)}</td>
                      <td className={`share-metric ${metricTone("pod", row.pod)}`}>{fmtPercentFlexible(row.pod)}</td>
                      <td className={`share-metric ${metricTone("cc", row.cc)}`}>{fmtPercentFlexible(row.cc)}</td>
                      <td className={`share-metric ${metricTone("ce_dpmo", row.ce_dpmo)}`}>{plain(row.ce_dpmo)}</td>
                      <td className={`share-metric ${metricTone("cdf_dpmo", row.cdf_dpmo)}`}>{plain(row.cdf_dpmo)}</td>
                      <td className={`share-metric ${metricTone("psb", row.psb)}`}>{plain(row.psb)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <footer className="scorex3-share-footer">
            <span>{shareRows.length} drivers · minimum FICO {TARGETS.mentor}+</span>
            <div>
              <button type="button" className="btn ghost" onClick={copyShareSummary}>
                {copyStatus || "Copy summary"}
              </button>
              <button type="button" className="btn primary" onClick={() => setShareOpen(false)}>Close</button>
            </div>
          </footer>
          {mobilePhotoPreview && (
            <div className="scorex3-photo-preview-overlay" role="dialog" aria-modal="true" aria-label="Photo preview" onClick={() => setMobilePhotoPreview(null)}>
              <div className="scorex3-photo-preview-modal" onClick={(event) => event.stopPropagation()}>
                <div className="scorex3-photo-preview-top">
                  <div><b>{mobilePhotoPreview.label}</b><span>Tap Share photo, or press and hold the image to save it to Photos.</span></div>
                  <button type="button" aria-label="Close preview" onClick={() => setMobilePhotoPreview(null)}>×</button>
                </div>
                {photoShareTip && <p className="scorex3-photo-share-tip" role="status">{photoShareTip}</p>}
                {mobilePhotoPreview.kind === "full-scorecard" ? (
                  <div className="scorex3-full-photo-scroll">
                    <img src={mobilePhotoPreview.dataUrl} alt={mobilePhotoPreview.label} />
                  </div>
                ) : (
                  <img src={mobilePhotoPreview.dataUrl} alt={mobilePhotoPreview.label} />
                )}
                <div className="scorex3-photo-preview-actions">
                  {mobilePhotoPreview.kind === "full-scorecard" && mobilePhotoPreview.page > 1 && (
                    <button type="button" className="btn ghost" onClick={() => previewFullScorecardPhoto(mobilePhotoPreview.page - 1)}>
                      ← Previous
                    </button>
                  )}
                  <button type="button" className="btn primary" onClick={sharePreviewPhoto}>Share photo</button>
                  {mobilePhotoPreview.kind === "full-scorecard" && mobilePhotoPreview.page < fullPhotoPages.length && (
                    <button type="button" className="btn ghost" onClick={() => previewFullScorecardPhoto(mobilePhotoPreview.page + 1)}>
                      Next →
                    </button>
                  )}
                  <button type="button" className="btn ghost scorex3-desktop-save-png" onClick={savePreviewPhoto}>Save PNG</button>
                  <button type="button" className="btn ghost" onClick={() => setMobilePhotoPreview(null)}>Close</button>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>,
      document.body
    )}
  </div>;
}