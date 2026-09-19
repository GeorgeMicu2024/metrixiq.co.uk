"use client";

import { n, targetFor } from "../../lib/performance/metrics";

const RANGE_OPTIONS = [1, 2, 4, 8, 12, 26, 52, "all"];

export function RangeTabs({ value, onChange }) {
  return (
    <div className="pro-range-tabs">
      {RANGE_OPTIONS.map((option) => (
        <button
          type="button"
          key={String(option)}
          className={value === option ? "active" : ""}
          onClick={() => onChange(option)}
        >
          {option === "all" ? "All" : `${option}W`}
        </button>
      ))}
    </div>
  );
}

export function EmptyRow({ columns, text }) {
  return (
    <tr>
      <td colSpan={columns}>
        <div className="pro-empty-row">{text}</div>
      </td>
    </tr>
  );
}

export function ProTrendChart({ points, metric }) {
  const clean = points.filter((point) => n(point.value) != null);

  if (!clean.length) {
    return (
      <div className="pro-chart-empty">
        No stored values for this metric in the selected period.
      </div>
    );
  }

  const width = 900;
  const height = 280;
  const left = 54;
  const right = 28;
  const top = 26;
  const bottom = 52;
  const target = targetFor(metric);
  const values = clean.map((point) => Number(point.value));

  if (target != null) values.push(target);

  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const pad = Math.max(
    metric === "mentor" ? 8 : 0.5,
    (rawMax - rawMin) * 0.2
  );
  const min = Math.max(0, rawMin - pad);
  const max = Math.max(min + 1, rawMax + pad);

  const x = (index) =>
    clean.length === 1
      ? width / 2
      : left + index * ((width - left - right) / (clean.length - 1));

  const y = (value) =>
    top + ((max - value) / (max - min)) * (height - top - bottom);

  const path = clean
    .map((point, index) =>
      `${index ? "L" : "M"} ${x(index)} ${y(Number(point.value))}`
    )
    .join(" ");

  const targetY = target != null ? y(target) : null;
  const lineTone =
    target != null && Number(clean.at(-1)?.value) < target
      ? "#d99128"
      : "#168b78";

  return (
    <div className="pro-chart-wrap">
      <svg
        className="pro-trend-chart"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
      >
        {[0, 1, 2, 3].map((index) => {
          const yy = top + index * ((height - top - bottom) / 3);
          return (
            <line
              key={index}
              x1={left}
              y1={yy}
              x2={width - right}
              y2={yy}
              stroke="#e7edf2"
              strokeWidth="1"
            />
          );
        })}

        {targetY != null && (
          <>
            <line
              x1={left}
              y1={targetY}
              x2={width - right}
              y2={targetY}
              stroke="#8e9baa"
              strokeWidth="2"
              strokeDasharray="8 8"
            />
            <text
              x={width - right}
              y={targetY - 8}
              textAnchor="end"
              fontSize="11"
              fill="#6c7b8c"
            >
              Target {metric === "mentor" ? target : target.toFixed(2)}
            </text>
          </>
        )}

        <path
          d={path}
          fill="none"
          stroke={lineTone}
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {clean.map((point, index) => (
          <g key={point.label}>
            <circle
              cx={x(index)}
              cy={y(Number(point.value))}
              r="6"
              fill="#fff"
              stroke={lineTone}
              strokeWidth="4"
            />
            <text
              x={x(index)}
              y={height - 18}
              textAnchor="middle"
              fontSize="13"
              fill="#718093"
            >
              {point.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
