"use client";

import { useMemo, useRef, useState } from "react";
import { analyseFiles } from "../../lib/analyzer";
import { IMPORT_ACCEPT } from "../../lib/imports/preflight";
import {
  ErrorBox,
  Loading,
  dname,
  filterRowsBySite,
  n,
  openShape,
  pct,
  trid,
  useOperationalRows,
  weekNo,
} from "./OperationalShared";

const weekOf = (row) => {
  const raw = String(row?.raw_data?.calendar_week || row?.week_label || "");
  const match = raw.match(/W\d+/i);
  return match ? match[0].toUpperCase() : raw;
};

const podOf = (row) => row?.raw_data?.pod_detail || {};

const reasons = [
  ["noPackageDetected", "No Package Detected", "▣"],
  ["blurryPhoto", "Blurry Photo", "◉"],
  ["photoTooDark", "Photo Too Dark", "◐"],
  ["packageInCar", "Package In Car", "▰"],
  ["packageTooClose", "Package Too Close", "⌕"],
];

const sum = (rows, getter) =>
  rows.reduce((total, row) => total + (Number(getter(row)) || 0), 0);

const band = (value) =>
  value >= 99.8 ? "excellent" : value >= 99.6 ? "target" : value >= 99 ? "risk" : "critical";

const label = (value) =>
  value >= 99.8 ? "Excellent" : value >= 99.6 ? "On target" : value >= 99 ? "At risk" : "Critical";

const csv = (value) => '"' + String(value ?? "").replaceAll('"', '""') + '"';

const inferSiteFromFile = (name) =>
  String(name || "").toUpperCase().match(/\bD[A-Z]{1,4}\d{1,3}\b/)?.[0] || "";

export default function PodQualityView({
  organizationId,
  onOpenDriver,
  onImported,
  siteFilter = "all",
  refreshKey = 0,
}) {
  const load = useOperationalRows(organizationId, "pod", refreshKey);
  const rows = filterRowsBySite(load.rows, siteFilter);
  const input = useRef(null);

  const [week, setWeek] = useState("");
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState("all");
  const [reason, setReason] = useState("all");
  const [sort, setSort] = useState({ key: "rejects", dir: "desc" });
  const [detail, setDetail] = useState(null);
  const [showTransporter, setShowTransporter] = useState(true);
  const [showTrend, setShowTrend] = useState(true);
  const [showReasons, setShowReasons] = useState(true);
  const [trendWindow, setTrendWindow] = useState(8);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState("");

  const weeks = useMemo(
    () =>
      [...new Set(rows.map(weekOf).filter((value) => /^W\d+$/i.test(value)))]
        .sort((a, b) => weekNo(b) - weekNo(a)),
    [rows]
  );

  const selectedWeek = week && weeks.includes(week) ? week : weeks[0] || "";
  const base = rows.filter((row) => weekOf(row) === selectedWeek);

  const totals = {
    opp: sum(base, (row) => podOf(row).opportunities),
    success: sum(base, (row) => podOf(row).success),
    bypass: sum(base, (row) => podOf(row).bypass),
    rejects: sum(base, (row) => podOf(row).rejects),
  };
  totals.pod = totals.opp ? (totals.success / totals.opp) * 100 : null;

  const reasonTotals = Object.fromEntries(
    reasons.map(([key]) => [key, sum(base, (row) => podOf(row).reasons?.[key])])
  );

  const trendWeeks = useMemo(
    () =>
      [...new Set(rows.map(weekOf).filter((value) => /^W\d+$/i.test(value)))]
        .sort((a, b) => weekNo(a) - weekNo(b))
        .slice(-trendWindow),
    [rows, trendWindow]
  );

  const trendSeries = useMemo(
    () =>
      trendWeeks.map((weekLabel) => {
        const weekRows = rows.filter((row) => weekOf(row) === weekLabel);
        const opportunities = sum(weekRows, (row) => podOf(row).opportunities);
        const success = sum(weekRows, (row) => podOf(row).success);
        const rejects = sum(weekRows, (row) => podOf(row).rejects);
        return {
          week: weekLabel,
          opportunities,
          success,
          rejects,
          pod: opportunities ? (success / opportunities) * 100 : null,
        };
      }),
    [rows, trendWeeks]
  );

  const trendChart = useMemo(() => {
    const width = 340;
    const height = 160;
    const left = 28;
    const right = 12;
    const top = 22;
    const bottom = 28;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const count = Math.max(1, trendSeries.length);
    const slot = plotWidth / count;
    const maxSuccess = Math.max(1, ...trendSeries.map((item) => item.success || 0));

    const points = trendSeries.map((item, index) => {
      const x = left + slot * index + slot / 2;
      const podValue = item.pod == null ? 95 : Math.max(95, Math.min(100, item.pod));
      const y = top + ((100 - podValue) / 5) * plotHeight;
      const successHeight = Math.max(3, ((item.success || 0) / maxSuccess) * (plotHeight - 8));
      const rejectHeight = item.rejects > 0 ? Math.max(3, Math.min(10, (item.rejects / Math.max(1, item.opportunities)) * 600)) : 0;
      return { ...item, x, y, successHeight, rejectHeight, slot };
    });

    return {
      width,
      height,
      left,
      right,
      top,
      bottom,
      plotHeight,
      baseline: top + plotHeight,
      points,
      line: points.map((point) => `${point.x},${point.y}`).join(" "),
    };
  }, [trendSeries]);

  const reasonPalette = ["#f25b5b", "#f4ae2b", "#3478ef", "#8b4cf6", "#35ad8b"];
  const rejectTotalForChart = Math.max(1, totals.rejects);
  let rejectCursor = 0;
  const rejectSegments = reasons.map(([key, text, icon], index) => {
    const value = reasonTotals[key] || 0;
    const percent = (value / rejectTotalForChart) * 100;
    const start = rejectCursor;
    rejectCursor += percent;
    return {
      key,
      text,
      icon,
      value,
      percent,
      start,
      end: rejectCursor,
      color: reasonPalette[index],
    };
  });
  const rejectGradient = rejectSegments
    .map((segment) => `${segment.color} ${segment.start}% ${segment.end}%`)
    .join(", ");

  const mainReason = (row) => {
    const detailData = podOf(row);
    const reasonMap = detailData.reasons || {};
    const main = reasons
      .map(([key, text]) => [text, Number(reasonMap[key]) || 0])
      .sort((a, b) => b[1] - a[1])[0];

    if (main?.[1]) return main[0];
    if (Number(detailData.rejects) > 0) return "Reason unavailable";
    if (Number(detailData.bypass) > 0) return "Bypass";
    return "—";
  };

  const valueFor = (row, key) => {
    const detailData = podOf(row);
    if (key === "name") return dname(row.drivers).toLowerCase();
    if (key === "trid") return trid(row.drivers);
    if (key === "pod") return Number(row.pod) || 0;
    return Number(detailData[key]) || 0;
  };

  const filtered = base
    .filter((row) => {
      const detailData = podOf(row);
      const podValue = Number(row.pod) || 0;
      const searchText = (dname(row.drivers) + " " + trid(row.drivers)).toLowerCase();

      return (
        searchText.includes(query.toLowerCase()) &&
        (
          focus === "all" ||
          (focus === "rejects" && detailData.rejects > 0) ||
          (focus === "bypass" && detailData.bypass > 0) ||
          (focus === "below" && podValue < 99) ||
          (focus === "excellent" && podValue >= 99.8)
        ) &&
        (reason === "all" || (detailData.reasons?.[reason] || 0) > 0)
      );
    })
    .sort((a, b) => {
      const aValue = valueFor(a, sort.key);
      const bValue = valueFor(b, sort.key);
      const comparison =
        typeof aValue === "string" ? aValue.localeCompare(bValue) : aValue - bValue;
      return sort.dir === "asc" ? comparison : -comparison;
    });

  const active = detail && base.includes(detail) ? detail : filtered[0] || null;
  const activeDetail = podOf(active);
  const activeReasons = activeDetail.reasons || {};

  const toggleSort = (key) =>
    setSort((current) => ({
      key,
      dir: current.key === key && current.dir === "desc" ? "asc" : "desc",
    }));

  const sortArrow = (key) =>
    sort.key === key ? (sort.dir === "desc" ? " ↓" : " ↑") : "";

  const resetFilters = () => {
    setQuery("");
    setFocus("all");
    setReason("all");
    setSort({ key: "rejects", dir: "desc" });
    setDetail(null);
  };

  const quickImport = async (file) => {
    if (!file || importing) return;

    setImporting(true);
    setImportMessage("Analysing " + file.name + "…");

    try {
      const result = await analyseFiles([file]);
      if (!result?.recognizedFiles) {
        throw new Error("This file was not recognised as a supported report.");
      }

      const types = (result.fileResults || [])
        .filter((item) => item.recognized)
        .map((item) => String(item.reportType || "").toLowerCase());

      if (types.length && !types.some((type) => type.includes("pod"))) {
        throw new Error("This is not a POD Quality report. Use Import Center for other report types.");
      }

      const selectedSite = String(siteFilter || "").trim().toUpperCase();
      const importSite =
        selectedSite && selectedSite !== "ALL"
          ? selectedSite
          : inferSiteFromFile(file.name) || null;

      const saved = await onImported?.(result, [file], importSite);
      if (saved && Number(saved.savedMetrics || 0) === 0) {
        throw new Error(
          "POD report was recognised, but no driver-level POD Quality rows were saved."
        );
      }

      setWeek("");
      setDetail(null);
      resetFilters();
      setImportMessage(
        `POD Quality report imported successfully${importSite ? ` · ${importSite}` : ""}.`
      );
    } catch (error) {
      setImportMessage(error?.message || "Could not import POD report.");
    } finally {
      setImporting(false);
      if (input.current) input.current.value = "";
    }
  };

  const exportCsv = () => {
    if (!filtered.length) return;

    const headers = [
      "Driver",
      "TRID",
      "Opportunities",
      "Success",
      "Bypass",
      "Rejects",
      "POD %",
      "Main reject reason",
    ];
    const body = filtered.map((row) => [
      dname(row.drivers),
      trid(row.drivers),
      podOf(row).opportunities,
      podOf(row).success,
      podOf(row).bypass,
      podOf(row).rejects,
      row.pod,
      mainReason(row),
    ]);

    const blob = new Blob(
      [[headers, ...body].map((row) => row.map(csv).join(",")).join(String.fromCharCode(13, 10))],
      { type: "text/csv" }
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "metrixiq-pod-" + selectedWeek + ".csv";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 300);
  };

  if (load.loading) return <Loading text="Loading POD quality…" />;
  if (load.error) return <ErrorBox error={load.error} />;

  return (
    <div className="podv2">
      <header className="podv2-head">
        <div>
          <span className="page-kicker">DELIVERY QUALITY</span>
          <h1>Photo-on-Delivery Compliance</h1>
          <p>Driver-level POD Quality from dedicated Amazon POD reports only.</p>
        </div>

        <div className="podv2-actions">
          <label className="podv2-week-picker">
            <span>WEEK</span>
            <select
              aria-label="Select POD report week"
              value={selectedWeek}
              disabled={!weeks.length}
              onChange={(event) => {
                setWeek(event.target.value);
                setDetail(null);
              }}
            >
              {weeks.length ? (
                weeks.map((item) => <option key={item}>{item}</option>)
              ) : (
                <option value="">No detailed POD weeks</option>
              )}
            </select>
          </label>

          <input
            ref={input}
            type="file"
            hidden
            accept={IMPORT_ACCEPT}
            onChange={(event) => quickImport(event.target.files?.[0])}
          />

          <button
            className="btn primary"
            disabled={importing}
            onClick={() => input.current?.click()}
          >
            {importing ? "Importing…" : "⇧ Import POD"}
          </button>

          <button
            className="btn ghost"
            disabled={!filtered.length}
            onClick={exportCsv}
          >
            ⇩ Export
          </button>
        </div>
      </header>

      {importMessage && <div className="podv2-import-message">{importMessage}</div>}

      {!weeks.length ? (
        <section className="panel podv2-empty podv2-no-data">
          <div className="podv2-empty-mark">POD</div>
          <b>No detailed POD Quality report for this site</b>
          <p>
            Scorecard POD percentages are intentionally excluded here because they do not
            include opportunities, bypasses or reject reasons. Import the dedicated Amazon
            POD Quality report to populate this workspace.
          </p>
          <button
            className="btn primary"
            disabled={importing}
            onClick={() => input.current?.click()}
          >
            {importing ? "Importing…" : "⇧ Import POD Quality report"}
          </button>
        </section>
      ) : (
        <>
          <section className="podv2-kpis">
            {[
              ["▣", "Total Opportunities", totals.opp],
              ["✓", "Successful Photos", totals.success, pct(totals.pod, 2)],
              ["↻", "Bypass", totals.bypass, totals.opp ? pct((totals.bypass / totals.opp) * 100, 2) : "—"],
              ["!", "Rejects", totals.rejects, totals.opp ? pct((totals.rejects / totals.opp) * 100, 2) : "—"],
            ].map((item, index) => (
              <article key={item[1]} className={index === 3 ? "bad" : index === 2 ? "warn" : "ok"}>
                <i>{item[0]}</i>
                <div>
                  <span>{item[1]}</span>
                  <strong>{Number(item[2] || 0).toLocaleString()}</strong>
                  <small>{item[3] || selectedWeek}</small>
                </div>
              </article>
            ))}
          </section>

          <section className="podv3-workspace">
            <div className="podv3-main">
              <div className="podv2-filter-row">
                <nav className="podv2-chips">
                  {[
                    ["all", "All Drivers"],
                    ["rejects", "With Rejects"],
                    ["bypass", "With Bypass"],
                    ["below", "POD < 99%"],
                    ["excellent", "Excellent ≥ 99.8%"],
                  ].map(([key, text]) => (
                    <button
                      key={key}
                      className={focus === key ? "active" : ""}
                      onClick={() => setFocus(key)}
                    >
                      {text}
                    </button>
                  ))}
                </nav>
                <button className="btn ghost compact" onClick={resetFilters}>
                  Reset filters
                </button>
              </div>

              <div className="podv3-filters">
                <div className="podv3-search">
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={
                      showTransporter
                        ? "⌕ Search driver name or Transporter ID…"
                        : "⌕ Search driver name…"
                    }
                  />
                </div>

                <button
                  type="button"
                  className={"podv3-column-toggle " + (showTransporter ? "active" : "")}
                  onClick={() => setShowTransporter((current) => !current)}
                  aria-pressed={showTransporter}
                  title={showTransporter ? "Hide Transporter ID column" : "Show Transporter ID column"}
                >
                  <span aria-hidden="true" />
                  {showTransporter ? "Hide Transporter" : "Show Transporter"}
                </button>

                <select value={reason} onChange={(event) => setReason(event.target.value)}>
                  <option value="all">All reject reasons</option>
                  {reasons.map(([key, text]) => (
                    <option key={key} value={key}>
                      {text}
                    </option>
                  ))}
                </select>

                <select
                  value={sort.key}
                  onChange={(event) => setSort({ key: event.target.value, dir: "desc" })}
                >
                  <option value="rejects">Sort: Rejects</option>
                  <option value="pod">Sort: POD</option>
                  <option value="bypass">Sort: Bypass</option>
                  <option value="opportunities">Sort: Opportunities</option>
                </select>
              </div>

              <article className="panel podv2-table podv3-table">
                <div className="table-wrap">
                  <table className={showTransporter ? "" : "transporter-hidden"}>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th onClick={() => toggleSort("name")}>
                          Driver Name{sortArrow("name")}
                        </th>
                        {showTransporter && (
                          <th onClick={() => toggleSort("trid")}>
                            Transporter ID{sortArrow("trid")}
                          </th>
                        )}
                        {[
                          ["opportunities", "Opportunities"],
                          ["success", "Success"],
                          ["bypass", "Bypass"],
                          ["rejects", "Rejects"],
                          ["pod", "POD %"],
                        ].map(([key, text]) => (
                          <th key={key} onClick={() => toggleSort(key)}>
                            {text}
                            {sortArrow(key)}
                          </th>
                        ))}
                        <th>Main Reject Reason</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((row, index) => {
                        const detailData = podOf(row);
                        const podValue = Number(row.pod) || 0;
                        return (
                          <tr key={row.driver_id + "-" + index}>
                            <td>{index + 1}</td>
                            <td><b>{dname(row.drivers)}</b></td>
                            {showTransporter && <td><code>{trid(row.drivers)}</code></td>}
                            <td>{detailData.opportunities}</td>
                            <td>{detailData.success}</td>
                            <td className={detailData.bypass ? "warn" : ""}>{detailData.bypass}</td>
                            <td className={detailData.rejects ? "bad" : ""}>{detailData.rejects}</td>
                            <td><b className={"podv3-pod-score " + band(podValue)}>{pct(podValue, 2)}</b></td>
                            <td>{mainReason(row)}</td>
                            <td>
                              <span className={"podv2-band " + band(podValue)}>
                                {label(podValue)}
                              </span>
                            </td>
                            <td>
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onOpenDriver?.(openShape(row, { pod: n(row.pod) }));
                                }}
                              >
                                View
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {!filtered.length && (
                        <tr>
                          <td colSpan={showTransporter ? 11 : 10}>
                            <div className="ops-mini-empty">
                              No drivers match the current POD filters.
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <footer>
                  {selectedWeek} · Showing {filtered.length} driver{filtered.length === 1 ? "" : "s"} ·
                  click headers to sort
                </footer>
              </article>
            </div>

            <aside className="podv3-rail">
              <article className={"panel podv3-insight " + (!showTrend ? "collapsed" : "")}>
                <header>
                  <div>
                    <h2>POD Compliance Trend</h2>
                    <p>Successful photos, rejects and POD % over time.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowTrend((current) => !current)}
                    aria-expanded={showTrend}
                  >
                    {showTrend ? "◉ Hide" : "◉ Show"}
                  </button>
                </header>

                {showTrend && (
                  <>
                    <div className="podv3-range">
                      {[4, 8, 12].map((value) => (
                        <button
                          key={value}
                          type="button"
                          className={trendWindow === value ? "active" : ""}
                          onClick={() => setTrendWindow(value)}
                        >
                          {value} Weeks
                        </button>
                      ))}
                    </div>

                    <div className="podv3-trend-chart">
                      {trendChart.points.length ? (
                        <svg
                          viewBox={`0 0 ${trendChart.width} ${trendChart.height}`}
                          role="img"
                          aria-label="POD compliance trend"
                        >
                          {[95, 97.5, 100].map((value) => {
                            const y =
                              trendChart.top +
                              ((100 - value) / 5) * trendChart.plotHeight;
                            return (
                              <g key={value}>
                                <line
                                  x1={trendChart.left}
                                  y1={y}
                                  x2={trendChart.width - trendChart.right}
                                  y2={y}
                                  className="podv3-gridline"
                                />
                                <text
                                  x={trendChart.width - 1}
                                  y={y + 3}
                                  textAnchor="end"
                                  className="podv3-axis"
                                >
                                  {value}%
                                </text>
                              </g>
                            );
                          })}

                          {trendChart.points.map((point) => {
                            const barWidth = Math.max(10, Math.min(24, point.slot * 0.48));
                            const successY = trendChart.baseline - point.successHeight;
                            return (
                              <g key={point.week}>
                                <rect
                                  x={point.x - barWidth / 2}
                                  y={successY}
                                  width={barWidth}
                                  height={point.successHeight}
                                  rx="2"
                                  className="podv3-success-bar"
                                />
                                {!!point.rejectHeight && (
                                  <rect
                                    x={point.x - barWidth / 2}
                                    y={trendChart.baseline - point.rejectHeight}
                                    width={barWidth}
                                    height={point.rejectHeight}
                                    className="podv3-reject-bar"
                                  />
                                )}
                                <text
                                  x={point.x}
                                  y={trendChart.height - 7}
                                  textAnchor="middle"
                                  className="podv3-week"
                                >
                                  {point.week}
                                </text>
                              </g>
                            );
                          })}

                          <polyline points={trendChart.line} className="podv3-pod-line" />
                          {trendChart.points.map((point) => (
                            <g key={point.week + "-point"}>
                              <circle cx={point.x} cy={point.y} r="3.5" className="podv3-pod-point" />
                              <text
                                x={point.x}
                                y={Math.max(10, point.y - 7)}
                                textAnchor="middle"
                                className="podv3-pod-label"
                              >
                                {point.pod == null ? "—" : point.pod.toFixed(1) + "%"}
                              </text>
                            </g>
                          ))}
                        </svg>
                      ) : (
                        <div className="podv3-empty-chart">No trend data available.</div>
                      )}
                    </div>

                    <div className="podv3-legend">
                      <span><i className="success" />Successful</span>
                      <span><i className="rejects" />Rejects</span>
                      <span><i className="pod" />POD %</span>
                    </div>
                  </>
                )}
              </article>

              <article className={"panel podv3-insight " + (!showReasons ? "collapsed" : "")}>
                <header>
                  <div>
                    <h2>Reject Reasons</h2>
                    <p>Breakdown of rejected PODs ({selectedWeek}).</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowReasons((current) => !current)}
                    aria-expanded={showReasons}
                  >
                    {showReasons ? "◉ Hide" : "◉ Show"}
                  </button>
                </header>

                {showReasons && (
                  <div className="podv3-reject-layout">
                    <div
                      className="podv3-donut"
                      style={{
                        background: totals.rejects
                          ? `conic-gradient(${rejectGradient})`
                          : "#edf2f5",
                      }}
                    >
                      <div>
                        <strong>{totals.rejects}</strong>
                        <span>Rejects</span>
                      </div>
                    </div>

                    <div className="podv3-reject-list">
                      {rejectSegments.map((segment) => (
                        <button
                          key={segment.key}
                          type="button"
                          className={reason === segment.key ? "active" : ""}
                          onClick={() => setReason(reason === segment.key ? "all" : segment.key)}
                        >
                          <i style={{ background: segment.color }} />
                          <span>{segment.text}</span>
                          <b>{segment.value}</b>
                          <small>{segment.percent.toFixed(1)}%</small>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </article>
            </aside>
          </section>

          <style jsx global>{`
            .podv2{gap:11px;padding:18px 22px 26px}
            .podv2-head h1{font-size:27px}
            .podv2-head p{font-size:11px}
            .podv2-actions .btn{height:38px;padding:0 13px;font-size:10px}
            .podv2-week-picker{height:38px;min-width:88px;padding:4px 9px}
            .podv2-week-picker select{height:22px!important}

            .podv2-kpis{gap:8px}
            .podv2-kpis article{padding:10px 12px;border-radius:11px;min-height:70px}
            .podv2-kpis i{width:34px;height:34px}
            .podv2-kpis strong{font-size:22px}
            .podv2-kpis span{font-size:10px}
            .podv2-kpis small{font-size:9px}

            .podv3-workspace{
              display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:12px;align-items:start
            }
            .podv3-main{min-width:0;display:grid;gap:9px}
            .podv2-filter-row{gap:9px}
            .podv2-chips{gap:6px}
            .podv2-chips button{padding:7px 11px;border-radius:8px;font-size:9px}
            .podv2-filter-row .btn.compact{height:32px;font-size:9px}

            .podv3-filters{
              display:grid;grid-template-columns:minmax(250px,1fr) auto 170px 150px;
              gap:7px;align-items:center
            }
            .podv3-search input,.podv3-filters select{
              width:100%;height:36px;border:1px solid #dce5ee;border-radius:9px;background:#fff;
              padding:0 10px;font-size:10px;color:#24384b
            }
            .podv3-column-toggle{
              height:36px;border:1px solid #dce5ee;border-radius:9px;background:#fff;
              padding:0 9px;display:inline-flex;align-items:center;gap:7px;
              color:#40566a;font-size:9px;font-weight:850;white-space:nowrap;cursor:pointer
            }
            .podv3-column-toggle>span{
              width:26px;height:15px;border-radius:999px;background:#dfe6eb;position:relative
            }
            .podv3-column-toggle>span:after{
              content:"";position:absolute;width:11px;height:11px;left:2px;top:2px;
              border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(20,42,60,.18);transition:.16s
            }
            .podv3-column-toggle.active>span{background:#2d9b79}
            .podv3-column-toggle.active>span:after{transform:translateX(11px)}

            .podv3-table{overflow:hidden}
            .podv3-table .table-wrap{max-height:660px;overflow:auto}
            .podv3-table table{min-width:900px}
            .podv3-table table.transporter-hidden{min-width:780px}
            .podv3-table th,.podv3-table td{padding:8px 7px;font-size:9px}
            .podv3-table th{position:sticky;top:0;z-index:2;background:#f8fafc}
            .podv3-table td b{font-size:9px}
            .podv3-table code{font-size:7px}
            .podv3-table footer{padding:9px 11px;font-size:9px}
            .podv3-table td button{padding:5px 9px;font-size:8px}
            .podv3-pod-score{
              display:inline-flex;align-items:center;justify-content:center;min-width:58px;
              border-radius:7px;padding:5px 7px
            }
            .podv3-pod-score.excellent,.podv3-pod-score.target{background:#e9f7f0;color:#187455}
            .podv3-pod-score.risk{background:#fff4dd;color:#9c6412}
            .podv3-pod-score.critical{background:#ffe8e9;color:#b63a43}

            .podv3-rail{display:grid;gap:10px;position:sticky;top:12px}
            .podv3-insight{padding:12px;border-radius:12px;overflow:hidden}
            .podv3-insight.collapsed{padding-bottom:10px}
            .podv3-insight>header{
              display:flex;align-items:flex-start;justify-content:space-between;gap:10px
            }
            .podv3-insight h2{margin:0;font-size:14px;color:#142b3f}
            .podv3-insight p{margin:3px 0 0;font-size:9px;color:#758697}
            .podv3-insight>header>button{
              height:27px;padding:0 8px;border:1px solid #dce5ee;border-radius:7px;background:#fff;
              color:#40566a;font-size:8px;font-weight:850;cursor:pointer
            }

            .podv3-range{display:flex;gap:5px;margin:10px 0 3px}
            .podv3-range button{
              height:27px;border:1px solid #d8e2ea;border-radius:7px;background:#f7faff;
              padding:0 9px;font-size:8px;font-weight:850;color:#2468c9;cursor:pointer
            }
            .podv3-range button.active{background:#2b74e8;color:#fff;border-color:#2b74e8}
            .podv3-trend-chart{height:180px}
            .podv3-trend-chart svg{width:100%;height:100%;display:block;overflow:visible}
            .podv3-gridline{stroke:#e8eef2;stroke-width:1}
            .podv3-axis,.podv3-week{fill:#6f8191;font-size:7px;font-weight:700}
            .podv3-success-bar{fill:#48b993;opacity:.95}
            .podv3-reject-bar{fill:#f25b5b}
            .podv3-pod-line{fill:none;stroke:#102d4b;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
            .podv3-pod-point{fill:#102d4b;stroke:#fff;stroke-width:1.5}
            .podv3-pod-label{fill:#102d4b;font-size:7px;font-weight:900}
            .podv3-empty-chart{height:100%;display:grid;place-items:center;color:#7a8997;font-size:10px}
            .podv3-legend{display:flex;justify-content:center;gap:14px;margin-top:1px}
            .podv3-legend span{display:flex;align-items:center;gap:5px;font-size:8px;color:#4a6072}
            .podv3-legend i{width:8px;height:8px;border-radius:50%}
            .podv3-legend i.success{background:#48b993}
            .podv3-legend i.rejects{background:#f25b5b}
            .podv3-legend i.pod{background:#102d4b}

            .podv3-reject-layout{display:grid;grid-template-columns:120px 1fr;gap:12px;align-items:center;margin-top:11px}
            .podv3-donut{
              width:112px;height:112px;border-radius:50%;display:grid;place-items:center;margin:auto
            }
            .podv3-donut>div{
              width:66px;height:66px;border-radius:50%;background:#fff;display:grid;place-items:center;
              align-content:center;box-shadow:0 0 0 1px #edf1f4
            }
            .podv3-donut strong{font-size:20px;line-height:1;color:#173047}
            .podv3-donut span{font-size:8px;color:#768797;margin-top:2px}
            .podv3-reject-list{display:grid;gap:4px}
            .podv3-reject-list button{
              display:grid;grid-template-columns:8px minmax(0,1fr) 28px 38px;gap:6px;align-items:center;
              min-height:25px;border:0;border-radius:6px;background:transparent;padding:3px 4px;text-align:left;cursor:pointer
            }
            .podv3-reject-list button:hover,.podv3-reject-list button.active{background:#f4f8fb}
            .podv3-reject-list i{width:7px;height:7px;border-radius:50%}
            .podv3-reject-list span{font-size:8px;color:#334b60}
            .podv3-reject-list b{font-size:8px;color:#173047;text-align:right}
            .podv3-reject-list small{font-size:8px;color:#7b8997;text-align:right}

            @media(max-width:1180px){
              .podv3-workspace{grid-template-columns:1fr}
              .podv3-rail{position:static;grid-template-columns:1fr 1fr}
              .podv3-filters{grid-template-columns:1fr auto 160px 145px}
            }
            @media(max-width:760px){
              .podv2{padding:14px 12px 90px}
              .podv2-kpis{display:flex;overflow-x:auto}
              .podv2-kpis article{min-width:175px}
              .podv3-rail{grid-template-columns:1fr}
              .podv3-filters{grid-template-columns:1fr 1fr}
              .podv3-search{grid-column:1/-1}
              .podv3-reject-layout{grid-template-columns:1fr}
            }
          `}</style>
        </>
      )}
    </div>
  );
}
