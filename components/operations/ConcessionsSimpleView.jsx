"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildFourWeekConcessionMatrix,
  fetchConcessionSnapshots,
} from "../../lib/data/concessions";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { ErrorBox, Loading } from "./OperationalShared";

const cellTone = (value) => {
  const count = Number(value || 0);
  if (count === 0) return "zero";
  if (count === 1) return "one";
  if (count === 2) return "two";
  return "high";
};

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
}) {
  const [load, setLoad] = useState({ loading: true, error: "", rows: [] });
  const [query, setQuery] = useState("");
  const [show, setShow] = useState("all");
  const [range, setRange] = useState(8);
  const [showTrid, setShowTrid] = useState(true);

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

  const eightWeeks = useMemo(
    () => latestConcessionWeeks(load.rows || [], site, 8),
    [load.rows, site]
  );

  const weeks = useMemo(
    () => (range === 4 ? eightWeeks.slice(-4) : eightWeeks),
    [eightWeeks, range]
  );

  const matrix = useMemo(
    () => buildFourWeekConcessionMatrix(load.rows || [], site, weeks),
    [load.rows, site, weeks]
  );

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
      if (show === "repeat" && row.affectedWeeks < 2) return false;
      if (show === "latest" && Number(row.byWeek?.[latestWeek] || 0) <= 0) {
        return false;
      }

      if (!needle) return true;
      return `${row.driver_name} ${row.driver_trid}`
        .toLowerCase()
        .includes(needle);
    });
  }, [matrix, query, show, latestWeek]);

  const selectedTotal = weekly.reduce((sum, item) => sum + item.total, 0);
  const uniqueAffected = matrix.length;
  const repeatDrivers = matrix.filter((row) => row.affectedWeeks >= 2).length;
  const latestTotal = latestItem?.total || 0;
  const latestAffected = latestItem?.affected || 0;
  const latestDelta = deltaMeta(latestItem?.delta ?? null);
  const affectedDelta = deltaMeta(latestItem?.affectedDelta ?? null);
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
          </p>
        </div>
        <div className="cx5-heading-meta">
          <div className="cx5-range-switch" aria-label="Concessions range">
            <button
              type="button"
              className={range === 8 ? "active" : ""}
              onClick={() => setRange(8)}
            >
              8-week view
            </button>
            <button
              type="button"
              className={range === 4 ? "active" : ""}
              onClick={() => setRange(4)}
            >
              4-week view
            </button>
          </div>
          <b>Verified snapshots</b>
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
                <span>Latest affected</span>
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
                <span>Unique affected</span>
                <strong>{uniqueAffected}</strong>
                <small>{selectedTotal} DNR across {weeks.length} weeks</small>
              </div>
            </article>
          </section>

          <section className="panel cx5-trend">
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
          </section>

          <section className="panel cx5-matrix">
            <div className="cx5-matrix-head">
              <div>
                <span className="page-kicker">DRIVER DETAIL</span>
                <h2>Driver concession matrix · last {weeks.length} weeks</h2>
                <p>
                  Weekly DNR, total exposure and recent movement in one view.
                </p>
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
                  <option value="all">All affected drivers</option>
                  <option value="repeat">Repeat · 2+ weeks</option>
                  <option value="latest">Latest week only</option>
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
                    <th>Total</th>
                    <th>Trend</th>
                    <th>Avg / wk</th>
                    <th>Weeks</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row, index) => {
                    const values = weeks.map((week) => Number(row.byWeek?.[week] || 0));
                    const average = weeks.length ? row.total / weeks.length : 0;

                    return (
                      <tr key={row.driver_trid}>
                        <td>
                          <span className="cx5-rank">{index + 1}</span>
                        </td>
                        <td>
                          <div className="cx5-driver">
                            <b>{row.driver_name}</b>
                            {row.affectedWeeks >= 3 && <small>Repeat pattern</small>}
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
                          <span className="cx5-total">{row.total}</span>
                        </td>
                        <td>
                          <MiniTrend values={values} />
                        </td>
                        <td>
                          <span className="cx5-average">{average.toFixed(1)}</span>
                        </td>
                        <td>
                          <span className={row.affectedWeeks >= 2 ? "cx5-repeat" : "cx5-weeks"}>
                            {row.affectedWeeks}/{weeks.length}
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
                                concessions: row.total,
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
          </section>
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
        .cx5-cell.zero{background:#e9f8f0;color:#2d7a5b}
        .cx5-cell.one{background:#f1f7df;color:#697c2a}
        .cx5-cell.two{background:#fff0cf;color:#95630b}
        .cx5-cell.high{background:#f9dfe2;color:#a43f49}
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

        .cx5-empty{display:grid;justify-items:center;text-align:center;gap:7px;padding:44px;border-radius:14px}
        .cx5-empty-icon{display:grid;place-items:center;width:40px;height:40px;border-radius:50%;background:#f0f5f7;color:#5a7184;font-weight:900}
        .cx5-empty h2{margin:3px 0 0;font-size:18px}
        .cx5-empty p{margin:0;max-width:600px;color:#748493;font-size:11px;line-height:1.5}

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
        }
        @media(max-width:520px){
          .cx5-summary{grid-template-columns:1fr}
          .cx5-chart-shell{height:160px}
        }
      `}</style>
    </div>
  );
}
