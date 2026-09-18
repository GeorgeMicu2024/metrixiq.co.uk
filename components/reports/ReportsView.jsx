"use client";

import { useMemo, useState } from "react";
import { buildFleetIntelligence } from "../../lib/intelligence/fleet";
import {
  buildDriverPerformanceRows,
  buildExecutiveSummary,
  buildHistoryRows,
  buildRiskRows,
  toCsv,
} from "../../lib/reports/fleetReports";

function downloadText(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function ExportButton({ children, onClick, primary = false }) {
  return (
    <button
      type="button"
      className={primary ? "btn primary" : "btn ghost"}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export default function ReportsView({ drivers = [], kpis = {}, history = [] }) {
  const [notice, setNotice] = useState("");
  const intelligence = useMemo(
    () => buildFleetIntelligence(drivers, kpis, history),
    [drivers, kpis, history]
  );

  const driverRows = useMemo(() => buildDriverPerformanceRows(drivers), [drivers]);
  const riskRows = useMemo(() => buildRiskRows(drivers), [drivers]);
  const historyRows = useMemo(() => buildHistoryRows(history), [history]);

  function exportCsv(filename, rows, label) {
    if (!rows.length) {
      setNotice(`No ${label.toLowerCase()} data is available to export yet.`);
      return;
    }

    downloadText(filename, toCsv(rows), "text/csv;charset=utf-8");
    setNotice(`${label} exported successfully.`);
  }

  function exportExecutive() {
    const summary = buildExecutiveSummary(drivers, kpis, history);
    downloadText(
      "metrixiq-executive-fleet-brief.json",
      JSON.stringify(summary, null, 2),
      "application/json;charset=utf-8"
    );
    setNotice("Executive fleet brief exported successfully.");
  }

  const reports = [
    {
      id: "executive",
      title: "Executive Fleet Brief",
      description: "Fleet health, risk, evidence confidence and management priorities.",
      records: drivers.length,
      format: "JSON + Print",
      action: exportExecutive,
      actionLabel: "Export brief",
    },
    {
      id: "drivers",
      title: "Driver Performance",
      description: "Driver-level KPI, risk, issue and confidence dataset.",
      records: driverRows.length,
      format: "CSV",
      action: () => exportCsv("metrixiq-driver-performance.csv", driverRows, "Driver performance"),
      actionLabel: "Download CSV",
    },
    {
      id: "risk",
      title: "Risk & Coaching",
      description: "Drivers currently requiring operational or coaching attention.",
      records: riskRows.length,
      format: "CSV",
      action: () => exportCsv("metrixiq-risk-coaching.csv", riskRows, "Risk and coaching"),
      actionLabel: "Download CSV",
    },
    {
      id: "history",
      title: "Fleet History",
      description: "Weekly fleet KPI and performance movement for trend analysis.",
      records: historyRows.length,
      format: "CSV",
      action: () => exportCsv("metrixiq-fleet-history.csv", historyRows, "Fleet history"),
      actionLabel: "Download CSV",
    },
  ];

  return (
    <>
      <div className="page-heading reports-heading">
        <div>
          <span className="page-kicker">REPORTING</span>
          <h1>Report centre</h1>
          <p>
            Export management-ready evidence from the same trusted data used by
            scorecards, coaching and operational intelligence.
          </p>
        </div>
        <div className="page-actions">
          <ExportButton onClick={() => window.print()}>Print / Save PDF</ExportButton>
          <ExportButton onClick={exportExecutive} primary>Export executive brief</ExportButton>
        </div>
      </div>

      <section className="reports-summary">
        <article>
          <span>Decision confidence</span>
          <strong>{intelligence.confidence}%</strong>
          <small>{intelligence.completeness}% KPI coverage</small>
        </article>
        <article>
          <span>Drivers available</span>
          <strong>{drivers.length}</strong>
          <small>{intelligence.highRisk} high risk</small>
        </article>
        <article>
          <span>Historical periods</span>
          <strong>{historyRows.length}</strong>
          <small>Fleet trend evidence</small>
        </article>
        <article>
          <span>Reports ready</span>
          <strong>{reports.filter((report) => report.records > 0 || report.id === "executive").length}</strong>
          <small>Exportable now</small>
        </article>
      </section>

      {notice && <div className="reports-notice">{notice}</div>}

      <section className="reports-brief panel">
        <div className="panel-head">
          <div>
            <h2>Management brief</h2>
            <p>Current evidence translated into a concise management signal.</p>
          </div>
          <span className="panel-badge">{intelligence.confidence}% confidence</span>
        </div>
        <div className="reports-brief-grid">
          <div>
            <span>Priority</span>
            <h3>{intelligence.headline}</h3>
            <p>{intelligence.summary}</p>
          </div>
          <div className="reports-actions-preview">
            {intelligence.actions.slice(0, 3).map((action, index) => (
              <div key={action.id}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <b>{action.title}</b>
                  <small>{action.text}</small>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="reports-grid">
        {reports.map((report) => (
          <article key={report.id} className="reports-card">
            <div className="reports-card-top">
              <span>{report.format}</span>
              <b className={report.records || report.id === "executive" ? "ready" : "empty"}>
                {report.records || report.id === "executive" ? "READY" : "NO DATA"}
              </b>
            </div>
            <h3>{report.title}</h3>
            <p>{report.description}</p>
            <div className="reports-card-meta">
              <span>Records</span>
              <strong>{report.records}</strong>
            </div>
            <button type="button" onClick={report.action}>
              {report.actionLabel} →
            </button>
          </article>
        ))}
      </section>
    </>
  );
}
