"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toBlob } from "html-to-image";
import {
  buildFourWeekConcessionMatrix,
  fetchConcessionSnapshots,
} from "../../lib/data/concessions";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import {
  buildSingleWeekConcessionRows,
  buildMultiWeekConcessionRows,
  concessionExportPages,
  weeklyConcessionTone,
} from "../../lib/data/concessionsWeeklyView";
import { ErrorBox, Loading } from "./OperationalShared";

const cellTone = (value) => {
  const count = Number(value || 0);
  if (count === 0) return "zero";
  if (count === 1) return "one";
  if (count === 2) return "two";
  return "high";
};

const CONCESSIONS_PAGE_SIZE = 25;

const latestConcessionWeeks = (rows, site, limit = 8) =>
  [...new Set(
    (rows || [])
      .filter((row) => !site || row.site === site)
      .map((row) => row.week_label)
      .filter(Boolean)
  )]
    .sort(
      (a, b) =>
        Number(String(b).replace(/\D/g, "")) -
        Number(String(a).replace(/\D/g, ""))
    )
    .slice(0, limit)
    .reverse();

const deltaMeta = (value) => {
  if (value == null) return { label: "No comparison", tone: "neutral" };
  if (value === 0) return { label: "0 vs prev", tone: "neutral" };
  if (value < 0) return { label: `${value} vs prev`, tone: "better" };
  return { label: `+${value} vs prev`, tone: "worse" };
};

function MiniTrend({ values = [] }) {
  const safe = values.map((value) => Number(value || 0));
  const width = 88;
  const height = 26;
  const pad = 2;
  const max = Math.max(1, ...safe);
  const min = Math.min(0, ...safe);
  const spread = Math.max(1, max - min);
  const lastIndex = Math.max(1, safe.length - 1);
  const points = safe
    .map((value, index) => {
      const x = pad + (index / lastIndex) * (width - pad * 2);
      const y = pad + ((max - value) / spread) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const previous = safe.length > 1 ? safe[safe.length - 2] : null;
  const latest = safe.length ? safe[safe.length - 1] : 0;
  const movement = previous == null ? 0 : latest - previous;
  const tone = movement > 0 ? "worse" : movement < 0 ? "better" : "neutral";

  return (
    <div className={`cx5-mini-trend ${tone}`}>
      <svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
        <polyline points={points} />
        {safe.map((value, index) => {
          const x = pad + (index / lastIndex) * (width - pad * 2);
          const y = pad + ((max - value) / spread) * (height - pad * 2);
          return <circle key={`${index}-${value}`} cx={x} cy={y} r="1.7" />;
        })}
      </svg>
      <small>
        {movement > 0 ? `↑ +${movement}` : movement < 0 ? `↓ ${movement}` : "→ 0"}
      </small>
    </div>
  );
}

export default function ConcessionsSimpleView({
  organizationId,
  onOpenDriver,
  siteFilter = "all",
  onSiteFilterChange,
  refreshKey = 0,
  drivers = [],
}) {
  const [load, setLoad] = useState({ loading: true, error: "", rows: [] });
  const [query, setQuery] = useState("");
  const [show, setShow] = useState("all");
  const [range, setRange] = useState(8);
  const [selectedWeek, setSelectedWeek] = useState("");
  const [previewReady, setPreviewReady] = useState(false);
  const [showTrid, setShowTrid] = useState(true);
  const [page, setPage] = useState(1);
  const [saveMessage, setSaveMessage] = useState("");
  const [latestSiteRoster, setLatestSiteRoster] = useState([]);
  const exportPageRefs = useRef([]);

  useEffect(() => {
    let alive = true;
    if (!organizationId) {
      setLoad({ loading: false, error: "", rows: [] });
      return () => {};
    }

    (async () => {
      try {
        setLoad((current) => ({ ...current, loading: true, error: "" }));
        const rows = await fetchConcessionSnapshots(
          getSupabaseBrowserClient(),
          organizationId,
          siteFilter
        );
        if (alive) setLoad({ loading: false, error: "", rows });
      } catch (error) {
        if (alive) {
          setLoad({
            loading: false,
            error: error?.message || "Could not load concessions.",
            rows: [],
          });
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [organizationId, siteFilter, refreshKey]);

  const globalSite = String(siteFilter || "all").trim().toUpperCase();
  const availableSites = useMemo(
    () =>
      [...new Set(
        (load.rows || [])
          .map((row) => String(row.site || "").toUpperCase())
          .filter(Boolean)
      )].sort(),
    [load.rows]
  );

  useEffect(() => {
    if (
      !load.loading &&
      globalSite === "ALL" &&
      availableSites.length &&
      onSiteFilterChange
    ) {
      onSiteFilterChange(availableSites[0]);
    }
  }, [load.loading, globalSite, availableSites.join("|"), onSiteFilterChange]);

  const site = globalSite !== "ALL" ? globalSite : availableSites[0] || "";

  useEffect(() => {
    let cancelled = false;
    async function loadLatestSiteRoster() {
      if (!organizationId || !site) {
        if (!cancelled) setLatestSiteRoster([]);
        return;
      }
      const supabase = getSupabaseBrowserClient();
      const { data: latestRows } = await supabase
        .from("driver_metrics")
        .select("period_start,period_end,week_label")
        .eq("organization_id", organizationId)
        .eq("site", site)
        .like("week_label", "%:%")
        .order("period_end", { ascending: false })
        .order("period_start", { ascending: false })
        .limit(1);

      if (!latestRows?.length) {
        if (!cancelled) setLatestSiteRoster([]);
        return;
      }

      const latest = latestRows[0];
      let query = supabase
        .from("driver_metrics")
        .select("driver_id,period_start,period_end,driver:drivers!driver_metrics_driver_id_fkey(id,trid,full_name,status)")
        .eq("organization_id", organizationId)
        .eq("site", site)
        .eq("period_start", latest.period_start);
      if (latest.period_end) query = query.eq("period_end", latest.period_end);

      const { data: rosterRows } = await query;
      const byTrid = new Map();
      for (const row of rosterRows || []) {
        const d = row?.driver;
        const trid = String(d?.trid || "").trim().toUpperCase();
        if (!trid) continue;
        byTrid.set(trid, { id: trid, dbId: d?.id || row?.driver_id || null, name: d?.full_name || trid, site });
      }
      if (!cancelled) setLatestSiteRoster([...byTrid.values()]);
    }
    loadLatestSiteRoster().catch(() => !cancelled && setLatestSiteRoster([]));
    return () => { cancelled = true; };
  }, [organizationId, site, refreshKey]);

  const eightWeeks = useMemo(
    () => latestConcessionWeeks(load.rows || [], site, 8),
    [load.rows, site]
  );

  const effectiveWeek = eightWeeks.includes(selectedWeek)
    ? selectedWeek
    : eightWeeks[eightWeeks.length - 1] || "";

  const weeks = useMemo(
    () => range === 1
      ? (effectiveWeek ? [effectiveWeek] : [])
      : range === 4 ? eightWeeks.slice(-4) : eightWeeks,
    [eightWeeks, range, effectiveWeek]
  );

  const historicMatrix = useMemo(
    () => buildFourWeekConcessionMatrix(load.rows || [], site, eightWeeks),
    [load.rows, site, eightWeeks]
  );
  const historicByTrid = useMemo(
    () => new Map(historicMatrix.map((row) => [row.driver_trid, row])),
    [historicMatrix]
  );
  const repeatTrids = useMemo(
    () => new Set(historicMatrix.filter((row) => row.affectedWeeks >= 2).map((row) => row.driver_trid)),
    [historicMatrix]
  );

  const matrix = useMemo(() => {
    if (range === 1) {
      return buildSingleWeekConcessionRows(
        load.rows || [], site, effectiveWeek, latestSiteRoster, drivers
      );
    }
    return buildMultiWeekConcessionRows(
      load.rows || [], site, weeks, latestSiteRoster, drivers
    );
  }, [load.rows, site, weeks, drivers, latestSiteRoster, range, effectiveWeek]);

  const weekly = useMemo(
    () =>
      weeks.map((week, index) => {
        const rows = (load.rows || []).filter(
          (row) =>
            row.site === site &&
            row.week_label === week &&
            Number(row.dnr || 0) > 0
        );
        const total = rows.reduce(
          (sum, row) => sum + Number(row.dnr || 0),
          0
        );
        const affected = new Set(rows.map((row) => row.driver_trid)).size;

        const previousWeek = index > 0 ? weeks[index - 1] : null;
        const previousRows = previousWeek
          ? (load.rows || []).filter(
              (row) =>
                row.site === site &&
                row.week_label === previousWeek &&
                Number(row.dnr || 0) > 0
            )
          : [];
        const previousTotal = previousWeek
          ? previousRows.reduce((sum, row) => sum + Number(row.dnr || 0), 0)
          : null;
        const previousAffected = previousWeek
          ? new Set(previousRows.map((row) => row.driver_trid)).size
          : null;

        return {
          week,
          total,
          affected,
          source: rows[0]?.source_file || "",
          delta: previousTotal == null ? null : total - previousTotal,
          affectedDelta:
            previousAffected == null ? null : affected - previousAffected,
        };
      }),
    [load.rows, site, weeks]
  );

  const latestWeek = weeks[weeks.length - 1] || "";
  const latestItem = weekly[weekly.length - 1] || null;
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return matrix.filter((row) => {
      if (show === "repeat" && !(range === 1 ? repeatTrids.has(row.driver_trid) : row.affectedWeeks >= 2)) return false;
      if (show === "latest" && Number(row.byWeek?.[latestWeek] || 0) <= 0) return false;
      if (show === "zero" && range === 1 && Number(row.byWeek?.[latestWeek] || 0) !== 0) return false;

      if (!needle) return true;
      return `${row.driver_name} ${row.driver_trid}`
        .toLowerCase()
        .includes(needle);
    });
  }, [matrix, query, show, latestWeek, range, repeatTrids]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / CONCESSIONS_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * CONCESSIONS_PAGE_SIZE;
  const pagedFiltered = filtered.slice(pageStart, pageStart + CONCESSIONS_PAGE_SIZE);
  const exportPages = useMemo(
    () => concessionExportPages(filtered, CONCESSIONS_PAGE_SIZE),
    [filtered]
  );

  useEffect(() => {
    setPage(1);
  }, [query, show, range, site, effectiveWeek]);

  useEffect(() => {
    setPreviewReady(false);
    setSaveMessage("");
  }, [query, show, range, site, effectiveWeek, load.rows]);

  const selectedTotal = weekly.reduce((sum, item) => sum + item.total, 0);
  const uniqueAffected = matrix.filter((row) => Number(row.total || 0) > 0).length;
  const repeatDrivers = range === 1
    ? historicMatrix.filter((row) => row.affectedWeeks >= 2).length
    : matrix.filter((row) => row.affectedWeeks >= 2).length;
  const zeroConcessions = range === 1
    ? matrix.filter((row) => Number(row.byWeek?.[latestWeek] || 0) === 0).length
    : 0;
  const latestTotal = latestItem?.total || 0;
  const latestAffected = latestItem?.affected || 0;
  const previousWeek = range === 1 ? eightWeeks[eightWeeks.indexOf(effectiveWeek) - 1] : null;
  const priorRows = previousWeek
    ? (load.rows || []).filter((row) => row.site === site && row.week_label === previousWeek && Number(row.dnr || 0) > 0)
    : [];
  const priorTotal = previousWeek ? priorRows.reduce((sum, row) => sum + Number(row.dnr || 0), 0) : null;
  const priorAffected = previousWeek ? new Set(priorRows.map((row) => row.driver_trid)).size : null;
  const latestDelta = deltaMeta(range === 1 && priorTotal != null ? latestTotal - priorTotal : latestItem?.delta ?? null);
  const affectedDelta = deltaMeta(range === 1 && priorAffected != null ? latestAffected - priorAffected : latestItem?.affectedDelta ?? null);
  const maxWeek = Math.max(1, ...weekly.map((item) => item.total));

  const trend = useMemo(() => {
    const width = 1000;
    const height = 170;
    const left = 38;
    const right = 26;
    const top = 22;
    const bottom = 34;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const denominator = Math.max(1, weekly.length - 1);

    const points = weekly.map((item, index) => ({
      ...item,
      x: left + (index / denominator) * plotWidth,
      y: top + (1 - item.total / maxWeek) * plotHeight,
    }));

    return {
      width,
      height,
      left,
      right,
      top,
      bottom,
      plotHeight,
      points,
      line: points.map((point) => `${point.x},${point.y}`).join(" "),
      area: points.length
        ? `${points.map((point) => `${point.x},${point.y}`).join(" ")} ${points[points.length - 1].x},${top + plotHeight} ${points[0].x},${top + plotHeight}`
        : "",
    };
  }, [weekly, maxWeek]);

  async function saveConcessionsImages() {
    if (!filtered.length || !exportPages.length) return;
    const totalPages = exportPages.length;
    setSaveMessage(totalPages > 1 ? `Creating ${totalPages} pages…` : "Creating image…");
    try {
      if (typeof document !== "undefined" && document.fonts?.ready) {
        await document.fonts.ready;
      }
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await new Promise((resolve) => setTimeout(resolve, 80));

      for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
        const node = exportPageRefs.current[pageIndex];
        if (!node) throw new Error(`Could not prepare page ${pageIndex + 1}.`);
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
          throw new Error(`Could not create page ${pageIndex + 1} correctly.`);
        }

        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        const siteSlug = String(site || "site").toLowerCase().replace(/[^a-z0-9]+/g, "-");
        const rangeSlug = weeks.length ? `${weeks[0]}-${weeks[weeks.length - 1]}`.toLowerCase() : "report";
        anchor.href = url;
        anchor.download =
          totalPages === 1
            ? `concessions-${siteSlug}-${rangeSlug}.png`
            : `concessions-${siteSlug}-${rangeSlug}-p${pageIndex + 1}.png`;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 500);
        if (pageIndex < totalPages - 1) {
          await new Promise((resolve) => setTimeout(resolve, 180));
        }
      }

      setSaveMessage(totalPages > 1 ? `${totalPages} pages saved.` : "Image saved.");
    } catch (error) {
      setSaveMessage(error?.message || "Could not save the concessions image.");
    }
  }

  if (load.loading) return <Loading text="Loading clean concessions history…" />;
  if (load.error) return <ErrorBox error={load.error} />;

  return (
    <div className="cx5">
      <header className="cx5-heading">
        <div>
          <span className="page-kicker">QUALITY INTELLIGENCE</span>
          <h1>Concessions</h1>
          <p>
            Clean DNR history from dedicated Associates Concessions snapshots.
            Track movement, repeat patterns and driver-level trends.
            {range === 1 && <span className="cx5-single-helper"> Select one week and export shareable image pages.</span>}
          </p>
        </div>
        <div className="cx5-heading-meta">
          <div className="cx5-range-switch" aria-label="Concessions range">
            <button
              type="button"
              className={range === 8 ? "active" : ""}
              onClick={() => { setRange(8); setShow("all"); }}
            >
              8-week view
            </button>
            <button
              type="button"
              className={range === 4 ? "active" : ""}
              onClick={() => { setRange(4); setShow("all"); }}
            >
              4-week view
            </button>
            <button
              type="button"
              className={range === 1 ? "active" : ""}
              onClick={() => { setRange(1); setShow("all"); }}
            >
              1-week view
            </button>
          </div>
          <b>Verified snapshots</b>
          {range === 1 && (
            <div className="cx5-single-controls">
              <label className="cx5-week-select">
                <span>Week</span>
                <select
                  aria-label="Select concessions week"
                  value={effectiveWeek}
                  onChange={(event) => setSelectedWeek(event.target.value)}
                >
                  {eightWeeks.map((week) => <option value={week} key={week}>{week}</option>)}
                </select>
              </label>
              <button
                type="button"
                className="cx5-week-generate"
                onClick={() => setPreviewReady(true)}
                disabled={!filtered.length}
              >
                ▧ Generate weekly images
              </button>
              <button
                type="button"
                className="cx5-week-download"
                onClick={saveConcessionsImages}
                disabled={!previewReady || !filtered.length}
              >
                ↓ Download images
              </button>
            </div>
          )}
        </div>
      </header>

      {!site || !weeks.length ? (
        <section className="panel cx5-empty">
          <div className="cx5-empty-icon">!</div>
          <h2>No clean concessions history for this site</h2>
          <p>
            Use the Site selector in the top bar, then import a dedicated
            Associates Concessions CSV for that station.
          </p>
        </section>
      ) : (
        <>
          <section className="cx5-summary">
            <article>
              <div className="cx5-kpi-icon danger" aria-hidden="true">▣</div>
              <div>
                <span>{latestWeek} DNR</span>
                <strong>{latestTotal}</strong>
                <small className={latestDelta.tone}>{latestDelta.label}</small>
              </div>
            </article>
            <article>
              <div className="cx5-kpi-icon blue" aria-hidden="true">◎</div>
              <div>
                <span>{range === 1 ? "Affected drivers" : "Latest affected"}</span>
                <strong>{latestAffected}</strong>
                <small className={affectedDelta.tone}>{affectedDelta.label}</small>
              </div>
            </article>
            <article>
              <div className="cx5-kpi-icon amber" aria-hidden="true">↻</div>
              <div>
                <span>Repeat drivers</span>
                <strong>{repeatDrivers}</strong>
                <small>Affected in 2+ weeks</small>
              </div>
            </article>
            <article>
              <div className="cx5-kpi-icon violet" aria-hidden="true">◉</div>
              <div>
                <span>{range === 1 ? "Zero concessions" : "Unique affected"}</span>
                <strong>{range === 1 ? zeroConcessions : uniqueAffected}</strong>
                <small>{range === 1 ? `No DNR in ${latestWeek} among available roster` : `${selectedTotal} DNR across ${weeks.length} weeks`}</small>
              </div>
            </article>
          </section>

          {range === 1 ? (
            <section className="panel cx5-weekly-preview">
              <div className="cx5-weekly-preview-head">
                <div>
                  <span className="page-kicker">WEEKLY IMAGES</span>
                  <h2>{site} • {latestWeek} concessions</h2>
                  <p>{filtered.length} drivers • {exportPages.length} page(s), 25 per page. Previews reflect the current search and filter.</p>
                </div>
                <span className="cx5-preview-status">{previewReady ? "Ready to download" : "Generate to preview"}</span>
              </div>
              {previewReady ? (
                <div className="cx5-preview-grid" aria-label="Weekly concessions image page previews">
                  {exportPages.map((pageRows, pageIndex) => (
                    <div className="cx5-preview-card" key={pageIndex}>
                      <div className="cx5-preview-banner">
                        <b>{site} • {latestWeek} CONCESSIONS</b>
                        <small>Page {pageIndex + 1} of {exportPages.length}</small>
                      </div>
                      <div className="cx5-preview-column-head"><b>Driver name</b><b>DNR concessions</b></div>
                      <div className="cx5-preview-rows">
                        {pageRows.map((row) => {
                          const value = Number(row.byWeek?.[latestWeek] || 0);
                          return (
                            <div className="cx5-preview-row" key={row.driver_trid}>
                              <span>{row.driver_name}</span>
                              <strong className={weeklyConcessionTone(value)}>{value}</strong>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="cx5-preview-placeholder">
                  Click <b>Generate weekly images</b> to preview all {exportPages.length} export page(s).
                </div>
              )}
            </section>
          ) : <section className="panel cx5-trend">
            <div className="cx5-section-head">
              <div>
                <span className="page-kicker">WEEKLY TREND</span>
                <h2>Total DNR · {weeks.length}-week movement</h2>
              </div>
              <small>Lower DNR is better</small>
            </div>

            <div className="cx5-chart-shell">
              <svg
                viewBox={`0 0 ${trend.width} ${trend.height}`}
                role="img"
                aria-label={`${weeks.length}-week concessions trend`}
              >
                <defs>
                  <linearGradient id="cx5TrendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2d8f79" stopOpacity="0.18" />
                    <stop offset="100%" stopColor="#2d8f79" stopOpacity="0.02" />
                  </linearGradient>
                </defs>

                {[0, 0.25, 0.5, 0.75, 1].map((step) => {
                  const y = trend.top + step * trend.plotHeight;
                  const value = Math.round(maxWeek * (1 - step));
                  return (
                    <g key={step}>
                      <line
                        x1={trend.left}
                        y1={y}
                        x2={trend.width - trend.right}
                        y2={y}
                        className="cx5-gridline"
                      />
                      <text
                        x={trend.left - 10}
                        y={y + 4}
                        textAnchor="end"
                        className="cx5-y-label"
                      >
                        {value}
                      </text>
                    </g>
                  );
                })}

                {trend.area && <polygon points={trend.area} fill="url(#cx5TrendFill)" />}
                {trend.line && <polyline points={trend.line} className="cx5-trend-line" />}

                {trend.points.map((point, index) => {
                  const isLatest = index === trend.points.length - 1;
                  return (
                    <g key={point.week}>
                      {isLatest && (
                        <circle
                          cx={point.x}
                          cy={point.y}
                          r="10"
                          className="cx5-latest-ring"
                        />
                      )}
                      <circle
                        cx={point.x}
                        cy={point.y}
                        r={isLatest ? 5.5 : 4.5}
                        className={isLatest ? "cx5-point latest" : "cx5-point"}
                      />
                      <text
                        x={point.x}
                        y={Math.max(14, point.y - 12)}
                        textAnchor="middle"
                        className="cx5-point-value"
                      >
                        {point.total}
                      </text>
                      <text
                        x={point.x}
                        y={trend.height - 9}
                        textAnchor="middle"
                        className="cx5-x-label"
                      >
                        {point.week}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </section>}

          <section className="panel cx5-matrix">
            <div className="cx5-matrix-head">
              <div>
                <span className="page-kicker">DRIVER DETAIL</span>
                <h2>{range === 1 ? `Driver concessions · ${latestWeek}` : `Driver concessions · last ${weeks.length} weeks`}</h2>
                <p>{range === 1 ? "Selected-week DNR, with 8-week context in the comparison columns." : "Weekly DNR, total exposure and recent movement in one view."}</p>
              </div>

              <div className="cx5-filterbar">
                <label className="cx5-search">
                  <span aria-hidden="true">⌕</span>
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search driver or TRID…"
                  />
                </label>

                <select
                  value={show}
                  onChange={(event) => setShow(event.target.value)}
                  aria-label="Filter concessions drivers"
                >
                  <option value="all">{range === 1 ? "All drivers" : "All affected drivers"}</option>
                  <option value="repeat">Repeat · 2+ weeks</option>
                  <option value="latest">{range === 1 ? "With concessions" : "Latest week only"}</option>
                  {range === 1 && <option value="zero">Zero concessions</option>}
                </select>

                <button
                  type="button"
                  className={`cx5-trid-toggle ${showTrid ? "active" : ""}`}
                  onClick={() => setShowTrid((current) => !current)}
                  aria-pressed={showTrid}
                  title={showTrid ? "Hide TRID column" : "Show TRID column"}
                >
                  <span aria-hidden="true">{showTrid ? "◉" : "⊘"}</span>
                  {showTrid ? "Hide TRID" : "Show TRID"}
                </button>
                {range !== 1 && (
                  <button
                    type="button"
                    className="cx5-save-image"
                    onClick={saveConcessionsImages}
                    disabled={!filtered.length}
                  >
                    <span aria-hidden="true">↓</span>
                    Save Image
                  </button>
                )}
              </div>
            </div>

            <div className="cx5-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Driver</th>
                    {showTrid && <th>TRID</th>}
                    {weeks.map((week) => (
                      <th
                        key={week}
                        className={week === latestWeek ? "latest-col" : ""}
                      >
                        {week}
                      </th>
                    ))}
                    <th>{range === 1 ? "Total (8W)" : "Total"}</th>
                    <th>{range === 1 ? "Trend (8W)" : "Trend"}</th>
                    <th>Avg / wk</th>
                    <th>Weeks</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedFiltered.map((row, index) => {
                    const historic = range === 1 ? (historicByTrid.get(row.driver_trid) || row) : row;
                    const values = (range === 1 ? eightWeeks : weeks).map((week) => Number(historic.byWeek?.[week] || 0));
                    const average = (range === 1 ? eightWeeks : weeks).length
                      ? historic.total / (range === 1 ? eightWeeks : weeks).length : 0;

                    return (
                      <tr key={row.driver_trid}>
                        <td>
                          <span className="cx5-rank">{pageStart + index + 1}</span>
                        </td>
                        <td>
                          <div className="cx5-driver">
                            <b>{row.driver_name}</b>
                            {historic.affectedWeeks >= 3 && <small>Repeat pattern</small>}
                          </div>
                        </td>
                        {showTrid && (
                          <td>
                            <code>{row.driver_trid}</code>
                          </td>
                        )}
                        {weeks.map((week) => {
                          const value = Number(row.byWeek?.[week] || 0);
                          return (
                            <td
                              key={week}
                              className={week === latestWeek ? "latest-col" : ""}
                            >
                              <span className={`cx5-cell ${cellTone(value)}`}>
                                {value}
                              </span>
                            </td>
                          );
                        })}
                        <td>
                          <span className="cx5-total">{historic.total}</span>
                        </td>
                        <td>
                          <MiniTrend values={values} />
                        </td>
                        <td>
                          <span className="cx5-average">{average.toFixed(1)}</span>
                        </td>
                        <td>
                          <span className={historic.affectedWeeks >= 2 ? "cx5-repeat" : "cx5-weeks"}>
                            {historic.affectedWeeks}/{range === 1 ? eightWeeks.length : weeks.length}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="cx5-open"
                            disabled={!row.driver_id}
                            onClick={() =>
                              row.driver_id &&
                              onOpenDriver?.({
                                id: row.driver_trid,
                                dbId: row.driver_id,
                                name: row.driver_name,
                                site,
                                concessions: range === 1 ? Number(row.byWeek?.[latestWeek] || 0) : row.total,
                              })
                            }
                          >
                            Open
                            <span>→</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {!filtered.length && (
                    <tr>
                      <td colSpan={weeks.length + (showTrid ? 8 : 7)}>
                        <div className="cx5-no-results">
                          No drivers match the current filter.
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Compact mobile presentation of the same paginated and filtered rows.
                Desktop table and image exports are left intact. */}
            <div className="cx5-mobile-cards" aria-label="Concessions drivers mobile list">
              {pagedFiltered.map((row, index) => {
                const historic = range === 1 ? (historicByTrid.get(row.driver_trid) || row) : row;
                const historicWeeks = range === 1 ? eightWeeks : weeks;
                const average = historicWeeks.length ? historic.total / historicWeeks.length : 0;
                return (
                  <article className="cx5-mobile-card" key={row.driver_trid}>
                    <div className="cx5-mobile-card-top">
                      <span className="cx5-mobile-rank">#{pageStart + index + 1}</span>
                      <div className="cx5-mobile-driver">
                        <b>{row.driver_name}</b>
                        {historic.affectedWeeks >= 3 && <small>Repeat pattern</small>}
                        {showTrid && <code>{row.driver_trid}</code>}
                      </div>
                      <div className="cx5-mobile-total">
                        <span>{range === 1 ? "8-week total" : "Total DNR"}</span>
                        <strong>{historic.total}</strong>
                      </div>
                    </div>
                    <div className="cx5-mobile-week-grid">
                      {weeks.map((week) => {
                        const value = Number(row.byWeek?.[week] || 0);
                        return (
                          <div className="cx5-mobile-week" key={week}>
                            <span>{week}</span>
                            <strong className={`cx5-cell ${cellTone(value)}`}>{value}</strong>
                          </div>
                        );
                      })}
                    </div>
                    <div className="cx5-mobile-card-bottom">
                      <div className="cx5-mobile-stats">
                        <span>Average <b>{average.toFixed(1)}/wk</b></span>
                        <span>Weeks <b>{historic.affectedWeeks}/{historicWeeks.length}</b></span>
                      </div>
                      <button
                        type="button"
                        className="cx5-open"
                        disabled={!row.driver_id}
                        onClick={() =>
                          row.driver_id &&
                          onOpenDriver?.({
                            id: row.driver_trid,
                            dbId: row.driver_id,
                            name: row.driver_name,
                            site,
                            concessions: range === 1 ? Number(row.byWeek?.[latestWeek] || 0) : row.total,
                          })
                        }
                      >
                        Open <span>→</span>
                      </button>
                    </div>
                  </article>
                );
              })}
              {!filtered.length && (
                <div className="cx5-no-results">No drivers match the current filter.</div>
              )}
            </div>

            {filtered.length > 0 && (
              <div className="cx5-pagination">
                <div className="cx5-page-buttons">
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={currentPage === 1}
                    aria-label="Previous concessions page"
                  >
                    ‹
                  </button>
                  {Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => (
                    <button
                      key={pageNumber}
                      type="button"
                      className={pageNumber === currentPage ? "active" : ""}
                      onClick={() => setPage(pageNumber)}
                    >
                      {pageNumber}
                    </button>
                  ))}
                </div>
                <span>
                  Showing {pageStart + 1}–{Math.min(pageStart + CONCESSIONS_PAGE_SIZE, filtered.length)} of {filtered.length} drivers
                </span>
                <b>25 per page</b>
              </div>
            )}
            {saveMessage && <div className="cx5-save-message">{saveMessage}</div>}
          </section>

          {exportPages.length > 0 && (
            <div className="cx5-export-stack" aria-hidden="true">
              {exportPages.map((pageRows, pageIndex) => (
                <section
                  key={"cx5-export-" + pageIndex}
                  ref={(node) => {
                    exportPageRefs.current[pageIndex] = node;
                  }}
                  className={"cx5-export-page" + (range === 1 ? " weekly" : "")}
                  style={{ width: range === 1 ? "920px" : Math.max(820, 570 + weeks.length * 125) + "px" }}
                >
                  {range === 1 ? (
                    <>
                      <div className="cx5-single-export-title">{site} • {latestWeek} CONCESSIONS</div>
                      <div className="cx5-single-export-header">
                        <b>Driver name</b><b>DNR concessions</b>
                      </div>
                      <div className="cx5-single-export-rows">
                        {pageRows.map((row) => {
                          const value = Number(row.byWeek?.[latestWeek] || 0);
                          return (
                            <div className="cx5-single-export-row" key={row.driver_trid}>
                              <b>{row.driver_name}</b>
                              <strong className={weeklyConcessionTone(value)}>{value}</strong>
                            </div>
                          );
                        })}
                      </div>
                      <footer className="cx5-single-export-foot">
                        <span>{filtered.length} drivers • {latestWeek}</span>
                        <b>Page {pageIndex + 1} of {exportPages.length}</b>
                      </footer>
                    </>
                  ) : (
                    <>
                  <header className="cx5-export-head">
                    <div>
                      <span>DRIVER DETAIL</span>
                      <h1>Driver concessions · last {weeks.length} weeks</h1>
                      <p>Weekly DNR, total exposure and recent movement in one view.</p>
                    </div>
                    <div>
                      <b>Site: {site}</b>
                      <small>{weeks.length ? `${weeks[0]}–${weeks[weeks.length - 1]}` : ""}</small>
                    </div>
                  </header>

                  <div className="cx5-export-table">
                    <div
                      className="cx5-export-row cx5-export-row-head"
                      style={{ gridTemplateColumns: `56px minmax(300px,1fr) repeat(${weeks.length},104px) 112px` }}
                    >
                      <span>#</span>
                      <span>DRIVER</span>
                      {weeks.map((week) => <span key={week}>{week}</span>)}
                      <span>TOTAL</span>
                    </div>

                    {pageRows.map((row, rowIndex) => {
                      const absoluteIndex = pageIndex * CONCESSIONS_PAGE_SIZE + rowIndex;
                      return (
                        <div
                          key={row.driver_trid || absoluteIndex}
                          className="cx5-export-row"
                          style={{ gridTemplateColumns: `56px minmax(300px,1fr) repeat(${weeks.length},104px) 112px` }}
                        >
                          <span className="rank">{absoluteIndex + 1}</span>
                          <b>{row.driver_name}</b>
                          {weeks.map((week) => {
                            const value = Number(row.byWeek?.[week] || 0);
                            return (
                              <span key={week}>
                                <i className={"cx5-export-cell " + cellTone(value)}>{value}</i>
                              </span>
                            );
                          })}
                          <span><i className="cx5-export-total">{row.total}</i></span>
                        </div>
                      );
                    })}
                  </div>

                  <footer className="cx5-export-foot">
                    <span>Total {filtered.length} drivers</span>
                    <b>Page {pageIndex + 1} of {exportPages.length}</b>
                    <span>{site} · {weeks.length ? `${weeks[0]}–${weeks[weeks.length - 1]}` : ""}</span>
                  </footer>
                    </>
                  )}
                </section>
              ))}
            </div>
          )}
        </>
      )}

      <style jsx global>{`
        .cx5{display:grid;gap:12px;padding-bottom:28px;max-width:1600px;margin:0 auto}
        .cx5-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;padding:7px 2px 2px}
        .cx5-heading h1{margin:4px 0 4px;font-size:29px;line-height:1.05;letter-spacing:-.035em;color:#10263a}
        .cx5-heading p{margin:0;max-width:760px;font-size:11px;line-height:1.5;color:#738395}
        .cx5-heading-meta{display:flex;align-items:center;gap:8px;white-space:nowrap}
        .cx5-heading-meta>b{display:inline-flex;align-items:center;height:30px;padding:0 10px;border:1px solid #c8e5da;border-radius:999px;background:#eff9f5;color:#25725f;font-size:9px;font-weight:900;letter-spacing:.07em;text-transform:uppercase}
        .cx5-range-switch{display:flex;align-items:center;gap:4px;padding:3px;border:1px solid #dce5eb;border-radius:999px;background:#fff}
        .cx5-range-switch button{height:24px;padding:0 9px;border:0;border-radius:999px;background:transparent;color:#697c8e;font-size:8px;font-weight:900;letter-spacing:.05em;text-transform:uppercase;cursor:pointer}
        .cx5-range-switch button.active{background:#eef6ff;color:#1d66d2;box-shadow:inset 0 0 0 1px #bcd5ff}


        .cx5-heading-meta{flex-wrap:wrap;justify-content:flex-end;max-width:700px}
        .cx5-range-switch button.active{background:#eef6ff;color:#1d66d2}
        .cx5-single-helper{color:#257b68;font-weight:750}
        .cx5-single-controls{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end;width:100%}
        .cx5-week-select{display:flex;align-items:center;gap:8px;padding:5px 10px;border:1px solid #d5e1e8;border-radius:9px;background:#fff}
        .cx5-week-select>span{font-size:9px;font-weight:850;color:#738497}
        .cx5-week-select select{min-width:80px;border:0;outline:0;font-size:12px;font-weight:900;color:#183249;background:#fff}
        .cx5-week-generate,.cx5-week-download{height:35px;padding:0 13px;border:1px solid #b8d6cc;border-radius:9px;background:#f8fdfb;color:#246b5a;font-weight:850;font-size:10px;cursor:pointer}
        .cx5-week-generate{background:#258e74;border-color:#258e74;color:#fff}
        .cx5-week-generate:disabled,.cx5-week-download:disabled{opacity:.45;cursor:not-allowed}
        .cx5-weekly-preview{padding:15px 16px;border-radius:14px}
        .cx5-weekly-preview-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:12px}
        .cx5-weekly-preview-head h2{margin:2px 0;font-size:17px;color:#193347}
        .cx5-weekly-preview-head p{margin:0;color:#78899b;font-size:10px}
        .cx5-preview-status{padding:7px 10px;border-radius:999px;background:#eaf6f2;color:#267560;font-size:9px;font-weight:850;white-space:nowrap}
        .cx5-preview-placeholder{padding:38px 12px;text-align:center;color:#728498;background:#f7fafc;border:1px dashed #d9e5ea;border-radius:12px;font-size:11px}
        .cx5-preview-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
        .cx5-preview-card{min-width:0;border:1px solid #dce6ec;border-radius:10px;overflow:hidden;background:#fff}
        .cx5-preview-banner{display:flex;align-items:center;justify-content:space-between;gap:6px;background:#152a43;color:#fff;padding:10px}
        .cx5-preview-banner b{font-size:10px;letter-spacing:.02em}
        .cx5-preview-banner small{font-size:8px;white-space:nowrap;color:#cad7e6}
        .cx5-preview-column-head,.cx5-preview-row{display:grid;grid-template-columns:minmax(0,1fr) 110px;align-items:stretch}
        .cx5-preview-column-head{background:#304e6b;color:#fff;font-size:9px}
        .cx5-preview-column-head b{padding:7px}
        .cx5-preview-rows{max-height:250px;overflow:auto}
        .cx5-preview-row{border-bottom:1px solid #e9eef3;min-height:26px;font-size:9px}
        .cx5-preview-row span{padding:6px 7px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .cx5-preview-row strong{display:grid;place-items:center;font-size:11px;font-weight:850}
        .cx5-preview-row .zero,.cx5-single-export-row .zero{background:#daf7e5;color:#126c43}
        .cx5-preview-row .one,.cx5-single-export-row .one{background:#ffe892;color:#6c500c}
        .cx5-preview-row .two,.cx5-single-export-row .two{background:#ffc68d;color:#8b410b}
        .cx5-preview-row .high,.cx5-single-export-row .high{background:#f6a3a3;color:#8f1a24}
        .cx5-export-page.weekly{padding:16px;background:#fff}
        .cx5-single-export-title{padding:22px 16px;background:#142c47;color:#fff;font-size:28px;font-weight:900;letter-spacing:.025em}
        .cx5-single-export-header,.cx5-single-export-row{display:grid;grid-template-columns:1fr 240px}
        .cx5-single-export-header{background:#30506c;color:#fff;font-size:20px}
        .cx5-single-export-header b{padding:12px 14px}
        .cx5-single-export-row{min-height:39px;border-bottom:1px solid #d7dbe0;font-size:19px}
        .cx5-single-export-row>b{padding:8px 13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .cx5-single-export-row strong{display:grid;place-items:center;font-weight:700;font-size:20px}
        .cx5-single-export-foot{display:flex;justify-content:space-between;gap:12px;padding:12px 14px;background:#142c47;color:#fff;font-size:13px}
        @media(max-width:1180px){.cx5-preview-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media(max-width:760px){.cx5-heading-meta{justify-content:flex-start;max-width:100%}.cx5-single-controls{justify-content:flex-start}.cx5-preview-grid{grid-template-columns:1fr}.cx5-weekly-preview-head{flex-direction:column}}

        .cx5-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
        .cx5-summary article{display:flex;align-items:center;gap:12px;min-height:72px;padding:10px 13px;border:1px solid #dfe7ec;border-radius:12px;background:#fff;box-shadow:0 4px 14px rgba(23,48,71,.035)}
        .cx5-kpi-icon{display:grid;place-items:center;flex:0 0 38px;width:38px;height:38px;border-radius:11px;font-size:18px;font-weight:900}
        .cx5-kpi-icon.danger{background:#fff0f1;color:#d74753}
        .cx5-kpi-icon.blue{background:#edf5ff;color:#2e79de}
        .cx5-kpi-icon.amber{background:#fff5e7;color:#e18422}
        .cx5-kpi-icon.violet{background:#f3efff;color:#7f5bd8}
        .cx5-summary span{display:block;font-size:8px;font-weight:900;letter-spacing:.075em;text-transform:uppercase;color:#788898}
        .cx5-summary strong{display:block;margin:3px 0 2px;font-size:22px;line-height:1;color:#132a3e}
        .cx5-summary small{font-size:9px;color:#85929f}
        .cx5-summary small.better{color:#19805e;font-weight:850}
        .cx5-summary small.worse{color:#c34750;font-weight:850}
        .cx5-summary small.neutral{color:#7b8996;font-weight:800}

        .cx5-trend{padding:14px 16px 12px;border-radius:14px}
        .cx5-section-head{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;margin-bottom:4px}
        .cx5-section-head h2{margin:2px 0 0;font-size:16px;color:#173047}
        .cx5-section-head>small{font-size:9px;color:#8995a0}
        .cx5-chart-shell{height:178px;overflow:hidden}
        .cx5-chart-shell svg{display:block;width:100%;height:100%}
        .cx5-gridline{stroke:#e8eef2;stroke-width:1}
        .cx5-y-label,.cx5-x-label{fill:#778797;font-size:9px;font-weight:750}
        .cx5-trend-line{fill:none;stroke:#2d8f79;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}
        .cx5-point{fill:#fff;stroke:#2d8f79;stroke-width:3}
        .cx5-point.latest{fill:#2d8f79}
        .cx5-latest-ring{fill:#2d8f79;opacity:.12}
        .cx5-point-value{fill:#173047;font-size:10px;font-weight:900}

        .cx5-matrix{overflow:hidden;border-radius:14px;padding:0}
        .cx5-matrix-head{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;padding:13px 15px;border-bottom:1px solid #dfe7ec}
        .cx5-matrix-head h2{margin:2px 0 2px;font-size:17px;color:#142b40}
        .cx5-matrix-head p{margin:0;font-size:9px;color:#81909e}
        .cx5-filterbar{display:flex;align-items:center;gap:7px;min-width:min(650px,57vw)}
        .cx5-search{display:flex;align-items:center;gap:7px;flex:1;height:34px;padding:0 10px;border:1px solid #d3dde5;border-radius:8px;background:#fff}
        .cx5-search span{font-size:14px;color:#84929f}
        .cx5-search input{flex:1;min-width:0;border:0;outline:0;background:transparent;color:#173047;font-size:10px}
        .cx5-filterbar select{height:34px;min-width:158px;border:1px solid #d3dde5;border-radius:8px;background:#fff;padding:0 9px;color:#334b60;font-size:9px;font-weight:750}
        .cx5-trid-toggle{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:34px;padding:0 10px;border:1px solid #d3dde5;border-radius:8px;background:#fff;color:#5f7486;font-size:9px;font-weight:850;white-space:nowrap;cursor:pointer}
        .cx5-trid-toggle.active{border-color:#bfd7d0;background:#f3faf7;color:#28735f}
        .cx5-save-image{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:34px;padding:0 13px;border:1px solid #138a72;border-radius:8px;background:#159b81;color:#fff;font-size:9px;font-weight:900;white-space:nowrap;cursor:pointer;box-shadow:0 4px 10px rgba(21,155,129,.14)}
        .cx5-save-image:hover{background:#11856f}
        .cx5-save-image:disabled{opacity:.45;cursor:not-allowed}

        .cx5-table-wrap{max-height:610px;overflow:auto;border-top:0}
        .cx5-table-wrap table{width:100%;min-width:1180px;border-collapse:separate;border-spacing:0}
        .cx5-table-wrap th{position:sticky;top:0;z-index:2;padding:8px 9px;background:#f7f9fa;border-right:1px solid #e0e8ed;border-bottom:1px solid #d7e1e7;text-align:center;font-size:7px;font-weight:900;letter-spacing:.065em;text-transform:uppercase;color:#718292;white-space:nowrap}
        .cx5-table-wrap th:nth-child(2){text-align:left}
        .cx5-table-wrap th:last-child{border-right:0}
        .cx5-table-wrap th.latest-col,.cx5-table-wrap td.latest-col{background:#f3faf7}
        .cx5-table-wrap td{padding:6px 9px;border-right:1px solid #e6edf2;border-bottom:1px solid #e6edf2;font-size:10px;color:#253b50;vertical-align:middle;text-align:center;background:#fff}
        .cx5-table-wrap td:nth-child(2){text-align:left}
        .cx5-table-wrap td:last-child{border-right:0}
        .cx5-table-wrap tbody tr:hover td{background:#fafcfd}
        .cx5-table-wrap tbody tr:hover td.latest-col{background:#eff8f4}
        .cx5-rank{display:grid;place-items:center;width:24px;height:24px;margin:0 auto;border-radius:7px;background:#edf2f5;color:#486075;font-size:9px;font-weight:850}
        .cx5-driver{display:grid;gap:1px;min-width:145px}
        .cx5-driver b{font-size:10px;color:#13283c;white-space:nowrap}
        .cx5-driver small{font-size:7px;font-weight:800;color:#a45a61;text-transform:uppercase;letter-spacing:.04em}
        .cx5-table-wrap code{font-size:8px;background:#f1f4f6;color:#68798a;border-radius:5px;padding:3px 5px;white-space:nowrap}
        .cx5-cell{display:inline-flex;align-items:center;justify-content:center;min-width:29px;height:23px;border-radius:6px;font-size:9px;font-weight:900}
        .cx5-cell.zero{background:#cdf4de;color:#08683f}
        .cx5-cell.one{background:#fff0a8;color:#725000}
        .cx5-cell.two{background:#ffc58f;color:#a43b00}
        .cx5-cell.high{background:#ffb3b3;color:#a31313}
        .cx5-total{display:inline-flex;align-items:center;justify-content:center;min-width:34px;height:24px;padding:0 6px;border-radius:7px;background:#eaf0f4;color:#1a364d;font-weight:900}
        .cx5-average{font-weight:850;color:#415a70}
        .cx5-weeks,.cx5-repeat{display:inline-flex;align-items:center;justify-content:center;min-width:34px;height:22px;padding:0 6px;border-radius:999px;font-size:8px;font-weight:850}
        .cx5-weeks{background:#eff3f6;color:#617486}
        .cx5-repeat{background:#fff0df;color:#986119}
        .cx5-mini-trend{display:flex;align-items:center;justify-content:center;gap:5px;min-width:118px}
        .cx5-mini-trend svg{width:78px;height:23px;overflow:visible}
        .cx5-mini-trend polyline{fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
        .cx5-mini-trend circle{fill:#fff;stroke:currentColor;stroke-width:1.4}
        .cx5-mini-trend small{min-width:32px;font-size:8px;font-weight:900;text-align:left}
        .cx5-mini-trend.better{color:#228061}
        .cx5-mini-trend.worse{color:#c74651}
        .cx5-mini-trend.neutral{color:#7d8b97}
        .cx5-open{display:inline-flex;align-items:center;gap:5px;border:1px solid #d3dee6;background:#fff;border-radius:7px;height:27px;padding:0 8px;color:#2b7162;font-size:8px;font-weight:850;cursor:pointer}
        .cx5-open:disabled{opacity:.4;cursor:not-allowed}
        .cx5-no-results{padding:28px;text-align:center;color:#83909c}

        .cx5-pagination{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:14px;padding:11px 15px;border-top:1px solid #e0e8ed;background:#fff}
        .cx5-page-buttons{display:flex;gap:5px}
        .cx5-page-buttons button{display:grid;place-items:center;min-width:29px;height:29px;padding:0 7px;border:1px solid #d8e2e8;border-radius:7px;background:#fff;color:#52697d;font-size:9px;font-weight:900;cursor:pointer}
        .cx5-page-buttons button.active{background:#2e7de9;border-color:#2e7de9;color:#fff}
        .cx5-page-buttons button:disabled{opacity:.35;cursor:not-allowed}
        .cx5-pagination>span{text-align:right;color:#708192;font-size:9px}
        .cx5-pagination>b{height:29px;display:flex;align-items:center;padding:0 10px;border:1px solid #d8e2e8;border-radius:7px;color:#41586c;font-size:9px;background:#fff}
        .cx5-save-message{padding:0 15px 11px;text-align:right;color:#2d7a68;font-size:9px;font-weight:800;background:#fff}

        .cx5-export-stack{position:fixed;left:-20000px;top:0;transform:none;z-index:-1;pointer-events:none}
        .cx5-export-page{padding:30px;background:#eef3f5;color:#13253a;font-family:Arial,Helvetica,sans-serif;box-sizing:border-box}
        .cx5-export-head{display:flex;justify-content:space-between;align-items:flex-start;gap:22px;padding:24px 26px;border:1px solid #d7e2e8;border-radius:18px;background:#fff}
        .cx5-export-head>div:first-child>span{font-size:14px;font-weight:900;letter-spacing:1.6px;color:#2d8b78}
        .cx5-export-head h1{margin:7px 0 5px;font-size:34px;line-height:1.04;color:#10243a}
        .cx5-export-head p{margin:0;font-size:14px;color:#687b8e}
        .cx5-export-head>div:last-child{display:grid;gap:5px;text-align:right;color:#344d62}
        .cx5-export-head>div:last-child b{font-size:14px}
        .cx5-export-head>div:last-child small{font-size:13px;color:#77899a}
        .cx5-export-table{margin-top:17px;overflow:hidden;border:1px solid #d9e3e9;border-radius:14px;background:#fff}
        .cx5-export-row{display:grid;align-items:center;min-height:54px;border-bottom:1px solid #edf1f4}
        .cx5-export-row:last-child{border-bottom:0}
        .cx5-export-row>*{padding:0 10px;box-sizing:border-box}
        .cx5-export-row>span{text-align:center}
        .cx5-export-row>b{font-size:16px;line-height:1.15;color:#17283d;font-weight:800}
        .cx5-export-row .rank{font-size:13px;font-weight:900;color:#607589}
        .cx5-export-row-head{min-height:48px;background:#f6f8fa;border-bottom:1px solid #dfe7ec}
        .cx5-export-row-head>*{font-size:11px;font-weight:900;letter-spacing:.7px;color:#718294}
        .cx5-export-row-head>span:nth-child(2){text-align:left}
        .cx5-export-cell{display:inline-flex;align-items:center;justify-content:center;min-width:54px;height:34px;border-radius:9px;font-style:normal;font-size:15px;font-weight:900}
        .cx5-export-cell.zero{background:#cdf4de;color:#08683f}
        .cx5-export-cell.one{background:#fff0a8;color:#725000}
        .cx5-export-cell.two{background:#ffc58f;color:#a43b00}
        .cx5-export-cell.high{background:#ffb3b3;color:#a31313}
        .cx5-export-total{display:inline-flex;align-items:center;justify-content:center;min-width:58px;height:35px;border-radius:9px;background:#eaf0f4;color:#1a364d;font-style:normal;font-size:15px;font-weight:900}
                .cx5-export-foot{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:14px;margin-top:14px;padding:15px 18px;border-radius:12px;background:#16304a;color:#fff;font-size:12px}
        .cx5-export-foot b{text-align:center}
        .cx5-export-foot span:last-child{text-align:right}

        .cx5-empty{display:grid;justify-items:center;text-align:center;gap:7px;padding:44px;border-radius:14px}
        .cx5-empty-icon{display:grid;place-items:center;width:40px;height:40px;border-radius:50%;background:#f0f5f7;color:#5a7184;font-weight:900}
        .cx5-empty h2{margin:3px 0 0;font-size:18px}
        .cx5-empty p{margin:0;max-width:600px;color:#748493;font-size:11px;line-height:1.5}


        /* Concessions high-contrast presentation only: no logic changes */
        .cx5{color:#111827}
        .cx5 .cx5-matrix-head{padding:16px 17px 14px}
        .cx5 .cx5-matrix-head h2{font-size:19px;font-weight:900;color:#101c2d;letter-spacing:-.015em}
        .cx5 .cx5-matrix-head p{font-size:11px;color:#45576a;font-weight:600}
        .cx5 .page-kicker{color:#087a65;font-size:10px;font-weight:900}
        .cx5 .cx5-search{height:37px;border-color:#c9d7e2}
        .cx5 .cx5-search span{color:#30445b;font-size:17px}
        .cx5 .cx5-search input{font-size:12px;font-weight:650;color:#111827}
        .cx5 .cx5-search input::placeholder{color:#617389;opacity:1}
        .cx5 .cx5-filterbar select{height:37px;font-size:11px;font-weight:800;color:#172a40;border-color:#c9d7e2}
        .cx5 .cx5-trid-toggle{height:37px;font-size:11px;font-weight:850;color:#264457}
        .cx5 .cx5-save-image{height:37px;font-size:11px;font-weight:900;background:#0b8e75}
        .cx5 .cx5-table-wrap table{min-width:1450px}
        .cx5 .cx5-table-wrap th{padding:11px 9px;font-size:10px;font-weight:900;letter-spacing:.04em;color:#29415a;background:#f3f7fa;border-color:#dce5ed}
        .cx5 .cx5-table-wrap th.latest-col{background:#e8f5ef;color:#145b49}
        .cx5 .cx5-table-wrap td{padding:7px 9px;font-size:12px;color:#111827;border-color:#e2eaf0}
        .cx5 .cx5-table-wrap td.latest-col{background:#f0faf5}
        .cx5 .cx5-driver{gap:2px;min-width:185px}
        .cx5 .cx5-driver b{font-size:13px;font-weight:900;color:#101827;letter-spacing:-.015em;white-space:normal;line-height:1.25}
        .cx5 .cx5-driver small{font-size:9px;font-weight:950;color:#b4232c;letter-spacing:.025em}
        .cx5 .cx5-rank{width:29px;height:29px;font-size:11px;font-weight:900;color:#243a50;background:#eaf0f4}
        .cx5 .cx5-table-wrap code{font-size:10px;font-weight:750;color:#33465c;background:#edf2f5}
        .cx5 .cx5-cell{min-width:34px;height:29px;font-size:12px;font-weight:950;color:#111827;border-radius:7px}
        .cx5 .cx5-cell.zero{background:#c8f5dc;color:#111827}
        .cx5 .cx5-cell.one{background:#ffeb91;color:#111827}
        .cx5 .cx5-cell.two{background:#ffc391;color:#111827}
        .cx5 .cx5-cell.high{background:#f8a2a7;color:#111827}
        .cx5 .cx5-total{min-width:40px;height:29px;font-size:12px;font-weight:950;color:#132437;background:#dfeefb}
        .cx5 .cx5-average{font-size:12px;font-weight:950;color:#15273d}
        .cx5 .cx5-weeks,.cx5 .cx5-repeat{min-width:43px;height:27px;font-size:10px;font-weight:950;color:#39240d}
        .cx5 .cx5-repeat{background:#ffe7cc}
        .cx5 .cx5-mini-trend{min-width:120px}
        .cx5 .cx5-mini-trend small{font-size:10px;font-weight:950}
        .cx5 .cx5-open{height:32px;padding:0 10px;font-size:11px;font-weight:900;border-color:#9ccfb8;color:#14583f}
        .cx5 .cx5-pagination>span,.cx5 .cx5-pagination>b{font-size:11px;font-weight:800;color:#243d55}
        .cx5 .cx5-page-buttons button{font-size:11px;font-weight:900;min-width:33px;height:33px;color:#283e58}
        .cx5 .cx5-page-buttons button.active{color:#fff}
        .cx5 .cx5-save-message{font-size:11px;font-weight:850}
        .cx5 .cx5-preview-banner b{font-size:12px}
        .cx5 .cx5-preview-column-head{font-size:11px}
        .cx5 .cx5-preview-row{font-size:11px;color:#111827}
        .cx5 .cx5-preview-row strong{font-size:13px;color:#111827}
        .cx5 .cx5-preview-row .zero,.cx5 .cx5-preview-row .one,.cx5 .cx5-preview-row .two,.cx5 .cx5-preview-row .high{color:#111827}
        .cx5 .cx5-export-row>b{font-size:18px;font-weight:900;color:#101827}
        .cx5 .cx5-export-cell{font-size:17px;font-weight:950;color:#111827}
        .cx5 .cx5-export-cell.zero,.cx5 .cx5-export-cell.one,.cx5 .cx5-export-cell.two,.cx5 .cx5-export-cell.high{color:#111827}
        .cx5 .cx5-export-total{font-size:17px;font-weight:950;color:#111827}
        .cx5 .cx5-single-export-row>b{font-weight:900;color:#101827}
        .cx5 .cx5-single-export-row strong{font-weight:950;color:#111827}
        .cx5 .cx5-single-export-row .zero,.cx5 .cx5-single-export-row .one,.cx5 .cx5-single-export-row .two,.cx5 .cx5-single-export-row .high{color:#111827}

        @media(max-width:1180px){
          .cx5-summary{grid-template-columns:1fr 1fr}
          .cx5-matrix-head{align-items:stretch;flex-direction:column}
          .cx5-filterbar{min-width:0;width:100%}
        }
        @media(max-width:760px){
          .cx5-heading{align-items:flex-start;flex-direction:column}
          .cx5-heading-meta{align-self:flex-start;flex-wrap:wrap}
          .cx5-summary{grid-template-columns:1fr 1fr}
          .cx5-filterbar{flex-wrap:wrap}
          .cx5-search{flex:1 1 100%}
          .cx5-filterbar select{flex:1}
          .cx5-trid-toggle{flex:0 0 auto}
          .cx5-save-image{flex:1}
          .cx5-pagination{grid-template-columns:1fr;justify-items:start}
          .cx5-pagination>span{text-align:left}
        }

        /* Mobile list: same data and filtering as desktop, presented vertically. */
        .cx5-mobile-cards{display:none}
        @media(max-width:760px){
          .cx5{width:100%;max-width:100%;min-width:0;gap:11px}
          .cx5-heading,.cx5-heading>div,.cx5-matrix,.cx5-trend,.cx5-summary,.cx5-weekly-preview{min-width:0}
          .cx5-heading{gap:12px}
          .cx5-heading h1{font-size:25px}
          .cx5-heading p{font-size:12px;line-height:1.5}
          .cx5-heading-meta{width:100%;justify-content:flex-start}
          .cx5-range-switch{width:100%;justify-content:space-between}
          .cx5-range-switch button{font-size:10px;padding:0 9px;height:32px;flex:1}
          .cx5-heading-meta>b{height:28px}
          .cx5-single-controls{width:100%;justify-content:flex-start}
          .cx5-week-select{flex:1;min-width:130px}
          .cx5-week-generate,.cx5-week-download{flex:1 1 145px;min-height:39px}
          .cx5-summary{grid-template-columns:repeat(2,minmax(0,1fr))}
          .cx5-summary article{min-width:0;padding:12px 10px;gap:8px}
          .cx5-summary span{font-size:9px}
          .cx5-summary strong{font-size:23px}
          .cx5-summary small{font-size:10px}
          .cx5-matrix-head{padding:14px 12px}
          .cx5-matrix-head h2{font-size:19px}
          .cx5-matrix-head p{font-size:11px}
          .cx5-filterbar{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));min-width:0;width:100%;gap:8px}
          .cx5-search{grid-column:1/-1;width:100%;min-width:0;box-sizing:border-box}
          .cx5-filterbar select{min-width:0;width:100%}
          .cx5-trid-toggle,.cx5-save-image{height:39px;font-size:11px;min-width:0;width:100%}
          .cx5-table-wrap{display:none}
          .cx5-mobile-cards{display:grid;gap:10px;padding:12px;background:#f3f7fa;min-width:0}
          .cx5-mobile-card{min-width:0;overflow:hidden;border:1px solid #dbe5ec;border-radius:13px;background:#fff;box-shadow:0 2px 8px rgba(21,42,58,.045)}
          .cx5-mobile-card-top{display:flex;gap:9px;align-items:flex-start;padding:12px}
          .cx5-mobile-rank{display:grid;place-items:center;flex:0 0 31px;height:31px;border-radius:9px;background:#eaf0f5;color:#23394d;font-size:11px;font-weight:900}
          .cx5-mobile-driver{min-width:0;flex:1;display:grid;gap:3px;padding-top:1px}
          .cx5-mobile-driver b{font-size:14px;font-weight:900;line-height:1.3;color:#101827;overflow-wrap:anywhere}
          .cx5-mobile-driver small{font-size:9px;font-weight:900;letter-spacing:.025em;color:#b4232c;text-transform:uppercase}
          .cx5-mobile-driver code{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;font-weight:700;color:#33465c}
          .cx5-mobile-total{display:grid;gap:4px;justify-items:center;flex:0 0 73px;background:#e8f2fb;padding:8px 7px;border-radius:10px}
          .cx5-mobile-total span{font-size:9px;font-weight:800;color:#3d5672;text-align:center}
          .cx5-mobile-total strong{font-size:23px;line-height:1;font-weight:950;color:#10243a}
          .cx5-mobile-week-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;padding:0 12px 12px}
          .cx5-mobile-week{min-width:0;display:grid;gap:4px;text-align:center}
          .cx5-mobile-week>span{font-size:10px;font-weight:900;color:#455c72}
          .cx5-mobile-week .cx5-cell{display:grid;place-items:center;width:100%;height:35px;min-width:0;font-size:14px;box-sizing:border-box}
          .cx5-mobile-card-bottom{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 12px;border-top:1px solid #e7edf3}
          .cx5-mobile-stats{display:flex;flex-wrap:wrap;gap:10px;font-size:10px;color:#597083}
          .cx5-mobile-stats b{color:#132b40;font-weight:900}
          .cx5-mobile-card-bottom .cx5-open{height:34px;min-width:69px;justify-content:center}
          .cx5-pagination{grid-template-columns:1fr;gap:10px;padding:12px}
          .cx5-page-buttons{width:100%;flex-wrap:wrap;gap:6px}
          .cx5-page-buttons button{min-width:36px;min-height:36px}
          .cx5-pagination>span{justify-self:start;text-align:left}
          .cx5-pagination>b{justify-self:start}
          .cx5-trend{min-width:0;overflow:hidden}
          .cx5-section-head{align-items:flex-start}
          .cx5-section-head h2{font-size:15px}
        }
        @media(max-width:365px){
          .cx5-mobile-week-grid{gap:5px;padding-left:9px;padding-right:9px}
          .cx5-mobile-card-top{gap:7px;padding:10px}
          .cx5-mobile-total{flex-basis:65px}
          .cx5-mobile-driver b{font-size:13px}
        }

        @media(max-width:520px){
          .cx5-summary{grid-template-columns:1fr}
          .cx5-chart-shell{height:160px}
        }
      `}</style>
    </div>
  );
}
