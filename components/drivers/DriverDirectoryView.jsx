"use client";

import { useEffect, useMemo, useState } from "react";
import { isUsablePersonName } from "../../lib/identity";
import { TARGETS } from "../../lib/config/performance";

const n = (value) =>
  value == null || value === "" || Number.isNaN(Number(value)) ? null : Number(value);

const fmtPct = (value, digits = 2) =>
  n(value) == null ? "—" : `${Number(value).toFixed(digits)}%`;

const fmtNum = (value, digits = 0) =>
  n(value) == null ? "—" : Number(value).toFixed(digits);

function riskClass(risk) {
  const normalized = String(risk || "Low").toLowerCase();
  return normalized === "high" ? "bad" : normalized === "medium" ? "warn" : "good";
}

function targetFor(metric) {
  if (metric === "dcr") return TARGETS.dcr;
  if (metric === "pod") return TARGETS.pod;
  if (metric === "iadc") return TARGETS.iadc;
  if (metric === "mentor") return TARGETS.mentor;
  return null;
}

function metricStatus(metric, value) {
  const numeric = n(value);
  if (numeric == null) return "neutral";
  const target = targetFor(metric);
  if (target == null) return "neutral";
  return numeric >= target ? "good" : numeric >= target * 0.97 ? "warn" : "bad";
}

function MetricPill({ metric, value }) {
  const tone = metricStatus(metric, value);
  const shown = metric === "mentor" ? fmtNum(value) : fmtPct(value);
  return <span className={`pro-metric-pill ${tone}`}>{shown}</span>;
}

function EmptyRow({ columns, text }) {
  return (
    <tr>
      <td colSpan={columns}>
        <div className="pro-empty-row">{text}</div>
      </td>
    </tr>
  );
}

export default function DriverDirectoryView({ drivers = [], onOpen, query = "" }) {
  const [localQuery, setLocalQuery] = useState(query);
  const [risk, setRisk] = useState("all");
  const [coverage, setCoverage] = useState("all");

  useEffect(() => setLocalQuery(query), [query]);

  const filtered = useMemo(() => {
    return drivers
      .filter((driver) => {
        const text = `${driver.name || ""} ${driver.id || ""} ${driver.site || ""}`.toLowerCase();
        if (!text.includes(localQuery.toLowerCase())) return false;
        if (risk !== "all" && String(driver.risk || "Low").toLowerCase() !== risk) return false;

        const dataPoints = [
          driver.dcr,
          driver.pod,
          driver.iadc,
          driver.mentor_score ?? driver.ementor ?? driver.fico,
        ].filter((value) => n(value) != null).length;

        if (coverage === "complete" && dataPoints < 3) return false;
        if (coverage === "partial" && dataPoints >= 3) return false;
        return true;
      })
      .sort((a, b) => (n(b.performance) ?? -1) - (n(a.performance) ?? -1));
  }, [drivers, localQuery, risk, coverage]);

  const unresolved = drivers.filter((driver) => !isUsablePersonName(driver.name)).length;
  const coaching = drivers.filter((driver) => String(driver.risk || "").toLowerCase() !== "low").length;
  const measured = drivers.filter((driver) =>
    [driver.dcr, driver.pod, driver.iadc, driver.mentor_score ?? driver.ementor ?? driver.fico].some(
      (value) => n(value) != null
    )
  ).length;

  return (
    <>
      <div className="page-heading pro-heading">
        <div>
          <span className="page-kicker">OPERATIONS</span>
          <h1>Driver directory</h1>
          <p>One trusted profile per TRID with the latest available operational evidence.</p>
        </div>
      </div>

      <section className="pro-kpi-grid">
        <article>
          <span>Total drivers</span>
          <strong>{drivers.length}</strong>
          <small>Current workspace</small>
        </article>
        <article>
          <span>Measured</span>
          <strong>{measured}</strong>
          <small>At least one current metric</small>
        </article>
        <article className={coaching ? "warn" : ""}>
          <span>Needs attention</span>
          <strong>{coaching}</strong>
          <small>Medium or high risk</small>
        </article>
        <article className={unresolved ? "bad" : ""}>
          <span>Unresolved identity</span>
          <strong>{unresolved}</strong>
          <small>Requires trusted mapping</small>
        </article>
      </section>

      <section className="panel pro-table-panel">
        <div className="pro-filterbar">
          <input
            value={localQuery}
            onChange={(event) => setLocalQuery(event.target.value)}
            placeholder="Search driver name, TRID or site…"
          />
          <select value={risk} onChange={(event) => setRisk(event.target.value)}>
            <option value="all">All risk levels</option>
            <option value="low">Low risk</option>
            <option value="medium">Medium risk</option>
            <option value="high">High risk</option>
          </select>
          <select value={coverage} onChange={(event) => setCoverage(event.target.value)}>
            <option value="all">All data coverage</option>
            <option value="complete">3+ core metrics</option>
            <option value="partial">Partial evidence</option>
          </select>
          <span className="pro-filter-count">{filtered.length} shown</span>
        </div>

        <div className="table-wrap">
          <table className="data-table pro-directory-table">
            <thead>
              <tr>
                <th>Driver</th>
                <th>Site</th>
                <th>Index</th>
                <th>DCR</th>
                <th>POD</th>
                <th>IADC</th>
                <th>Mentor</th>
                <th>Concessions</th>
                <th>Risk</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((driver) => {
                const mentor = n(driver.mentor_score ?? driver.ementor ?? driver.fico);
                const unresolvedName = !isUsablePersonName(driver.name);

                return (
                  <tr
                    key={`${driver.dbId || ""}-${driver.id}`}
                    className={unresolvedName ? "pro-unresolved-row" : ""}
                  >
                    <td>
                      <div className="pro-driver-cell">
                        <span>
                          {unresolvedName
                            ? "?"
                            : String(driver.name || "D")
                                .split(/\s+/)
                                .slice(0, 2)
                                .map((part) => part[0])
                                .join("")
                                .toUpperCase()}
                        </span>
                        <div>
                          <b>{unresolvedName ? "Unresolved driver" : driver.name}</b>
                          <small>{driver.id}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="site-chip">{driver.site || "Unassigned"}</span>
                    </td>
                    <td>
                      <div className="pro-index-cell">
                        <b>{n(driver.performance) == null ? "—" : Math.round(driver.performance)}</b>
                        {n(driver.performance) != null && (
                          <i
                            style={{
                              width: `${Math.min(100, Math.max(0, Number(driver.performance)))}%`,
                            }}
                          />
                        )}
                      </div>
                    </td>
                    <td><MetricPill metric="dcr" value={driver.dcr} /></td>
                    <td><MetricPill metric="pod" value={driver.pod} /></td>
                    <td><MetricPill metric="iadc" value={driver.iadc} /></td>
                    <td><MetricPill metric="mentor" value={mentor} /></td>
                    <td>
                      <span
                        className={`concession-badge ${
                          (n(driver.concessions) || 0) >= 3
                            ? "bad"
                            : (n(driver.concessions) || 0) > 0
                              ? "warn"
                              : "good"
                        }`}
                      >
                        {n(driver.concessions) == null ? "—" : Number(driver.concessions).toFixed(0)}
                      </span>
                    </td>
                    <td>
                      <span className={`pro-risk-chip ${riskClass(driver.risk)}`}>
                        {driver.risk || "Low"}
                      </span>
                    </td>
                    <td>
                      <button type="button" className="profile-link" onClick={() => onOpen?.(driver)}>
                        Open profile →
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!filtered.length && (
                <EmptyRow columns={10} text="No drivers match the current filters." />
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
