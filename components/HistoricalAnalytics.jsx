"use client";

import { useMemo, useState } from "react";

export const TARGETS = {
  dcr: 99.2,
  pod: 99.6,
  iadc: 80,
  mentor: 815,
};

const RANGE_OPTIONS = [1, 2, 4, 8, 12, 26, 52, "all"];
const METRICS = ["performance", "dcr", "pod", "iadc", "cc", "mentor", "psb", "reattempts", "concessions", "lor"];

function numberOrNull(value) {
  return value == null || value === "" || Number.isNaN(Number(value)) ? null : Number(value);
}
function avg(values) {
  const clean = values.map(numberOrNull).filter((v) => v != null);
  return clean.length ? clean.reduce((a, b) => a + b, 0) / clean.length : null;
}
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
function display(value, key) {
  const n = numberOrNull(value);
  if (n == null) return "—";
  if (["dcr", "pod", "iadc", "cc", "psb", "reattempts"].includes(key)) return `${n.toFixed(2)}%`;
  if (["concessions", "lor"].includes(key)) return Number.isInteger(n) ? String(n) : n.toFixed(2);
  return Math.round(n).toString();
}
function mentorScore(row) {
  return numberOrNull(row?.mentor_score) ?? numberOrNull(row?.ementor) ?? numberOrNull(row?.fico);
}
function periodKey(row) {
  return row.week_label || row.period_end || row.period_start || "Unknown";
}
function periodSortValue(row) {
  return row.period_end || row.period_start || row.week_label || "";
}
function targetStatus(value, key) {
  const n = numberOrNull(value);
  if (n == null) return "missing";
  if (key === "dcr") return n >= TARGETS.dcr ? "good" : "warn";
  if (key === "pod") return n >= TARGETS.pod ? "good" : "warn";
  if (key === "iadc") return n >= TARGETS.iadc ? "good" : "warn";
  if (key === "mentor") return n >= TARGETS.mentor ? "good" : "warn";
  return "good";
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
      for (const metric of METRICS) {
        if (metric === "mentor") result.mentor = avg(group.rows.map(mentorScore));
        else result[metric] = avg(group.rows.map((row) => row[metric]));
      }
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
    return <div className="history-empty"><b>No historical data yet</b><span>Import the relevant weekly reports to build this trend.</span></div>;
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
  const padding = Math.max(1, (maxRaw - minRaw) * 0.2);
  const min = Math.max(0, minRaw - padding);
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

function performanceIndex(record) {
  const components = [];
  if (record.dcr != null) components.push(clamp(record.dcr / TARGETS.dcr * 100, 0, 105));
  if (record.pod != null) components.push(clamp(record.pod / TARGETS.pod * 100, 0, 105));
  if (record.iadc != null) components.push(clamp(record.iadc / TARGETS.iadc * 100, 0, 105));
  if (record.mentor != null) components.push(clamp(record.mentor / TARGETS.mentor * 100, 0, 105));
  return components.length >= 2 ? avg(components) : null;
}

function buildLeaderboard(rows, selectedPeriods) {
  const keys = new Set(selectedPeriods.map((period) => period.key));
  const map = new Map();

  for (const row of rows) {
    if (!keys.has(periodKey(row))) continue;
    const driver = row.drivers || {};
    const id = row.driver_id || driver.trid || driver.full_name;
    if (!id) continue;
    const current = map.get(id) || {
      id,
      name: driver.full_name || "Unknown driver",
      trid: driver.trid || "—",
      site: driver.site || "—",
      dcr: [], pod: [], iadc: [], mentor: [],
    };
    const values = {
      dcr: numberOrNull(row.dcr),
      pod: numberOrNull(row.pod),
      iadc: numberOrNull(row.iadc),
      mentor: mentorScore(row),
    };
    for (const [key, value] of Object.entries(values)) if (value != null) current[key].push(value);
    map.set(id, current);
  }

  return [...map.values()].map((driver) => {
    const result = {
      ...driver,
      dcr: avg(driver.dcr),
      pod: avg(driver.pod),
      iadc: avg(driver.iadc),
      mentor: avg(driver.mentor),
    };
    result.index = performanceIndex(result);
    result.dataPoints = [result.dcr, result.pod, result.iadc, result.mentor].filter((v) => v != null).length;
    return result;
  }).filter((driver) => driver.index != null)
    .sort((a, b) => b.index - a.index);
}

function LeaderboardTable({ title, subtitle, rows, bottom = false }) {
  return <article className="panel leaderboard-card">
    <div className="panel-head"><div><h2>{title}</h2><p>{subtitle}</p></div><span className={`panel-badge ${bottom ? "warn" : "good"}`}>{rows.length}</span></div>
    <div className="table-wrap"><table className="data-table leaderboard-table"><thead><tr>
      <th>#</th><th>Driver</th><th>DCR</th><th>POD</th><th>IADC</th><th>Mentor</th><th>Index</th>
    </tr></thead><tbody>
      {rows.length ? rows.map((driver, index) => <tr key={driver.id}>
        <td><span className="rank-badge">{index + 1}</span></td>
        <td><b>{driver.name}</b><small className="history-date">{driver.trid}</small></td>
        <td>{display(driver.dcr, "dcr")}</td><td>{display(driver.pod, "pod")}</td>
        <td>{display(driver.iadc, "iadc")}</td><td>{display(driver.mentor, "mentor")}</td>
        <td><b>{driver.index.toFixed(1)}</b></td>
      </tr>) : <tr><td colSpan="7"><div className="history-empty compact">Not enough combined metrics yet.</div></td></tr>}
    </tbody></table></div>
  </article>;
}

export function PerformanceHistoryView({ history = [], kpis = {}, rows = [] }) {
  const [range, setRange] = useState(4);
  const [metric, setMetric] = useState("performance");
  const selected = useMemo(() => selectPeriods(history, range), [history, range]);
  const latest = selected.at(-1) || {};
  const leaderboard = useMemo(() => buildLeaderboard(rows, selected), [rows, selected]);
  const bottom = leaderboard.slice().reverse().slice(0, 5);

  const currentMentor = latest.mentor ?? kpis.ementor ?? kpis.fico ?? null;
  const cards = [
    ["DCR", latest.dcr ?? kpis.dcr, "dcr", `Target ≥ ${TARGETS.dcr.toFixed(2)}%`],
    ["POD", latest.pod ?? kpis.pod, "pod", `Target ≥ ${TARGETS.pod.toFixed(2)}%`],
    ["IADC", latest.iadc ?? kpis.iadc, "iadc", `Target ≥ ${TARGETS.iadc}%`],
    ["Mentor Score", currentMentor, "mentor", `Target ≥ ${TARGETS.mentor}`],
    ["Contact Compliance", latest.cc ?? kpis.cc, "cc", "Operational quality"],
    ["Concessions", latest.concessions ?? kpis.concessions, "concessions", "Lower is better"],
  ];

  return <>
    <div className="page-heading history-heading">
      <div><span className="page-kicker">OPERATIONS</span><h1>Performance intelligence</h1><p>Real weekly evidence retained from imported operational reports.</p></div>
      <RangeSelector value={range} onChange={setRange} />
    </div>

    <div className="performance-cards">
      {cards.map(([label, value, key, target]) => <article className={`target-card ${targetStatus(value,key)}`} key={label}>
        <span>{label}</span><strong>{display(value, key)}</strong><small>{target}</small>
        <div className="progress"><i style={{width:`${Math.min(100, key === "mentor" ? (Number(value)||0)/TARGETS.mentor*100 : Number(value)||0)}%`}} /></div>
      </article>)}
    </div>

    <section className="panel history-panel">
      <div className="panel-head">
        <div><h2>{range === "all" ? "Full performance history" : `Last ${range} week${range === 1 ? "" : "s"}`}</h2><p>Select a metric to inspect movement across the same reporting periods.</p></div>
        <select className="history-metric-select" value={metric} onChange={(e) => setMetric(e.target.value)}>
          <option value="performance">Performance Index</option>
          <option value="dcr">DCR</option>
          <option value="pod">POD</option>
          <option value="iadc">IADC</option>
          <option value="mentor">Mentor Score</option>
          <option value="cc">Contact Compliance</option>
          <option value="concessions">Concessions</option>
          <option value="lor">LoR</option>
        </select>
      </div>
      <HistoryChart history={selected} metric={metric} />
    </section>

    <section className="leaderboard-grid">
      <LeaderboardTable title="Top 5 performers" subtitle="Highest multi-metric performance index in the selected period." rows={leaderboard.slice(0,5)} />
      <LeaderboardTable title="Bottom 5 — attention" subtitle="Lowest multi-metric performance index; review before the next cycle." rows={bottom} bottom />
    </section>

    <section className="panel history-table-panel">
      <div className="panel-head"><div><h2>Weekly evidence</h2><p>Only metrics actually stored for each reporting week are shown.</p></div><span className="panel-badge">{selected.length} periods</span></div>
      <div className="table-wrap"><table className="data-table history-table"><thead><tr>
        <th>Period</th><th>Drivers</th><th>DCR</th><th>POD</th><th>IADC</th><th>CC</th><th>Mentor</th><th>Concessions</th>
      </tr></thead><tbody>
        {selected.length ? selected.slice().reverse().map((period) => <tr key={period.key}>
          <td><b>{period.weekLabel}</b><small className="history-date">{period.periodEnd || period.periodStart || ""}</small></td>
          <td>{period.driverCount}</td><td>{display(period.dcr,"dcr")}</td><td>{display(period.pod,"pod")}</td>
          <td>{display(period.iadc,"iadc")}</td><td>{display(period.cc,"cc")}</td><td>{display(period.mentor,"mentor")}</td>
          <td>{display(period.concessions,"concessions")}</td>
        </tr>) : <tr><td colSpan="8"><div className="history-empty compact">No saved weekly metrics yet.</div></td></tr>}
      </tbody></table></div>
    </section>
  </>;
}

function concessionTrend(values) {
  const clean = values.filter((v) => v != null);
  if (clean.length < 2) return "—";
  const half = Math.max(1, Math.floor(clean.length / 2));
  const early = avg(clean.slice(0, half)) ?? 0;
  const late = avg(clean.slice(-half)) ?? 0;
  if (late > early + 0.25) return "↑";
  if (late < early - 0.25) return "↓";
  return "→";
}

export function ConcessionsHistoryView({ rows = [] }) {
  const [range, setRange] = useState(8);

  // A reporting period belongs in this module only when a concessions metric exists.
  // Missing concession files must never appear as a fake zero week.
  const concessionRows = useMemo(() => rows.filter((row) => numberOrNull(row.concessions) != null), [rows]);
  const periods = useMemo(() => aggregateFleetHistory(concessionRows), [concessionRows]);
  const selectedPeriods = useMemo(() => selectPeriods(periods, range), [periods, range]);
  const selectedKeys = new Set(selectedPeriods.map((period) => period.key));

  const ranked = useMemo(() => {
    const byDriver = new Map();
    for (const row of concessionRows) {
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
      current.byWeek[periodKey(row)] = numberOrNull(row.concessions);
      byDriver.set(id, current);
    }

    return [...byDriver.values()].map((driver) => {
      const values = selectedPeriods.map((period) => Object.prototype.hasOwnProperty.call(driver.byWeek, period.key) ? driver.byWeek[period.key] : null);
      const reported = values.filter((v) => v != null);
      return {
        ...driver,
        values,
        total: reported.reduce((a,b) => a+b,0),
        weeksReported: reported.length,
        weeksAffected: reported.filter((v) => v > 0).length,
        average: reported.length ? reported.reduce((a,b)=>a+b,0)/reported.length : 0,
        trend: concessionTrend(values),
      };
    }).filter((driver) => driver.weeksReported > 0)
      .sort((a,b) => b.total-a.total || b.weeksAffected-a.weeksAffected);
  }, [concessionRows, selectedPeriods]);

  const total = ranked.reduce((sum, driver) => sum + driver.total, 0);
  const repeat = ranked.filter((driver) => driver.weeksAffected >= 2).length;
  const affected = ranked.filter((driver) => driver.total > 0).length;
  const top = ranked[0]?.total || 0;

  return <>
    <div className="page-heading history-heading">
      <div><span className="page-kicker">QUALITY</span><h1>Concessions intelligence</h1><p>Exact weekly concession counts, repeat patterns and cumulative totals.</p></div>
      <RangeSelector value={range} onChange={setRange} />
    </div>

    <section className="concession-summary">
      <article><span>Total concessions</span><strong>{Math.round(total)}</strong><small>{selectedPeriods.length} concessions reporting week{selectedPeriods.length === 1 ? "" : "s"}</small></article>
      <article><span>Drivers affected</span><strong>{affected}</strong><small>At least one concession</small></article>
      <article><span>Repeat drivers</span><strong>{repeat}</strong><small>Concessions in 2+ weeks</small></article>
      <article><span>Highest driver total</span><strong>{Math.round(top)}</strong><small>Selected period</small></article>
    </section>

    <section className="panel concessions-panel">
      <div className="panel-head"><div><h2>Driver ranking</h2><p>Each week shows the stored count. “—” means no concession report/data for that driver-week; it is not converted to zero.</p></div><span className="panel-badge">{ranked.length} tracked</span></div>
      <div className="table-wrap concessions-table-wrap"><table className="data-table concessions-table"><thead><tr>
        <th>Rank</th><th>Driver</th><th>TRID</th>
        {selectedPeriods.map((period) => <th key={period.key}>{period.weekLabel}</th>)}
        <th>Total</th><th>Weeks affected</th><th>Avg/reported week</th><th>Trend</th>
      </tr></thead><tbody>
        {ranked.length ? ranked.map((driver, index) => <tr key={driver.id}>
          <td><span className={`rank-badge rank-${Math.min(index+1,4)}`}>{index+1}</span></td>
          <td><b>{driver.name}</b><small className="history-date">{driver.site}</small></td>
          <td>{driver.trid}</td>
          {driver.values.map((value, idx) => <td key={idx}>{value == null ? <span className="missing-cell">—</span> : <span className={`concession-cell ${value >= 3 ? "high" : value >= 2 ? "med" : value >= 1 ? "low" : ""}`}>{value}</span>}</td>)}
          <td><b>{driver.total}</b></td><td>{driver.weeksAffected}/{driver.weeksReported}</td><td>{driver.average.toFixed(2)}</td><td className="trend-arrow">{driver.trend}</td>
        </tr>) : <tr><td colSpan={8 + selectedPeriods.length}><div className="history-empty compact">No valid concessions history stored for this period.</div></td></tr>}
      </tbody></table></div>
    </section>
  </>;
}

function riskTone(value) {
  const s = String(value || "").toLowerCase();
  if (s.includes("high")) return "high";
  if (s.includes("medium")) return "med";
  if (s.includes("low")) return "low";
  return "";
}
function mentorDetail(row) {
  const raw = row?.raw_data || {};
  return raw.mentor || null;
}

export function MentorHistoryView({ rows = [] }) {
  const [range, setRange] = useState(4);
  const mentorRows = useMemo(() => rows.filter((row) => mentorScore(row) != null || mentorDetail(row)), [rows]);
  const periods = useMemo(() => aggregateFleetHistory(mentorRows), [mentorRows]);
  const selectedPeriods = useMemo(() => selectPeriods(periods, range), [periods, range]);
  const keys = new Set(selectedPeriods.map((p) => p.key));

  const drivers = useMemo(() => {
    const map = new Map();
    for (const row of mentorRows) {
      if (!keys.has(periodKey(row))) continue;
      const d = row.drivers || {};
      const id = row.driver_id || d.trid || d.full_name;
      if (!id) continue;
      const current = map.get(id) || {id, name:d.full_name||"Unknown driver", trid:d.trid||"—", scores:[], detail:null, sort:periodSortValue(row)};
      const score = mentorScore(row);
      if (score != null) current.scores.push(score);
      if (mentorDetail(row)) {
        current.detail = mentorDetail(row);
        current.sort = periodSortValue(row);
      }
      map.set(id,current);
    }
    return [...map.values()].map((d) => ({...d, score:avg(d.scores)})).filter((d) => d.score != null || d.detail)
      .sort((a,b)=>(b.score??-1)-(a.score??-1));
  }, [mentorRows, selectedPeriods]);

  const avgScore = avg(drivers.map((d)=>d.score));
  const belowTarget = drivers.filter((d)=>numberOrNull(d.score)!=null && d.score<TARGETS.mentor).length;
  const highRisk = drivers.filter((d)=>Object.values(d.detail||{}).some((v)=>String(v).toLowerCase().includes("high risk"))).length;
  const trainingOpen = drivers.filter((d)=>{
    const t=numberOrNull(d.detail?.training), c=numberOrNull(d.detail?.completed);
    return t!=null && c!=null && c<t;
  }).length;

  return <>
    <div className="page-heading history-heading">
      <div><span className="page-kicker">SAFETY</span><h1>Mentor intelligence</h1><p>Driving score, behavioural risk categories and training completion in one operational view.</p></div>
      <RangeSelector value={range} onChange={setRange} />
    </div>

    <section className="concession-summary mentor-summary">
      <article><span>Average score</span><strong>{avgScore == null ? "—" : Math.round(avgScore)}</strong><small>Target ≥ {TARGETS.mentor}</small></article>
      <article><span>Below target</span><strong>{belowTarget}</strong><small>Needs attention</small></article>
      <article><span>High-risk drivers</span><strong>{highRisk}</strong><small>Any high-risk behaviour</small></article>
      <article><span>Training outstanding</span><strong>{trainingOpen}</strong><small>Completed below assigned</small></article>
    </section>

    <section className="leaderboard-grid">
      <LeaderboardTable
        title="Top 5 Mentor scores"
        subtitle="Highest average score in the selected period."
        rows={drivers.slice(0,5).map((d)=>({...d, mentor:d.score, index:(d.score||0)/TARGETS.mentor*100}))}
      />
      <LeaderboardTable
        title="Bottom 5 Mentor scores"
        subtitle="Lowest score first — prioritise coaching."
        rows={drivers.slice().sort((a,b)=>(a.score??9999)-(b.score??9999)).slice(0,5).map((d)=>({...d, mentor:d.score, index:(d.score||0)/TARGETS.mentor*100}))}
        bottom
      />
    </section>

    <section className="panel">
      <div className="panel-head"><div><h2>Mentor driver table</h2><p>Mirrors the operational safety report while keeping the MetrixIQ design system.</p></div><span className="panel-badge">{drivers.length} drivers</span></div>
      <div className="table-wrap"><table className="data-table mentor-table"><thead><tr>
        <th>Driver</th><th>TRID</th><th>Score</th><th>Acceleration</th><th>Braking</th><th>Cornering</th><th>Distraction</th><th>Speeding</th><th>Events</th><th>Training</th><th>Completed</th>
      </tr></thead><tbody>
        {drivers.length ? drivers.map((driver)=><tr key={driver.id}>
          <td><b>{driver.name}</b></td><td>{driver.trid}</td>
          <td><span className={`score-pill ${(driver.score??0)>=TARGETS.mentor?"good":"warn"}`}>{driver.score==null?"—":Math.round(driver.score)}</span></td>
          {["acceleration","braking","cornering","distraction","speedingRisk"].map((key)=><td key={key}><span className={`mentor-risk ${riskTone(driver.detail?.[key])}`}>{driver.detail?.[key]||"—"}</span></td>)}
          <td>{driver.detail?.speedingEvents ?? "—"}</td><td>{driver.detail?.training ?? "—"}</td><td>{driver.detail?.completed ?? "—"}</td>
        </tr>) : <tr><td colSpan="11"><div className="history-empty compact">Import a Mentor/eMentor spreadsheet to populate this table.</div></td></tr>}
      </tbody></table></div>
    </section>
  </>;
}
