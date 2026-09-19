"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { fetchDriverScorecardData } from "../../lib/data/scorecardData";
import { displayDriverName } from "../../lib/identity";
import { TARGETS } from "../../lib/config/performance";
import { driverShape, num, plain } from "../../lib/scorecards/metrics";
import { calculateDriverScorecard } from "../../lib/scorecards/driverScoreFormula";
import { EmptyPanel, ErrorPanel, LoadingPanel, useLoad } from "./ScorecardPrimitives";

export default function DriverScorecardsV22({
  organizationId,
  onOpenDriver,
  onImport,
  siteFilter = "all",
  onSiteFilterChange,
}) {
  const load = useLoad(async () => {
    const supabase = getSupabaseBrowserClient();
    return fetchDriverScorecardData(supabase, organizationId);
  }, [organizationId]);

  const rows = load.data?.rows || [];
  const cards = load.data?.cards || [];

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
    const value = String(row?.drivers?.site || "").trim().toUpperCase();
    return value || "UNASSIGNED";
  };

  const periodKeyForRow = (row) =>
    `${yearForRow(row) || "unknown"}-${row.week_label || "Unknown"}-${siteForRow(row)}`;

  const driverKey = (row) =>
    String(row?.driver_id || row?.drivers?.id || row?.drivers?.trid || "").trim();

  const siteOptions = useMemo(() => {
    const values = new Set();
    for (const row of rows) {
      const site = siteForRow(row);
      if (site !== "UNASSIGNED") values.add(site);
    }
    for (const card of cards) {
      const site = String(card.site || "").trim().toUpperCase();
      if (site) values.add(site);
    }
    return [...values].sort();
  }, [rows, cards]);

  const periodMap = useMemo(() => {
    const map = new Map();

    for (const row of rows) {
      if (!row.week_label) continue;
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
  const [quickFilter, setQuickFilter] = useState("all");
  const [sort, setSort] = useState({ key: "displayScore", direction: "desc" });
  const [shareOpen, setShareOpen] = useState(false);
  const [shareScope, setShareScope] = useState("all");
  const [breakdownRow, setBreakdownRow] = useState(null);
  const [copyStatus, setCopyStatus] = useState("");
  const [manualFicoOverrides, setManualFicoOverrides] = useState({});
  const [editRow, setEditRow] = useState(null);
  const [editFico, setEditFico] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editMessage, setEditMessage] = useState("");

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
      const row = withEffectiveFico(sourceRow);
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
        sourceRank: tier,
      };
    });
  };

  const previousRows = useMemo(
    () => enrichBaseRows(previousPeriod),
    [previousPeriod, manualFicoOverrides]
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
      .sort((a, b) => (num(b.displayScore) ?? -1) - (num(a.displayScore) ?? -1))
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
      (a, b) => (num(b.displayScore) ?? -1) - (num(a.displayScore) ?? -1)
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
  }, [period, previousByDriver, previousRankByDriver, manualFicoOverrides]);

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
  const weekDelta =
    averageDriverScore != null && previousAverage != null
      ? averageDriverScore - previousAverage
      : null;
  const improvedCount = enrichedRows.filter((row) => num(row.scoreDelta) != null && row.scoreDelta > 0).length;
  const droppedCount = enrichedRows.filter((row) => num(row.scoreDelta) != null && row.scoreDelta < 0).length;
  const attentionCount = enrichedRows.filter(
    (row) => ["fair", "poor"].includes(row.sourceRank.cls) || row.flags.filter((flag) => flag.severity === "bad").length >= 2
  ).length;
  const formulaCount = enrichedRows.length;

  const headlineScore = averageDriverScore;
  const overallStanding =
    headlineScore != null ? sourceTier(headlineScore).label : "Not rated";
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
      .filter(matchesQuickFilter)
      .sort(compareRows);
  }, [enrichedRows, query, groupFilter, quickFilter, sort]);

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
      setSort({ key: "displayScore", direction: "desc" });
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
    <th>
      <button type="button" onClick={() => toggleSort(columnKey)}>
        <span>{children}</span>
        <small>{sortArrow(columnKey)}</small>
      </button>
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
      (a, b) => (num(b.displayScore) ?? -1) - (num(a.displayScore) ?? -1)
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

  async function copyShareSummary() {
    const lines = [
      `${period?.weekLabel || "Week"} Driver Scorecard · ${period?.site || "All sites"}`,
      `Team score: ${headlineScore == null ? "—" : headlineScore.toFixed(2)} · ${overallStanding}`,
      `Drivers: ${totalDrivers} · Improved: ${improvedCount} · Attention: ${attentionCount}`,
      `WoW: ${weekDelta == null ? "n/a" : `${weekDelta > 0 ? "+" : ""}${weekDelta.toFixed(1)} pts`}`,
      "",
      ...shareRows.slice(0, 30).map((row, index) => {
        const fico = num(row.mentor_score ?? row.ementor ?? row.fico);
        const flags = row.flags.map((flag) => flag.label).join(", ") || "OK";
        return `${index + 1}. ${displayDriverName(row.drivers)} — ${row.displayScore == null ? "—" : row.displayScore.toFixed(0)} · FICO ${fico ?? "—"} · ${flags}`;
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

  const openFicoEditor = (row) => {
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
      const existingOverride = editRow.raw_data?.manual_fico_override || null;
      const originalValue =
        existingOverride?.original_value ??
        num(editRow.mentor_score ?? editRow.ementor ?? editRow.fico);
      const nextRawData = {
        ...(editRow.raw_data || {}),
        scorecard_formula_version: "v1",
        manual_fico_override: {
          original_value: originalValue,
          value,
          updated_at: new Date().toISOString(),
          source: "driver_scorecard_edit",
        },
      };

      const { data, error } = await supabase
        .from("driver_metrics")
        .update({
          mentor_score: value,
          ementor: value,
          fico: value,
          raw_data: nextRawData,
        })
        .eq("organization_id", organizationId)
        .eq("driver_id", editRow.driver_id)
        .eq("week_label", editRow.week_label)
        .select("driver_id");

      if (error) throw error;
      if (!data?.length) throw new Error("No matching driver-week record was updated.");

      setManualFicoOverrides((current) => ({
        ...current,
        [manualOverrideKey(editRow)]: value,
      }));
      setBreakdownRow(null);
      setEditMessage("Saved");
      window.setTimeout(() => {
        setEditRow(null);
        setEditMessage("");
      }, 500);
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

  return <div className="scorex3-root">
    <section className="scorex3-header">
      <div className="scorex3-title">
        <span className="page-kicker">DRIVER SCORECARDS</span>
        <h1>{period?.weekLabel || "Week"} Driver Scorecards</h1>
        <p>
          {period?.site || "All sites"} · {period?.year || "—"} · Weekly ranking with FICO, delivery quality and concessions.
        </p>
      </div>

      <div className={`scorex3-station-score ${overallTier.cls}`}>
        <span>Team score</span>
        <div>
          <strong>{headlineScore == null ? "—" : `${headlineScore.toFixed(2)}%`}</strong>
          <em>{overallStanding}</em>
        </div>
        <small className={weekDelta == null ? "neutral" : weekDelta >= 0 ? "up" : "down"}>
          {previousPeriod
            ? `vs ${previousPeriod.weekLabel}: ${weekDelta == null ? "—" : `${weekDelta >= 0 ? "+" : ""}${weekDelta.toFixed(1)} pts`}`
            : "No previous week comparison"}
        </small>
      </div>
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
        <span>Site</span>
        <select
          aria-label="Filter driver scorecards by site"
          value={siteFilter}
          onChange={(event) => onSiteFilterChange?.(event.target.value)}
          disabled={!onSiteFilterChange}
        >
          <option value="all">All sites</option>
          {siteOptions.map((site) => <option key={site} value={site}>{site}</option>)}
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
          placeholder="Name or Transporter ID…"
        />
      </label>

      <button type="button" className="btn ghost scorex3-share-button" onClick={() => setShareOpen(true)}>
        Share view
      </button>
      <button type="button" className="btn primary scorex3-import" onClick={onImport}>
        Import scorecard
      </button>
    </section>

    <section className="scorex3-insight">
      <div>
        <b>{improvedCount}</b> improved
        <span>·</span>
        <b>{droppedCount}</b> declined
        <span>·</span>
        <b>{attentionCount}</b> need attention
        <span>·</span>
        <b>{nearPromotionCount}</b> within 3 points of the next tier
      </div>
      <small>Formula v1 active · {formulaCount} calculated · missing metrics default to 100% per formula</small>
    </section>

    <section className="scorex3-summary">
      <article>
        <span>Drivers</span>
        <strong>{totalDrivers}</strong>
        <small>{period?.weekLabel}</small>
      </article>
      <article>        <span>Delivered</span>
        <strong>{Math.round(delivered).toLocaleString()}</strong>
        <small>Weekly total</small>
      </article>
      <article>
        <span>Concessions</span>
        <strong>{Math.round(concessions)}</strong>
        <small>Same-week evidence</small>
      </article>
      <article>
        <span>Avg Total Score</span>
        <strong>{averageDriverScore == null ? "—" : averageDriverScore.toFixed(1)}</strong>
        <small>Driver average</small>
      </article>
      <article className={weekDelta == null ? "" : weekDelta >= 0 ? "positive" : "negative"}>
        <span>WoW</span>
        <strong>{weekDelta == null ? "—" : `${weekDelta >= 0 ? "+" : ""}${weekDelta.toFixed(1)}`}</strong>
        <small>{previousPeriod ? `vs ${previousPeriod.weekLabel}` : "No comparison"}</small>
      </article>
      <article>
        <span>FICO linked</span>
        <strong>{ficoLinked}/{totalDrivers}</strong>
        <small>{totalDrivers ? Math.round((ficoLinked / totalDrivers) * 100) : 0}% coverage</small>
      </article>
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

    <section className="scorex3-tier-strip" aria-label="Scorecard rank summary">
      {groupOrder.map((group) =>
        <button
          type="button"
          key={group.cls}
          className={`${group.cls} ${groupFilter === group.cls ? "active" : ""}`}
          onClick={() => setGroupFilter((current) => current === group.cls ? "all" : group.cls)}
        >
          <span>{group.label}</span>
          <strong>{groupCounts[group.cls] || 0}</strong>
          <small>
            {group.min} · {totalDrivers ? Math.round(((groupCounts[group.cls] || 0) / totalDrivers) * 100) : 0}%
          </small>
        </button>
      )}
    </section>

    <section className="scorex3-quick-filters" aria-label="Quick scorecard filters">
      {quickFilters.map((filter) =>
        <button
          key={filter.key}
          type="button"
          className={quickFilter === filter.key ? "active" : ""}
          onClick={() => selectQuickFilter(filter.key)}
        >
          <span>{filter.label}</span>
          <b>{filter.count}</b>
        </button>
      )}
    </section>

    <section className="scorex3-register">
      <div className="scorex3-register-head">
        <div>
          <span>SCORECARD REGISTER</span>
          <h2>{period?.weekLabel} driver ranking</h2>
        </div>
        <div>
          <b>{periodRows.length}/{totalDrivers}</b>
          <span>
            Showing drivers · sorted by {sortLabels[sort.key] || "Score"} {sort.direction === "asc" ? "↑" : "↓"}
          </span>
        </div>
      </div>

      <div className="scorex3-table-wrap">
        <table className="scorex3-table">
          <thead>
            <tr>
              <SortHeader columnKey="trid">Transporter ID</SortHeader>
              <SortHeader columnKey="rank">Rank</SortHeader>
              <SortHeader columnKey="name">Name</SortHeader>
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
                  <td colSpan="15">
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
                  const flagText = row.flags.map((flag) => flag.label).join(" · ");

                  return <tr
                    key={`${row.driver_id}-${period?.key}`}
                    className={`scorex3-driver-row ${row.flags.filter((flag) => flag.severity === "bad").length >= 2 ? "multi-risk" : ""}`}
                  >
                    <td className="scorex3-trid-cell">{driver.trid || "—"}</td>
                    <td className={`scorex3-rank-cell ${row.sourceRank.cls}`}>
                      <b>{row.sourceRank.label}</b>
                      <small className={movementClass(row)}>
                        #{row.currentRank || "—"} {movementLabel(row)}
                      </small>
                    </td>
                    <td className="scorex3-name-cell">
                      <button
                        type="button"
                        onClick={() => onOpenDriver?.(driverShape(row))}
                        title="Open Driver 360"
                      >
                        {displayDriverName(driver)}
                      </button>
                      <div className="scorex3-flags" title={flagText || "No active performance flag"}>
                        {row.flags.length ? row.flags.slice(0, 3).map((flag) =>
                          <span key={flag.key} className={flag.severity}>{flag.label}</span>
                        ) : <span className="ok">OK</span>}
                        {row.flags.length > 3 && <em>+{row.flags.length - 3}</em>}
                      </div>
                    </td>
                    <td className={`scorex3-metric ${metricTone("concessions", row.concessions)}`}>
                      {plain(row.concessions)}
                    </td>
                    <td className={`scorex3-score-cell ${row.sourceRank.cls}`}>
                      <button
                        type="button"
                        onClick={() => setBreakdownRow(row)}
                        title="Why this score?"
                      >
                        <b>{row.displayScore == null ? "—" : row.displayScore.toFixed(0)}</b>
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
                    <td className="scorex3-delivered-cell">{plain(row.delivered)}</td>
                    <td className={`scorex3-metric ${metricTone("dcr", row.dcr)}`}>{fmtPercentFlexible(row.dcr)}</td>
                    <td className={`scorex3-metric ${metricTone("dsc_dpmo", row.dsc_dpmo)}`}>{plain(row.dsc_dpmo)}</td>
                    <td className={`scorex3-metric ${metricTone("lor", row.lor)}`}>{plain(row.lor)}</td>
                    <td className={`scorex3-metric ${metricTone("pod", row.pod)}`}>{fmtPercentFlexible(row.pod)}</td>
                    <td className={`scorex3-metric ${metricTone("cc", row.cc)}`}>{fmtPercentFlexible(row.cc)}</td>
                    <td className={`scorex3-metric ${metricTone("ce_dpmo", row.ce_dpmo)}`}>{plain(row.ce_dpmo)}</td>
                    <td className={`scorex3-metric ${metricTone("cdf_dpmo", row.cdf_dpmo)}`}>{plain(row.cdf_dpmo)}</td>
                    <td className={`scorex3-metric ${metricTone("psb", row.psb)}`}>{plain(row.psb)}</td>
                  </tr>;
                }),
              ];
            })}

            {!periodRows.length &&
              <tr>
                <td colSpan="15">
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
            <button type="button" onClick={() => !editSaving && setEditRow(null)} aria-label="Close FICO editor">×</button>
          </header>

          <div className="scorex3-edit-formula">
            <span>Formula impact</span>
            <b>FICO = 17% of Total Score</b>
            <small>Below 750 = 0 · 810+ = 100% · 750–809 uses (FICO−750)/70.</small>
          </div>

          <label className="scorex3-edit-field">
            <span>FICO score</span>
            <input
              type="number"
              min="0"
              max="850"
              step="1"
              value={editFico}
              onChange={(event) => {
                setEditFico(event.target.value);
                setEditMessage("");
              }}
              autoFocus
            />
          </label>

          <div className="scorex3-edit-preview">
            <div>
              <span>Current Total Score</span>
              <strong>{editRow.displayScore == null ? "—" : editRow.displayScore.toFixed(1)}</strong>
            </div>
            <div>
              <span>Preview Total Score</span>
              <strong>{editPreview?.value == null ? "—" : editPreview.value.toFixed(1)}</strong>
            </div>
            <div>
              <span>Change</span>
              <strong className={
                editPreview?.value == null || editRow.displayScore == null
                  ? "neutral"
                  : editPreview.value > editRow.displayScore
                    ? "up"
                    : editPreview.value < editRow.displayScore
                      ? "down"
                      : "neutral"
              }>
                {editPreview?.value == null || editRow.displayScore == null
                  ? "—"
                  : `${editPreview.value - editRow.displayScore >= 0 ? "+" : ""}${(editPreview.value - editRow.displayScore).toFixed(1)}`}
              </strong>
            </div>
          </div>

          <div className="scorex3-edit-note">
            Saving updates FICO for this driver and this scorecard week only. The Total Score, Rank and WoW comparison recalculate automatically from Formula v1.
          </div>

          {editMessage && <div className={`scorex3-edit-message ${editMessage === "Saved" ? "success" : "error"}`}>{editMessage}</div>}

          <footer>
            <button type="button" className="btn ghost" disabled={editSaving} onClick={() => setEditRow(null)}>Cancel</button>
            <button type="button" className="btn primary" disabled={editSaving} onClick={saveFicoEdit}>
              {editSaving ? "Saving…" : "Save FICO & recalculate"}
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
              <strong>{breakdownRow.displayScore == null ? "—" : breakdownRow.displayScore.toFixed(1)}</strong>
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
            <b>Scorecard formula v1</b>
            <span>
              Exact weighted formula: FICO 17%, DCR 17%, DSC 17%, LoR 6%, POD 8%, CC 8%, CE 10%, CDF 10%, PSB 7%. Missing/non-numeric inputs default to 100% exactly as defined by the formula. Coverage: {breakdownRow.scoreCoverage}/9 real metrics.
            </span>
          </div>

          <section className="scorex3-breakdown-list">
            {breakdownRow.scoreComponents.map((component) => (
              <article key={component.key}>
                <div className="scorex3-breakdown-line">
                  <div>
                    <b>{component.label}</b>
                    <span>
                      {component.defaulted ? "Missing → 100% default" : component.format(component.value)}
                    </span>
                  </div>
                  <div>
                    <strong>{component.component.toFixed(0)}%</strong>
                    <small>{component.weight}% weight · {component.contribution.toFixed(1)} pts</small>
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

    {shareOpen && (
      <div className="scorex3-share-overlay" role="dialog" aria-modal="true" onClick={() => setShareOpen(false)}>
        <section className="scorex3-share-sheet" onClick={(event) => event.stopPropagation()}>
          <header className="scorex3-share-head">
            <div>
              <span>METRIXIQ · DRIVER SCORECARD</span>
              <h2>{period?.weekLabel} · {period?.site || "All sites"}</h2>
              <p>{period?.year || "—"} weekly performance summary</p>
            </div>
            <div>
              <strong>{headlineScore == null ? "—" : `${headlineScore.toFixed(2)}%`}</strong>
              <em>{overallStanding}</em>
            </div>
          </header>

          <section className="scorex3-share-kpis">
            <article><span>Drivers</span><strong>{totalDrivers}</strong></article>
            <article><span>WoW</span><strong>{weekDelta == null ? "—" : `${weekDelta >= 0 ? "+" : ""}${weekDelta.toFixed(1)}`}</strong></article>
            <article><span>Improved</span><strong>{improvedCount}</strong></article>
            <article><span>Attention</span><strong>{attentionCount}</strong></article>
          </section>

          <div className="scorex3-share-tabs">
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

          <div className="scorex3-share-table-wrap">
            <table className="scorex3-share-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Driver</th>
                  <th>Rank</th>
                  <th>Score</th>
                  <th>WoW</th>
                  <th>FICO</th>
                  <th>Con</th>
                  <th>DCR</th>
                  <th>POD</th>
                  <th>CC</th>
                  <th>Flags</th>
                </tr>
              </thead>
              <tbody>
                {shareRows.map((row, index) => (
                  <tr key={`share-${driverKey(row)}-${index}`}>
                    <td>{index + 1}</td>
                    <td><b>{displayDriverName(row.drivers)}</b></td>
                    <td className={`tier ${row.sourceRank.cls}`}>{row.sourceRank.label}</td>
                    <td><b>{row.displayScore == null ? "—" : row.displayScore.toFixed(0)}</b></td>
                    <td className={scoreDeltaClass(row.scoreDelta)}>{row.scoreDelta == null ? "—" : scoreDeltaLabel(row.scoreDelta)}</td>
                    <td>{plain(row.mentor_score ?? row.ementor ?? row.fico)}</td>
                    <td>{plain(row.concessions)}</td>
                    <td>{fmtPercentFlexible(row.dcr)}</td>
                    <td>{fmtPercentFlexible(row.pod)}</td>
                    <td>{fmtPercentFlexible(row.cc)}</td>
                    <td>{row.flags.slice(0, 3).map((flag) => flag.label).join(" · ") || "OK"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <footer className="scorex3-share-footer">
            <span>{shareRows.length} drivers · minimum FICO {TARGETS.mentor}+</span>
            <div>
              <button type="button" className="btn ghost" onClick={copyShareSummary}>
                {copyStatus || "Copy summary"}
              </button>
              <button type="button" className="btn ghost" onClick={() => setShareOpen(false)}>Close</button>
              <button type="button" className="btn primary" onClick={() => window.print()}>Print / Save</button>
            </div>
          </footer>
        </section>
      </div>
    )}
  </div>;
}