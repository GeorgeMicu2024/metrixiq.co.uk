"use client";

import { useMemo, useState } from "react";

const RANGE_OPTIONS = [1, 2, 4, 8, 12, 26, 52, "all"];
const METRICS = ["performance", "dcr", "pod", "iadc", "cc", "fico", "ementor", "psb", "reattempts", "concessions", "lor"];

function numberOrNull(value) {
  return value == null || value === "" || Number.isNaN(Number(value)) ? null : Number(value);
}
function avg(values) {
  const clean = values.map(numberOrNull).filter((v) => v != null);
  return clean.length ? clean.reduce((a, b) => a + b, 0) / clean.length : null;
}
function display(value, key) {
  const n = numberOrNull(value);
  if (n == null) return "—";
  if (["dcr", "pod", "iadc", "cc", "psb", "reattempts"].includes(key)) return `${n.toFixed(1)}%`;
  if (["concessions", "lor"].includes(key)) return n.toFixed(2);
  return Math.round(n).toString();
}
function periodKey(row) {
  return row.week_label || row.period_end || row.period_start || "Unknown";
}
function periodSortValue(row) {
  return row.period_end || row.period_start || row.week_label || "";
}

export function aggregateFleetHistory(rows = []) {
  const groups = new Map();
  for (const row of rows) {
    const key = periodKey(row);
    const current = groups.get(key) || {
      key,
      weekLabel: row.week_label || key,
      periodStart: row.period_start || null,
      periodEnd: row.period_end || null,
      sortValue: periodSortValue(row),
      rows: [],
    };
    current.rows.push(row);
    current.sortValue = current.sortValue || periodSortValue(row);
    groups.set(key, current);
  }

  return [...groups.values()]
    .map((group) => {
      const result = {
        key: group.key,
        weekLabel: group.weekLabel,
        periodStart: group.periodStart,
        periodEnd: group.periodEnd,
        sortValue: group.sortValue,
        driverCount: group.rows.length,
      };
      for (const metric of METRICS) result[metric] = avg(group.rows.map((row) => row[metric]));
      return result;
    })
    .sort((a, b) => String(a.sortValue).localeCompare(String(b.sortValue)));
}

function RangeSelector({ value, onChange }) {
  return <div className="history-range" role="group" aria-label="Analysis period">
    {RANGE_OPTIONS.map((option) => <button
      type="button"
      key={String(option)}
      className={value === option ? "active" : ""}
      onClick={() => onChange(option)}
    >{option === "all" ? "All" : `${option}W`}</button>)}
  </div>;
}

function selectPeriods(history, range) {
  if (range === "all") return history;
  return history.slice(-Number(range));
}

function HistoryChart({ history, metric = "performance" }) {
  const points = history
    .map((period) => ({ label: period.weekLabel, value: numberOrNull(period[metric]) }))
    .filter((point) => point.value != null);

  if (!points.length) {
    return <div className="history-empty"><b>No historical data yet</b><span>Import weekly reports to build the trend automatically.</span></div>;
  }

  const width = 760;
  const height = 220;
  const left = 30;
  const right = 20;
  const top = 24;
  const bottom = 34;
  const values = points.map((point) => point.value);
  const minRaw = Math.min(...values);
  const maxRaw = Math.max(...values);
  const padding = Math.max(2, (maxRaw - minRaw) * 0.2);
  const min = metric === "performance" || ["dcr","pod","iadc","cc","psb","reattempts"].includes(metric)
    ? Math.max(0, minRaw - padding)
    : minRaw - padding;
  const max = Math.max(min + 1, maxRaw + padding);
  const x = (index) => points.length === 1 ? width / 2 : left + index * ((width - left - right) / (points.length - 1));
  const y = (value) => top + (max - value) / (max - min) * (height - top - bottom);
  const path = points.map((point, index) => `${index ? "L" : "M"} ${x(index)} ${y(point.value)}`).join(" ");

  return <svg className="history-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-label={`${metric} history`}>
    <g stroke="#e5edf2" strokeWidth="1">
      <line x1={left} y1={top + 30} x2={width-right} y2={top + 30} />
      <line x1={left} y1={height/2} x2={width-right} y2={height/2} />
      <line x1={left} y1={height-bottom} x2={width-right} y2={height-bottom} />
    </g>
    <path d={path} fill="none" stroke="#149b86" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    {points.map((point, index) => <g key={`${point.label}-${index}`}>
      <circle cx={x(index)} cy={y(point.value)} r="5" fill="#fff" stroke="#149b86" strokeWidth="3" />
      <text x={x(index)} y={height-10} textAnchor="middle" fontSize="11" fill="#7d8b9b">{point.label}</text>
    </g>)}
  </svg>;
}

export function HistoryTrendChart({ history = [] }) {
  return <HistoryChart history={history} metric="performance" />;
}

export function PerformanceHistoryView({ history = [], kpis = {} }) {
  const [range, setRange] = useState(4);
  const [metric, setMetric] = useState("performance");
  const selected = useMemo(() => selectPeriods(history, range), [history, range]);
  const latest = selected.at(-1) || {};
  const cards = [
    ["DCR", latest.dcr ?? kpis.dcr, "dcr", "Target 98.8%"],
    ["POD", latest.pod ?? kpis.pod, "pod", "Target 98.0%"],
    ["IADC", latest.iadc ?? kpis.iadc, "iadc", "Target 80%"],
    ["CC", latest.cc ?? kpis.cc, "cc", "Target 98.0%"],
    ["FICO", latest.fico ?? kpis.fico, "fico", "Target 790"],
    ["eMentor", latest.ementor ?? kpis.ementor, "ementor", "Target 815"],
  ];

  return <>
    <div className="page-heading history-heading">
      <div><span className="page-kicker">OPERATIONS</span><h1>Performance history</h1><p>Real weekly performance retained from imported reports.</p></div>
      <RangeSelector value={range} onChange={setRange} />
    </div>

    <div className="performance-cards">
      {cards.map(([label, value, key, target]) => <article key={label}><span>{label}</span><strong>{display(value, key)}</strong><small>{target}</small><div className="progress"><i style={{width:`${Math.min(100, Number(value)||0)}%`}} /></div></article>)}
    </div>

    <section className="panel history-panel">
      <div className="panel-head">
        <div><h2>{range === "all" ? "Full history" : `Last ${range} week${range === 1 ? "" : "s"}`}</h2><p>Switch metric to inspect the same reporting periods.</p></div>
        <select className="history-metric-select" value={metric} onChange={(e) => setMetric(e.target.value)}>
          <option value="performance">Performance</option>
          <option value="dcr">DCR</option>
          <option value="pod">POD</option>
          <option value="iadc">IADC</option>
          <option value="cc">Contact Compliance</option>
          <option value="fico">FICO</option>
          <option value="ementor">eMentor</option>
          <option value="concessions">Concessions</option>
          <option value="lor">LoR</option>
        </select>
      </div>
      <HistoryChart history={selected} metric={metric} />
    </section>

    <section className="panel history-table-panel">
      <div className="panel-head"><div><h2>Weekly evidence</h2><p>Stored reporting periods from Supabase.</p></div><span className="panel-badge">{selected.length} periods</span></div>
      <div className="table-wrap"><table className="data-table history-table"><thead><tr>
        <th>Period</th><th>Drivers</th><th>DCR</th><th>POD</th><th>IADC</th><th>CC</th><th>FICO</th><th>eMentor</th><th>Concessions</th>
      </tr></thead><tbody>
        {selected.length ? selected.slice().reverse().map((period) => <tr key={period.key}>
          <td><b>{period.weekLabel}</b><small className="history-date">{period.periodEnd || period.periodStart || ""}</small></td>
          <td>{period.driverCount}</td><td>{display(period.dcr,"dcr")}</td><td>{display(period.pod,"pod")}</td>
          <td>{display(period.iadc,"iadc")}</td><td>{display(period.cc,"cc")}</td><td>{display(period.fico,"fico")}</td>
          <td>{display(period.ementor,"ementor")}</td><td>{display(period.concessions,"concessions")}</td>
        </tr>) : <tr><td colSpan="9"><div className="history-empty compact">No saved weekly metrics yet.</div></td></tr>}
      </tbody></table></div>
    </section>
  </>;
}

function concessionTrend(values) {
  if (values.length < 2) return "—";
  const half = Math.max(1, Math.floor(values.length / 2));
  const early = avg(values.slice(0, half)) ?? 0;
  const late = avg(values.slice(-half)) ?? 0;
  if (late > early + 0.25) return "↑";
  if (late < early - 0.25) return "↓";
  return "→";
}

export function ConcessionsHistoryView({ rows = [] }) {
  const [range, setRange] = useState(8);
  const periods = useMemo(() => aggregateFleetHistory(rows), [rows]);
  const selectedPeriods = useMemo(() => selectPeriods(periods, range), [periods, range]);
  const selectedKeys = new Set(selectedPeriods.map((period) => period.key));

  const ranked = useMemo(() => {
    const byDriver = new Map();
    for (const row of rows) {
      if (!selectedKeys.has(periodKey(row))) continue;
      const driver = row.drivers || {};
      const id = row.driver_id || driver.trid || "unknown";
      const current = byDriver.get(id) || {
        id,
        trid: driver.trid || "—",
        name: driver.full_name || "Unknown driver",
        site: driver.site || "—",
        byWeek: {},
      };
      const value = numberOrNull(row.concessions) ?? 0;
      current.byWeek[periodKey(row)] = value;
      byDriver.set(id, current);
    }
    return [...byDriver.values()].map((driver) => {
      const values = selectedPeriods.map((period) => driver.byWeek[period.key] ?? 0);
      return {
        ...driver,
        values,
        total: values.reduce((a,b) => a+b,0),
        weeksAffected: values.filter((v) => v > 0).length,
        average: values.length ? values.reduce((a,b)=>a+b,0)/values.length : 0,
        trend: concessionTrend(values),
      };
    }).filter((driver) => driver.total > 0).sort((a,b) => b.total-a.total || b.weeksAffected-a.weeksAffected);
  }, [rows, selectedPeriods]);

  const total = ranked.reduce((sum, driver) => sum + driver.total, 0);
  const repeat = ranked.filter((driver) => driver.weeksAffected >= 2).length;
  const top = ranked[0]?.total || 0;

  return <>
    <div className="page-heading history-heading">
      <div><span className="page-kicker">QUALITY</span><h1>Concessions intelligence</h1><p>Track repeat patterns across any retained weekly reporting window.</p></div>
      <RangeSelector value={range} onChange={setRange} />
    </div>

    <section className="concession-summary">
      <article><span>Total concessions</span><strong>{Math.round(total)}</strong><small>{selectedPeriods.length} reporting period{selectedPeriods.length === 1 ? "" : "s"}</small></article>
      <article><span>Drivers affected</span><strong>{ranked.length}</strong><small>At least one concession</small></article>
      <article><span>Repeat drivers</span><strong>{repeat}</strong><small>2+ affected weeks</small></article>
      <article><span>Highest driver total</span><strong>{Math.round(top)}</strong><small>Selected period</small></article>
    </section>

    <section className="panel concessions-panel">
      <div className="panel-head"><div><h2>Driver ranking</h2><p>Highest total first. Weekly cells remain auditable back to the stored scorecard period.</p></div><span className="panel-badge">{ranked.length} affected</span></div>
      <div className="table-wrap concessions-table-wrap"><table className="data-table concessions-table"><thead><tr>
        <th>Rank</th><th>Driver</th><th>TRID</th>
        {selectedPeriods.map((period) => <th key={period.key}>{period.weekLabel}</th>)}
        <th>Total</th><th>Weeks affected</th><th>Avg/week</th><th>Trend</th>
      </tr></thead><tbody>
        {ranked.length ? ranked.map((driver, index) => <tr key={driver.id}>
          <td><span className={`rank-badge rank-${Math.min(index+1,4)}`}>{index+1}</span></td>
          <td><b>{driver.name}</b><small className="history-date">{driver.site}</small></td>
          <td>{driver.trid}</td>
          {driver.values.map((value, idx) => <td key={idx}><span className={`concession-cell ${value >= 3 ? "high" : value >= 2 ? "med" : value >= 1 ? "low" : ""}`}>{value}</span></td>)}
          <td><b>{driver.total}</b></td><td>{driver.weeksAffected}/{selectedPeriods.length}</td><td>{driver.average.toFixed(2)}</td><td className="trend-arrow">{driver.trend}</td>
        </tr>) : <tr><td colSpan={8 + selectedPeriods.length}><div className="history-empty compact">No concessions stored for this period.</div></td></tr>}
      </tbody></table></div>
    </section>
  </>;
}
