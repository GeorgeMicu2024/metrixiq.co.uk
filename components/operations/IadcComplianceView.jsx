"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  const [sortDir, setSortDir] = useState("desc");
  const [showTrid, setShowTrid] = useState(true);
  const [trendRange, setTrendRange] = useState(8);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [importError, setImportError] = useState("");
  const fileInput = useRef(null);

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

  const previousByDriver = useMemo(() => {
    if (!previousDay) return new Map();
    const rowsForPrevious = dailyRows.filter(
      (row) =>
        calendarWeek(row) === selectedWeek &&
        rowDate(row) === previousDay &&
        valueOf(row) != null
    );
    return new Map(
      dedupeDriverRows(rowsForPrevious).map((row) => [row.driver_id, valueOf(row)])
    );
  }, [dailyRows, previousDay, selectedWeek, tab]);

  const scoredRows = selectedRows.filter((row) => valueOf(row) != null);
  const average = metricAverage(scoredRows, valueOf);
  const compliant = scoredRows.filter((row) => Number(valueOf(row)) >= target).length;
  const below = scoredRows.length - compliant;
  const strong = scoredRows.filter(
    (row) => Number(valueOf(row)) >= Math.max(target + 10, 90)
  ).length;

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = scoredRows.filter((row) => {
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
  }, [scoredRows, query, sortKey, sortDir, tab, previousByDriver]);

  const excellentCut = Math.max(target + 10, 90);
  const compliantOnly = Math.max(0, compliant - strong);
  const totalForDistribution = Math.max(1, scoredRows.length);
  const distribution = {
    below,
    compliant: compliantOnly,
    excellent: strong,
    belowPct: (below / totalForDistribution) * 100,
    compliantPct: (compliantOnly / totalForDistribution) * 100,
    excellentPct: (strong / totalForDistribution) * 100,
  };

  const trendWeeks = useMemo(
    () =>
      [...new Set(
        rowsWithMetric
          .map(calendarWeek)
          .filter((value) => /^W\\d+$/i.test(value))
      )]
        .sort((a, b) => weekNo(a) - weekNo(b))
        .slice(-trendRange),
    [rowsWithMetric, trendRange]
  );

  const trendSeries = useMemo(
    () =>
      trendWeeks.map((trendWeek) => {
        const weekMetricRows = rowsWithMetric.filter(
          (row) => calendarWeek(row) === trendWeek
        );
        return {
          week: trendWeek,
          value: metricAverage(weekMetricRows, valueOf),
        };
      }),
    [trendWeeks, rowsWithMetric, tab]
  );

  const trendChart = useMemo(() => {
    const width = 1000;
    const height = 180;
    const left = 42;
    const right = 24;
    const top = 18;
    const bottom = 34;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const denominator = Math.max(1, trendSeries.length - 1);

    const points = trendSeries.map((item, index) => {
      const value = item.value == null ? 0 : Math.max(0, Math.min(100, Number(item.value)));
      return {
        ...item,
        x: left + (index / denominator) * plotWidth,
        y: top + ((100 - value) / 100) * plotHeight,
      };
    });

    return {
      width,
      height,
      left,
      right,
      top,
      bottom,
      plotHeight,
      targetY: top + ((100 - target) / 100) * plotHeight,
      points,
      line: points.map((point) => `${point.x},${point.y}`).join(" "),
      area: points.length
        ? `${points.map((point) => `${point.x},${point.y}`).join(" ")} ${points[points.length - 1].x},${top + plotHeight} ${points[0].x},${top + plotHeight}`
        : "",
    };
  }, [trendSeries, target]);

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

  if (load.loading) return <Loading text="Loading IADC & DWC workspace…" />;
  if (load.error) return <ErrorBox error={load.error} />;

  return (
    <div className="iadcpro">
      <header className="iadcpro-hero">
        <div>
          <span className="page-kicker">WORKFLOW COMPLIANCE</span>
          <h1>IADC & DWC Performance</h1>
          <p>
            Driver-level IADC and DWC compliance with daily reports kept separate
            from weekly scorecard evidence.
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
          <button
            type="button"
            className={"iadcpro-trid-toggle " + (showTrid ? "active" : "")}
            onClick={() => setShowTrid((current) => !current)}
            aria-pressed={showTrid}
            title={showTrid ? "Hide TRID column" : "Show TRID column"}
          >
            <span aria-hidden="true" />
            {showTrid ? "Hide TRID" : "Show TRID"}
          </button>
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
        </div>
      </section>

      {importMessage && <div className="iadcpro-message success">{importMessage}</div>}
      {importError && (
        <div className="iadcpro-message error">
          <span>{importError}</span>
          <button type="button" onClick={() => setImportError("")}>×</button>
        </div>
      )}

      <section className="iadcpro-kpis">
        <article>
          <span>Drivers</span>
          <strong>{scoredRows.length}</strong>
          <small>{mode === "daily" ? formatDate(selectedDay) : selectedWeek || "No period"}</small>
        </article>
        <article>
          <span>{tab.toUpperCase()} Average</span>
          <strong>{average == null ? "—" : pct(average, 1)}</strong>
          <small>Target ≥ {target}%</small>
        </article>
        <article className="good">
          <span>Compliant</span>
          <strong>{compliant}</strong>
          <small>{scoredRows.length ? Math.round((compliant / scoredRows.length) * 100) : 0}% of drivers</small>
        </article>
        <article className="warn">
          <span>Below Target</span>
          <strong>{below}</strong>
          <small>{below ? "Coaching priority" : "No action required"}</small>
        </article>
        <article className="excellent">
          <span>Excellent</span>
          <strong>{strong}</strong>
          <small>≥ {Math.max(target + 10, 90)}%</small>
        </article>
      </section>

      {!!scoredRows.length && (
        <section className="iadcpro-analytics">
          <article className="panel iadcpro-trend-card">
            <div className="iadcpro-analytics-head">
              <div>
                <h2>{tab.toUpperCase()} Trend</h2>
                <p>
                  {mode === "daily" ? "Daily-report" : "Weekly-report"} {tab.toUpperCase()} average across previous weeks.
                </p>
              </div>
              <select
                value={trendRange}
                onChange={(event) => setTrendRange(Number(event.target.value))}
                aria-label="Trend range"
              >
                <option value={8}>Last 8 weeks</option>
                <option value={4}>Last 4 weeks</option>
              </select>
            </div>

            <div className="iadcpro-line-chart">
              {trendSeries.length ? (
                <svg
                  viewBox={`0 0 ${trendChart.width} ${trendChart.height}`}
                  role="img"
                  aria-label={`${tab.toUpperCase()} performance trend`}
                  preserveAspectRatio="none"
                >
                  <defs>
                    <linearGradient id="iadcTrendFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2d8f79" stopOpacity="0.18" />
                      <stop offset="100%" stopColor="#2d8f79" stopOpacity="0.02" />
                    </linearGradient>
                  </defs>

                  {[0, 20, 40, 60, 80, 100].map((value) => {
                    const y =
                      trendChart.top +
                      ((100 - value) / 100) * trendChart.plotHeight;
                    return (
                      <g key={value}>
                        <line
                          x1={trendChart.left}
                          y1={y}
                          x2={trendChart.width - trendChart.right}
                          y2={y}
                          className="iadcpro-gridline"
                        />
                        <text
                          x={trendChart.left - 10}
                          y={y + 4}
                          textAnchor="end"
                          className="iadcpro-axis-label"
                        >
                          {value}%
                        </text>
                      </g>
                    );
                  })}

                  <line
                    x1={trendChart.left}
                    y1={trendChart.targetY}
                    x2={trendChart.width - trendChart.right}
                    y2={trendChart.targetY}
                    className="iadcpro-target-line"
                  />

                  {trendChart.area && (
                    <polygon points={trendChart.area} fill="url(#iadcTrendFill)" />
                  )}
                  {trendChart.line && (
                    <polyline points={trendChart.line} className="iadcpro-trend-line" />
                  )}

                  {trendChart.points.map((point, index) => {
                    const isLatest = index === trendChart.points.length - 1;
                    return (
                      <g key={point.week}>
                        <circle
                          cx={point.x}
                          cy={point.y}
                          r={isLatest ? 6 : 5}
                          className={isLatest ? "iadcpro-trend-point latest" : "iadcpro-trend-point"}
                        >
                          <title>
                            {point.week}: {point.value == null ? "No data" : pct(point.value, 1)}
                          </title>
                        </circle>
                        <text
                          x={point.x}
                          y={Math.max(14, point.y - 13)}
                          textAnchor="middle"
                          className="iadcpro-point-value"
                        >
                          {point.value == null ? "—" : Number(point.value).toFixed(1)}
                        </text>
                        <text
                          x={point.x}
                          y={trendChart.height - 9}
                          textAnchor="middle"
                          className="iadcpro-week-label"
                        >
                          {point.week}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              ) : (
                <div className="iadcpro-chart-empty">No previous-week trend is available yet.</div>
              )}
            </div>
          </article>

          <article className="panel iadcpro-distribution-card">
            <div className="iadcpro-analytics-head">
              <div>
                <h2>Driver Performance Distribution</h2>
                <p>Breakdown for the selected period.</p>
              </div>
            </div>

            <div className="iadcpro-donut-layout">
              <div
                className="iadcpro-donut"
                style={{
                  background: `conic-gradient(
                    #e9ad22 0 ${distribution.belowPct}%,
                    #2f977d ${distribution.belowPct}% ${distribution.belowPct + distribution.compliantPct}%,
                    #3b82f6 ${distribution.belowPct + distribution.compliantPct}% 100%
                  )`,
                }}
                aria-label="Driver performance distribution"
              >
                <div>
                  <strong>{scoredRows.length}</strong>
                  <span>Drivers</span>
                </div>
              </div>

              <div className="iadcpro-distribution-legend">
                <div>
                  <i className="below" />
                  <span>Below target (&lt; {target}%)</span>
                  <b>{distribution.below}</b>
                  <small>{distribution.belowPct.toFixed(1)}%</small>
                </div>
                <div>
                  <i className="compliant" />
                  <span>Compliant ({target}–{excellentCut - 0.1}%)</span>
                  <b>{distribution.compliant}</b>
                  <small>{distribution.compliantPct.toFixed(1)}%</small>
                </div>
                <div>
                  <i className="excellent" />
                  <span>Excellent (≥ {excellentCut}%)</span>
                  <b>{distribution.excellent}</b>
                  <small>{distribution.excellentPct.toFixed(1)}%</small>
                </div>
              </div>
            </div>
          </article>
        </section>
      )}

      <section className="iadcpro-filterbar">
        <div className="iadcpro-search">
          <span aria-hidden="true">⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={showTrid ? "Search driver name or TRID…" : "Search driver name…"}
          />
        </div>

        <span className="iadcpro-sort-label">Sort by</span>
        <select value={sortKey} onChange={(event) => setSortKey(event.target.value)}>
          <option value="metric">{tab.toUpperCase()}</option>
          <option value="secondary">{tab === "iadc" ? "DWC" : "IADC"}</option>
          <option value="delta">Vs previous</option>
          <option value="name">Driver name</option>
        </select>

        <select value={sortDir} onChange={(event) => setSortDir(event.target.value)}>
          <option value="desc">{sortKey === "name" ? "Z to A" : "High to low"}</option>
          <option value="asc">{sortKey === "name" ? "A to Z" : "Low to high"}</option>
        </select>

        <span className="iadcpro-source">
          {rows.length
            ? `${rows.length} source rows loaded`
            : "No IADC source rows loaded"}
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
                    <th>Actions</th>
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
                          <span className={"iadcpro-status " + tone}>{statusFor(score, target)}</span>
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

      <style jsx global>{`
        .iadcpro{gap:12px}
        .iadcpro-hero{padding:14px 20px;border-radius:14px;min-height:92px}
        .iadcpro-hero h1{margin:3px 0 4px;font-size:25px}
        .iadcpro-hero p{font-size:11px;line-height:1.45}
        .iadcpro-target{min-width:112px}
        .iadcpro-target span{font-size:9px}
        .iadcpro-target strong{font-size:25px;margin-top:3px}

        .iadcpro-controlbar{padding:10px 12px;gap:8px;border-radius:12px}
        .iadcpro-tabs,.iadcpro-period-tabs{padding:3px}
        .iadcpro-tabs button,.iadcpro-period-tabs button{padding:7px 14px;font-size:11px}
        .iadcpro-controlbar select,.iadcpro-filterbar select{height:36px;font-size:11px}
        .iadcpro-actions{gap:7px}
        .iadcpro-actions .btn{height:36px;padding:0 14px;font-size:10px}

        .iadcpro-trid-toggle{
          height:36px;padding:0 11px;border:1px solid #d4dee6;border-radius:9px;
          background:#fff;color:#41566b;font-size:10px;font-weight:850;
          display:inline-flex;align-items:center;gap:8px;white-space:nowrap;cursor:pointer
        }
        .iadcpro-trid-toggle>span{
          width:28px;height:16px;border-radius:999px;background:#dfe6eb;position:relative;transition:.18s ease
        }
        .iadcpro-trid-toggle>span:after{
          content:"";position:absolute;width:12px;height:12px;left:2px;top:2px;border-radius:50%;
          background:#fff;box-shadow:0 1px 3px rgba(20,42,60,.2);transition:.18s ease
        }
        .iadcpro-trid-toggle.active>span{background:#2d8f79}
        .iadcpro-trid-toggle.active>span:after{transform:translateX(12px)}

        .iadcpro-kpis{gap:9px}
        .iadcpro-kpis article{min-height:76px;padding:11px 14px;border-radius:12px}
        .iadcpro-kpis span{font-size:8px}
        .iadcpro-kpis strong{font-size:23px;margin:5px 0 2px}
        .iadcpro-kpis small{font-size:9px}

        .iadcpro-analytics{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(360px,.95fr);gap:10px}
        .iadcpro-trend-card,.iadcpro-distribution-card{
          min-width:0;border:1px solid #dce5ec;border-radius:13px;background:#fff;overflow:hidden
        }
        .iadcpro-analytics-head{
          min-height:52px;padding:11px 14px 7px;display:flex;align-items:flex-start;
          justify-content:space-between;gap:12px
        }
        .iadcpro-analytics-head h2{margin:0;font-size:14px;color:#132b40}
        .iadcpro-analytics-head p{margin:3px 0 0;font-size:9px;color:#7b8997}
        .iadcpro-analytics-head select{
          height:30px;border:1px solid #d3dde5;border-radius:8px;background:#fff;
          padding:0 9px;color:#42586c;font-size:9px;font-weight:800
        }

        .iadcpro-line-chart{height:190px;padding:0 9px 5px}
        .iadcpro-line-chart svg{display:block;width:100%;height:100%;overflow:visible}
        .iadcpro-gridline{stroke:#e8eef2;stroke-width:1}
        .iadcpro-axis-label,.iadcpro-week-label{fill:#7a8997;font-size:9px;font-weight:700}
        .iadcpro-target-line{stroke:#1ea37d;stroke-width:1.5;stroke-dasharray:5 5}
        .iadcpro-trend-line{
          fill:none;stroke:#2d8f79;stroke-width:3;stroke-linecap:round;stroke-linejoin:round
        }
        .iadcpro-trend-point{fill:#fff;stroke:#2d8f79;stroke-width:3}
        .iadcpro-trend-point.latest{fill:#2d8f79}
        .iadcpro-point-value{fill:#173047;font-size:9px;font-weight:900}
        .iadcpro-chart-empty{height:100%;display:grid;place-items:center;color:#7b8997;font-size:11px}

        .iadcpro-donut-layout{
          display:grid;grid-template-columns:150px minmax(0,1fr);gap:18px;align-items:center;
          padding:4px 18px 18px
        }
        .iadcpro-donut{
          width:132px;height:132px;border-radius:50%;display:grid;place-items:center;
          box-shadow:inset 0 0 0 1px rgba(17,45,70,.05)
        }
        .iadcpro-donut>div{
          width:78px;height:78px;border-radius:50%;background:#fff;display:grid;place-items:center;
          align-content:center;box-shadow:0 0 0 1px #e8edf1
        }
        .iadcpro-donut strong{font-size:23px;line-height:1;color:#173047}
        .iadcpro-donut span{font-size:9px;color:#7b8997;margin-top:3px}
        .iadcpro-distribution-legend{display:grid;gap:11px}
        .iadcpro-distribution-legend>div{
          display:grid;grid-template-columns:10px minmax(0,1fr) 28px 44px;gap:8px;align-items:center
        }
        .iadcpro-distribution-legend i{width:9px;height:9px;border-radius:50%}
        .iadcpro-distribution-legend i.below{background:#e9ad22}
        .iadcpro-distribution-legend i.compliant{background:#2f977d}
        .iadcpro-distribution-legend i.excellent{background:#3b82f6}
        .iadcpro-distribution-legend span{font-size:9px;color:#334b60}
        .iadcpro-distribution-legend b{font-size:10px;color:#173047;text-align:right}
        .iadcpro-distribution-legend small{font-size:9px;color:#7b8997;text-align:right}

        .iadcpro-filterbar{
          grid-template-columns:minmax(260px,1fr) auto minmax(120px,155px) minmax(120px,155px) auto;
          gap:8px;padding:0
        }
        .iadcpro-search{height:36px}
        .iadcpro-sort-label{font-size:9px;font-weight:850;color:#687a8c;white-space:nowrap}
        .iadcpro-source{font-size:10px}

        .iadcpro-main{display:block}
        .iadcpro-table-card{width:100%}
        .iadcpro-card-head{padding:11px 14px 9px}
        .iadcpro-card-head h2{font-size:15px}
        .iadcpro-card-head p{font-size:9px}
        .iadcpro-table-wrap{max-height:620px}
        .iadcpro-table-wrap table{min-width:900px}
        .iadcpro-table-wrap table.trid-hidden{min-width:760px}
        .iadcpro-table-wrap th{padding:9px 10px;font-size:8px;text-align:center;border-right:1px solid #e6edf2}
        .iadcpro-table-wrap th:nth-child(2){text-align:left}
        .iadcpro-table-wrap td{
          padding:8px 10px;font-size:11px;text-align:center;border-right:1px solid #edf1f4
        }
        .iadcpro-table-wrap td:nth-child(2){text-align:left}
        .iadcpro-table-wrap th:last-child,.iadcpro-table-wrap td:last-child{border-right:0}
        .iadcpro-table-wrap td b{font-size:11px}
        .iadcpro-table-wrap code{font-size:8px}
        .iadcpro-score{min-width:62px;padding:6px 8px}
        .iadcpro-table-wrap tbody tr{cursor:default}
        .iadcpro-table-wrap tbody tr:hover td{background:#f8fbfc}

        @media(max-width:1180px){
          .iadcpro-analytics{grid-template-columns:1fr}
          .iadcpro-distribution-card{max-width:none}
          .iadcpro-filterbar{grid-template-columns:1fr auto 150px 150px}
          .iadcpro-source{grid-column:1/-1;text-align:left}
        }
        @media(max-width:720px){
          .iadcpro-hero{padding:13px 14px}
          .iadcpro-kpis{display:flex;overflow-x:auto}
          .iadcpro-kpis article{min-width:170px}
          .iadcpro-donut-layout{grid-template-columns:1fr;justify-items:center}
          .iadcpro-distribution-legend{width:100%}
          .iadcpro-filterbar{grid-template-columns:1fr 1fr}
          .iadcpro-search{grid-column:1/-1}
          .iadcpro-sort-label{display:none}
          .iadcpro-source{grid-column:1/-1}
          .iadcpro-line-chart{height:170px}
        }
      `}</style>
    </div>
  );
}
