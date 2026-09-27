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

  if (load.loading) return <Loading text="Loading DCR scorecard data…" />;
  if (load.error) return <ErrorBox error={load.error} />;

  const siteLabel =
    String(siteFilter || "all").toLowerCase() === "all"
      ? "All Sites"
      : String(siteFilter).toUpperCase();

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
            placeholder="Search driver or TRID…"
          />
        </div>

        <select value={sortDir} onChange={(event) => setSortDir(event.target.value)}>
          <option value="asc">DCR · Lowest first</option>
          <option value="desc">DCR · Highest first</option>
        </select>

        <span className="dcrscorecard-source">
          Source: DSP Scorecard · {selectedWeek || "No week"}
        </span>
      </section>

      <section className="iadcpro-kpis">
        <article>
          <span>Total Drivers</span>
          <strong>{rows.length}</strong>
          <small>{siteLabel} · {selectedWeek || "No week"}</small>
        </article>
        <article>
          <span>DCR Average</span>
          <strong>{average == null ? "—" : pct(average, 2)}</strong>
          <small>Target ≥ {TARGET}%</small>
        </article>
        <article className="good">
          <span>On Target</span>
          <strong>{onTarget}</strong>
          <small>{rows.length ? Math.round((onTarget / rows.length) * 100) : 0}% of drivers</small>
        </article>
        <article className="warn">
          <span>Below Target</span>
          <strong>{below}</strong>
          <small>{below ? "Needs attention" : "No action required"}</small>
        </article>
        <article className="excellent">
          <span>100% DCR</span>
          <strong>{perfect}</strong>
          <small>Perfect completion</small>
        </article>
      </section>

      {!rows.length ? (
        <section className="panel iadcpro-empty">
          <div>!</div>
          <h2>No DCR scorecard rows for {siteLabel}</h2>
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
                <p>{siteLabel} · {selectedWeek} · scorecard source only</p>
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
                        <td><code>{trid(row.drivers)}</code></td>
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
                    <small>{trid(active.drivers)} · {siteLabel}</small>
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
    </div>
  );
}
