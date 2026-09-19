"use client";

import { useEffect, useMemo, useState } from "react";
import { TARGETS, targetLabel } from "../../lib/config/performance";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { fetchMentorDailyRows } from "../../lib/data/mentorDaily";
import {
  ErrorBox,
  Loading,
  dname,
  filterRowsBySite,
  n,
  openShape,
  riskTone,
  toneMentor,
  trid,
  useOperationalRows,
  weekNo,
} from "../operations/OperationalShared";

function formatDate(value) {
  if (!value) return "No date";
  const date = new Date(value + "T12:00:00");
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function makeItem(row) {
  return {
    id: row.driver_id || trid(row.drivers || {}),
    driver: row.drivers || {},
    score: n(row.mentor_score ?? row.ementor ?? row.fico),
    details: row.raw_data?.mentor || null,
    row,
  };
}

export default function MentorView({
  organizationId,
  onOpenDriver,
  onImport,
  siteFilter = "all",
}) {
  const weeklyLoad = useOperationalRows(organizationId, "mentor");
  const [dailyLoad, setDailyLoad] = useState({
    loading: true,
    error: "",
    rows: [],
  });
  const [mode, setMode] = useState("daily");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedWeek, setSelectedWeek] = useState("");
  const [query, setQuery] = useState("");
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    let alive = true;

    if (!organizationId) {
      setDailyLoad({ loading: false, error: "", rows: [] });
      return () => {};
    }

    (async () => {
      try {
        setDailyLoad((current) => ({ ...current, loading: true, error: "" }));
        const rows = await fetchMentorDailyRows(
          getSupabaseBrowserClient(),
          organizationId
        );
        if (alive) setDailyLoad({ loading: false, error: "", rows });
      } catch (error) {
        if (alive) {
          setDailyLoad({
            loading: false,
            error: error?.message || "Could not load daily eMentor history.",
            rows: [],
          });
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [organizationId]);

  const weeklyRows = useMemo(
    () => filterRowsBySite(weeklyLoad.rows, siteFilter),
    [weeklyLoad.rows, siteFilter]
  );
  const dailyRows = useMemo(
    () => filterRowsBySite(dailyLoad.rows, siteFilter),
    [dailyLoad.rows, siteFilter]
  );

  const dates = useMemo(
    () =>
      [...new Set(dailyRows.map((row) => row.report_date).filter(Boolean))]
        .sort()
        .reverse(),
    [dailyRows]
  );
  const weeks = useMemo(
    () =>
      [...new Set(weeklyRows.map((row) => row.week_label).filter(Boolean))]
        .sort((a, b) => weekNo(a) - weekNo(b))
        .reverse(),
    [weeklyRows]
  );

  useEffect(() => {
    if (dates.length && !dates.includes(selectedDate)) {
      setSelectedDate(dates[0]);
    }
  }, [dates, selectedDate]);

  useEffect(() => {
    if (weeks.length && !weeks.includes(selectedWeek)) {
      setSelectedWeek(weeks[0]);
    }
  }, [weeks, selectedWeek]);

  const dailyMap = useMemo(
    () =>
      dailyRows
        .filter((row) => row.report_date === selectedDate)
        .map(makeItem)
        .filter((item) => item.score != null || item.details)
        .sort((a, b) => (b.score ?? -1) - (a.score ?? -1)),
    [dailyRows, selectedDate]
  );

  const weeklyMap = useMemo(
    () =>
      weeklyRows
        .filter((row) => row.week_label === selectedWeek)
        .map(makeItem)
        .filter((item) => item.score != null || item.details)
        .sort((a, b) => (b.score ?? -1) - (a.score ?? -1)),
    [weeklyRows, selectedWeek]
  );

  if (mode === "daily" && dailyLoad.loading) {
    return <Loading text="Loading daily eMentor history…" />;
  }
  if (mode === "weekly" && weeklyLoad.loading) {
    return <Loading text="Loading weekly eMentor scorecards…" />;
  }
  if (mode === "daily" && dailyLoad.error) {
    return <ErrorBox error={dailyLoad.error} />;
  }
  if (mode === "weekly" && weeklyLoad.error) {
    return <ErrorBox error={weeklyLoad.error} />;
  }

  const map = mode === "daily" ? dailyMap : weeklyMap;
  const filtered = map.filter((item) =>
    (dname(item.driver) + " " + trid(item.driver))
      .toLowerCase()
      .includes(query.toLowerCase())
  );
  const scored = map.filter((item) => item.score != null);
  const avg = scored.length
    ? scored.reduce((sum, item) => sum + item.score, 0) / scored.length
    : null;
  const below = scored.filter((item) => item.score < TARGETS.mentor).length;
  const passed = scored.filter((item) => item.score >= TARGETS.mentor).length;
  const highRisk = map.filter((item) =>
    Object.values(item.details || {}).some((value) =>
      String(value).toLowerCase().includes("high risk")
    )
  ).length;
  const training = map.filter(
    (item) =>
      n(item.details?.training) != null &&
      n(item.details?.completed) != null &&
      Number(item.details.completed) < Number(item.details.training)
  ).length;
  const top = scored.slice(0, 5);
  const bottom = [...scored].sort((a, b) => a.score - b.score).slice(0, 5);
  const periodLabel =
    mode === "daily"
      ? formatDate(selectedDate)
      : selectedWeek
        ? selectedWeek + " weekly scorecard"
        : "No weekly period";
  const siteLabel = siteFilter === "all" ? "All sites" : siteFilter;

  return (
    <>
      <div className="page-heading v10-heading">
        <div>
          <span className="page-kicker">SAFETY</span>
          <h1>eMentor intelligence</h1>
          <p>
            Daily driving history and weekly FICO scorecard evidence in one
            operational view.
          </p>
        </div>

        <div className="mentor-view-actions">
          <div className="mentor-mode-tabs" role="tablist" aria-label="eMentor view mode">
            <button
              type="button"
              className={mode === "daily" ? "active" : ""}
              onClick={() => setMode("daily")}
            >
              Daily
            </button>
            <button
              type="button"
              className={mode === "weekly" ? "active" : ""}
              onClick={() => setMode("weekly")}
            >
              Weekly
            </button>
          </div>

          {mode === "daily" ? (
            <select
              className="mentor-period-select"
              aria-label="Select eMentor report date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
            >
              {dates.length ? (
                dates.map((date) => (
                  <option key={date} value={date}>
                    {formatDate(date)}
                  </option>
                ))
              ) : (
                <option value="">No daily uploads yet</option>
              )}
            </select>
          ) : (
            <select
              className="mentor-period-select"
              aria-label="Select weekly eMentor scorecard"
              value={selectedWeek}
              onChange={(event) => setSelectedWeek(event.target.value)}
            >
              {weeks.length ? (
                weeks.map((week) => (
                  <option key={week} value={week}>
                    {week}
                  </option>
                ))
              ) : (
                <option value="">No weekly scorecards yet</option>
              )}
            </select>
          )}

          <button
            type="button"
            className="btn ghost"
            onClick={() => setShareOpen(true)}
            disabled={!map.length}
          >
            Share view
          </button>
          {onImport && (
            <button type="button" className="btn primary" onClick={onImport}>
              Import eMentor
            </button>
          )}
        </div>
      </div>

      <section className="v10-kpi-grid">
        <article>
          <span>Average score</span>
          <strong>{avg == null ? "—" : Math.round(avg)}</strong>
          <small>{targetLabel("mentor")}</small>
        </article>
        <article className={below ? "warn" : ""}>
          <span>Below target</span>
          <strong>{below}</strong>
          <small>{periodLabel}</small>
        </article>
        <article className={highRisk ? "bad" : ""}>
          <span>High-risk behaviour</span>
          <strong>{highRisk}</strong>
          <small>Any high-risk category</small>
        </article>
        <article>
          <span>Training outstanding</span>
          <strong>{training}</strong>
          <small>Completed below assigned</small>
        </article>
      </section>

      <section className="dashboard-grid lower">
        <article className="panel v10-rank-card">
          <div className="panel-head">
            <div>
              <h2>Top 5 eMentor</h2>
              <p>Highest driving scores for {periodLabel}.</p>
            </div>
          </div>
          {top.map((item, index) => (
            <button
              key={item.id}
              onClick={() =>
                onOpenDriver?.(
                  openShape(item.row, {
                    mentor_score: item.score,
                    fico: item.score,
                    ementor: item.score,
                  })
                )
              }
            >
              <span className="rank-badge">{index + 1}</span>
              <div>
                <b>{dname(item.driver)}</b>
                <small>{trid(item.driver)}</small>
              </div>
              <strong>{Math.round(item.score)}</strong>
            </button>
          ))}
        </article>

        <article className="panel v10-rank-card attention">
          <div className="panel-head">
            <div>
              <h2>Bottom 5 — attention</h2>
              <p>Lowest eMentor scores for {periodLabel}.</p>
            </div>
          </div>
          {bottom.map((item, index) => (
            <button
              key={item.id}
              onClick={() =>
                onOpenDriver?.(
                  openShape(item.row, {
                    mentor_score: item.score,
                    fico: item.score,
                    ementor: item.score,
                    risk: "Medium",
                    issue: "Mentor score below target",
                  })
                )
              }
            >
              <span className="rank-badge">{index + 1}</span>
              <div>
                <b>{dname(item.driver)}</b>
                <small>{trid(item.driver)}</small>
              </div>
              <strong>{Math.round(item.score)}</strong>
            </button>
          ))}
        </article>
      </section>

      <section className="panel v10-table-panel">
        <div className="panel-head">
          <div>
            <h2>{mode === "daily" ? "Daily eMentor register" : "Weekly FICO register"}</h2>
            <p>{periodLabel} · {siteLabel} · {map.length} driver records</p>
          </div>
          <input
            className="v10-search"
            aria-label="Search eMentor drivers"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search driver or TRID…"
          />
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Driver</th>
                <th>TRID</th>
                <th>Score</th>
                <th>Acceleration</th>
                <th>Braking</th>
                <th>Cornering</th>
                <th>Distraction</th>
                <th>Speeding</th>
                <th>Events</th>
                <th>Training</th>
                <th>Completed</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const details = item.details || {};
                const tone = toneMentor(item.score, TARGETS.mentor);
                return (
                  <tr key={item.id}>
                    <td>
                      <b>{dname(item.driver)}</b>
                      <small className="history-date">
                        {item.driver?.site || "Unassigned"}
                      </small>
                    </td>
                    <td>
                      <code className="v10-trid">{trid(item.driver)}</code>
                    </td>
                    <td>
                      <span className={"v10-score " + tone}>
                        {item.score == null ? "—" : Math.round(item.score)}
                      </span>
                    </td>
                    {["acceleration", "braking", "cornering", "distraction", "speedingRisk"].map(
                      (key) => (
                        <td key={key}>
                          <span className={"v10-risk " + riskTone(details[key])}>
                            {details[key] || "—"}
                          </span>
                        </td>
                      )
                    )}
                    <td>{details.speedingEvents ?? "—"}</td>
                    <td>{details.training ?? "—"}</td>
                    <td>{details.completed ?? "—"}</td>
                    <td>
                      <button
                        className="profile-link"
                        onClick={() =>
                          onOpenDriver?.(
                            openShape(item.row, {
                              mentor_score: item.score,
                              fico: item.score,
                              ementor: item.score,
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
              {!filtered.length && (
                <tr>
                  <td colSpan="12">
                    <div className="v10-empty">
                      {mode === "daily"
                        ? "No daily eMentor snapshot stored for this date."
                        : "No weekly eMentor evidence stored for this week."}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {shareOpen && (
        <div
          className="mentor-share-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="eMentor share view"
          onClick={() => setShareOpen(false)}
        >
          <div
            className="mentor-share-sheet"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mentor-share-hero">
              <span className="mentor-share-eyebrow">
                METRIXIQ · EMENTOR {mode === "daily" ? "DAILY" : "WEEKLY"}
              </span>
              <h2>{siteLabel} · {periodLabel}</h2>
              <p>
                Safe-driving performance · minimum required score {TARGETS.mentor}+
              </p>
            </div>

            <div className="mentor-share-kpis">
              <div>
                <span>Average</span>
                <strong>{avg == null ? "—" : Math.round(avg)}</strong>
              </div>
              <div>
                <span>Drivers</span>
                <strong>{scored.length}</strong>
              </div>
              <div>
                <span>{TARGETS.mentor}+</span>
                <strong>{passed}</strong>
              </div>
              <div>
                <span>Below {TARGETS.mentor}</span>
                <strong>{below}</strong>
              </div>
            </div>

            <div className="mentor-share-table-wrap">
              <table className="mentor-share-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Driver</th>
                    <th>Score</th>
                    <th>Acceleration</th>
                    <th>Braking</th>
                    <th>Cornering</th>
                    <th>Distraction</th>
                    <th>Speeding</th>
                    <th>Events</th>
                  </tr>
                </thead>
                <tbody>
                  {scored.map((item, index) => {
                    const details = item.details || {};
                    return (
                      <tr
                        key={item.id}
                        className={item.score < TARGETS.mentor ? "below" : ""}
                      >
                        <td>{index + 1}</td>
                        <td>
                          <b>{dname(item.driver)}</b>
                        </td>
                        <td className="score">{Math.round(item.score)}</td>
                        <td>{details.acceleration || "—"}</td>
                        <td>{details.braking || "—"}</td>
                        <td>{details.cornering || "—"}</td>
                        <td>{details.distraction || "—"}</td>
                        <td>{details.speedingRisk || "—"}</td>
                        <td>{details.speedingEvents ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mentor-share-footer">
              <span>Generated from stored eMentor evidence in MetrixIQ.</span>
              <span>Target: {TARGETS.mentor}+ · {siteLabel}</span>
            </div>

            <div className="mentor-share-actions">
              <button
                type="button"
                className="btn ghost"
                onClick={() => setShareOpen(false)}
              >
                Close
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={() => window.print()}
              >
                Print / Save view
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
