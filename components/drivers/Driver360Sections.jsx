"use client";

import { fmt } from "../dashboard/utils";
import { formatDriverDelta } from "../../lib/drivers/driver360";

function periodLabel(row) {
  return row?.week_label || row?.period_end || row?.period_start || "Period";
}

function mentor(row) {
  return row?.mentor_score ?? row?.ementor ?? row?.fico ?? null;
}

function concessionValue(row) {
  const value = Number(row?.concessions);
  return Number.isFinite(value) ? value : null;
}

export function Driver360Overview({ snapshot }) {
  const riskMovement =
    snapshot.riskDelta == null
      ? "No prior risk state"
      : snapshot.riskDelta < 0
        ? "Risk improving"
        : snapshot.riskDelta > 0
          ? "Risk increased"
          : "Risk unchanged";

  const cards = [
    {
      label: "Trajectory",
      value:
        snapshot.performanceDelta == null
          ? "—"
          : formatDriverDelta(snapshot.performanceDelta),
      note: snapshot.previousLabel
        ? `vs ${snapshot.previousLabel}`
        : "More history required",
      tone: snapshot.performanceTone,
    },
    {
      label: "Evidence coverage",
      value: `${snapshot.coverage}%`,
      note: "Core Driver 360 metrics",
      tone: snapshot.coverage >= 80 ? "good" : snapshot.coverage >= 60 ? "warn" : "bad",
    },
    {
      label: "4-week concessions",
      value: snapshot.fourWeekConcessions,
      note: `${snapshot.concessionWeeks} affected week${snapshot.concessionWeeks === 1 ? "" : "s"}`,
      tone: snapshot.fourWeekConcessions > 3 ? "bad" : snapshot.fourWeekConcessions > 0 ? "warn" : "good",
    },
    {
      label: "Risk movement",
      value: snapshot.latestRisk,
      note: riskMovement,
      tone: String(snapshot.latestRisk).toLowerCase() === "high" ? "bad" : String(snapshot.latestRisk).toLowerCase() === "medium" ? "warn" : "good",
    },
  ];

  return (
    <section className="driver360-overview">
      {cards.map((card) => (
        <article key={card.label} className={`driver360-stat ${card.tone}`}>
          <span>{card.label}</span>
          <strong>{card.value}</strong>
          <small>{card.note}</small>
        </article>
      ))}
    </section>
  );
}

export function Driver360DeltaGrid({ snapshot }) {
  return (
    <section className="panel driver360-deltas">
      <div className="panel-head">
        <div>
          <h2>KPI movement</h2>
          <p>
            {snapshot.previousLabel
              ? `${snapshot.latestLabel} versus ${snapshot.previousLabel}`
              : "Latest measured KPI state"}
          </p>
        </div>
        <span className="panel-badge">{snapshot.metricDeltas.length} signals</span>
      </div>

      <div className="driver360-delta-grid">
        {snapshot.metricDeltas.map((metric) => (
          <article key={metric.key}>
            <div>
              <span>{metric.label}</span>
              {metric.targetMet != null && (
                <em className={metric.targetMet ? "good" : "bad"}>
                  {metric.targetMet ? "On target" : "Below target"}
                </em>
              )}
            </div>
            <strong>{fmt(metric.current, metric.key)}</strong>
            <small className={metric.tone}>
              {formatDriverDelta(
                metric.delta,
                metric.key === "mentor" || metric.key === "concessions" ? "" : "pp"
              )}
            </small>
          </article>
        ))}
      </div>
    </section>
  );
}

export function DriverTrajectoryChart({ snapshot }) {
  const rows = snapshot.periods
    .map((row) => ({
      label: periodLabel(row),
      value: Number(row?.performance),
    }))
    .filter((row) => Number.isFinite(row.value));

  if (rows.length < 2) {
    return (
      <div className="driver360-empty">
        <b>More history required</b>
        <span>Performance trajectory will appear after additional reporting periods are imported.</span>
      </div>
    );
  }

  const width = 660;
  const height = 210;
  const padX = 36;
  const padY = 28;
  const minValue = Math.max(0, Math.min(...rows.map((row) => row.value)) - 8);
  const maxValue = Math.min(100, Math.max(...rows.map((row) => row.value)) + 8);
  const range = Math.max(1, maxValue - minValue);
  const step = rows.length > 1 ? (width - padX * 2) / (rows.length - 1) : 0;
  const points = rows.map((row, index) => ({
    ...row,
    x: padX + step * index,
    y: padY + ((maxValue - row.value) / range) * (height - padY * 2),
  }));
  const path = points.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <div className="driver360-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Driver performance trajectory">
        {[0, 1, 2, 3].map((line) => {
          const y = padY + ((height - padY * 2) / 3) * line;
          return <line key={line} x1={padX} y1={y} x2={width - padX} y2={y} className="driver360-gridline" />;
        })}
        <polyline points={path} className="driver360-line" />
        {points.map((point, index) => (
          <g key={`${point.label}-${index}`}>
            <circle cx={point.x} cy={point.y} r="5" className="driver360-point" />
            <text x={point.x} y={Math.max(14, point.y - 11)} textAnchor="middle" className="driver360-value">
              {point.value.toFixed(0)}
            </text>
            <text x={point.x} y={height - 7} textAnchor="middle" className="driver360-label">
              {point.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export function DriverEvidenceTimeline({ snapshot }) {
  const rows = snapshot.periods.slice(-8).reverse();

  return (
    <section className="panel driver360-timeline">
      <div className="panel-head">
        <div>
          <h2>Evidence timeline</h2>
          <p>Recent weekly KPI evidence for this driver.</p>
        </div>
        <span className="panel-badge">{rows.length} periods</span>
      </div>

      <div className="table-wrap">
        <table className="data-table driver360-table">
          <thead>
            <tr>
              <th>Period</th>
              <th>Performance</th>
              <th>DCR</th>
              <th>POD</th>
              <th>IADC</th>
              <th>Mentor</th>
              <th>Concessions</th>
              <th>Risk</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((row, index) => (
              <tr key={`${periodLabel(row)}-${index}`}>
                <td><b>{periodLabel(row)}</b></td>
                <td>{fmt(row.performance, "performance")}</td>
                <td>{fmt(row.dcr, "dcr")}</td>
                <td>{fmt(row.pod, "pod")}</td>
                <td>{fmt(row.iadc, "iadc")}</td>
                <td>{fmt(mentor(row), "mentor")}</td>
                <td>{concessionValue(row) ?? "—"}</td>
                <td><span className={`risk-pill ${String(row.risk || "low").toLowerCase()}`}>{row.risk || "Low"}</span></td>
              </tr>
            )) : (
              <tr>
                <td colSpan="8">
                  <div className="driver360-empty">
                    <b>No historical evidence yet</b>
                    <span>Import additional scorecards to build the Driver 360 timeline.</span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
