"use client";

import { useEffect, useState } from "react";
import { displayDriverName } from "../../lib/identity";
import {
  driverShape,
  indexFor,
  num,
  tierForIndex,
} from "../../lib/scorecards/metrics";

export function useLoad(loader, deps = []) {
  const [state, setState] = useState({
    loading: true,
    error: "",
    data: null,
  });

  useEffect(() => {
    let alive = true;
    setState((current) => ({ ...current, loading: true, error: "" }));

    loader()
      .then((data) => {
        if (alive) {
          setState({ loading: false, error: "", data });
        }
      })
      .catch((error) => {
        if (alive) {
          setState({
            loading: false,
            error: error?.message || "Could not load data.",
            data: null,
          });
        }
      });

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}

export function LoadingPanel({ text = "Loading operational data…" }) {
  return (
    <section className="panel ops-empty">
      <div className="auth-spinner" />
      <b>{text}</b>
    </section>
  );
}

export function ErrorPanel({ error }) {
  return (
    <section className="panel ops-empty error">
      <b>Unable to load this view</b>
      <span>{error}</span>
    </section>
  );
}

export function EmptyPanel({ title, text, action, onAction }) {
  return (
    <section className="panel ops-empty">
      <div className="ops-empty-icon">◇</div>
      <b>{title}</b>
      <span>{text}</span>
      {action && (
        <button className="btn primary" onClick={onAction}>
          {action}
        </button>
      )}
    </section>
  );
}

export function MetricValue({ item, format = "plain" }) {
  if (!item) return <span className="muted-value">—</span>;

  const value = typeof item === "object" ? item.value : item;
  const standing = typeof item === "object" ? item.standing : null;
  const shown =
    format === "pct" && num(value) != null
      ? `${Number(value).toFixed(2)}%`
      : String(value ?? "—");

  return (
    <span className="scorecard-source-value">
      <b>{shown}</b>
      {standing && <em>{standing}</em>}
    </span>
  );
}

export function ScorecardMetricRow({ label, item, format }) {
  return (
    <div className="source-metric-row">
      <span>{label}</span>
      <MetricValue item={item} format={format} />
    </div>
  );
}

export function LeaderList({
  rows,
  title,
  inverse = false,
  onOpenDriver,
}) {
  const sorted = rows
    .map((row) => ({ ...row, index: indexFor(row) }))
    .filter((row) => row.index != null)
    .sort((a, b) =>
      inverse ? a.index - b.index : b.index - a.index
    )
    .slice(0, 5);

  return (
    <article className="panel ops-leader-card">
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          <p>
            {inverse
              ? "Lowest combined index — prioritise review."
              : "Highest combined index in the selected week."}
          </p>
        </div>
      </div>

      <div className="leader-stack">
        {sorted.length ? sorted.map((row, index) => {
          const driver = row.drivers || {};
          const tier = tierForIndex(row.index);

          return (
            <button
              key={row.driver_id}
              className="leader-row"
              onClick={() => onOpenDriver?.(driverShape(row))}
            >
              <span className="rank-badge">{index + 1}</span>
              <span className="leader-name">
                <b>{displayDriverName(driver)}</b>
                <small>{driver.trid}</small>
              </span>
              <span className={`tier-chip ${tier.cls}`}>{tier.label}</span>
              <strong>{row.index.toFixed(1)}</strong>
            </button>
          );
        }) : (
          <div className="ops-mini-empty">Not enough combined metrics yet.</div>
        )}
      </div>
    </article>
  );
}
