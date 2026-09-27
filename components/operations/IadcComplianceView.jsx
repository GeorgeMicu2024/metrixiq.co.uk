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
  const [sortDir, setSortDir] = useState("asc");
  const [selectedDriverId, setSelectedDriverId] = useState("");
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

    return [...filtered].sort((a, b) => {
      const delta = Number(valueOf(a)) - Number(valueOf(b));
      return sortDir === "asc" ? delta : -delta;
    });
  }, [scoredRows, query, sortDir, tab]);

  useEffect(() => {
    if (!visible.length) {
      setSelectedDriverId("");
      return;
    }
    if (!visible.some((row) => row.driver_id === selectedDriverId)) {
      setSelectedDriverId(visible[0].driver_id);
    }
  }, [visible, selectedDriverId]);

  const active =
    visible.find((row) => row.driver_id === selectedDriverId) ||
    visible[0] ||
    null;

  const activeTrend = useMemo(() => {
    if (!active?.driver_id) return [];
    return dailyRows
      .filter(
        (row) =>
          row.driver_id === active.driver_id &&
          valueOf(row) != null &&
          calendarWeek(row) === selectedWeek
      )
      .sort((a, b) => rowDate(a).localeCompare(rowDate(b)))
      .map((row) => ({ date: rowDate(row), value: valueOf(row) }))
      .slice(-5);
  }, [active?.driver_id, dailyRows, selectedWeek, tab]);

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
      setSelectedDriverId("");
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
              setSelectedDriverId("");
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
              setSelectedDriverId("");
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

      <section className="iadcpro-filterbar">
        <div className="iadcpro-search">
          <span aria-hidden="true">⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search driver name or TRID…"
          />
        </div>
        <select value={sortDir} onChange={(event) => setSortDir(event.target.value)}>
          <option value="asc">{tab.toUpperCase()} · Lowest first</option>
          <option value="desc">{tab.toUpperCase()} · Highest first</option>
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
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Driver</th>
                    <th>TRID</th>
                    <th>{tab.toUpperCase()}</th>
                    <th>{tab === "iadc" ? "DWC" : "IADC"}</th>
                    <th>Vs previous</th>
                    <th>Status</th>
                    <th />
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
                      <tr
                        key={row.id || row.driver_id}
                        className={active?.driver_id === row.driver_id ? "active" : ""}
                        onClick={() => setSelectedDriverId(row.driver_id)}
                      >
                        <td><span className="iadcpro-rank">{index + 1}</span></td>
                        <td>
                          <b>{dname(row.drivers)}</b>
                        </td>
                        <td><code>{trid(row.drivers)}</code></td>
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
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedDriverId(row.driver_id);
                            }}
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </article>

          <aside className="panel iadcpro-detail">
            {active ? (
              <>
                <div className="iadcpro-driver-head">
                  <div className="iadcpro-avatar">
                    {dname(active.drivers)
                      .split(" ")
                      .map((part) => part[0])
                      .filter(Boolean)
                      .slice(0, 2)
                      .join("")
                      .toUpperCase()}
                  </div>
                  <div>
                    <span>DRIVER DETAIL</span>
                    <h2>{dname(active.drivers)}</h2>
                    <small>{trid(active.drivers)}</small>
                  </div>
                </div>

                <div className="iadcpro-detail-score">
                  <span>{tab.toUpperCase()} selected period</span>
                  <strong className={toneFor(valueOf(active), target)}>
                    {pct(valueOf(active), 1)}
                  </strong>
                  <small>
                    {Number(valueOf(active)) >= target
                      ? `${(Number(valueOf(active)) - target).toFixed(1)} pp above target`
                      : `${(target - Number(valueOf(active))).toFixed(1)} pp below target`}
                  </small>
                </div>

                <div className="iadcpro-detail-grid">
                  <div>
                    <span>{tab === "iadc" ? "DWC" : "IADC"}</span>
                    <b>{secondaryValueOf(active) == null ? "—" : pct(secondaryValueOf(active), 1)}</b>
                  </div>
                  <div>
                    <span>Status</span>
                    <b>{statusFor(valueOf(active), target)}</b>
                  </div>
                </div>

                <div className="iadcpro-trend">
                  <h3>Daily trend</h3>
                  {activeTrend.length ? (
                    activeTrend.map((item) => (
                      <div key={item.date}>
                        <span>{formatDate(item.date)}</span>
                        <div><i style={{ width: `${Math.max(4, Math.min(100, item.value))}%` }} /></div>
                        <b>{pct(item.value, 1)}</b>
                      </div>
                    ))
                  ) : (
                    <p>No daily history for this driver in {selectedWeek || "the selected week"}.</p>
                  )}
                </div>

                <button
                  type="button"
                  className="btn primary full"
                  onClick={() =>
                    onOpenDriver?.(
                      openShape(active, {
                        iadc: n(active.iadc),
                        dwc: dwcOf(active),
                        risk: Number(valueOf(active)) < target - 10
                          ? "High"
                          : Number(valueOf(active)) < target
                            ? "Medium"
                            : "Low",
                      })
                    )
                  }
                >
                  Open Driver 360 →
                </button>
              </>
            ) : (
              <div className="iadcpro-no-driver">Select a driver to view details.</div>
            )}
          </aside>
        </section>
      )}
    </div>
  );
}
