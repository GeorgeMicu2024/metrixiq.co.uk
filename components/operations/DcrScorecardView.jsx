"use client";

import { useEffect, useMemo, useState } from "react";
import { dcrSourceLabel, fetchDcrScorecardRows } from "../../lib/data/dcr";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { ErrorBox, Loading, dname, n, openShape, pct, trid, weekNo } from "./OperationalShared";

const TARGET = 99.2;
const rowWeek = (row) => {
  const raw = String(row?.raw_data?.calendar_week || row?.week_label || "");
  const match = raw.match(/W\d+/i);
  return match ? match[0].toUpperCase() : raw;
};

const tone = (value) => {
  const score = Number(value);
  if (score >= 99.8) return "excellent";
  if (score >= TARGET) return "good";
  if (score >= 98) return "watch";
  return "critical";
};

const status = (value) => {
  const score = Number(value);
  if (score >= 99.8) return "Excellent";
  if (score >= TARGET) return "On target";
  if (score >= 98) return "Watch";
  return "Below target";
};

const avg = (rows) => {
  const values = rows.map((row) => n(row.dcr)).filter((value) => value != null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
};

export default function DcrScorecardView({
  organizationId,
  onOpenDriver,
  siteFilter = "all",
  refreshKey = 0,
}) {
  const [load, setLoad] = useState({ loading: true, error: "", rows: [] });
  const [week, setWeek] = useState("");
  const [query, setQuery] = useState("");
  const [sortDir, setSortDir] = useState("asc");
  const [selectedId, setSelectedId] = useState("");
  const [showTrid, setShowTrid] = useState(true);
  const [showTrend, setShowTrend] = useState(true);
  const [showDistribution, setShowDistribution] = useState(true);

  useEffect(() => {
    let alive = true;
    if (!organizationId) {
      setLoad({ loading: false, error: "", rows: [] });
      return () => {};
    }

    (async () => {
      try {
        setLoad((current) => ({ ...current, loading: true, error: "" }));
        const rows = await fetchDcrScorecardRows(
          getSupabaseBrowserClient(),
          organizationId,
          siteFilter
        );
        if (alive) setLoad({ loading: false, error: "", rows });
      } catch (error) {
        if (alive) {
          setLoad({
            loading: false,
            error: error?.message || "Could not load DCR scorecard data.",
            rows: [],
          });
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [organizationId, siteFilter, refreshKey]);

  const weeks = useMemo(
    () =>
      [...new Set((load.rows || []).map(rowWeek).filter((value) => /^W\d+$/i.test(value)))]
        .sort((a, b) => weekNo(b) - weekNo(a)),
    [load.rows]
  );

  const selectedWeek = week && weeks.includes(week) ? week : weeks[0] || "";

  const rows = useMemo(() => {
    const byDriver = new Map();
    for (const row of load.rows || []) {
      if (rowWeek(row) !== selectedWeek) continue;
      const current = byDriver.get(row.driver_id);
      if (!current || String(row.created_at || "") > String(current.created_at || "")) {
        byDriver.set(row.driver_id, row);
      }
    }
    return [...byDriver.values()];
  }, [load.rows, selectedWeek]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows
      .filter((row) => {
        const haystack = [dname(row.drivers), trid(row.drivers), dcrSourceLabel(row)]
          .join(" ")
          .toLowerCase();
        return !needle || haystack.includes(needle);
      })
      .sort((a, b) => {
        const delta = Number(a.dcr) - Number(b.dcr);
        return sortDir === "asc" ? delta : -delta;
      });
  }, [rows, query, sortDir]);

  useEffect(() => {
    if (!visible.length) {
      setSelectedId("");
      return;
    }
    if (!visible.some((row) => row.driver_id === selectedId)) {
      setSelectedId(visible[0].driver_id);
    }
  }, [visible, selectedId]);

  const active =
    visible.find((row) => row.driver_id === selectedId) ||
    visible[0] ||
    null;

  const average = avg(rows);
  const onTarget = rows.filter((row) => Number(row.dcr) >= TARGET).length;
  const below = rows.length - onTarget;
  const perfect = rows.filter((row) => Number(row.dcr) >= 100).length;

  const weeklyTrend = useMemo(
    () =>
      weeks
        .slice(0, 8)
        .reverse()
        .map((weekLabel) => {
          const weekRows = (load.rows || []).filter((row) => rowWeek(row) === weekLabel);
          return { week: weekLabel, value: avg(weekRows) };
        }),
    [weeks, load.rows]
  );

  const trendChart = useMemo(() => {
    const width = 720;
    const height = 132;
    const left = 22;
    const right = 18;
    const top = 18;
    const bottom = 27;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const denominator = Math.max(1, weeklyTrend.length - 1);
    const values = weeklyTrend.map((item) => Number(item.value)).filter(Number.isFinite);
    const minValue = values.length ? Math.min(...values, 96) : 96;
    const maxValue = 100;
    const spread = Math.max(0.5, maxValue - minValue);

    const points = weeklyTrend.map((item, index) => {
      const value = Number.isFinite(Number(item.value)) ? Number(item.value) : minValue;
      return {
        ...item,
        x: left + (index / denominator) * plotWidth,
        y: top + ((maxValue - value) / spread) * plotHeight,
      };
    });

    const targetY = top + ((maxValue - TARGET) / spread) * plotHeight;
    const latest = points[points.length - 1] || null;
    const previous = points[points.length - 2] || null;
    const delta =
      latest?.value != null && previous?.value != null
        ? Number(latest.value) - Number(previous.value)
        : null;

    return {
      width,
      height,
      left,
      right,
      top,
      bottom,
      plotHeight,
      minValue,
      maxValue,
      points,
      targetY,
      line: points.map((point) => `${point.x},${point.y}`).join(" "),
      area: points.length
        ? `${points.map((point) => `${point.x},${point.y}`).join(" ")} ${points[points.length - 1].x},${top + plotHeight} ${points[0].x},${top + plotHeight}`
        : "",
      latest,
      delta,
    };
  }, [weeklyTrend]);

  const distribution = {
    onTarget,
    below,
    perfect,
    onTargetPct: rows.length ? (onTarget / rows.length) * 100 : 0,
    belowPct: rows.length ? (below / rows.length) * 100 : 0,
    perfectPct: rows.length ? (perfect / rows.length) * 100 : 0,
  };

  if (load.loading) return <Loading text="Loading DCR scorecard data…" />;
  if (load.error) return <ErrorBox error={load.error} />;

  return (
    <div className="iadcpro dcrscorecard">
      <header className="iadcpro-hero">
        <div>
          <span className="page-kicker">DELIVERY PERFORMANCE</span>
          <h1>DCR — Delivery Completion Rate</h1>
          <p>
            Weekly DCR is read directly from imported DSP scorecard evidence.
            Daily operational records are excluded from this view.
          </p>
        </div>
        <div className="iadcpro-target">
          <span>DCR TARGET</span>
          <strong>{TARGET}%+</strong>
        </div>
      </header>

      <section className="iadcpro-controlbar dcrscorecard-controls">
        <label>
          <span>Scorecard week</span>
          <select value={selectedWeek} onChange={(event) => setWeek(event.target.value)}>
            {weeks.length ? (
              weeks.map((item) => <option key={item}>{item}</option>)
            ) : (
              <option value="">No scorecard week</option>
            )}
          </select>
        </label>

        <div className="iadcpro-search">
          <span aria-hidden="true">⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={showTrid ? "Search driver or TRID…" : "Search driver…"}
          />
        </div>

        <button
          type="button"
          className={"dcr-ui-toggle " + (showTrid ? "active" : "")}
          onClick={() => setShowTrid((current) => !current)}
          aria-pressed={showTrid}
          title={showTrid ? "Hide TRID column" : "Show TRID column"}
        >
          <span aria-hidden="true" />
          {showTrid ? "Hide TRID" : "Show TRID"}
        </button>

        <select value={sortDir} onChange={(event) => setSortDir(event.target.value)}>
          <option value="asc">DCR · Lowest first</option>
          <option value="desc">DCR · Highest first</option>
        </select>

        <span className="dcrscorecard-source">
          Source: DSP Scorecard · {selectedWeek || "No week"}
        </span>
      </section>

      <section className="iadcpro-kpis dcr-compact-kpis">
        <article>
          <i className="dcr-kpi-icon drivers">◎</i>
          <div>
            <span>Total Drivers</span>
            <strong>{rows.length}</strong>
            <small>{selectedWeek || "No week"}</small>
          </div>
        </article>
        <article>
          <i className="dcr-kpi-icon average">▥</i>
          <div>
            <span>DCR Average</span>
            <strong>{average == null ? "—" : pct(average, 2)}</strong>
            <small>Target ≥ {TARGET}%</small>
          </div>
        </article>
        <article className="good">
          <i className="dcr-kpi-icon target">◎</i>
          <div>
            <span>On Target</span>
            <strong>{onTarget}</strong>
            <small>{rows.length ? Math.round((onTarget / rows.length) * 100) : 0}% of drivers</small>
          </div>
        </article>
        <article className="warn">
          <i className="dcr-kpi-icon below">!</i>
          <div>
            <span>Below Target</span>
            <strong>{below}</strong>
            <small>{below ? "Needs attention" : "No action required"}</small>
          </div>
        </article>
        <article className="excellent">
          <i className="dcr-kpi-icon perfect">☆</i>
          <div>
            <span>100% DCR</span>
            <strong>{perfect}</strong>
            <small>Perfect completion</small>
          </div>
        </article>
      </section>

      {!!rows.length && (
        <section className={"dcr-insights " + (!showTrend || !showDistribution ? "has-collapsed" : "")}>
          <article className={"panel dcr-trend-card " + (!showTrend ? "collapsed" : "")}>
            <header>
              <div>
                <h2>Weekly DCR Trend</h2>
                <p>Scorecard average across the latest available weeks.</p>
              </div>
              <button type="button" onClick={() => setShowTrend((current) => !current)}>
                {showTrend ? "Hide" : "Show"}
              </button>
            </header>

            {showTrend && (
              <div className="dcr-trend-body">
                <div className="dcr-trend-chart">
                  <svg
                    viewBox={`0 0 ${trendChart.width} ${trendChart.height}`}
                    role="img"
                    aria-label="Weekly DCR trend"
                    preserveAspectRatio="none"
                  >
                    <defs>
                      <linearGradient id="dcrTrendFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#20a07a" stopOpacity="0.18" />
                        <stop offset="100%" stopColor="#20a07a" stopOpacity="0.02" />
                      </linearGradient>
                    </defs>

                    <line
                      x1={trendChart.left}
                      y1={trendChart.targetY}
                      x2={trendChart.width - trendChart.right}
                      y2={trendChart.targetY}
                      className="dcr-target-line"
                    />

                    {trendChart.area && <polygon points={trendChart.area} fill="url(#dcrTrendFill)" />}
                    {trendChart.line && <polyline points={trendChart.line} className="dcr-trend-line" />}

                    {trendChart.points.map((point, index) => (
                      <g key={point.week}>
                        <circle
                          cx={point.x}
                          cy={point.y}
                          r={index === trendChart.points.length - 1 ? 4.5 : 3.5}
                          className="dcr-trend-point"
                        />
                        <text
                          x={point.x}
                          y={trendChart.height - 7}
                          textAnchor="middle"
                          className="dcr-trend-week"
                        >
                          {point.week}
                        </text>
                      </g>
                    ))}
                  </svg>
                </div>

                <div className="dcr-trend-summary">
                  <strong>
                    {trendChart.latest?.value == null ? "—" : pct(trendChart.latest.value, 2)}
                  </strong>
                  <small className={trendChart.delta == null ? "" : trendChart.delta >= 0 ? "up" : "down"}>
                    {trendChart.delta == null
                      ? "No previous comparison"
                      : `${trendChart.delta >= 0 ? "▲ +" : "▼ "}${trendChart.delta.toFixed(2)} pp`}
                  </small>
                  <span>
                    {trendChart.points.length > 1
                      ? `vs. ${trendChart.points[trendChart.points.length - 2].week}`
                      : "Latest week"}
                  </span>
                </div>
              </div>
            )}
          </article>

          <article className={"panel dcr-distribution-card " + (!showDistribution ? "collapsed" : "")}>
            <header>
              <div>
                <h2>Driver Distribution</h2>
                <p>Current scorecard population.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowDistribution((current) => !current)}
              >
                {showDistribution ? "Hide" : "Show"}
              </button>
            </header>

            {showDistribution && (
              <div className="dcr-distribution-body">
                <div className="dcr-distribution-bar" aria-label="DCR driver distribution">
                  <span className="on-target" style={{ width: `${distribution.onTargetPct}%` }} />
                  <span className="below" style={{ width: `${distribution.belowPct}%` }} />
                  <span className="perfect" style={{ width: `${distribution.perfectPct}%` }} />
                </div>

                <div className="dcr-distribution-stats">
                  <div>
                    <i className="on-target" />
                    <span>On Target</span>
                    <b>{distribution.onTarget}</b>
                    <small>{distribution.onTargetPct.toFixed(0)}%</small>
                  </div>
                  <div>
                    <i className="below" />
                    <span>Below Target</span>
                    <b>{distribution.below}</b>
                    <small>{distribution.belowPct.toFixed(0)}%</small>
                  </div>
                  <div>
                    <i className="perfect" />
                    <span>100% DCR</span>
                    <b>{distribution.perfect}</b>
                    <small>{distribution.perfectPct.toFixed(0)}%</small>
                  </div>
                </div>
              </div>
            )}
          </article>
        </section>
      )}


      {!rows.length ? (
        <section className="panel iadcpro-empty">
          <div>!</div>
          <h2>No DCR scorecard rows in the current scope</h2>
          <p>
            No weekly scorecard DCR data is available for this site. Import the correct DSP scorecard
            and keep the Activity Site matched to the station.
          </p>
        </section>
      ) : (
        <section className="iadcpro-main">
          <article className="panel iadcpro-table-card">
            <div className="iadcpro-card-head">
              <div>
                <h2>DCR Driver Ranking</h2>
                <p>{selectedWeek} · scorecard source only</p>
              </div>
              <strong>{visible.length} drivers</strong>
            </div>

            <div className="iadcpro-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Driver</th>
                    {showTrid && <th>TRID</th>}
                    <th>Delivered</th>
                    <th>DCR</th>
                    <th>Gap to target</th>
                    <th>Status</th>
                    <th>Source</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row, index) => {
                    const score = Number(row.dcr);
                    const gap = score - TARGET;
                    const rowTone = tone(score);
                    return (
                      <tr
                        key={row.id || row.driver_id}
                        className={active?.driver_id === row.driver_id ? "active" : ""}
                        onClick={() => setSelectedId(row.driver_id)}
                      >
                        <td><span className="iadcpro-rank">{index + 1}</span></td>
                        <td><b>{dname(row.drivers)}</b></td>
                        {showTrid && <td><code>{trid(row.drivers)}</code></td>}
                        <td>{Number(row.delivered || 0).toLocaleString()}</td>
                        <td><span className={"iadcpro-score " + rowTone}>{pct(score, 2)}</span></td>
                        <td>
                          <span className={"iadcpro-delta " + (gap >= 0 ? "up" : "down")}>
                            {gap >= 0 ? "+" : ""}{gap.toFixed(2)} pp
                          </span>
                        </td>
                        <td><span className={"iadcpro-status " + rowTone}>{status(score)}</span></td>
                        <td className="dcrscorecard-file">{dcrSourceLabel(row)}</td>
                        <td>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedId(row.driver_id);
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
                    <span>SCORECARD DRIVER</span>
                    <h2>{dname(active.drivers)}</h2>
                    <small>{trid(active.drivers)}</small>
                  </div>
                </div>

                <div className="iadcpro-detail-score">
                  <span>DCR · {selectedWeek}</span>
                  <strong className={tone(active.dcr)}>{pct(active.dcr, 2)}</strong>
                  <small>
                    {Number(active.dcr) >= TARGET
                      ? `${(Number(active.dcr) - TARGET).toFixed(2)} pp above target`
                      : `${(TARGET - Number(active.dcr)).toFixed(2)} pp below target`}
                  </small>
                </div>

                <div className="iadcpro-detail-grid">
                  <div>
                    <span>Delivered</span>
                    <b>{Number(active.delivered || 0).toLocaleString()}</b>
                  </div>
                  <div>
                    <span>Status</span>
                    <b>{status(active.dcr)}</b>
                  </div>
                  <div>
                    <span>Scorecard tier</span>
                    <b>{active.tier || active.raw_data?.tier || "—"}</b>
                  </div>
                  <div>
                    <span>Source</span>
                    <b>{dcrSourceLabel(active)}</b>
                  </div>
                </div>

                <button
                  type="button"
                  className="btn primary full"
                  onClick={() =>
                    onOpenDriver?.(
                      openShape(active, {
                        dcr: n(active.dcr),
                        risk:
                          Number(active.dcr) < 98
                            ? "High"
                            : Number(active.dcr) < TARGET
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

      <style jsx global>{`
        .dcrscorecard{gap:11px}
        .dcrscorecard .iadcpro-hero{
          min-height:82px;padding:12px 18px;border-radius:13px
        }
        .dcrscorecard .iadcpro-hero h1{font-size:25px;margin:3px 0 3px}
        .dcrscorecard .iadcpro-hero p{font-size:10px;line-height:1.4}
        .dcrscorecard .iadcpro-target{min-width:110px}
        .dcrscorecard .iadcpro-target span{font-size:8px}
        .dcrscorecard .iadcpro-target strong{font-size:24px}

        .dcrscorecard-controls{
          grid-template-columns:180px minmax(280px,1fr) auto 190px auto;
          gap:8px;padding:9px 11px;border-radius:11px
        }
        .dcrscorecard-controls label>span{font-size:8px}
        .dcrscorecard-controls select,.dcrscorecard-controls .iadcpro-search{height:34px}
        .dcrscorecard-controls select{font-size:10px}
        .dcrscorecard-source{font-size:9px;white-space:nowrap}

        .dcr-ui-toggle{
          height:34px;border:1px solid #d6e0e7;border-radius:8px;background:#fff;
          padding:0 9px;display:inline-flex;align-items:center;gap:7px;color:#41576b;
          font-size:9px;font-weight:850;white-space:nowrap;cursor:pointer
        }
        .dcr-ui-toggle>span{
          width:26px;height:15px;border-radius:999px;background:#dfe6eb;position:relative
        }
        .dcr-ui-toggle>span:after{
          content:"";position:absolute;width:11px;height:11px;left:2px;top:2px;border-radius:50%;
          background:#fff;box-shadow:0 1px 3px rgba(20,42,60,.18);transition:.16s
        }
        .dcr-ui-toggle.active>span{background:#2d9b79}
        .dcr-ui-toggle.active>span:after{transform:translateX(11px)}

        .dcr-compact-kpis{gap:8px}
        .dcr-compact-kpis article{
          min-height:72px;padding:9px 11px;border-radius:11px;display:flex;align-items:center;gap:9px
        }
        .dcr-compact-kpis article>div{min-width:0}
        .dcr-compact-kpis span{font-size:8px}
        .dcr-compact-kpis strong{font-size:22px;margin:3px 0 2px}
        .dcr-compact-kpis small{font-size:8px}
        .dcr-kpi-icon{
          flex:0 0 32px;width:32px;height:32px;border-radius:9px;display:grid;place-items:center;
          font-style:normal;font-size:16px;font-weight:900;background:#e9f8f4;color:#10a986
        }
        .dcr-kpi-icon.average{background:#edf4ff;color:#3478ef}
        .dcr-kpi-icon.target{background:#eaf8f0;color:#179765}
        .dcr-kpi-icon.below{background:#fff4db;color:#d99a12}
        .dcr-kpi-icon.perfect{background:#edf3ff;color:#3979eb}

        .dcr-insights{display:grid;grid-template-columns:minmax(0,1.12fr) minmax(360px,.88fr);gap:10px}
        .dcr-insights.has-collapsed{align-items:start}
        .dcr-trend-card,.dcr-distribution-card{
          padding:11px 13px;border-radius:12px;min-width:0
        }
        .dcr-trend-card.collapsed,.dcr-distribution-card.collapsed{padding-bottom:10px}
        .dcr-trend-card>header,.dcr-distribution-card>header{
          display:flex;align-items:flex-start;justify-content:space-between;gap:10px
        }
        .dcr-trend-card h2,.dcr-distribution-card h2{margin:0;font-size:13px;color:#152d42}
        .dcr-trend-card p,.dcr-distribution-card p{margin:2px 0 0;font-size:8px;color:#7a8a99}
        .dcr-trend-card header button,.dcr-distribution-card header button{
          height:25px;border:1px solid #dbe4eb;border-radius:7px;background:#fff;
          padding:0 8px;color:#53687a;font-size:8px;font-weight:850;cursor:pointer
        }

        .dcr-trend-body{display:grid;grid-template-columns:minmax(0,1fr) 108px;gap:12px;align-items:center;margin-top:5px}
        .dcr-trend-chart{height:115px}
        .dcr-trend-chart svg{display:block;width:100%;height:100%;overflow:visible}
        .dcr-target-line{stroke:#78c5b1;stroke-width:1;stroke-dasharray:4 4}
        .dcr-trend-line{fill:none;stroke:#169f79;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}
        .dcr-trend-point{fill:#fff;stroke:#169f79;stroke-width:2.3}
        .dcr-trend-week{fill:#738494;font-size:8px;font-weight:750}
        .dcr-trend-summary{display:grid;align-content:center;justify-items:start;gap:3px}
        .dcr-trend-summary strong{font-size:21px;line-height:1;color:#168b6b}
        .dcr-trend-summary small{font-size:9px;font-weight:900}
        .dcr-trend-summary small.up{color:#168b6b}
        .dcr-trend-summary small.down{color:#c33d48}
        .dcr-trend-summary span{font-size:8px;color:#7c8b99}

        .dcr-distribution-body{margin-top:13px}
        .dcr-distribution-bar{
          height:12px;border-radius:999px;background:#edf2f5;display:flex;overflow:hidden
        }
        .dcr-distribution-bar span{height:100%}
        .dcr-distribution-bar .on-target{background:#43a879}
        .dcr-distribution-bar .below{background:#f0b62b}
        .dcr-distribution-bar .perfect{background:#4f7ee8}
        .dcr-distribution-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px}
        .dcr-distribution-stats>div{
          display:grid;grid-template-columns:8px 1fr auto;column-gap:6px;row-gap:2px;align-items:center
        }
        .dcr-distribution-stats i{width:7px;height:7px;border-radius:50%}
        .dcr-distribution-stats i.on-target{background:#43a879}
        .dcr-distribution-stats i.below{background:#f0b62b}
        .dcr-distribution-stats i.perfect{background:#4f7ee8}
        .dcr-distribution-stats span{font-size:8px;color:#52687a}
        .dcr-distribution-stats b{font-size:11px;color:#173047}
        .dcr-distribution-stats small{grid-column:2/-1;font-size:8px;color:#7f8d99}

        .dcrscorecard .iadcpro-main{grid-template-columns:minmax(0,1fr) 310px;gap:10px}
        .dcrscorecard .iadcpro-card-head{padding:10px 13px 8px}
        .dcrscorecard .iadcpro-card-head h2{font-size:15px}
        .dcrscorecard .iadcpro-card-head p{font-size:8px}
        .dcrscorecard .iadcpro-table-wrap{max-height:630px}
        .dcrscorecard .iadcpro-table-wrap th{padding:8px 8px;font-size:7px}
        .dcrscorecard .iadcpro-table-wrap td{padding:7px 8px;font-size:9px}
        .dcrscorecard .iadcpro-table-wrap td b{font-size:10px}
        .dcrscorecard .iadcpro-table-wrap code{font-size:7px}
        .dcrscorecard .iadcpro-detail{padding:13px}
        .dcrscorecard .iadcpro-detail-score strong{font-size:34px}

        @media(max-width:1180px){
          .dcrscorecard-controls{grid-template-columns:170px 1fr auto 180px}
          .dcrscorecard-source{grid-column:1/-1}
          .dcr-insights{grid-template-columns:1fr}
        }
        @media(max-width:820px){
          .dcrscorecard-controls{grid-template-columns:1fr 1fr}
          .dcrscorecard-controls .iadcpro-search{grid-column:1/-1}
          .dcrscorecard-source{grid-column:1/-1}
          .dcr-trend-body{grid-template-columns:1fr}
          .dcr-distribution-stats{grid-template-columns:1fr}
        }
      `}</style>
    </div>
  );
}
