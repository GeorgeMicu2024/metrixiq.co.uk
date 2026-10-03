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
          delta: previousTotal == null ? null : total - previousTotal,al,
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

                