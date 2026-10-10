"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toBlob } from "html-to-image";
import { analyseFiles } from "../../lib/analyzer";
import { fetchIadcWorkspaceRows } from "../../lib/data/iadc";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { ErrorBox, Loading, dname, n, openShape, pct, trid, weekNo } from "./OperationalShared";

const ACCEPT = ".xlsx,.xls,.html,.htm,.pdf";
const IADC_TARGET = 80;
const DWC_TARGET = 85;

const granularity = (row) =>
  String(row?.raw_data?.metric_granularity || "weekly").toLowerCase();

const calendarWeek = (row) => {
  const raw = String(row?.raw_data?.calendar_week || row?.week_label || "");
  const match = raw.match(/W\d+/i);
  return match ? match[0].toUpperCase() : raw;
};

const rowDate = (row) =>
  String(
    row?.raw_data?.metric_date ||
      row?.period_end ||
      row?.period_start ||
      ""
  ).slice(0, 10);

const dwcOf = (row) => n(row?.raw_data?.dwc);

const formatDate = (value) => {
  if (!value) return "No date";
  const date = new Date(value + "T12:00:00");
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const csv = (value) => '"' + String(value ?? "").replaceAll('"', '""') + '"';

function dedupeDriverRows(rows) {
  const byDriver = new Map();
  for (const row of rows) {
    const key = String(row.driver_id || row.id || "");
    if (!key) continue;
    const current = byDriver.get(key);
    if (
      !current ||
      String(row.created_at || "") > String(current.created_at || "")
    ) {
      byDriver.set(key, row);
    }
  }
  return [...byDriver.values()];
}

function toneFor(value, target) {
  const score = n(value);
  if (score == null) return "neutral";
  if (score >= Math.max(target + 10, 90)) return "excellent";
  if (score >= target) return "good";
  if (score >= target - 10) return "watch";
  return "critical";
}

function statusFor(value, target) {
  const score = n(value);
  if (score == null) return "No data";
  if (score >= Math.max(target + 10, 90)) return "Excellent";
  if (score >= target) return "Compliant";
  if (score >= target - 10) return "Watch";
  return "Action required";
}

function metricAverage(rows, getter) {
  const values = rows.map(getter).filter((value) => value != null);
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + Number(value), 0) / values.length;
}

function inferSiteFromFile(fileName) {
  return String(fileName || "").toUpperCase().match(/\bD[A-Z]{1,4}\d{1,3}\b/)?.[0] || "";
}

export default function IadcComplianceView({
  organizationId,
  onOpenDriver,
  onImported,
  siteFilter = "all",
  initialComplianceTab = "iadc",
  refreshKey = 0,
}) {
  const [load, setLoad] = useState({ loading: true, error: "", rows: [] });
  const [localRefresh, setLocalRefresh] = useState(0);
  const [tab, setTab] = useState(initialComplianceTab === "dwc" ? "dwc" : "iadc");
  const [mode, setMode] = useState("daily");
  const [week, setWeek] = useState("");
  const [day, setDay] = useState("");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState("metric");
  const [sortDir, setSortDir] = useState("asc");
  const [showTrid, setShowTrid] = useState(true);
  const [driverFilter, setDriverFilter] = useState("all");
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [importError, setImportError] = useState("");
  const fileInput = useRef(null);
  const shareCardRefs = useRef([]);
  const [shareMessage, setShareMessage] = useState("");

  useEffect(() => {
    let alive = true;
    if (!organizationId) {
      setLoad({ loading: false, error: "", rows: [] });
      return () => {};
    }

    (async () => {
      try {
        setLoad((current) => ({ ...current, loading: true, error: "" }));
        const rows = await fetchIadcWorkspaceRows(
          getSupabaseBrowserClient(),
          organizationId,
          siteFilter
        );
        if (alive) setLoad({ loading: false, error: "", rows });
      } catch (error) {
        if (alive) {
          setLoad({
            loading: false,
            error: error?.message || "Could not load IADC data.",
            rows: [],
          });
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [organizationId, siteFilter, refreshKey, localRefresh]);

  const rows = load.rows || [];
  const target = tab === "dwc" ? DWC_TARGET : IADC_TARGET;
  const valueOf = (row) => (tab === "dwc" ? dwcOf(row) : n(row?.iadc));
  const secondaryValueOf = (row) => (tab === "dwc" ? n(row?.iadc) : dwcOf(row));

  const dailyRows = useMemo(
    () => rows.filter((row) => granularity(row) === "daily"),
    [rows]
  );
  const weeklyRows = useMemo(
    () => rows.filter((row) => granularity(row) === "weekly"),
    [rows]
  );

  const modeRows = mode === "daily" ? dailyRows : weeklyRows;
  const rowsWithMetric = useMemo(
    () => modeRows.filter((row) => valueOf(row) != null),
    [modeRows, tab]
  );

  const weeks = useMemo(
    () =>
      [...new Set(rowsWithMetric.map(calendarWeek).filter((value) => /^W\d+$/i.test(value)))]
        .sort((a, b) => weekNo(b) - weekNo(a)),
    [rowsWithMetric]
  );

  const selectedWeek =
    week && weeks.includes(week) ? week : weeks[0] || "";

  const weekRows = useMemo(
    () => rowsWithMetric.filter((row) => calendarWeek(row) === selectedWeek),
    [rowsWithMetric, selectedWeek]
  );

  const days = useMemo(
    () =>
      mode === "daily"
        ? [...new Set(weekRows.map(rowDate).filter(Boolean))].sort().reverse()
        : [],
    [mode, weekRows]
  );

  const selectedDay =
    day && days.includes(day) ? day : days[0] || "";

  const selectedRows = useMemo(() => {
    const base =
      mode === "daily"
        ? weekRows.filter((row) => rowDate(row) === selectedDay)
        : weekRows;
    return dedupeDriverRows(base);
  }, [mode, weekRows, selectedDay]);

  const previousDay = useMemo(() => {
    if (mode !== "daily" || !selectedDay) return "";
    const index = days.indexOf(selectedDay);
    return index >= 0 ? days[index + 1] || "" : "";
  }, [mode, selectedDay, days]);

  const previousWeek = useMemo(() => {
    if (mode !== "weekly" || !selectedWeek) return "";
    const index = weeks.indexOf(selectedWeek);
    return index >= 0 ? weeks[index + 1] || "" : "";
  }, [mode, selectedWeek, weeks]);

  const previousPeriodRows = useMemo(() => {
    if (mode === "daily") {
      if (!previousDay) return [];
      return dedupeDriverRows(
        dailyRows.filter(
          (row) =>
            calendarWeek(row) === selectedWeek &&
            rowDate(row) === previousDay &&
            valueOf(row) != null
        )
      );
    }

    if (!previousWeek) return [];
    return dedupeDriverRows(
      weeklyRows.filter(
        (row) =>
          calendarWeek(row) === previousWeek &&
          valueOf(row) != null
      )
    );
  }, [mode, dailyRows, weeklyRows, previousDay, previousWeek, selectedWeek, tab]);

  const previousByDriver = useMemo(
    () =>
      new Map(
        previousPeriodRows.map((row) => [row.driver_id, valueOf(row)])
      ),
    [previousPeriodRows, tab]
  );

  const scoredRows = selectedRows.filter((row) => valueOf(row) != null);
  const average = metricAverage(scoredRows, valueOf);
  const compliant = scoredRows.filter((row) => Number(valueOf(row)) >= target).length;
  const below = scoredRows.length - compliant;
  const strong = scoredRows.filter(
    (row) => Number(valueOf(row)) >= Math.max(target + 10, 90)
  ).length;

  const previousAverage = metricAverage(previousPeriodRows, valueOf);
  const averageDelta =
    average == null || previousAverage == null
      ? null
      : Number(average) - Number(previousAverage);

  const excellentCut = Math.max(target + 10, 90);

  const latestDailyDates = useMemo(
    () =>
      [...new Set(
        dailyRows
          .filter((row) => valueOf(row) != null)
          .map(rowDate)
          .filter(Boolean)
          .filter((date) => !selectedDay || date <= selectedDay)
      )]
        .sort()
        .slice(-7),
    [dailyRows, selectedDay, tab]
  );

  const last7ByDriver = useMemo(() => {
    const map = new Map();
    for (const row of dailyRows) {
      if (
        !latestDailyDates.includes(rowDate(row)) ||
        valueOf(row) == null
      ) continue;
      const key = row.driver_id;
      if (!map.has(key)) map.set(key, new Map());
      map.get(key).set(rowDate(row), Number(valueOf(row)));
    }

    const result = new Map();
    for (const [driverId, values] of map.entries()) {
      result.set(
        driverId,
        latestDailyDates.map((date) =>
          values.has(date) ? values.get(date) : null
        )
      );
    }
    return result;
  }, [dailyRows, latestDailyDates, tab]);

  const latestFourWeeks = useMemo(
    () =>
      [...new Set(
        rows
          .filter((row) => valueOf(row) != null)
          .map(calendarWeek)
          .filter((value) => /^W\d+$/i.test(value))
      )]
        .sort((a, b) => weekNo(b) - weekNo(a))
        .slice(0, 4),
    [rows, tab]
  );

  const avg4wByDriver = useMemo(() => {
    const byDriverWeek = new Map();
    const sourceRows = weeklyRows.some((row) => valueOf(row) != null)
      ? weeklyRows
      : dailyRows;

    for (const row of sourceRows) {
      const weekLabel = calendarWeek(row);
      const value = valueOf(row);
      if (
        value == null ||
        !latestFourWeeks.includes(weekLabel) ||
        !row.driver_id
      ) continue;

      if (!byDriverWeek.has(row.driver_id)) {
        byDriverWeek.set(row.driver_id, new Map());
      }
      const weekMap = byDriverWeek.get(row.driver_id);
      if (!weekMap.has(weekLabel)) weekMap.set(weekLabel, []);
      weekMap.get(weekLabel).push(Number(value));
    }

    const result = new Map();
    for (const [driverId, weekMap] of byDriverWeek.entries()) {
      const weekAverages = [...weekMap.values()]
        .map((values) =>
          values.length
            ? values.reduce((sum, value) => sum + value, 0) / values.length
            : null
        )
        .filter((value) => value != null);

      result.set(
        driverId,
        weekAverages.length
          ? weekAverages.reduce((sum, value) => sum + value, 0) / weekAverages.length
          : null
      );
    }
    return result;
  }, [weeklyRows, dailyRows, latestFourWeeks, tab]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = scoredRows.filter((row) => {
      const score = Number(valueOf(row));
      const passesStatus =
        driverFilter === "all" ||
        (driverFilter === "below" && score < target) ||
        (driverFilter === "compliant" && score >= target && score < excellentCut) ||
        (driverFilter === "excellent" && score >= excellentCut);

      if (!passesStatus) return false;

      const haystack = [
        dname(row.drivers),
        trid(row.drivers),
        valueOf(row),
        secondaryValueOf(row),
      ]
        .join(" ")
        .toLowerCase();

      return !needle || haystack.includes(needle);
    });

    const numericFor = (row) => {
      if (sortKey === "secondary") return secondaryValueOf(row);
      if (sortKey === "delta") {
        const previous = previousByDriver.get(row.driver_id);
        const current = valueOf(row);
        return previous == null || current == null
          ? null
          : Number(current) - Number(previous);
      }
      if (sortKey === "avg4w") return avg4wByDriver.get(row.driver_id) ?? null;
      return valueOf(row);
    };

    return [...filtered].sort((a, b) => {
      if (sortKey === "name") {
        const cmp = dname(a.drivers).localeCompare(dname(b.drivers));
        return sortDir === "asc" ? cmp : -cmp;
      }

      const av = numericFor(a);
      const bv = numericFor(b);
      if (av == null && bv == null) return dname(a.drivers).localeCompare(dname(b.drivers));
      if (av == null) return 1;
      if (bv == null) return -1;
      const delta = Number(av) - Number(bv);
      return sortDir === "asc" ? delta : -delta;
    });
  }, [
    scoredRows,
    query,
    driverFilter,
    sortKey,
    sortDir,
    tab,
    previousByDriver,
    avg4wByDriver,
    target,
    excellentCut,
  ]);

  async function quickImport(file) {
    if (!file || importing) return;

    const ext = String(file.name || "").toLowerCase().match(/\.[^.]+$/)?.[0] || "";
    if (![".xlsx", ".xls", ".html", ".htm", ".pdf"].includes(ext)) {
      setImportError("Upload an Amazon IADC/DWC Excel, HTML or PDF report.");
      return;
    }

    setImporting(true);
    setImportError("");
    setImportMessage("");

    try {
      const result = await analyseFiles([file]);
      const recognized = (result?.fileResults || []).filter((item) => item.recognized);
      const iadcLike = recognized.some((item) =>
        String(item.reportType || "").toLowerCase().includes("iadc")
      );

      if (!result?.recognizedFiles || !iadcLike) {
        throw new Error("This file was not recognised as an Amazon IADC/DWC report.");
      }

      const chosenSite =
        String(siteFilter || "").toLowerCase() === "all"
          ? inferSiteFromFile(file.name) || null
          : String(siteFilter || "").trim().toUpperCase();

      await onImported?.(result, [file], chosenSite);
      setImportMessage(
        `Imported ${file.name}${chosenSite ? ` · ${chosenSite}` : ""}. Data refreshed.`
      );
      setWeek("");
      setDay("");
      setLocalRefresh((value) => value + 1);
    } catch (error) {
      setImportError(error?.message || "Could not import this IADC report.");
    } finally {
      setImporting(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function exportCsv() {
    if (!visible.length) return;
    const metricLabel = tab.toUpperCase();
    const secondaryLabel = tab === "iadc" ? "DWC" : "IADC";
    const output = [
      ["Driver", "TRID", metricLabel, secondaryLabel, "Status"],
      ...visible.map((row) => [
        dname(row.drivers),
        trid(row.drivers),
        valueOf(row),
        secondaryValueOf(row),
        statusFor(valueOf(row), target),
      ]),
    ]
      .map((line) => line.map(csv).join(","))
      .join("\r\n");

    const blob = new Blob([output], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `metrixiq-${tab}-${mode === "daily" ? selectedDay : selectedWeek}.csv`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 250);
  }

  const sharePeriod = mode === "daily" ? selectedDay : selectedWeek;
  const shareSite = String(siteFilter || "all").toUpperCase() === "ALL"
    ? "All sites"
    : String(siteFilter || "").trim().toUpperCase();
  const shareFileName = `metrixiq-iadc-${shareSite.replace(/[^A-Z0-9]+/gi, "-").toLowerCase()}-${sharePeriod || "report"}.png`;
  const IADC_EXPORT_PAGE_SIZE = 25;
  const sharePages = useMemo(() => {
    const pages = [];
    for (let index = 0; index < visible.length; index += IADC_EXPORT_PAGE_SIZE) {
      pages.push(visible.slice(index, index + IADC_EXPORT_PAGE_SIZE));
    }
    return pages;
  }, [visible]);

  async function createShareImage(node) {
    if (!node || !visible.length) {
      throw new Error("There is no IADC data to export.");
    }

    if (typeof document !== "undefined" && document.fonts?.ready) {
      await document.fonts.ready;
    }
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await new Promise((resolve) => setTimeout(resolve, 80));

    const blob = await toBlob(node, {
      cacheBust: true,
      pixelRatio: 2,
      backgroundColor: "#eef3f5",
      style: {
        position: "static",
        left: "0",
        top: "0",
        transform: "none",
        zIndex: "0",
        margin: "0",
        opacity: "1",
        visibility: "visible",
      },
    });
    if (!blob || blob.size < 5000) {
      throw new Error("Could not create the IADC image correctly. Please try again.");
    }
    return blob;
  }

  function downloadShareBlob(blob, pageIndex = 0, totalPages = 1) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = totalPages === 1 ? shareFileName : shareFileName.replace(/\.png$/i, "-p" + (pageIndex + 1) + ".png");
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  async function saveIadcImage() {
    if (tab !== "iadc" || !visible.length) return;
    const totalPages = sharePages.length;
    setShareMessage(totalPages > 1 ? "Creating " + totalPages + " IADC pages…" : "Creating IADC image…");
    try {
      for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
        const node = shareCardRefs.current[pageIndex];
        const blob = await createShareImage(node);
        downloadShareBlob(blob, pageIndex, totalPages);
        if (totalPages > 1 && pageIndex < totalPages - 1) {
          await new Promise((resolve) => setTimeout(resolve, 180));
        }
      }
      setShareMessage(totalPages > 1 ? totalPages + " IADC pages saved." : "IADC image saved.");
    } catch (error) {
      setShareMessage(error?.message || "Could not save the IADC image.");
    }
  }


  if (load.loading) return <Loading text="Loading IADC & DWC workspace…" />;
  if (load.error) return <ErrorBox error={load.error} />;

  return (
    <div className="iadcpro">
      <header className="iadcpro-hero">
        <div>
          <span className="page-kicker">WORKFLOW COMPLIANCE</span>
          <h1>{tab.toUpperCase()} Performance</h1>
          <p>
            Driver-level {tab.toUpperCase()} compliance with daily reports kept separate from weekly scorecard evidence.
          </p>
        </div>
        <div className="iadcpro-target">
          <span>{tab.toUpperCase()} TARGET</span>
          <strong>{target}%+</strong>
        </div>
      </header>

      <section className="iadcpro-controlbar">
        <div className="iadcpro-tabs">
          <button
            type="button"
            className={tab === "iadc" ? "active" : ""}
            onClick={() => {
              setTab("iadc");
              setDay("");
              setWeek("");
                    }}
          >
            IADC
          </button>
          <button
            type="button"
            className={tab === "dwc" ? "active" : ""}
            onClick={() => {
              setTab("dwc");
              setDay("");
              setWeek("");
                    }}
          >
            DWC
          </button>
        </div>

        <div className="iadcpro-period-tabs">
          <button
            type="button"
            className={mode === "daily" ? "active" : ""}
            onClick={() => {
              setMode("daily");
              setWeek("");
              setDay("");
            }}
          >
            Daily
          </button>
          <button
            type="button"
            className={mode === "weekly" ? "active" : ""}
            onClick={() => {
              setMode("weekly");
              setWeek("");
              setDay("");
            }}
          >
            Weekly
          </button>
        </div>

        <label>
          <span>Week</span>
          <select
            value={selectedWeek}
            onChange={(event) => {
              setWeek(event.target.value);
              setDay("");
            }}
          >
            {weeks.length ? (
              weeks.map((item) => <option key={item}>{item}</option>)
            ) : (
              <option value="">No week available</option>
            )}
          </select>
        </label>

        {mode === "daily" && (
          <label>
            <span>Date</span>
            <select value={selectedDay} onChange={(event) => setDay(event.target.value)}>
              {days.length ? (
                days.map((item) => (
                  <option key={item} value={item}>
                    {formatDate(item)}
                  </option>
                ))
              ) : (
                <option value="">No daily report</option>
              )}
            </select>
          </label>
        )}

        <div className="iadcpro-actions">
          <input
            ref={fileInput}
            type="file"
            hidden
            accept={ACCEPT}
            onChange={(event) => quickImport(event.target.files?.[0])}
          />
          <button
            type="button"
            className="btn primary"
            disabled={importing}
            onClick={() => fileInput.current?.click()}
          >
            {importing ? "Importing…" : "Import Report"}
          </button>
          <button type="button" className="btn ghost" onClick={exportCsv} disabled={!visible.length}>
            Export
          </button>
          {tab === "iadc" && (
            <>
              <button type="button" className="btn ghost iadcpro-save-image" onClick={saveIadcImage} disabled={!visible.length}>
                Save PNG
              </button>
            </>
          )}
        </div>
      </section>

      {importMessage && <div className="iadcpro-message success">{importMessage}</div>}
      {shareMessage && <div className="iadcpro-message success iadcpro-share-message">{shareMessage}</div>}
      {importError && (
        <div className="iadcpro-message error">
          <span>{importError}</span>
          <button type="button" onClick={() => setImportError("")}>×</button>
        </div>
      )}

      <section className="iadcpro-kpis">
        <article>
          <i className="iadcpro-kpi-icon drivers">◎</i>
          <div>
            <span>Total Drivers</span>
            <strong>{scoredRows.length}</strong>
            <small>{mode === "daily" ? formatDate(selectedDay) : selectedWeek || "No period"}</small>
          </div>
        </article>
        <article>
          <i className="iadcpro-kpi-icon average">◉</i>
          <div>
            <span>{tab.toUpperCase()} Average</span>
            <strong>{average == null ? "—" : pct(average, 1)}</strong>
            <small className={averageDelta == null ? "" : averageDelta >= 0 ? "up" : "down"}>
              {averageDelta == null
                ? `Target ≥ ${target}%`
                : `${averageDelta > 0 ? "+" : ""}${averageDelta.toFixed(1)} pp vs previous ${mode === "daily" ? "day" : "week"}`}
            </small>
          </div>
        </article>
        <article className="good">
          <i className="iadcpro-kpi-icon compliant">✓</i>
          <div>
            <span>Compliant</span>
            <strong>{compliant}</strong>
            <small>{scoredRows.length ? ((compliant / scoredRows.length) * 100).toFixed(1) : "0.0"}% of drivers</small>
          </div>
        </article>
        <article className="warn">
          <i className="iadcpro-kpi-icon below">!</i>
          <div>
            <span>Below Target</span>
            <strong>{below}</strong>
            <small>{scoredRows.length ? ((below / scoredRows.length) * 100).toFixed(1) : "0.0"}% of drivers</small>
          </div>
        </article>
        <article className="excellent">
          <i className="iadcpro-kpi-icon excellent">★</i>
          <div>
            <span>Excellent</span>
            <strong>{strong}</strong>
            <small>{scoredRows.length ? ((strong / scoredRows.length) * 100).toFixed(1) : "0.0"}% of drivers</small>
          </div>
        </article>
      </section>

      <section className="iadcpro-filterbar">
        <div className="iadcpro-search">
          <span aria-hidden="true">⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={showTrid ? "Search driver name or TRID…" : "Search driver name…"}
          />
        </div>

        <button
          type="button"
          className={"iadcpro-trid-toggle " + (showTrid ? "active" : "")}
          onClick={() => setShowTrid((current) => !current)}
          aria-pressed={showTrid}
          title={showTrid ? "Hide TRID column" : "Show TRID column"}
        >
          <span aria-hidden="true" />
          {showTrid ? "Show TRID" : "TRID hidden"}
        </button>

        <span className="iadcpro-sort-label">Sort by</span>
        <select value={sortKey} onChange={(event) => setSortKey(event.target.value)}>
          <option value="metric">{tab.toUpperCase()}</option>
          <option value="secondary">{tab === "iadc" ? "DWC" : "IADC"}</option>
          <option value="delta">Vs previous</option>
          <option value="avg4w">Avg 4W</option>
          <option value="name">Driver name</option>
        </select>

        <select value={sortDir} onChange={(event) => setSortDir(event.target.value)}>
          <option value="asc">{sortKey === "name" ? "A to Z" : "Low to high"}</option>
          <option value="desc">{sortKey === "name" ? "Z to A" : "High to low"}</option>
        </select>

        <select
          value={driverFilter}
          onChange={(event) => setDriverFilter(event.target.value)}
          aria-label="Driver status filter"
        >
          <option value="all">All drivers</option>
          <option value="below">Below target</option>
          <option value="compliant">Compliant</option>
          <option value="excellent">Excellent</option>
        </select>

        <span className="iadcpro-source">
          {visible.length} drivers
        </span>
      </section>

      {!rows.length ? (
        <section className="panel iadcpro-empty">
          <div>!</div>
          <h2>No IADC data available in the current scope</h2>
          <p>
            The workspace returned no IADC metric rows for this site. Import a valid Amazon IADC/DWC report
            or verify the site scope.
          </p>
          <button type="button" className="btn primary" onClick={() => fileInput.current?.click()}>
            Import IADC Report
          </button>
        </section>
      ) : !scoredRows.length ? (
        <section className="panel iadcpro-empty">
          <div>—</div>
          <h2>No {tab.toUpperCase()} evidence for this period</h2>
          <p>
            Choose another {mode === "daily" ? "date or week" : "week"}. The report data is present,
            but this metric is not available in the selected period.
          </p>
        </section>
      ) : (
        <section className="iadcpro-main">
          <article className="panel iadcpro-table-card">
            <div className="iadcpro-card-head">
              <div>
                <h2>Driver Performance</h2>
                <p>
                  {mode === "daily" ? formatDate(selectedDay) : selectedWeek}
                  {previousDay ? ` · compared with ${formatDate(previousDay)}` : ""}
                </p>
              </div>
              <strong>{visible.length} drivers</strong>
            </div>

            <div className="iadcpro-table-wrap">
              <table className={showTrid ? "" : "trid-hidden"}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Driver</th>
                    {showTrid && <th>TRID</th>}
                    <th>{tab.toUpperCase()}</th>
                    <th>{tab === "iadc" ? "DWC" : "IADC"}</th>
                    <th>Vs previous</th>
                    <th>Status</th>
                    <th>Last 7 days</th>
                    <th>Avg 4W</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row, index) => {
                    const score = valueOf(row);
                    const secondary = secondaryValueOf(row);
                    const previous = previousByDriver.get(row.driver_id);
                    const delta =
                      previous == null || score == null
                        ? null
                        : Number(score) - Number(previous);
                    const tone = toneFor(score, target);
                    const last7 = last7ByDriver.get(row.driver_id) || [];
                    const avg4w = avg4wByDriver.get(row.driver_id) ?? null;

                    return (
                      <tr key={row.id || row.driver_id}>
                        <td><span className="iadcpro-rank">{index + 1}</span></td>
                        <td><b>{dname(row.drivers)}</b></td>
                        {showTrid && <td><code>{trid(row.drivers)}</code></td>}
                        <td>
                          <span className={"iadcpro-score " + tone}>{pct(score, 1)}</span>
                        </td>
                        <td>{secondary == null ? "—" : pct(secondary, 1)}</td>
                        <td>
                          <span className={"iadcpro-delta " + (delta == null ? "" : delta > 0 ? "up" : delta < 0 ? "down" : "")}>
                            {delta == null ? "—" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)} pp`}
                          </span>
                        </td>
                        <td>
                          <span className={"iadcpro-status " + tone}>
                            {Number(score) >= target ? statusFor(score, target) : "Below target"}
                          </span>
                        </td>
                        <td>
                          <div className="iadcpro-sparkbars" aria-label="Last 7 days">
                            {(last7.length ? last7 : Array(7).fill(null)).map((value, sparkIndex) => (
                              <span
                                key={sparkIndex}
                                className={
                                  value == null
                                    ? "empty"
                                    : Number(value) >= excellentCut
                                      ? "excellent"
                                      : Number(value) >= target
                                        ? "good"
                                        : Number(value) >= target - 10
                                          ? "watch"
                                          : "critical"
                                }
                                style={{
                                  height: value == null
                                    ? "4px"
                                    : `${Math.max(5, Math.min(22, (Number(value) / 100) * 22))}px`,
                                }}
                                title={value == null ? "No data" : pct(value, 1)}
                              />
                            ))}
                          </div>
                        </td>
                        <td>
                          <span className={"iadcpro-avg4w " + tone}>
                            {avg4w == null ? "—" : pct(avg4w, 1)}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            onClick={() =>
                              onOpenDriver?.(
                                openShape(row, {
                                  iadc: n(row.iadc),
                                  dwc: dwcOf(row),
                                  risk:
                                    Number(valueOf(row)) < target - 10
                                      ? "High"
                                      : Number(valueOf(row)) < target
                                        ? "Medium"
                                        : "Low",
                                })
                              )
                            }
                          >
                            Open →
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      )}

      {tab === "iadc" && sharePages.length > 0 && (
        <>
          {sharePages.map((pageRows, pageIndex) => (
            <section
              key={"iadc-share-page-" + pageIndex}
              ref={(node) => {
                shareCardRefs.current[pageIndex] = node;
              }}
              className="iadc-share-card"
              aria-hidden="true"
            >
              <header className="iadc-share-head">
                <div>
                  <span>WORKFLOW COMPLIANCE</span>
                  <h1>IADC Performance</h1>
                  <p>{mode === "daily" ? formatDate(selectedDay) : selectedWeek} · {shareSite}</p>
                </div>
              </header>

              <div className="iadc-share-kpis">
                <article><span>DRIVERS</span><strong>{visible.length}</strong></article>
                <article><span>IADC AVERAGE</span><strong>{average == null ? "—" : pct(average, 1)}</strong></article>
                <article><span>TARGET</span><strong>{IADC_TARGET}%+</strong></article>
                <article><span>BELOW TARGET</span><strong>{visible.filter((row) => Number(n(row?.iadc)) < IADC_TARGET).length}</strong></article>
              </div>

              <div className="iadc-share-table">
                <div className="iadc-share-table-head">
                  <span>#</span><span>DRIVER</span><span>IADC</span>
                </div>
                {pageRows.map((row, index) => {
                  const score = n(row?.iadc);
                  const tone = toneFor(score, IADC_TARGET);
                  const absoluteIndex = pageIndex * IADC_EXPORT_PAGE_SIZE + index;
                  return (
                    <div className="iadc-share-row" key={row.id || row.driver_id || absoluteIndex}>
                      <span className="iadc-share-rank">{absoluteIndex + 1}</span>
                      <b>{dname(row.drivers)}</b>
                      <span className={"iadc-share-score " + tone}>{pct(score, 1)}</span>
                    </div>
                  );
                })}
              </div>

              <footer className="iadc-share-footer">
                <span>Target ≥ {IADC_TARGET}% · Please review your score and improve where needed.</span>
                <b>
                  {mode === "daily" ? formatDate(selectedDay) : selectedWeek}
                  {sharePages.length > 1 ? " · " + (pageIndex + 1) + "/" + sharePages.length : ""}
                </b>
              </footer>
            </section>
          ))}
        </>
      )}

      <style jsx global>{`
        .iadcpro{display:grid;gap:10px;padding-bottom:24px}
        .iadcpro-hero{padding:12px 18px;border-radius:13px;min-height:82px}
        .iadcpro-hero h1{margin:2px 0 3px;font-size:24px}
        .iadcpro-hero p{font-size:10px;line-height:1.4}
        .iadcpro-target{min-width:105px}
        .iadcpro-target span{font-size:8px}
        .iadcpro-target strong{font-size:24px;margin-top:2px}

        .iadcpro-controlbar{padding:9px 11px;gap:8px;border-radius:11px}
        .iadcpro-tabs,.iadcpro-period-tabs{padding:3px}
        .iadcpro-tabs button,.iadcpro-period-tabs button{padding:7px 14px;font-size:10px}
        .iadcpro-controlbar select,.iadcpro-filterbar select{height:34px;font-size:10px}
        .iadcpro-controlbar label>span{font-size:8px}
        .iadcpro-actions{gap:7px}
        .iadcpro-actions .btn{height:34px;padding:0 14px;font-size:9px}
        .iadcpro-share-message{margin-top:-2px}

        .iadc-share-card{
          position:fixed;left:0;top:0;transform:translateX(-120vw);width:1080px;padding:44px;
          background:#eef3f5;color:#13253a;font-family:Arial,Helvetica,sans-serif;box-sizing:border-box;
          z-index:1;opacity:1;visibility:visible;pointer-events:none
        }
        .iadc-share-head{
          display:flex;align-items:flex-start;justify-content:flex-start;gap:30px;padding:34px 38px;
          border:1px solid #d7e2e8;border-radius:22px;background:#fff
        }
        .iadc-share-head span{font-size:16px;font-weight:900;letter-spacing:2.2px;color:#2d8b78}
        .iadc-share-head h1{margin:10px 0 7px;font-size:48px;line-height:1;color:#10243a}
        .iadc-share-head p{margin:0;font-size:20px;color:#687b8e}

        .iadc-share-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:18px 0}
        .iadc-share-kpis article{
          padding:22px 24px;border:1px solid #d9e3e9;border-radius:18px;background:#fff;display:flex;flex-direction:column;gap:8px
        }
        .iadc-share-kpis span{font-size:13px;font-weight:900;letter-spacing:1.1px;color:#6b7c8d}
        .iadc-share-kpis strong{font-size:32px;color:#12263d}

        .iadc-share-table{overflow:hidden;border:1px solid #d9e3e9;border-radius:18px;background:#fff}
        .iadc-share-table-head,.iadc-share-row{display:grid;grid-template-columns:76px minmax(0,1fr) 180px;align-items:center}
        .iadc-share-table-head{min-height:54px;background:#f6f8fa;border-bottom:1px solid #dfe7ec}
        .iadc-share-table-head span{padding:0 20px;font-size:13px;font-weight:900;letter-spacing:1px;color:#718294}
        .iadc-share-row{min-height:58px;border-bottom:1px solid #edf1f4}
        .iadc-share-row:last-child{border-bottom:0}
        .iadc-share-row>*{padding:0 20px;box-sizing:border-box}
        .iadc-share-rank{font-size:16px;font-weight:900;color:#647789}
        .iadc-share-row b{font-size:19px;color:#17283d}
        .iadc-share-score{
          justify-self:center;display:inline-flex;align-items:center;justify-content:center;min-width:118px;padding:9px 15px;
          border-radius:12px;font-size:18px;font-weight:900;background:#eef2f4;color:#3d5367
        }
        .iadc-share-score.critical{background:#ffe7e5;color:#9f332f;border:1px solid #f0aaa6}
        .iadc-share-score.watch{background:#fff3d8;color:#95680d;border:1px solid #ecd07a}
        .iadc-share-score.good{background:#edf7d9;color:#477516;border:1px solid #c8df91}
        .iadc-share-score.excellent{background:#dff4ea;color:#17684c;border:1px solid #a8d8c4}
        .iadc-share-footer{
          display:flex;justify-content:space-between;align-items:center;gap:24px;margin-top:16px;padding:20px 26px;
          border-radius:16px;background:#16304a;color:#fff;font-size:16px
        }
        .iadc-share-footer b{white-space:nowrap}

        .iadcpro-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}
        .iadcpro-kpis article{
          min-height:76px;padding:10px 12px;border:1px solid #dde6ec;border-radius:12px;
          background:#fff;box-shadow:0 4px 14px rgba(26,51,72,.03);
          display:flex;align-items:center;gap:10px
        }
        .iadcpro-kpis article.good,.iadcpro-kpis article.warn,.iadcpro-kpis article.excellent{border-top:1px solid #dde6ec}
        .iadcpro-kpis article>div{min-width:0}
        .iadcpro-kpis span{font-size:8px}
        .iadcpro-kpis strong{font-size:23px;margin:4px 0 2px}
        .iadcpro-kpis small{font-size:8px;white-space:nowrap}
        .iadcpro-kpis small.up{color:#178457;font-weight:850}
        .iadcpro-kpis small.down{color:#c33d48;font-weight:850}
        .iadcpro-kpi-icon{
          flex:0 0 34px;width:34px;height:34px;border-radius:10px;display:grid;place-items:center;
          font-style:normal;font-size:17px;font-weight:900;background:#eff5ff;color:#3b82f6
        }
        .iadcpro-kpi-icon.average{background:#fff0f0;color:#df3c3c}
        .iadcpro-kpi-icon.compliant{background:#e8f8ee;color:#1f9b62}
        .iadcpro-kpi-icon.below{background:#fff5dc;color:#d99a10}
        .iadcpro-kpi-icon.excellent{background:#edf3ff;color:#477dea}

        .iadcpro-filterbar{
          display:grid;grid-template-columns:minmax(300px,1fr) auto auto 126px 136px 142px auto;
          gap:7px;align-items:center;padding:0
        }
        .iadcpro-search{height:34px}
        .iadcpro-search input{font-size:10px}
        .iadcpro-sort-label{font-size:8px;font-weight:900;color:#6c7d8f;white-space:nowrap}
        .iadcpro-source{font-size:9px;font-weight:800;white-space:nowrap;text-align:right}
        .iadcpro-trid-toggle{
          height:34px;padding:0 9px;border:0;border-radius:8px;background:transparent;color:#354b5f;
          font-size:9px;font-weight:850;display:inline-flex;align-items:center;gap:7px;white-space:nowrap;cursor:pointer
        }
        .iadcpro-trid-toggle>span{
          width:28px;height:16px;border-radius:999px;background:#dfe6eb;position:relative;transition:.18s ease
        }
        .iadcpro-trid-toggle>span:after{
          content:"";position:absolute;width:12px;height:12px;left:2px;top:2px;border-radius:50%;
          background:#fff;box-shadow:0 1px 3px rgba(20,42,60,.2);transition:.18s ease
        }
        .iadcpro-trid-toggle.active>span{background:#28b978}
        .iadcpro-trid-toggle.active>span:after{transform:translateX(12px)}

        .iadcpro-main{display:block}
        .iadcpro-table-card{width:100%;border-radius:12px}
        .iadcpro-card-head{padding:10px 13px 8px}
        .iadcpro-card-head h2{font-size:14px}
        .iadcpro-card-head p{font-size:8px}
        .iadcpro-card-head>strong{font-size:8px;padding:5px 8px}
        .iadcpro-table-wrap{max-height:650px;overflow:auto}
        .iadcpro-table-wrap table{min-width:1160px}
        .iadcpro-table-wrap table.trid-hidden{min-width:1020px}
        .iadcpro-table-wrap th{
          padding:8px 8px;font-size:7px;text-align:center;border-right:1px solid #e5ebef;
          background:#f7f9fb
        }
        .iadcpro-table-wrap th:nth-child(2){text-align:left}
        .iadcpro-table-wrap td{
          padding:7px 8px;font-size:10px;text-align:center;border-right:1px solid #edf1f4
        }
        .iadcpro-table-wrap td:nth-child(2){text-align:left}
        .iadcpro-table-wrap th:last-child,.iadcpro-table-wrap td:last-child{border-right:0}
        .iadcpro-table-wrap td b{font-size:10px}
        .iadcpro-table-wrap code{font-size:7px;padding:3px 5px}
        .iadcpro-rank{width:22px;height:22px;font-size:8px;border-radius:6px}
        .iadcpro-score{min-width:60px;padding:5px 7px;font-size:9px;border-radius:7px}
        .iadcpro-status{padding:4px 8px;font-size:8px}
        .iadcpro-delta{font-size:9px}
        .iadcpro-table-wrap td:last-child button{
          min-width:64px;height:25px;padding:0 8px;border-color:#d4e5df;color:#257663;font-size:8px
        }
        .iadcpro-table-wrap tbody tr{cursor:default}
        .iadcpro-table-wrap tbody tr:hover td{background:#fbfdfd}

        .iadcpro-sparkbars{
          height:24px;display:flex;align-items:flex-end;justify-content:center;gap:2px;min-width:76px
        }
        .iadcpro-sparkbars>span{
          width:5px;border-radius:2px 2px 1px 1px;background:#dfe6eb;display:block
        }
        .iadcpro-sparkbars>span.empty{background:#dfe6eb}
        .iadcpro-sparkbars>span.critical{background:#ef4444}
        .iadcpro-sparkbars>span.watch{background:#e9a918}
        .iadcpro-sparkbars>span.good{background:#43a879}
        .iadcpro-sparkbars>span.excellent{background:#2f8f75}

        .iadcpro-avg4w{
          display:inline-flex;align-items:center;justify-content:center;min-width:56px;padding:5px 7px;
          border-radius:7px;font-size:9px;font-weight:900;background:#f0f4f6;color:#43586b
        }
        .iadcpro-avg4w.critical{background:#ffe8e8;color:#b33a3a}
        .iadcpro-avg4w.watch{background:#fff2d7;color:#9b6a12}
        .iadcpro-avg4w.good{background:#eaf7ef;color:#23724f}
        .iadcpro-avg4w.excellent{background:#e6f4ef;color:#1f6c53}

        @media(max-width:1180px){
          .iadcpro-kpis{grid-template-columns:repeat(3,1fr)}
          .iadcpro-filterbar{grid-template-columns:1fr auto auto 130px 135px}
          .iadcpro-search{grid-column:1/-1}
          .iadcpro-source{grid-column:1/-1;text-align:left}
        }
        @media(max-width:720px){
          .iadcpro-hero{padding:12px 13px}
          .iadcpro-kpis{display:flex;overflow-x:auto}
          .iadcpro-kpis article{min-width:180px}
          .iadcpro-filterbar{grid-template-columns:1fr 1fr}
          .iadcpro-search{grid-column:1/-1}
          .iadcpro-sort-label{display:none}
          .iadcpro-trid-toggle{justify-content:flex-start}
          .iadcpro-source{grid-column:1/-1}
        }
      `}</style>
    </div>
  );
}
