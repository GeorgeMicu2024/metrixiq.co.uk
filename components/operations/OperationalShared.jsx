"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { fetchDirectOperationalRows } from "../../lib/data/directOperational";

export const RANGE_OPTIONS = [1, 2, 4, 8, 12, 26, 52, "all"];

export const n = (value) =>
  value == null || value === "" || Number.isNaN(Number(value)) ? null : Number(value);

export const pct = (value, digits = 2) =>
  n(value) == null ? "—" : `${Number(value).toFixed(digits)}%`;

export const weekNo = (label) =>
  Number(String(label || "").replace(/\D/g, "")) || 0;

export const dname = (driver) =>
  driver?.full_name || driver?.name || "Unresolved driver";

export const trid = (driver) =>
  driver?.trid || driver?.id || "—";

export function filterRowsBySite(rows, siteFilter = "all") {
  if (siteFilter === "all") return rows;
  return rows.filter(
    (row) =>
      String(row?.drivers?.site || "").trim().toUpperCase() === siteFilter
  );
}

export function useOperationalRows(organizationId, kind, refreshKey = 0) {
  const [state, setState] = useState({
    loading: true,
    error: "",
    rows: [],
  });

  useEffect(() => {
    let alive = true;

    if (!organizationId) {
      setState({ loading: false, error: "", rows: [] });
      return () => {};
    }

    (async () => {
      try {
        setState((current) => ({ ...current, loading: true, error: "" }));
        const rows = await fetchDirectOperationalRows(
          getSupabaseBrowserClient(),
          organizationId,
          kind
        );

        if (alive) {
          setState({ loading: false, error: "", rows });
        }
      } catch (error) {
        if (alive) {
          setState({
            loading: false,
            error: error?.message || "Could not load data.",
            rows: [],
          });
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [organizationId, kind, refreshKey]);

  return state;
}

export function Loading({ text }) {
  return (
    <section className="panel ops-empty">
      <div className="auth-spinner" />
      <b>{text}</b>
    </section>
  );
}

export function ErrorBox({ error }) {
  return (
    <section className="panel ops-empty error">
      <b>Unable to load this view</b>
      <span>{error}</span>
    </section>
  );
}

export function RangeTabs({ value, onChange }) {
  return (
    <div className="v10-range-tabs">
      {RANGE_OPTIONS.map((range) => (
        <button
          type="button"
          key={String(range)}
          className={value === range ? "active" : ""}
          onClick={() => onChange(range)}
        >
          {range === "all" ? "All" : `${range}W`}
        </button>
      ))}
    </div>
  );
}

export function toneIadc(value) {
  const score = n(value);
  return score == null
    ? "neutral"
    : score >= 90
      ? "excellent"
      : score >= 80
        ? "good"
        : score >= 70
          ? "warn"
          : "bad";
}

export function toneMentor(value, target) {
  const score = n(value);
  return score == null
    ? "neutral"
    : score >= 830
      ? "excellent"
      : score >= target
        ? "good"
        : score >= 790
          ? "warn"
          : "bad";
}

export function riskTone(value) {
  const risk = String(value || "").toLowerCase();
  return risk.includes("high")
    ? "high"
    : risk.includes("medium")
      ? "med"
      : risk.includes("low")
        ? "low"
        : "neutral";
}

export function openShape(row, extra = {}) {
  const driver = row?.drivers || {};
  return {
    id: trid(driver),
    dbId: row?.driver_id,
    name: dname(driver),
    site: driver.site || "",
    ...extra,
  };
}

export function contiguousWeeks(rows, range) {
  const present = [...new Set(rows.map((row) => row.week_label).filter(Boolean))]
    .sort((a, b) => weekNo(a) - weekNo(b));

  if (!present.length) return [];

  const min = weekNo(present[0]);
  const max = weekNo(present[present.length - 1]);
  const start = range === "all" ? min : Math.max(min, max - Number(range) + 1);

  return Array.from(
    { length: max - start + 1 },
    (_, index) => `W${String(start + index).padStart(2, "0")}`
  );
}
