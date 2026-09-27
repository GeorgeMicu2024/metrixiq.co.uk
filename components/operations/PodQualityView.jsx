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

          <section className="panel podv2-reasons">
            <h2>
              Reject Reasons <small>Total {totals.rejects}</small>
            </h2>
            <div className="podv2-reason-grid">
              {reasons.map(([key, text, icon]) => (
                <button
                  key={key}
                  onClick={() => setReason(reason === key ? "all" : key)}
                  className={reason === key ? "active" : ""}
                >
                  <i>{icon}</i>
                  <span>{text}</span>
                  <b>{reasonTotals[key]}</b>
                  <small>
                    {totals.rejects
                      ? ((reasonTotals[key] / totals.rejects) * 100).toFixed(1)
                      : 0}
                    %
                  </small>
                </button>
              ))}
            </div>
          </section>

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

          <div className="podv2-filters">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="⌕ Search driver name or Transporter ID…"
            />
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

          <section className="podv2-lower">
            <article className="panel podv2-table">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      {[
                        ["name", "Driver Name"],
                        ["trid", "Transporter ID"],
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
                        <tr
                          key={row.driver_id + "-" + index}
                          className={active === row ? "active" : ""}
                          onClick={() => setDetail(row)}
                        >
                          <td>{index + 1}</td>
                          <td><b>{dname(row.drivers)}</b></td>
                          <td><code>{trid(row.drivers)}</code></td>
                          <td>{detailData.opportunities}</td>
                          <td>{detailData.success}</td>
                          <td className={detailData.bypass ? "warn" : ""}>{detailData.bypass}</td>
                          <td className={detailData.rejects ? "bad" : ""}>{detailData.rejects}</td>
                          <td><b>{pct(podValue, 2)}</b></td>
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
                                setDetail(row);
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
                        <td colSpan="11">
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

            <aside className="panel podv2-detail">
              {active ? (
                <>
                  <div className="podv2-driver">
                    <div className="driver-avatar">
                      {dname(active.drivers)
                        .split(" ")
                        .map((part) => part[0])
                        .slice(0, 2)
                        .join("")}
                    </div>
                    <div>
                      <h2>{dname(active.drivers)}</h2>
                      <p>{trid(active.drivers)}</p>
                    </div>
                    <button onClick={() => setDetail(null)}>×</button>
                  </div>

                  <div className="podv2-mini">
                    {[
                      ["Opportunities", activeDetail.opportunities],
                      ["Success", activeDetail.success],
                      ["Bypass", activeDetail.bypass],
                      ["Rejects", activeDetail.rejects],
                    ].map((item) => (
                      <article key={item[0]}>
                        <b>{item[1] ?? 0}</b>
                        <span>{item[0]}</span>
                      </article>
                    ))}
                  </div>

                  <div className={"podv2-score " + band(Number(active.pod) || 0)}>
                    <strong>{pct(active.pod, 2)}</strong>
                    <span>POD Quality</span>
                  </div>

                  <h3>Reject Reasons</h3>
                  <div className="podv2-detail-reasons">
                    {reasons.map(([key, text, icon]) => (
                      <p key={key}>
                        <span>{icon} {text}</span>
                        <b>{activeReasons[key] || 0}</b>
                      </p>
                    ))}
                  </div>

                  <div className="podv2-coach">
                    <b>Coaching Focus</b>
                    <p>
                      {mainReason(active) === "No Package Detected"
                        ? "Ensure the parcel is clearly visible and fully inside the delivery photo."
                        : mainReason(active) === "Blurry Photo"
                          ? "Hold the device steady and confirm the photo is sharp before completing delivery."
                          : mainReason(active) === "Photo Too Dark"
                            ? "Use better lighting and make sure the parcel and delivery location are visible."
                            : mainReason(active) === "Package In Car"
                              ? "Take the POD only after the parcel is at the delivery location, not inside the vehicle."
                              : mainReason(active) === "Package Too Close"
                                ? "Step back so the full parcel and delivery context are visible."
                                : "Review POD process and avoid manual bypass where a valid photo can be taken."}
                    </p>
                  </div>

                  <button
                    className="btn ghost full"
                    onClick={() =>
                      navigator.clipboard?.writeText(
                        dname(active.drivers) +
                          " POD coaching: " +
                          mainReason(active) +
                          ". POD " +
                          pct(active.pod, 2) +
                          "."
                      )
                    }
                  >
                    Copy Coaching Message
                  </button>

                  <button
                    className="btn primary full"
                    onClick={() =>
                      onOpenDriver?.(openShape(active, { pod: n(active.pod) }))
                    }
                  >
                    View Driver 360 →
                  </button>
                </>
              ) : (
                <p>Select a driver.</p>
              )}
            </aside>
          </section>
        </>
      )}
    </div>
  );
}
