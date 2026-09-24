"use client";

import { useEffect, useMemo, useState } from "react";
import { TARGETS, targetLabel } from "../../lib/config/performance";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { fetchMentorDailyRows, setMentorDailyVisibility } from "../../lib/data/mentorDaily";
import MentorMappingPanel from "./MentorMappingPanel";
import {
  ErrorBox,
  Loading,
  dname,
  filterRowsBySite,
  n,
  openShape,
  trid,
  useOperationalRows,
  weekNo,
} from "../operations/OperationalShared";

const REPORT_COLUMNS = [
  ["firstName", "First Name"],
  ["lastName", "Last Name"],
  ["score", "Score"],
  ["acceleration", "Acceleration"],
  ["braking", "Braking"],
  ["cornering", "Cornering"],
  ["distraction", "Distraction"],
  ["speedingRisk", "Speeding"],
  ["speedingEvents", "Speeding Events"],
  ["training", "Training"],
  ["completed", "Completed"],
];

function formatDate(value) {
  if (!value) return "No date";
  const date = new Date(value + "T12:00:00");
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function splitDriverName(driver) {
  const fullName = String(dname(driver) || "").trim();
  const parts = fullName.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: fullName || "Unresolved", lastName: "—" };
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
}

function makeItem(row) {
  const details = row.raw_data?.mentor || {};
  const names = splitDriverName(row.drivers || {});
  return {
    id: row.id || row.source_identity_key || row.driver_id || trid(row.drivers || {}),
    driver: row.drivers || {},
    score: n(row.mentor_score ?? row.ementor ?? row.fico),
    details,
    row,
    firstName: names.firstName,
    lastName: names.lastName,
    acceleration: details.acceleration || "",
    braking: details.braking || "",
    cornering: details.cornering || "",
    distraction: details.distraction || "",
    speedingRisk: details.speedingRisk || "",
    speedingEvents: n(details.speedingEvents),
    training: n(details.training),
    completed: n(details.completed),
  };
}

function riskClass(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("high")) return "high";
  if (text.includes("medium")) return "medium";
  if (text.includes("low")) return "low";
  return "neutral";
}

function scoreClass(value) {
  const score = n(value);
  if (score == null) return "neutral";
  if (score < 700) return "critical";
  if (score < 790) return "poor";
  if (score < TARGETS.mentor) return "warning";
  if (score < 830) return "target";
  return "strong";
}

function compareValues(a, b, key) {
  const numericKeys = new Set(["score", "speedingEvents", "training", "completed"]);
  if (numericKeys.has(key)) return (n(a[key]) ?? -Infinity) - (n(b[key]) ?? -Infinity);
  return String(a[key] || "").localeCompare(String(b[key] || ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function ReportSortHeader({ columnKey, label, sort, onSort, tone = "risk" }) {
  const active = sort.key === columnKey;
  const arrow = !active ? "↕" : sort.direction === "asc" ? "↑" : "↓";
  return (
    <th className={"mentor-head " + tone}>
      <button type="button" onClick={() => onSort(columnKey)}>
        <span>{label}</span>
        <span className="mentor-sort-arrow">{arrow}</span>
      </button>
    </th>
  );
}

function MentorReportTable({ rows, sort, onSort, onOpenDriver, onHide, onRestore, visibilityBusy = "", compact = false }) {
  return (
    <div className={compact ? "mentor-report-scroll compact" : "mentor-report-scroll"}>
      <table className="mentor-report-table">
        <thead>
          <tr>
            <th className="mentor-head index">#</th>
            {(onHide || onRestore) && <th className="mentor-head numeric">Visibility</th>}
            {REPORT_COLUMNS.map(([key, label]) => (
              <ReportSortHeader
                key={key}
                columnKey={key}
                label={label}
                sort={sort}
                onSort={onSort}
                tone={key === "score" ? "score" : ["speedingEvents", "training", "completed"].includes(key) ? "numeric" : "risk"}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((item, index) => (
            <tr key={item.id + "-" + index}>
              <td className="mentor-index-cell">{index + 1}</td>
              {(onHide || onRestore) && (
                <td className="mentor-number-cell">
                  {item.row?.is_hidden
                    ? <button type="button" className="btn ghost" disabled={visibilityBusy === item.row?.id} onClick={() => onRestore?.(item)}>Restore</button>
                    : <button type="button" className="btn ghost" disabled={visibilityBusy === item.row?.id} onClick={() => onHide?.(item)}>Hide</button>}
                </td>
              )}
              <td className="mentor-name-cell">
                <button
                  type="button"
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
                  {item.firstName}
                </button>
              </td>
              <td className="mentor-name-cell">
                <button
                  type="button"
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
                  {item.lastName}
                </button>
              </td>
              <td className={"mentor-score-cell " + scoreClass(item.score)}>
                {item.score == null ? "—" : Math.round(item.score)}
              </td>
              {["acceleration", "braking", "cornering", "distraction", "speedingRisk"].map((key) => (
                <td key={key} className={"mentor-risk-cell " + riskClass(item[key])}>
                  {item[key] || "—"}
                </td>
              ))}
              <td className={"mentor-number-cell " + ((item.speedingEvents ?? 0) > 0 ? "alert" : "safe")}>
                {item.speedingEvents ?? "—"}
              </td>
              <td className="mentor-number-cell training">
                {item.training ?? "—"}
              </td>
              <td className={"mentor-number-cell completed " + ((item.completed ?? 0) > 0 ? "done" : "zero")}>
                {item.completed ?? "—"}
              </td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={(onHide || onRestore) ? 13 : 12}>
                <div className="mentor-report-empty">No eMentor rows match this report selection.</div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function MentorView({
  organizationId,
  onOpenDriver,
  onImport,
  siteFilter = "all",
  onSiteFilterChange,
  refreshKey = 0,
}) {
  const weeklyLoad = useOperationalRows(organizationId, "mentor", refreshKey);
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
  const [sort, setSort] = useState({ key: "score", direction: "asc" });
  const [mappingRefresh, setMappingRefresh] = useState(0);
  const [showHidden, setShowHidden] = useState(false);
  const [visibilityBusy, setVisibilityBusy] = useState("");

  useEffect(() => {
    let alive = true;

    if (!organizationId) {
      setDailyLoad({ loading: false, error: "", rows: [] });
      return () => {};
    }

    (async () => {
      try {
        setDailyLoad((currentState) => ({ ...currentState, loading: true, error: "" }));
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
  }, [organizationId, mappingRefresh, refreshKey]);

  const allDailyRows = dailyLoad.rows || [];
  const allWeeklyRows = weeklyLoad.rows || [];

  const availableSites = useMemo(
    () =>
      [...new Set(
        [...allDailyRows, ...allWeeklyRows]
          .map((row) => String(row?.drivers?.site || "").trim().toUpperCase())
          .filter(Boolean)
      )].sort(),
    [allDailyRows, allWeeklyRows]
  );

  const weeklyRows = useMemo(
    () => {
      const selectedSite = String(siteFilter || "all").trim().toUpperCase();
      if (selectedSite === "ALL") return allWeeklyRows;
      // Activity Site is authoritative. Legacy null-site rows may only be
      // attributed when the source evidence itself names the selected site.
      return allWeeklyRows.filter((row) => {
        const activitySite = String(row?.site || row?.raw_data?.activity_site || "").trim().toUpperCase();
        if (activitySite) return activitySite === selectedSite;
        const evidence = JSON.stringify(row?.raw_data?.source_files || []).toUpperCase();
        return evidence.includes(selectedSite);
      });
    },
    [allWeeklyRows, siteFilter]
  );
  const dailyRows = useMemo(
    () => filterRowsBySite(allDailyRows, siteFilter),
    [allDailyRows, siteFilter]
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
    if (dates.length && !dates.includes(selectedDate)) setSelectedDate(dates[0]);
    if (!dates.length && selectedDate) setSelectedDate("");
  }, [dates, selectedDate]);

  useEffect(() => {
    if (weeks.length && !weeks.includes(selectedWeek)) setSelectedWeek(weeks[0]);
    if (!weeks.length && selectedWeek) setSelectedWeek("");
  }, [weeks, selectedWeek]);

  const dailyMap = useMemo(
    () =>
      dailyRows
        .filter((row) => row.report_date === selectedDate)
        .map(makeItem)
        .filter((item) => item.score != null || item.details),
    [dailyRows, selectedDate]
  );

  const weeklyMap = useMemo(
    () =>
      weeklyRows
        .filter((row) => row.week_label === selectedWeek)
        .map(makeItem)
        .filter((item) => item.score != null || item.details),
    [weeklyRows, selectedWeek]
  );

  function applySort(items) {
    return [...items].sort((a, b) => {
      const delta = compareValues(a, b, sort.key);
      return sort.direction === "asc" ? delta : -delta;
    });
  }

  function toggleSort(key) {
    setSort((currentSort) =>
      currentSort.key === key
        ? { key, direction: currentSort.direction === "asc" ? "desc" : "asc" }
        : { key, direction: key === "score" ? "asc" : "asc" }
    );
  }

  const activeRowsUnfiltered = mode === "daily" ? dailyMap : weeklyMap;
  const activeRows = mode === "daily"
    ? activeRowsUnfiltered.filter((item) => showHidden || !item.row?.is_hidden)
    : activeRowsUnfiltered;

  async function setDailyItemHidden(item, hidden) {
    const snapshotId = item?.row?.id;
    if (!snapshotId || visibilityBusy) return;
    setVisibilityBusy(snapshotId);
    try {
      await setMentorDailyVisibility(
        getSupabaseBrowserClient(),
        organizationId,
        snapshotId,
        hidden
      );
      setDailyLoad((current) => ({
        ...current,
        rows: current.rows.map((row) =>
          row.id === snapshotId ? { ...row, is_hidden: hidden } : row
        ),
      }));
    } finally {
      setVisibilityBusy("");
    }
  }
  const searchedRows = activeRows.filter((item) =>
    [
      item.firstName,
      item.lastName,
      dname(item.driver),
      trid(item.driver),
      item.score,
    ]
      .join(" ")
      .toLowerCase()
      .includes(query.trim().toLowerCase())
  );
  const visibleRows = applySort(searchedRows);
  const reportRows = applySort(activeRows);

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

  const scored = activeRows.filter((item) => item.score != null);
  const average = scored.length
    ? scored.reduce((sum, item) => sum + item.score, 0) / scored.length
    : null;
  const below = scored.filter((item) => item.score < TARGETS.mentor).length;
  const passed = scored.filter((item) => item.score >= TARGETS.mentor).length;
  const siteLabel = siteFilter === "all" ? "All sites" : siteFilter;
  const periodLabel =
    mode === "daily"
      ? formatDate(selectedDate)
      : selectedWeek
        ? selectedWeek + " weekly scorecard"
        : "No weekly period";

  if (mode === "daily") {
    return (
      <>
        <section className="mentor-daily-shell">
          <div className="mentor-report-toolbar">
            <div className="mentor-report-title">
              <span className="mentor-report-icon mentor-report-icon-logo" aria-hidden="true"><img src="/ementor-ddp.svg" alt="" /></span>
              <div>
                <span className="page-kicker">EMENTOR SAFETY</span>
                <h1>Daily eMentor Report</h1>
                <p>
                  Site: <b>{siteLabel}</b>
                  <span>•</span>
                  Date: <b>{formatDate(selectedDate)}</b>
                  <span>•</span>
                  Report Type: <b>Daily</b>
                </p>
              </div>
            </div>

            <div className="mentor-report-controls">
              <label className="mentor-control">
                <span>Site</span>
                <select
                  value={siteFilter}
                  onChange={(event) => onSiteFilterChange?.(event.target.value)}
                  disabled={!onSiteFilterChange}
                  aria-label="Filter eMentor report by site"
                >
                  <option value="all">All sites</option>
                  {availableSites.map((site) => (
                    <option key={site} value={site}>{site}</option>
                  ))}
                </select>
              </label>

              <label className="mentor-control">
                <span>Date</span>
                <select
                  value={selectedDate}
                  onChange={(event) => setSelectedDate(event.target.value)}
                  aria-label="Select eMentor report date"
                >
                  {dates.length ? (
                    dates.map((date) => (
                      <option key={date} value={date}>{formatDate(date)}</option>
                    ))
                  ) : (
                    <option value="">No daily uploads</option>
                  )}
                </select>
              </label>

              <label className="mentor-search-control">
                <span aria-hidden="true">⌕</span>
                <input
                  aria-label="Search Mentor drivers"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search driver names…"
                />
              </label>

              <button
                type="button"
                className="btn mentor-report-button"
                onClick={() => setShareOpen(true)}
                disabled={!reportRows.length}
              >
                Daily report
              </button>

              {onImport && (
                <button type="button" className="btn primary" onClick={onImport}>
                  Import eMentor
                </button>
              )}
            </div>
          </div>

          <div className="mentor-mode-switch">
            <button type="button" className="active">Daily</button>
            <button type="button" onClick={() => setMode("weekly")}>Weekly scorecard</button>
            <span>Minimum required score: <b>{TARGETS.mentor}+</b></span>
          </div>

          <MentorReportTable
            rows={visibleRows}
            sort={sort}
            onSort={toggleSort}
            onOpenDriver={onOpenDriver}
            onHide={(item) => setDailyItemHidden(item, true)}
            onRestore={(item) => setDailyItemHidden(item, false)}
            visibilityBusy={visibilityBusy}
          />
          <div className="mentor-mode-switch">
            <button type="button" className={showHidden ? "active" : ""} onClick={() => setShowHidden((value) => !value)}>
              {showHidden ? "Hide hidden rows" : "Show hidden rows"}
            </button>
            <span>{dailyMap.filter((item) => item.row?.is_hidden).length} hidden account(s)</span>
          </div>

          <MentorMappingPanel organizationId={organizationId} reportDate={selectedDate} onChanged={() => setMappingRefresh((value) => value + 1)} />

          <footer className="mentor-report-footer">
            <span>
              Showing {visibleRows.length ? 1 : 0} - {visibleRows.length} of {activeRows.length} drivers
              {query ? " · filtered" : ""}
            </span>
            <span>MetrixIQ · Daily eMentor Report · {formatDate(selectedDate)}</span>
          </footer>
        </section>

        {shareOpen && (
          <div
            className="mentor-share-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="eMentor share view"
            onClick={() => setShareOpen(false)}
          >
            <div className="mentor-share-sheet daily" onClick={(event) => event.stopPropagation()}>
              <div className="mentor-share-hero">
                <span className="mentor-share-eyebrow">METRIXIQ · DAILY EMENTOR REPORT</span>
                <h2>{siteLabel} · {formatDate(selectedDate)}</h2>
                <p>Safe-driving performance · minimum required score {TARGETS.mentor}+</p>
              </div>
              <div className="mentor-share-kpis">
                <div><span>Average</span><strong>{average == null ? "—" : Math.round(average)}</strong></div>
                <div><span>Drivers</span><strong>{scored.length}</strong></div>
                <div><span>{TARGETS.mentor}+</span><strong>{passed}</strong></div>
                <div><span>Below {TARGETS.mentor}</span><strong>{below}</strong></div>
              </div>
              <MentorReportTable
                rows={reportRows}
                sort={sort}
                onSort={() => {}}
                onOpenDriver={null}
                compact
              />
              <div className="mentor-share-footer">
                <span>MetrixIQ · Daily eMentor Report</span>
                <span>{formatDate(selectedDate)} · {siteLabel}</span>
              </div>
              <div className="mentor-share-actions">
                <button type="button" className="btn ghost" onClick={() => setShareOpen(false)}>Close</button>
                <button type="button" className="btn primary" onClick={() => window.print()}>Print / Save view</button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  const top = [...scored].sort((a, b) => (b.score ?? -1) - (a.score ?? -1)).slice(0, 5);
  const bottom = [...scored].sort((a, b) => (a.score ?? Infinity) - (b.score ?? Infinity)).slice(0, 5);

  return (
    <>
      <div className="page-heading v10-heading">
        <div>
          <span className="page-kicker">SCORECARD</span>
          <h1>Weekly eMentor / FICO</h1>
          <p>Weekly eMentor evidence stored in the FICO position of the Driver Scorecard.</p>
        </div>
        <div className="mentor-view-actions">
          <div className="mentor-mode-tabs">
            <button type="button" onClick={() => setMode("daily")}>Daily</button>
            <button type="button" className="active">Weekly</button>
          </div>
          <select
            className="mentor-period-select"
            aria-label="Select weekly eMentor scorecard"
            value={selectedWeek}
            onChange={(event) => setSelectedWeek(event.target.value)}
          >
            {weeks.length ? weeks.map((week) => <option key={week} value={week}>{week}</option>) : <option value="">No weekly scorecards</option>}
          </select>
          <input
            className="v10-search"
            aria-label="Search Mentor drivers"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search driver…"
          />
          {onImport && <button type="button" className="btn primary" onClick={onImport}>Import eMentor</button>}
        </div>
      </div>

      <section className="v10-kpi-grid">
        <article><span>Average score</span><strong>{average == null ? "—" : Math.round(average)}</strong><small>{targetLabel("mentor")}</small></article>
        <article className={below ? "warn" : ""}><span>Below target</span><strong>{below}</strong><small>{periodLabel}</small></article>
        <article><span>At / above target</span><strong>{passed}</strong><small>{TARGETS.mentor}+ required</small></article>
        <article><span>Driver records</span><strong>{activeRows.length}</strong><small>{siteLabel}</small></article>
      </section>

      <section className="dashboard-grid lower">
        <article className="panel v10-rank-card">
          <div className="panel-head"><div><h2>Top 5 eMentor</h2><p>Highest weekly FICO scores.</p></div></div>
          {top.map((item, index) => (
            <button key={item.id} onClick={() => onOpenDriver?.(openShape(item.row,{mentor_score:item.score,fico:item.score,ementor:item.score}))}>
              <span className="rank-badge">{index + 1}</span>
              <div><b>{dname(item.driver)}</b><small>{trid(item.driver)}</small></div>
              <strong>{Math.round(item.score)}</strong>
            </button>
          ))}
        </article>
        <article className="panel v10-rank-card attention">
          <div className="panel-head"><div><h2>Bottom 5 — attention</h2><p>Lowest weekly FICO scores.</p></div></div>
          {bottom.map((item, index) => (
            <button key={item.id} onClick={() => onOpenDriver?.(openShape(item.row,{mentor_score:item.score,fico:item.score,ementor:item.score,risk:"Medium",issue:"Mentor score below target"}))}>
              <span className="rank-badge">{index + 1}</span>
              <div><b>{dname(item.driver)}</b><small>{trid(item.driver)}</small></div>
              <strong>{Math.round(item.score)}</strong>
            </button>
          ))}
        </article>
      </section>

      <section className="panel mentor-weekly-table">
        <div className="panel-head">
          <div><h2>Weekly FICO register</h2><p>{periodLabel} · {siteLabel}</p></div>
        </div>
        <MentorReportTable rows={visibleRows} sort={sort} onSort={toggleSort} onOpenDriver={onOpenDriver} />
      </section>
    </>
  );
}
