"use client";

import { useMemo, useRef, useState } from "react";
import { analyseFiles } from "../../lib/analyzer";
import { IMPORT_ACCEPT } from "../../lib/imports/preflight";
import {
  POD_EXPORT_PAGE_SIZE,
  POD_EXPORT_SITE,
  paginatePodRows,
  podRejectReasons,
} from "../../lib/pod/exportReport.mjs";
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
  refreshKey = 0,
}) {
  const load = useOperationalRows(organizationId, "pod", refreshKey);
  const rows = useMemo(() => {
    // POD Quality is intentionally a DZM1-only workspace, independent of the
    // station currently selected for other metrics in the global header.
    const siteRows = filterRowsBySite(load.rows, POD_EXPORT_SITE);

    // POD is site-specific. Some older imports were saved under the selected
    // metric site even when the linked driver belongs to another station.
    // Keep rows with no master-site assignment, but never surface a driver
    // whose known master site conflicts with the site selected in the header.
    return siteRows.filter((row) => {
      const driverSite = String(row?.drivers?.site || "").trim().toUpperCase();
      return !driverSite || driverSite === POD_EXPORT_SITE;
    });
  }, [load.rows]);
  const input = useRef(null);
  const exportStage = useRef(null);

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
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState("");
  const [exportError, setExportError] = useState("");

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

  const allReasons = (row) => podRejectReasons(podOf(row), reasons);

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
  const imagePages = paginatePodRows(filtered);
  const pageCount = Math.max(1, imagePages.length);
  const currentPage = Math.min(page, pageCount);
  const pageRows = imagePages[currentPage - 1] || [];
  const pageOffset = (currentPage - 1) * POD_EXPORT_PAGE_SIZE;

  const active = detail && base.includes(detail) ? detail : filtered[0] || null;
  const activeDetail = podOf(active);
  const activeReasons = activeDetail.reasons || {};

  const toggleSort = (key) => {
    setPage(1);
    setSort((current) => ({
      key,
      dir: current.key === key && current.dir === "desc" ? "asc" : "desc",
    }));
  };

  const sortArrow = (key) =>
    sort.key === key ? (sort.dir === "desc" ? " ↓" : " ↑") : "";

  const resetFilters = () => {
    setQuery("");
    setFocus("all");
    setReason("all");
    setSort({ key: "rejects", dir: "desc" });
    setDetail(null);
    setPage(1);
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

      const filenameSite = inferSiteFromFile(file.name);
      if (filenameSite && filenameSite !== POD_EXPORT_SITE) {
        throw new Error(`This POD workspace accepts DZM1 only. File appears to be for ${filenameSite}.`);
      }
      const importSite = POD_EXPORT_SITE;

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
      "Rejection reasons",
    ];
    const body = filtered.map((row) => [
      dname(row.drivers),
      trid(row.drivers),
      podOf(row).opportunities,
      podOf(row).success,
      podOf(row).bypass,
      podOf(row).rejects,
      row.pod,
      allReasons(row),
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

  const saveImages = async (allPages = false) => {
    if (!imagePages.length || exporting) return;
    setExportError("");
    setExporting(allPages ? "all" : "page");

    try {
      const { toPng } = await import("html-to-image");
      if (document.fonts?.ready) await document.fonts.ready;
      const targets = allPages
        ? imagePages.map((_, index) => index + 1)
        : [currentPage];

      for (const pageNumber of targets) {
        const target = exportStage.current?.querySelector(
          `[data-pod-image-page="${pageNumber}"]`
        );
        if (!target) throw new Error("Could not prepare the image for this page.");

        const dataUrl = await toPng(target, {
          pixelRatio: 2,
          backgroundColor: "#f3f7fb",
          cacheBust: true,
        });
        const anchor = document.createElement("a");
        anchor.download = `MetrixIQ_POD_DZM1_${selectedWeek}_Page_${pageNumber}_of_${imagePages.length}.png`;
        anchor.href = dataUrl;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      }
    } catch (error) {
      setExportError(error?.message || "Could not save the POD image.");
    } finally {
      setExporting("");
    }
  };

  if (load.loading) return <Loading text="Loading POD quality…" />;
  if (load.error) return <ErrorBox error={load.error} />;

  return (
    <div className="podv2">
      <header className="podv2-head">
        <div>
          <span className="page-kicker">DELIVERY QUALITY</span>
          <h1>POD Quality — DZM1</h1>
          <p>Driver-level POD Quality from dedicated Amazon POD reports only. <strong>· DZM1 only</strong></p>
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
                setPage(1);
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

          <button className="btn primary podv3-save-image" disabled={!filtered.length || !!exporting} onClick={() => saveImages(false)}>
            {exporting === "page" ? "Saving image…" : "⇩ Save Page as Image"}
          </button>
          <button className="btn ghost" disabled={!filtered.length || !!exporting} onClick={() => saveImages(true)}>
            {exporting === "all" ? "Saving pages…" : "⇩ Export All PNGs"}
          </button>
          <button className="btn ghost" disabled={!filtered.length} onClick={exportCsv}>
            ⇩ CSV
          </button>
        </div>
      </header>

      {importMessage && <div className="podv2-import-message">{importMessage}</div>}
      {exportError && <div className="podv2-import-message podv3-export-error" role="alert">{exportError}</div>}

      {!weeks.length ? (
        <section className="panel podv2-empty podv2-no-data">
          <div className="podv2-empty-mark">POD</div>
          <b>No detailed POD Quality report for this site (DZM1)</b>
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
                      onClick={() => { setFocus(key); setPage(1); }}
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
                    onChange={(event) => { setQuery(event.target.value); setPage(1); }}
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

                <select value={reason} onChange={(event) => { setReason(event.target.value); setPage(1); }}>
                  <option value="all">All reject reasons</option>
                  {reasons.map(([key, text]) => (
                    <option key={key} value={key}>
                      {text}
                    </option>
                  ))}
                </select>

                <select
                  value={sort.key}
                  onChange={(event) => { setSort({ key: event.target.value, dir: "desc" }); setPage(1); }}
                >
                  <option value="rejects">Sort: Rejects</option>
                  <option value="pod">Sort: POD</option>
                  <option value="bypass">Sort: Bypass</option>
                  <option value="opportunities">Sort: Opportunities</option>
                </select>
              </div>

              <article className="panel podv2-table podv3-table">
                <div className="podv3-scorecard-heading">
                  <div>
                    <h2>Driver Scorecards</h2>
                    <p>Scores, rejected photos and every recorded rejection reason · DZM1 only</p>
                  </div>
                  <span>{POD_EXPORT_PAGE_SIZE} drivers per image</span>
                </div>
                <div className="table-wrap podv3-desktop-table">
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
                        <th>Rejection Reasons</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((row, index) => {
                        const detailData = podOf(row);
                        const podValue = Number(row.pod) || 0;
                        return (
                          <tr key={row.driver_id + "-" + index}>
                            <td>{pageOffset + index + 1}</td>
                            <td><b>{dname(row.drivers)}</b></td>
                            {showTransporter && <td><code>{trid(row.drivers)}</code></td>}
                            <td>{detailData.opportunities}</td>
                            <td>{detailData.success}</td>
                            <td className={detailData.bypass ? "warn" : ""}>{detailData.bypass}</td>
                            <td className={detailData.rejects ? "bad" : ""}>{detailData.rejects}</td>
                            <td><b className={"podv3-pod-score " + band(podValue)}>{pct(podValue, 2)}</b></td>
                            <td className={detailData.rejects ? "podv3-reason-cell bad" : "podv3-reason-cell"}>{allReasons(row)}</td>
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
                <div className="podv3-mobile-cards">
                  {pageRows.map((row, index) => {
                    const detailData = podOf(row);
                    const podValue = Number(row.pod) || 0;
                    return (
                      <article className="podv3-mobile-card" key={row.driver_id + "-mobile-" + index}>
                        <div className="podv3-mobile-top">
                          <div><small>#{pageOffset + index + 1}</small><strong>{dname(row.drivers)}</strong></div>
                          <b className={"podv3-pod-score " + band(podValue)}>{pct(podValue, 2)}</b>
                        </div>
                        <div className="podv3-mobile-stats">
                          <span><b>{detailData.opportunities ?? 0}</b> Opportunities</span>
                          <span><b>{detailData.rejects ?? 0}</b> Rejected</span>
                          <span><b>{detailData.bypass ?? 0}</b> Bypass</span>
                        </div>
                        <p className={detailData.rejects ? "has-rejects" : ""}><b>What went wrong:</b> {allReasons(row)}</p>
                        <div className="podv3-mobile-bottom">
                          <span className={"podv2-band " + band(podValue)}>{label(podValue)}</span>
                          <button type="button" onClick={() => onOpenDriver?.(openShape(row, { pod: n(row.pod) }))}>View driver</button>
                        </div>
                      </article>
                    );
                  })}
                  {!pageRows.length && <div className="ops-mini-empty">No drivers match the current POD filters.</div>}
                </div>
                <footer className="podv3-pagination">
                  <span>
                    {selectedWeek} · Showing {filtered.length ? pageOffset + 1 : 0}–{Math.min(pageOffset + POD_EXPORT_PAGE_SIZE, filtered.length)} of {filtered.length} DZM1 drivers
                  </span>
                  <div className="podv3-pagination-controls">
                    <button type="button" aria-label="Previous POD page" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>‹</button>
                    <strong>Page {currentPage} of {pageCount}</strong>
                    <button type="button" aria-label="Next POD page" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>›</button>
                  </div>
                </footer>
                <div className="podv3-image-note">
                  ⇩ Save Page as Image downloads the current {POD_EXPORT_PAGE_SIZE}-driver page as a PNG. Export All PNGs saves every page.
                </div>
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
                          onClick={() => { setReason(reason === segment.key ? "all" : segment.key); setPage(1); }}
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

          <div className="podv3-export-stage" ref={exportStage} aria-hidden="true">
            {imagePages.map((exportRows, exportPageIndex) => (
              <section
                className="podv3-export-page"
                data-pod-image-page={exportPageIndex + 1}
                key={exportPageIndex}
              >
                <header>
                  <span>METRIXIQ · DELIVERY QUALITY</span>
                  <h2>POD Quality — DZM1</h2>
                  <p>{selectedWeek} · DZM1 Only · Driver scorecards</p>
                </header>
                <div className="podv3-export-summary">
                  <div><small>DRIVERS ON THIS PAGE</small><strong>{exportRows.length}</strong></div>
                  <div><small>DZM1 POD SCORE</small><strong>{pct(totals.pod, 2)}</strong></div>
                  <div><small>DZM1 REJECTED PHOTOS</small><strong>{totals.rejects.toLocaleString()}</strong></div>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Driver Name</th>
                      <th>POD Score</th>
                      <th>Opportunities</th>
                      <th>Rejected</th>
                      <th>Rejection Reasons</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exportRows.map((row, index) => {
                      const details = podOf(row);
                      const score = Number(row.pod) || 0;
                      return (
                        <tr key={row.driver_id + "-export-" + index}>
                          <td>{exportPageIndex * POD_EXPORT_PAGE_SIZE + index + 1}</td>
                          <td className="podv3-export-name">{dname(row.drivers)}</td>
                          <td><b className={"podv3-export-score " + band(score)}>{pct(score, 2)}</b></td>
                          <td>{Number(details.opportunities || 0).toLocaleString()}</td>
                          <td className={Number(details.rejects) ? "podv3-export-rejected" : ""}>{Number(details.rejects || 0).toLocaleString()}</td>
                          <td className={Number(details.rejects) ? "podv3-export-reasons" : ""}>{allReasons(row)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <footer>
                  <span>DZM1 · {selectedWeek} · Drivers {exportPageIndex * POD_EXPORT_PAGE_SIZE + 1}–{Math.min((exportPageIndex + 1) * POD_EXPORT_PAGE_SIZE, filtered.length)} of {filtered.length}</span>
                  <strong>Page {exportPageIndex + 1} of {imagePages.length}</strong>
                </footer>
              </section>
            ))}
          </div>

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
            .podv3-save-image{background:#258b7d!important;border-color:#258b7d!important;color:#fff!important}
            .podv3-save-image:hover:not(:disabled){background:#1d7468!important}
            .podv3-export-error{color:#a63142!important;background:#fff2f3!important;border-color:#f1cbd1!important}
            .podv3-scorecard-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 15px 9px}
            .podv3-scorecard-heading h2{font-size:17px;margin:0;color:#112b43}
            .podv3-scorecard-heading p{margin:4px 0 0;font-size:10px;color:#758697}
            .podv3-scorecard-heading>span{flex-shrink:0;border:1px solid #dce7f0;border-radius:8px;padding:7px 9px;background:#f6faff;color:#3572b9;font-size:10px;font-weight:800}
            .podv3-reason-cell{min-width:200px;max-width:300px;line-height:1.45;color:#2a7c63}
            .podv3-reason-cell.bad{color:#b34850}
            .podv3-mobile-cards{display:none}
            .podv3-pagination{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap!important}
            .podv3-pagination-controls{display:flex;align-items:center;gap:7px}
            .podv3-pagination-controls button{height:32px;min-width:34px;border:1px solid #dbe5ee;border-radius:8px;background:#fff;color:#224f86;font-size:21px;cursor:pointer}
            .podv3-pagination-controls button:disabled{opacity:.35;cursor:not-allowed}
            .podv3-pagination-controls strong{padding:0 9px;color:#173047;font-size:10px;white-space:nowrap}
            .podv3-image-note{margin:0 12px 12px;border:1px solid #cfe3fb;border-radius:8px;background:#f1f8ff;padding:9px;color:#2f6ead;font-size:10px;line-height:1.5}

            /* The export pages have their own fixed-width, high-resolution design.
               They are laid out off-screen, never display:none, so PNG capture works. */
            .podv3-export-stage{position:absolute;left:-20000px;top:0;width:1100px;pointer-events:none}
            .podv3-export-page{box-sizing:border-box;width:1100px;background:#f3f7fb;color:#14263d;padding:34px 38px 28px;font-family:Arial,Helvetica,sans-serif}
            .podv3-export-page *{box-sizing:border-box}
            .podv3-export-page>header{padding-bottom:22px;border-bottom:3px solid #278f83}
            .podv3-export-page>header>span{font-size:13px;letter-spacing:2.3px;font-weight:800;color:#218d7e}
            .podv3-export-page>header h2{font-size:35px;letter-spacing:-.8px;margin:12px 0 6px;color:#14263d}
            .podv3-export-page>header p{font-size:17px;margin:0;color:#6c7c91}
            .podv3-export-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:21px 0}
            .podv3-export-summary>div{background:#fff;border:1px solid #d9e4ed;border-radius:11px;padding:17px}
            .podv3-export-summary small{display:block;font-size:11px;letter-spacing:.7px;font-weight:800;color:#718294}
            .podv3-export-summary strong{display:block;margin-top:7px;font-size:26px;color:#132a43}
            .podv3-export-page table{width:100%;border-spacing:0;border-collapse:separate;background:#fff;border:1px solid #dce5ed;border-radius:12px;overflow:hidden;table-layout:fixed}
            .podv3-export-page th{padding:15px 11px;background:#edf2f7;color:#32475f;font-size:13px;text-align:left}
            .podv3-export-page th:nth-child(1){width:45px}
            .podv3-export-page th:nth-child(2){width:250px}
            .podv3-export-page th:nth-child(3){width:124px}
            .podv3-export-page th:nth-child(4){width:115px}
            .podv3-export-page th:nth-child(5){width:95px}
            .podv3-export-page td{padding:14px 11px;border-top:1px solid #e6edf3;font-size:13px;line-height:1.4;vertical-align:middle;overflow-wrap:anywhere}
            .podv3-export-page tbody tr:nth-child(even){background:#fbfdff}
            .podv3-export-page .podv3-export-name{font-weight:800;font-size:14px;color:#14263d}
            .podv3-export-score{display:inline-block;padding:5px 8px;border-radius:8px;white-space:nowrap}
            .podv3-export-score.excellent,.podv3-export-score.target{background:#def8eb;color:#086c3c}
            .podv3-export-score.risk{background:#fff0d4;color:#955a0b}
            .podv3-export-score.critical{background:#ffe3e4;color:#b82d42}
            .podv3-export-rejected,.podv3-export-reasons{color:#bc3748;font-weight:700}
            .podv3-export-page>footer{display:flex;justify-content:space-between;margin-top:18px;font-size:13px;color:#60758a}
            .podv3-export-page>footer strong{color:#14263d}

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
              .podv2-actions{width:100%;display:grid;grid-template-columns:1fr 1fr;gap:8px}
              .podv2-week-picker{grid-column:1}
              .podv3-save-image{grid-column:1/-1;grid-row:2}
              .podv2-actions .btn{min-width:0;font-size:10px}
              .podv3-desktop-table{display:none}
              .podv3-mobile-cards{display:grid;gap:9px;padding:9px}
              .podv3-mobile-card{border:1px solid #dce5ed;border-radius:11px;padding:13px;background:#fff}
              .podv3-mobile-top{display:flex;align-items:center;justify-content:space-between;gap:10px}
              .podv3-mobile-top>div{display:grid;gap:5px;min-width:0}
              .podv3-mobile-top small{color:#76889a;font-size:10px}
              .podv3-mobile-top strong{font-size:13px;overflow-wrap:anywhere;color:#173047}
              .podv3-mobile-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin:12px 0;padding:9px 0;border-block:1px solid #edf1f5}
              .podv3-mobile-stats span{display:grid;gap:4px;color:#748697;font-size:9px}
              .podv3-mobile-stats b{font-size:16px;color:#203951}
              .podv3-mobile-card p{font-size:11px;line-height:1.5;color:#23845e;margin:0 0 11px}
              .podv3-mobile-card p.has-rejects{color:#b63e4b}
              .podv3-mobile-bottom{display:flex;align-items:center;justify-content:space-between;gap:8px}
              .podv3-mobile-bottom>button{border:1px solid #d9e4ee;border-radius:7px;padding:7px 11px;background:#f7fafc;color:#2d6ab0;font-size:10px;font-weight:800}
              .podv3-scorecard-heading{align-items:flex-start}
              .podv3-scorecard-heading h2{font-size:15px}
              .podv3-scorecard-heading p{font-size:9px}
              .podv3-scorecard-heading>span{font-size:9px}
              .podv3-pagination{align-items:stretch}
              .podv3-pagination-controls{width:100%;justify-content:flex-end}
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
