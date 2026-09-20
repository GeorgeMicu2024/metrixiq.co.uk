"use client";

import { isUsablePersonName } from "../../lib/identity";
import { TARGETS, targetLabel } from "../../lib/config/performance";
import { HistoryTrendChart } from "../HistoricalAnalytics";
import { avg, fmt, initials, numberOrNull, tone } from "./utils";
import { buildFleetIntelligence } from "../../lib/intelligence/fleet";
import { buildInterventionQueue } from "../../lib/intelligence/operationsCopilot";
import { predictDeterioration } from "../../lib/intelligence/decisionEngine";
import { createAiInterventionTask } from "../../lib/data/automationV8";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import CommandCenterPanel from "./CommandCenterPanel";
import ManagerDailyBrief from "./ManagerDailyBrief";
import { buildDriver360Snapshot } from "../../lib/drivers/driver360";
import {
  Driver360DeltaGrid,
  Driver360Overview,
  DriverEvidenceTimeline,
  DriverTrajectoryChart,
} from "../drivers/Driver360Sections";

function MetricCard({ label, value, target, note, accent = "good" }) {
  return <article className="metric-card"><div className="metric-top"><span>{label}</span><i className={`metric-dot ${accent}`} /></div><strong>{value}</strong><div className="metric-bottom"><span>{target}</span><em>{note}</em></div></article>;
}
function Action({ n, title, text, onClick }) { return <div className="action-item"><span>{n}</span><div><b>{title}</b><p>{text}</p></div><button type="button" aria-label={title} onClick={onClick}>→</button></div>; }

function DriverTable({
  drivers,
  compact = false,
  onOpen,
  emptyText = "No drivers match the current evidence and filters.",
}) {
  const columns = compact ? 7 : 8;

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Driver</th>
            <th>Site</th>
            <th>Performance</th>
            <th>POD</th>
            <th>IADC</th>
            <th>Risk</th>
            {!compact && <th>Issue</th>}
            <th />
          </tr>
        </thead>
        <tbody>
          {drivers.length === 0 ? (
            <tr>
              <td colSpan={columns}>
                <div className="table-empty-state">
                  <b>No action required</b>
                  <span>{emptyText}</span>
                </div>
              </td>
            </tr>
          ) : drivers.map((d) => {
            const unresolved = !isUsablePersonName(d.name);
            const label = unresolved ? "Unresolved identity" : d.name;

            return (
              <tr
                key={`${d.id}-${d.dbId || "driver"}`}
                className={onOpen ? "driver-row-clickable" : ""}
                onClick={() => onOpen?.(d)}
              >
                <td>
                  <div className="driver-cell">
                    <span className={`driver-avatar ${unresolved ? "unresolved" : ""}`}>
                      {unresolved ? "?" : (d.initials || initials(label))}
                    </span>
                    <div>
                      <b>{label}</b>
                      <small>{d.id}</small>
                    </div>
                  </div>
                </td>
                <td>{d.site || "—"}</td>
                <td><b>{fmt(d.performance, "performance")}</b></td>
                <td>{fmt(d.pod, "pod")}</td>
                <td>{fmt(d.iadc, "iadc")}</td>
                <td><span className={`risk-pill ${tone(d.risk)}`}>{d.risk || "Low"}</span></td>
                {!compact && <td className="issue-cell">{unresolved ? "Identity mapping required" : (d.issue || "No active concern")}</td>}
                <td>
                  <button
                    type="button"
                    className="profile-link"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpen?.(d);
                    }}
                  >
                    Open →
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function DashboardView({ organizationId, commandCenter, drivers, kpis, history, onImport, onOpenDriver, onDrivers, onPerformance, onCoaching, onConcessions, onDataQuality, onNavigate }) {
  const intelligence = buildFleetIntelligence(drivers, kpis, history);
  const high = intelligence.highRisk;
  const med = intelligence.mediumRisk;
  const low = Math.max(0, drivers.length - high - med);
  const health = Math.round(avg(drivers, "performance") || 0);
  const total = Math.max(1, drivers.length);
  const attentionDrivers = intelligence.priorityDrivers.slice(0, 6).map((item) => item.driver);
  const interventionQueue = buildInterventionQueue(drivers).slice(0,5);
  const deterioration = predictDeterioration(history).filter((item)=>item.deteriorating).slice(0,5);
  const createIntervention = async (item) => {
    if(!organizationId||!item?.primary)return;
    await createAiInterventionTask(getSupabaseBrowserClient(),{organizationId,driverId:item.driver?.dbId||null,site:item.driver?.site||null,signalKey:item.primary.key,title:`AI intervention · ${item.driver?.name||"Driver"} · ${item.primary.label}`,detail:item.explanation,priority:item.primary.impact>=8?"high":"medium",dueHours:item.primary.impact>=8?12:24,metadata:{root_cause:item.primary,recommended_action:item.nextAction}});
    onNavigate?.("manager-control");
  };
  const openAction = (destination) => {
    if (destination === "coaching") return onCoaching?.();
    if (destination === "data-quality") return onDataQuality?.();
    if (destination === "imports") return onImport?.();
    return onPerformance?.();
  };
  return <><div className="page-heading today-heading"><div><span className="page-kicker">TODAY</span><h1>Command Center</h1><p>Your operational priorities, exceptions and actions for today.</p></div><div className="page-actions"><button className="btn ghost" onClick={onPerformance}>Performance</button><button className="btn ghost" onClick={onCoaching}>Coaching</button><button className="btn primary" onClick={onImport}>Import reports</button></div></div>
    <CommandCenterPanel summary={commandCenter} intelligence={intelligence} drivers={drivers} onCoaching={onCoaching} onConcessions={onConcessions} onImport={onImport} onOpenDriver={onOpenDriver} />
    <section className="dashboard-grid lower"><article className="panel"><div className="panel-head"><div><h2>Priority drivers</h2><p>Drivers requiring management attention today.</p></div><button className="link-btn" onClick={onDrivers}>View all</button></div><DriverTable drivers={attentionDrivers} compact onOpen={onOpenDriver} emptyText="No drivers currently require priority management attention." /></article><article className="panel"><div className="panel-head"><div><h2>Recommended actions</h2><p>Highest-value actions from current evidence.</p></div><span className="panel-badge">{intelligence.confidence}% confidence</span></div><div className="action-list">{intelligence.actions.slice(0,4).map((action,index)=><Action key={action.id} n={String(index+1).padStart(2,"0")} title={action.title} text={action.text} onClick={()=>openAction(action.destination)} />)}</div></article></section></>; } 
