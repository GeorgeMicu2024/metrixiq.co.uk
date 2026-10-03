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