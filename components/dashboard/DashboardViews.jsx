"use client";

import { useState } from "react";

import { isUsablePersonName } from "../../lib/identity";
import { TARGETS, targetLabel } from "../../lib/config/performance";
import { HistoryTrendChart } from "../HistoricalAnalytics";
import { avg, fmt, initials, numberOrNull, tone } from "./utils";
import { buildFleetIntelligence } from "../../lib/intelligence/fleet";
import CommandCenterPanel from "./CommandCenterPanel";
import { buildDriver360Snapshot } from "../../lib/drivers/driver360";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { deleteMyAccount, updateMyProfile, updateMyPassword, signOutAllSessions } from "../../lib/data/account";
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

export function DashboardView({ commandCenter, drivers, kpis, history, onImport, onOpenDriver, onDrivers, onPerformance, onCoaching, onConcessions, onDataQuality }) {
  const intelligence = buildFleetIntelligence(drivers, kpis, history);
  const high = intelligence.highRisk;
  const med = intelligence.mediumRisk;
  const low = Math.max(0, drivers.length - high - med);
  const health = Math.round(avg(drivers, "performance") || 0);
  const total = Math.max(1, drivers.length);
  const attentionDrivers = intelligence.priorityDrivers.slice(0, 6).map((item) => item.driver);
  const openAction = (destination) => {
    if (destination === "coaching") return onCoaching?.();
    if (destination === "data-quality") return onDataQuality?.();
    if (destination === "imports") return onImport?.();
    return onPerformance?.();
  };
  return <><div className="page-heading"><div><span className="page-kicker">OVERVIEW</span><h1>Fleet performance</h1><p>One operating view across driver performance, risk, data quality and coaching.</p></div><div className="page-actions"><button className="btn ghost" onClick={onPerformance}>Performance history</button><button className="btn primary" onClick={onImport}>Import reports</button></div></div>
    <CommandCenterPanel
      summary={commandCenter}
      intelligence={intelligence}
      drivers={drivers}
      onCoaching={onCoaching}
      onConcessions={onConcessions}
      onImport={onImport}
      onOpenDriver={onOpenDriver}
    />
    <section className="summary-strip"><div><span>Fleet health</span><strong>{health}<small>/100</small></strong><em>Current fleet score</em></div><div><span>Active drivers</span><strong>{drivers.length}</strong><em>Current workspace</em></div><div><span>High risk</span><strong>{high}</strong><em>Needs attention</em></div><div><span>Data confidence</span><strong>{kpis.data_confidence != null ? `${Number(kpis.data_confidence).toFixed(0)}%` : `${intelligence.confidence}%`}</strong><em>{intelligence.completeness}% KPI coverage</em></div></section>
    <section className="metric-grid"><MetricCard label="DCR" value={fmt(kpis.dcr, "dcr")} target={`Target ≥ ${TARGETS.dcr.toFixed(2)}%`} note="Fleet average" accent={kpis.dcr != null && kpis.dcr < TARGETS.dcr ? "warn" : "good"} /><MetricCard label="POD" value={fmt(kpis.pod, "pod")} target={`Target ≥ ${TARGETS.pod.toFixed(2)}%`} note={kpis.pod != null && kpis.pod < TARGETS.pod ? "Watch" : "Healthy"} accent={kpis.pod != null && kpis.pod < TARGETS.pod ? "warn" : "good"} /><MetricCard label="IADC" value={fmt(kpis.iadc, "iadc")} target={`Target ≥ ${TARGETS.iadc}%`} note="Fleet average" accent={kpis.iadc != null && kpis.iadc < TARGETS.iadc ? "warn" : "good"} /><MetricCard label="Mentor Score" value={fmt(kpis.mentor, "mentor")} target={`Target ≥ ${TARGETS.mentor}`} note="Unified driving score" accent={kpis.mentor != null && kpis.mentor < TARGETS.mentor ? "warn" : "good"} /><MetricCard label="Contact Compliance" value={fmt(kpis.cc, "cc")} target={targetLabel("cc")} note="Fleet average" /><MetricCard label="Concessions" value={fmt(kpis.concessions, "concessions")} target="Lower is better" note="Weekly quality signal" accent="warn" /></section>
    <section className="dashboard-grid"><article className="panel"><div className="panel-head"><div><h2>Performance trend</h2><p>Combined fleet score versus weekly target</p></div><span className="panel-badge good">Stored history</span></div><HistoryTrendChart history={history} /><div className="chart-legend"><span><i className="legend-line teal" />Fleet performance</span><span><i className="legend-line target" />Target 85</span></div></article>
      <article className="panel"><div className="panel-head"><div><h2>Driver risk</h2><p>Current prioritisation model</p></div><span className="panel-badge">{drivers.length} drivers</span></div><div className="risk-content"><div className="risk-donut" style={{ background: `conic-gradient(#18aa86 0 ${low / total * 100}%, #f0b84b ${low / total * 100}% ${(low + med) / total * 100}%, #ef626b ${(low + med) / total * 100}% 100%)` }}><div><strong>{high}</strong><span>high risk</span></div></div><div className="risk-list"><div><span><i className="risk-dot low" />Low risk</span><b>{low}</b></div><div><span><i className="risk-dot med" />Medium risk</span><b>{med}</b></div><div><span><i className="risk-dot high" />High risk</span><b>{high}</b></div></div></div></article></section>
    <section className="dashboard-grid lower"><article className="panel"><div className="panel-head"><div><h2>Drivers requiring attention</h2><p>Prioritised by KPI gaps, risk, concessions and data confidence</p></div><button className="link-btn" onClick={onDrivers}>View all</button></div><DriverTable drivers={attentionDrivers} compact onOpen={onOpenDriver} emptyText="No drivers currently require priority management attention." /></article><article className="panel"><div className="panel-head"><div><h2>Management actions</h2><p>Generated from the current fleet evidence</p></div><span className="panel-badge">{intelligence.confidence}% confidence</span></div><div className="action-list">{intelligence.actions.slice(0,3).map((action,index)=><Action key={action.id} n={String(index+1).padStart(2,"0")} title={action.title} text={action.text} onClick={()=>openAction(action.destination)} />)}</div></article></section></>;
}

export function IntelligenceView({
  drivers,
  kpis,
  history,
  onCoaching,
  onImport,
  onPerformance,
  onDataQuality,
  onOpenDriver,
}) {
  const intelligence = buildFleetIntelligence(drivers, kpis, history);
  const priorityDrivers = intelligence.priorityDrivers.slice(0, 6).map((item) => item.driver);

  const openAction = (destination) => {
    if (destination === "coaching") return onCoaching?.();
    if (destination === "data-quality") return onDataQuality?.();
    if (destination === "imports") return onImport?.();
    return onPerformance?.();
  };

  return <>
    <div className="page-heading">
      <div>
        <span className="page-kicker">INTELLIGENCE ENGINE</span>
        <h1>Operational intelligence</h1>
        <p>Explainable signals generated from imported fleet evidence, KPI targets and historical movement.</p>
      </div>
      <div className="intel-confidence-card">
        <span>Decision confidence</span>
        <strong>{intelligence.confidence}%</strong>
        <small>{intelligence.completeness}% core KPI coverage</small>
      </div>
    </div>

    <div className="intel-app-grid">
      <article className="insight-hero">
        <span>PRIORITY SIGNAL</span>
        <h2>{intelligence.headline}</h2>
        <p>{intelligence.summary}</p>
        <div className="intel-hero-actions">
          <button className="btn light" onClick={() => openAction(intelligence.actions[0]?.destination)}>
            Open recommended action
          </button>
          <small>Evidence-led · explainable · refreshed from workspace data</small>
        </div>
      </article>

      <article className="panel">
        <div className="panel-head">
          <div>
            <h2>Evidence summary</h2>
            <p>Measured pressure and data coverage by KPI</p>
          </div>
        </div>
        <div className="evidence-list">
          {intelligence.evidence.map((metric) => (
            <div key={metric.key}>
              <b>{metric.label}</b>
              <span>{metric.below} below target · {metric.coverage}% measured</span>
            </div>
          ))}
        </div>
      </article>
    </div>

    <section className="dashboard-grid lower intel-detail-grid">
      <article className="panel">
        <div className="panel-head">
          <div>
            <h2>Priority drivers</h2>
            <p>Ranked by risk, KPI failures, concessions and identity confidence</p>
          </div>
          <span className="panel-badge">{priorityDrivers.length} shown</span>
        </div>
        <DriverTable drivers={priorityDrivers} compact onOpen={onOpenDriver} emptyText="No driver currently triggers a priority intelligence signal." />
      </article>

      <article className="panel">
        <div className="panel-head">
          <div>
            <h2>Recommended actions</h2>
            <p>Highest-value management interventions right now</p>
          </div>
        </div>
        <div className="action-list">
          {intelligence.actions.map((action,index) => (
            <Action
              key={action.id}
              n={String(index + 1).padStart(2, "0")}
              title={action.title}
              text={action.text}
              onClick={() => openAction(action.destination)}
            />
          ))}
        </div>
      </article>
    </section>
  </>;
}

function coachingRecommendations(d) {
  const items = [];
  if (numberOrNull(d.dcr) != null && Number(d.dcr) < TARGETS.dcr) items.push(`DCR is below ${TARGETS.dcr.toFixed(2)}%. Review unsuccessful deliveries and complete every possible reattempt.`);
  if (numberOrNull(d.pod) != null && Number(d.pod) < TARGETS.pod) items.push(`POD is below ${TARGETS.pod.toFixed(2)}%. Coach clear, customer-presentable delivery photos.`);
  if (numberOrNull(d.iadc) != null && Number(d.iadc) < TARGETS.iadc) items.push(`IADC is below ${TARGETS.iadc}%. Reinforce Notify of Arrival, first app option, clear POD and swipe at location.`);
  const mentor = numberOrNull(d.ementor) ?? numberOrNull(d.fico);
  if (mentor != null && mentor < TARGETS.mentor) items.push(`Mentor driving score is below ${TARGETS.mentor}. Review acceleration, braking, cornering, distraction and speeding.`);
  if (numberOrNull(d.concessions) != null && Number(d.concessions) > 2) items.push("Review weekly concessions and identify repeat delivery, POD or customer-contact patterns.");
  if (!items.length) items.push("No urgent coaching intervention detected. Maintain current workflow and monitor the next reporting cycle.");
  return items;
}

export function DriverScorecardView({ driver, history, historyLoading, onBack }) {
  const snapshot = buildDriver360Snapshot(driver, history);
  const current = snapshot.current;
  const metrics = [
    ["DCR", current.dcr ?? driver.dcr, "dcr", `Target ≥ ${TARGETS.dcr.toFixed(2)}%`],
    ["POD", current.pod ?? driver.pod, "pod", `Target ≥ ${TARGETS.pod.toFixed(2)}%`],
    ["IADC", current.iadc ?? driver.iadc, "iadc", targetLabel("iadc")],
    ["CC", current.cc ?? driver.cc, "cc", targetLabel("cc")],
    ["Mentor Score", current.mentor_score ?? current.ementor ?? current.fico ?? driver.ementor ?? driver.fico, "mentor", `Target ≥ ${TARGETS.mentor}`],
    ["PSB", current.psb ?? driver.psb, "psb", targetLabel("psb")],
    ["Reattempts", current.reattempts ?? driver.reattempts, "reattempts", targetLabel("reattempts")],
    ["Concessions", current.concessions ?? driver.concessions, "concessions", "Lower is better"],
    ["LoR", current.lor ?? driver.lor, "lor", "Lower is better"],
  ];
  const recommendations = coachingRecommendations({
    ...driver,
    ...current,
    dataConfidence: snapshot.confidence ?? driver.dataConfidence,
  });

  return <>
    <button type="button" className="scorecard-back" onClick={onBack}>← Back</button>

    <section className="scorecard-hero driver360-hero">
      <div className="scorecard-person">
        <span className="scorecard-avatar">{driver.initials || initials(driver.name)}</span>
        <div>
          <span className="page-kicker">DRIVER 360</span>
          <h1>{driver.name}</h1>
          <p>{driver.site || "No site"} · {driver.id} · {driver.status || "Active"} · {snapshot.latestLabel}</p>
        </div>
      </div>
      <div className="scorecard-status">
        <span className={`risk-pill ${tone(snapshot.latestRisk)}`}>{snapshot.latestRisk} risk</span>
        <strong>{fmt(snapshot.currentPerformance, "performance")}<small>/100</small></strong>
        <em>Current performance</em>
      </div>
    </section>

    <Driver360Overview snapshot={snapshot} />

    <section className="scorecard-metrics">
      {metrics.map(([label, value, key, target]) => (
        <MetricCard
          key={label}
          label={label}
          value={fmt(value, key)}
          target={target}
          note="Latest result"
          accent={
            (key === "dcr" && Number(value) < TARGETS.dcr) ||
            (key === "pod" && Number(value) < TARGETS.pod) ||
            (key === "iadc" && Number(value) < TARGETS.iadc) ||
            (key === "mentor" && Number(value) < TARGETS.mentor)
              ? "warn"
              : "good"
          }
        />
      ))}
    </section>

    <Driver360DeltaGrid snapshot={snapshot} />

    <section className="scorecard-layout driver360-layout">
      <article className="panel">
        <div className="panel-head">
          <div>
            <h2>Performance trajectory</h2>
            <p>Recent performance score movement across imported periods.</p>
          </div>
          <span className="panel-badge">{snapshot.periods.length} periods</span>
        </div>
        {historyLoading
          ? <div className="scorecard-loading">Loading trajectory…</div>
          : <DriverTrajectoryChart snapshot={snapshot} />}
      </article>

      <article className="panel">
        <div className="panel-head">
          <div>
            <h2>Current risk evidence</h2>
            <p>Latest operational signal and data quality context.</p>
          </div>
        </div>
        <div className="scorecard-issue">
          <span>Primary issue</span>
          <strong>{current.issue || driver.issue || "No active concern"}</strong>
          <p>
            Data confidence: {snapshot.confidence != null ? `${Number(snapshot.confidence).toFixed(0)}%` : "Not provided"}
            {" · "}
            Coverage: {snapshot.coverage}%
          </p>
        </div>
        <div className="driver360-risk-context">
          <div><span>Current risk</span><b>{snapshot.latestRisk}</b></div>
          <div><span>Previous risk</span><b>{snapshot.previousRisk || "—"}</b></div>
          <div><span>4-week concessions</span><b>{snapshot.fourWeekConcessions}</b></div>
        </div>
        <div className="scorecard-source">
          Source: {driver.dbId ? "Supabase driver metrics" : "Demo / locally imported analysis"}
        </div>
      </article>
    </section>

    <DriverEvidenceTimeline snapshot={snapshot} />

    <section className="panel coaching-recommendations driver360-coaching">
      <div className="panel-head">
        <div>
          <h2>Coaching action</h2>
          <p>Evidence-led next steps for the manager.</p>
        </div>
        <span className="panel-badge">{recommendations.length} actions</span>
      </div>
      <div className="recommendation-list">
        {recommendations.map((text, i) => (
          <div key={text}>
            <span>{String(i + 1).padStart(2, "0")}</span>
            <p>{text}</p>
          </div>
        ))}
      </div>
    </section>
  </>;
}

export function SettingsView({ session, onLogout, onProfileUpdated }) {
  const [name, setName] = useState(session.name || "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function run(key, fn) { setBusy(key); setError(""); setMessage(""); try { await fn(); } catch(e) { setError(e?.message || "Action failed."); } finally { setBusy(""); } }
  return <><div className="page-heading"><div><span className="page-kicker">ACCOUNT</span><h1>Account settings</h1><p>Identity, password and active sessions.</p></div></div>
  {error && <div className="saas-error">{error}</div>}{message && <div className="form-notice">{message}</div>}
  <div className="settings-grid"><section className="panel"><h2>Account identity</h2><label>Full name<input value={name} onChange={e=>setName(e.target.value)} /></label><div className="setting-row"><span>Email</span><b>{session.email}</b></div><div className="setting-row"><span>Organisation</span><b>{session.organisation || "My Fleet"}</b></div><div className="setting-row"><span>Access</span><b>{session.role || "Member"}</b></div><button className="btn primary" disabled={busy==="profile"} onClick={()=>run("profile",async()=>{await updateMyProfile(getSupabaseBrowserClient(),name); onProfileUpdated?.(name.trim()); setMessage("Profile updated.");})}>{busy==="profile"?"Saving…":"Save profile"}</button></section>
  <section className="panel"><h2>Password & sessions</h2><label>New password<input type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Minimum 8 characters" /></label><button className="btn primary" disabled={busy==="password"} onClick={()=>run("password",async()=>{await updateMyPassword(getSupabaseBrowserClient(),password); setPassword(""); setMessage("Password updated.");})}>{busy==="password"?"Updating…":"Change password"}</button><p className="settings-copy">If you suspect another device still has access, sign out every active session and log in again.</p><button className="btn danger" disabled={busy==="sessions"} onClick={()=>run("sessions",async()=>{await signOutAllSessions(getSupabaseBrowserClient()); onLogout?.();})}>{busy==="sessions"?"Signing out…":"Sign out all sessions"}</button><hr /><h3>Danger zone</h3><p className="settings-copy">Deleting your account is permanent. Workspace owners must transfer ownership first.</p><button className="btn danger" disabled={busy==="delete"} onClick={()=>{if(window.prompt("Type DELETE to permanently delete your account.")!=="DELETE") return; run("delete",async()=>{await deleteMyAccount(getSupabaseBrowserClient()); onLogout?.();});}}>{busy==="delete"?"Deleting…":"Delete account"}</button></section></div></>;
}
