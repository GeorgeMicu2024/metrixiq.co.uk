"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Brand from "./Brand";
import {BillingProView, PlanOnboardingView, PlatformAdminView, SuspendedWorkspaceView, canAccessNav, TeamManagementView } from "./SaasFoundation";
import { analyseFiles } from "../lib/analyzer";
import { getSupabaseBrowserClient } from "../lib/supabase/client";
import { persistAnalysis } from "../lib/persistence";
import { aggregateFleetHistory, HistoryTrendChart } from "./HistoricalAnalytics";
import { CdfView, DataQualityView, DriverScorecardsView, SiteScorecardsView } from "./OperationalViews";
import { ProDriversView, ProPerformanceView } from "./ProfessionalViews";
import { DirectConcessionsView, DirectIadcView, DirectMentorView } from "./DirectOperationalViews";
import { isUsablePersonName } from "../lib/identity";
import { TARGETS, targetLabel } from "../lib/config/performance";
import { NAV_ICONS as icon, NAV_ITEMS as nav, navSection } from "./dashboard/navigation";
import { avg, fmt, initials, numberOrNull, tone } from "./dashboard/utils";
import { fetchAllDriverMetricRows } from "../lib/data/driverMetrics";

function MetricCard({ label, value, target, note, accent = "good" }) {
  return <article className="metric-card"><div className="metric-top"><span>{label}</span><i className={`metric-dot ${accent}`} /></div><strong>{value}</strong><div className="metric-bottom"><span>{target}</span><em>{note}</em></div></article>;
}
function Action({ n, title, text, onClick }) { return <div className="action-item"><span>{n}</span><div><b>{title}</b><p>{text}</p></div><button type="button" onClick={onClick}>→</button></div>; }

function DriverTable({ drivers, compact = false, onOpen }) {
  return <div className="table-wrap"><table className="data-table"><thead><tr><th>Driver</th><th>Site</th><th>Performance</th><th>POD</th><th>IADC</th><th>Risk</th>{!compact && <th>Issue</th>}<th /></tr></thead><tbody>{drivers.map((d) => {
    const unresolved = !isUsablePersonName(d.name);
    const label = unresolved ? "Unresolved identity" : d.name;
    return <tr key={`${d.id}-${d.dbId || "driver"}`} className={onOpen ? "driver-row-clickable" : ""} onClick={() => onOpen?.(d)}>
      <td><div className="driver-cell"><span className={`driver-avatar ${unresolved ? "unresolved" : ""}`}>{unresolved ? "?" : (d.initials || initials(label))}</span><div><b>{label}</b><small>{d.id}</small></div></div></td>
      <td>{d.site || "—"}</td><td><b>{fmt(d.performance, "performance")}</b></td><td>{fmt(d.pod, "pod")}</td><td>{fmt(d.iadc, "iadc")}</td><td><span className={`risk-pill ${tone(d.risk)}`}>{d.risk || "Low"}</span></td>{!compact && <td className="issue-cell">{unresolved ? "Identity mapping required" : (d.issue || "No active concern")}</td>}<td><button type="button" className="profile-link" onClick={(e) => { e.stopPropagation(); onOpen?.(d); }}>Open →</button></td>
    </tr>;
  })}</tbody></table></div>;
}

function DashboardView({ drivers, kpis, history, onImport, onOpenDriver, onDrivers, onPerformance, onCoaching }) {
  const high = drivers.filter((d) => d.risk === "High").length;
  const med = drivers.filter((d) => d.risk === "Medium").length;
  const low = Math.max(0, drivers.length - high - med);
  const health = Math.round(avg(drivers, "performance") || 0);
  const total = Math.max(1, drivers.length);
  return <><div className="page-heading"><div><span className="page-kicker">OVERVIEW</span><h1>Fleet performance</h1><p>One operating view across driver performance, risk, data quality and coaching.</p></div><div className="page-actions"><button className="btn ghost" onClick={onPerformance}>Performance history</button><button className="btn primary" onClick={onImport}>Import reports</button></div></div>
    <section className="summary-strip"><div><span>Fleet health</span><strong>{health}<small>/100</small></strong><em>Current fleet score</em></div><div><span>Active drivers</span><strong>{drivers.length}</strong><em>Current workspace</em></div><div><span>High risk</span><strong>{high}</strong><em>Needs attention</em></div><div><span>Data confidence</span><strong>{kpis.data_confidence != null ? `${Number(kpis.data_confidence).toFixed(0)}%` : "—"}</strong><em>Trusted records</em></div></section>
    <section className="metric-grid"><MetricCard label="DCR" value={fmt(kpis.dcr, "dcr")} target={`Target ≥ ${TARGETS.dcr.toFixed(2)}%`} note="Fleet average" accent={kpis.dcr != null && kpis.dcr < TARGETS.dcr ? "warn" : "good"} /><MetricCard label="POD" value={fmt(kpis.pod, "pod")} target={`Target ≥ ${TARGETS.pod.toFixed(2)}%`} note={kpis.pod != null && kpis.pod < TARGETS.pod ? "Watch" : "Healthy"} accent={kpis.pod != null && kpis.pod < TARGETS.pod ? "warn" : "good"} /><MetricCard label="IADC" value={fmt(kpis.iadc, "iadc")} target={`Target ≥ ${TARGETS.iadc}%`} note="Fleet average" accent={kpis.iadc != null && kpis.iadc < TARGETS.iadc ? "warn" : "good"} /><MetricCard label="Mentor Score" value={fmt(kpis.mentor, "mentor")} target={`Target ≥ ${TARGETS.mentor}`} note="Unified driving score" accent={kpis.mentor != null && kpis.mentor < TARGETS.mentor ? "warn" : "good"} /><MetricCard label="Contact Compliance" value={fmt(kpis.cc, "cc")} target={targetLabel("cc")} note="Fleet average" /><MetricCard label="Concessions" value={fmt(kpis.concessions, "concessions")} target="Lower is better" note="Weekly quality signal" accent="warn" /></section>
    <section className="dashboard-grid"><article className="panel"><div className="panel-head"><div><h2>Performance trend</h2><p>Combined fleet score versus weekly target</p></div><span className="panel-badge good">Stored history</span></div><HistoryTrendChart history={history} /><div className="chart-legend"><span><i className="legend-line teal" />Fleet performance</span><span><i className="legend-line target" />Target 85</span></div></article>
      <article className="panel"><div className="panel-head"><div><h2>Driver risk</h2><p>Current prioritisation model</p></div><span className="panel-badge">{drivers.length} drivers</span></div><div className="risk-content"><div className="risk-donut" style={{ background: `conic-gradient(#18aa86 0 ${low / total * 100}%, #f0b84b ${low / total * 100}% ${(low + med) / total * 100}%, #ef626b ${(low + med) / total * 100}% 100%)` }}><div><strong>{high}</strong><span>high risk</span></div></div><div className="risk-list"><div><span><i className="risk-dot low" />Low risk</span><b>{low}</b></div><div><span><i className="risk-dot med" />Medium risk</span><b>{med}</b></div><div><span><i className="risk-dot high" />High risk</span><b>{high}</b></div></div></div></article></section>
    <section className="dashboard-grid lower"><article className="panel"><div className="panel-head"><div><h2>Drivers requiring attention</h2><p>Prioritised by repeated failures and score deterioration</p></div><button className="link-btn" onClick={onDrivers}>View all</button></div><DriverTable drivers={drivers.filter((d) => d.risk !== "Low").slice(0, 6)} compact onOpen={onOpenDriver} /></article><article className="panel"><div className="panel-head"><div><h2>Management actions</h2><p>Recommended next steps from current evidence</p></div></div><div className="action-list"><Action n="01" title="Coach high-risk drivers" text={`${high} drivers have repeated quality or compliance deterioration.`} onClick={onCoaching} /><Action n="02" title="Review performance history" text="Use the selected reporting window to identify repeated deterioration." onClick={onPerformance} /><Action n="03" title="Import missing evidence" text="Add scorecards, POD, concessions, IADC and Mentor files to complete the weekly picture." onClick={onImport} /></div></article></section></>;
}

function CoachingView({ drivers, onOpen }) {
  const list = drivers.filter((d) => d.risk !== "Low");
  return <><div className="page-heading"><div><span className="page-kicker">OPERATIONS</span><h1>Coaching queue</h1><p>Turn risk signals into specific management action.</p></div></div><div className="coaching-list">{list.slice(0, 10).map((d, i) => <article key={d.id}><div className="coach-index">{String(i + 1).padStart(2, "0")}</div><div className="coach-main"><div className="driver-cell"><span className="driver-avatar">{d.initials || initials(d.name)}</span><div><b>{d.name}</b><small>{d.site} · {d.id}</small></div></div><p>{d.issue}</p></div><span className={`risk-pill ${tone(d.risk)}`}>{d.risk}</span><button className="btn ghost" onClick={() => onOpen(d)}>Open profile</button></article>)}</div></>;
}
function IntelligenceView({ drivers, onCoaching }) {
  const high = drivers.filter((d) => d.risk === "High");
  return <><div className="page-heading"><div><span className="page-kicker">INTELLIGENCE</span><h1>AI Insights</h1><p>Evidence-led signals based on imported driver performance data.</p></div></div><div className="intel-app-grid"><article className="insight-hero"><span>PRIORITY SIGNAL</span><h2>{high.length} drivers need intervention before the next reporting cycle.</h2><p>The strongest pattern is repeated POD / IADC deterioration combined with lower performance consistency. Prioritise coaching rather than reviewing every driver equally.</p><button className="btn light" onClick={onCoaching}>Open coaching queue</button></article><article className="panel"><div className="panel-head"><div><h2>Evidence summary</h2><p>What is driving the signal</p></div></div><div className="evidence-list"><div><b>DCR</b><span>{drivers.filter((d) => d.dcr != null && d.dcr < TARGETS.dcr).length} {`below ${TARGETS.dcr.toFixed(2)}%`}</span></div><div><b>POD</b><span>{drivers.filter((d) => d.pod != null && d.pod < TARGETS.pod).length} {`below ${TARGETS.pod.toFixed(2)}%`}</span></div><div><b>IADC</b><span>{drivers.filter((d) => d.iadc != null && d.iadc < TARGETS.iadc).length} {`below ${TARGETS.iadc}%`}</span></div><div><b>Mentor Score</b><span>{drivers.filter((d) => (d.ementor ?? d.fico) != null && (d.ementor ?? d.fico) < TARGETS.mentor).length} {`below ${TARGETS.mentor}`}</span></div></div></article></div></>;
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

function DriverScorecardView({ driver, history, historyLoading, onBack }) {
  const metrics = [
    ["DCR", driver.dcr, "dcr", `Target ≥ ${TARGETS.dcr.toFixed(2)}%`], ["POD", driver.pod, "pod", `Target ≥ ${TARGETS.pod.toFixed(2)}%`],
    ["IADC", driver.iadc, "iadc", targetLabel("iadc")], ["CC", driver.cc, "cc", targetLabel("cc")],
    ["Mentor Score", driver.ementor ?? driver.fico, "mentor", `Target ≥ ${TARGETS.mentor}`],
    ["PSB", driver.psb, "psb", targetLabel("psb")], ["Reattempts", driver.reattempts, "reattempts", targetLabel("reattempts")],
    ["Concessions", driver.concessions, "concessions", "Lower is better"], ["LoR", driver.lor, "lor", "Lower is better"],
  ];
  const historicalPerformance = history.map((h) => numberOrNull(h.performance)).filter((v) => v != null);
  const recommendations = coachingRecommendations(driver);
  return <>
    <button type="button" className="scorecard-back" onClick={onBack}>← Back</button>
    <section className="scorecard-hero">
      <div className="scorecard-person"><span className="scorecard-avatar">{driver.initials || initials(driver.name)}</span><div><span className="page-kicker">INDIVIDUAL DRIVER SCORECARD</span><h1>{driver.name}</h1><p>{driver.site || "No site"} · {driver.id} · {driver.status || "Active"}</p></div></div>
      <div className="scorecard-status"><span className={`risk-pill ${tone(driver.risk)}`}>{driver.risk || "Low"} risk</span><strong>{fmt(driver.performance, "performance")}<small>/100</small></strong><em>Performance score</em></div>
    </section>
    <section className="scorecard-metrics">{metrics.map(([label, value, key, target]) => <MetricCard key={label} label={label} value={fmt(value, key)} target={target} note="Latest result" accent={(key === "dcr" && Number(value) < TARGETS.dcr) || (key === "pod" && Number(value) < TARGETS.pod) || (key === "iadc" && Number(value) < TARGETS.iadc) || (key === "mentor" && Number(value) < TARGETS.mentor) ? "warn" : "good"} />)}</section>
    <section className="scorecard-layout"><article className="panel"><div className="panel-head"><div><h2>Performance history</h2><p>{driver.weekLabel ? `Latest period: ${driver.weekLabel}` : "Reporting periods available for this driver"}</p></div><span className="panel-badge">{history.length || 1} period{history.length === 1 ? "" : "s"}</span></div>{historyLoading ? <div className="scorecard-loading">Loading history…</div> : historicalPerformance.length > 1 ? <div className="mini-history-list">{history.slice(-8).map((h)=><div key={h.week_label||h.period_end}><span>{h.week_label||h.period_end}</span><b>{h.performance ?? "—"}</b></div>)}</div> : <div className="empty-history"><b>Current score: {fmt(driver.performance, "performance")}</b><p>More trend data will appear as weekly scorecards are imported.</p></div>}</article>
      <article className="panel"><div className="panel-head"><div><h2>Current risk evidence</h2><p>Latest operational signal</p></div></div><div className="scorecard-issue"><span>Primary issue</span><strong>{driver.issue || "No active concern"}</strong><p>Data confidence: {driver.dataConfidence != null ? `${Number(driver.dataConfidence).toFixed(0)}%` : "Not provided"}</p></div><div className="scorecard-source">Source: {driver.dbId ? "Supabase driver metrics" : "Demo / locally imported analysis"}</div></article></section>
    <section className="panel coaching-recommendations"><div className="panel-head"><div><h2>Coaching action</h2><p>Evidence-led next steps for the manager</p></div></div><div className="recommendation-list">{recommendations.map((text, i) => <div key={text}><span>{String(i + 1).padStart(2, "0")}</span><p>{text}</p></div>)}</div></section>
  </>;
}

function ImportsView({ onImported, analysis }) {
  const input = useRef(null);
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function run() {
    if (!files.length) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await analyseFiles(files);
      const saved = await onImported(result, files);
      setMessage(`Processed ${files.length} file(s) · ${result.recognizedFiles ?? 0} recognised · ${result.errorFiles ?? 0} errors · ${saved?.savedMetrics ?? 0} driver-week records · ${saved?.savedScorecards ?? 0} site scorecards · ${saved?.savedFeedback ?? 0} CDF events · ${saved?.unmatched ?? 0} unmatched.`);
    } catch (e) {
      setMessage(`Import failed: ${e?.message || "Unknown error"}`);
    } finally {
      setBusy(false);
    }
  }

  return <><div className="page-heading"><div><span className="page-kicker">DATA</span><h1>Smart Import</h1><p>Upload weekly reports together. MetrixIQ detects reporting periods, maps TRIDs and stores history permanently.</p></div><button className="btn primary" onClick={() => input.current?.click()}>Choose files</button></div>
    <input ref={input} type="file" multiple hidden onChange={(e) => setFiles(Array.from(e.target.files || []))} />
    <section className="import-drop" onClick={() => input.current?.click()}><div className="upload-icon">⇧</div><h2>Drop operational reports here</h2><p>Excel, CSV/TSV, ODS, HTML, PDF, JSON, XML and text · Multiple weeks supported · TRID mapping</p><button className="btn ghost">Browse files</button></section>
    {files.length > 0 && <section className="panel import-review"><div className="panel-head"><div><h2>Ready to process</h2><p>{files.length} selected file(s)</p></div><button className="btn primary" onClick={run} disabled={busy}>{busy ? "Analysing & saving…" : "Analyse & save history"}</button></div>
      <div className="file-list">{files.map((f) => <div key={f.name}><span className="file-type">{f.name.split(".").pop()?.toUpperCase()}</span><div><b>{f.name}</b><small>{(f.size / 1024 / 1024).toFixed(2)} MB</small></div><em>{analysis?.fileResults?.find((r) => r.name === f.name)?.status || "Selected"}</em></div>)}</div>
      {message && <div className={message.startsWith("Import failed") ? "import-message error" : "import-message"}>{message}</div>}
    </section>}
    {analysis && <section className="panel import-result"><div className="panel-head"><div><h2>Latest analysis</h2><p>Parsed data is now persisted as weekly historical evidence in your workspace.</p></div><span className="panel-badge good">Saved</span></div><div className="result-grid"><div><span>Drivers</span><strong>{analysis.driverCount}</strong></div><div><span>Periods</span><strong>{analysis.periods?.length || 0}</strong></div><div><span>TRID matches</span><strong>{analysis.matchedByTrid}</strong></div><div><span>Unmatched</span><strong>{analysis.unmatchedDrivers}</strong></div></div></section>}
  </>;
}
function ReportsView() { return <><div className="page-heading"><div><span className="page-kicker">REPORTING</span><h1>Report centre</h1><p>Generate management-ready views from current fleet data.</p></div><button className="btn primary" onClick={() => window.print()}>Export current view</button></div><div className="report-grid">{[["Executive Fleet Brief", "Health, KPI, risk and recommended actions"], ["Weekly Fleet Report", "Site performance and driver improvement"], ["Driver Performance", "Individual trend, incidents and coaching"], ["Risk Report", "Prioritised drivers and evidence"], ["Coaching Report", "Queue status and action"], ["Site Comparison", "Cross-site KPI analysis"]].map(([t, d]) => <article key={t}><span>▤</span><h3>{t}</h3><p>{d}</p><button type="button" onClick={() => window.print()}>Open / print →</button></article>)}</div></>; }
function SettingsView({ session, onLogout }) { return <><div className="page-heading"><div><span className="page-kicker">ACCOUNT</span><h1>Workspace settings</h1><p>Identity, organisation and data controls.</p></div></div><div className="settings-grid"><section className="panel"><h2>Account identity</h2><div className="setting-row"><span>Name</span><b>{session.name}</b></div><div className="setting-row"><span>Email</span><b>{session.email}</b></div><div className="setting-row"><span>Organisation</span><b>{session.organisation || "My Fleet"}</b></div><div className="setting-row"><span>Access</span><b>{session.role || "Member"}</b></div></section><section className="panel"><h2>Data & security</h2><p className="settings-copy">Authentication and fleet data access are protected by Supabase Auth and row-level security. Smart Import history is persisted in Supabase and protected by workspace row-level security.</p><button className="btn danger" onClick={onLogout}>Sign out</button></section></div></>; }

async function resolveWorkspace(supabase, user) {
  const { data: membership, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id, role, organizations(id,name,plan)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (membershipError) throw membershipError;

  if (membership?.organizations) {
    return {
      organization: membership.organizations,
      role: membership.role || "manager",
    };
  }

  const name =
    user.user_metadata?.organization_name?.trim() ||
    `${user.user_metadata?.full_name || user.email?.split("@")[0] || "My"} Fleet`;

  const { data: organization, error: createError } = await supabase
    .from("organizations")
    .insert({ name, created_by: user.id })
    .select("id,name,plan")
    .single();

  if (createError) throw createError;

  // The database trigger is the authority for access roles.
  // Never assume "owner" in the browser after creating a workspace.
  const { data: createdMembership, error: createdMembershipError } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organization.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (createdMembershipError) throw createdMembershipError;

  if (!createdMembership) {
    throw new Error("Workspace membership was not created. Please sign out and try again.");
  }

  return {
    organization,
    role: createdMembership.role || "manager",
  };
}

function mapScorecard(row) {
  const mentor = numberOrNull(row.mentor_score ?? row.ementor ?? row.fico);
  const name = isUsablePersonName(row.full_name) ? row.full_name : "Unresolved identity";
  return {
    id: row.trid, dbId: row.driver_id, name, initials: initials(name), site: row.site, status: row.status,
    performance: numberOrNull(row.performance), dcr: numberOrNull(row.dcr), pod: numberOrNull(row.pod), iadc: numberOrNull(row.iadc),
    cc: numberOrNull(row.cc), fico: mentor, ementor: mentor, mentor_score: mentor, psb: numberOrNull(row.psb),
    reattempts: numberOrNull(row.reattempts), concessions: numberOrNull(row.concessions), lor: numberOrNull(row.lor),
    delivered: numberOrNull(row.delivered), dnr_dpmo: numberOrNull(row.dnr_dpmo), dsc_dpmo: numberOrNull(row.dsc_dpmo),
    ce_dpmo: numberOrNull(row.ce_dpmo), cdf_dpmo: numberOrNull(row.cdf_dpmo), scorecard_score: numberOrNull(row.scorecard_score),
    tier: row.tier, risk: row.risk || "Low", issue: row.issue || "No active concern",
    dataConfidence: numberOrNull(row.data_confidence), weekLabel: row.week_label, rawData: row.raw_data || {},
  };
}

export default function DashboardClient() {
  const router = useRouter();
  const [active, setActive] = useState("dashboard");
  const [previousActive, setPreviousActive] = useState("drivers");
  const [session, setSession] = useState(null);
  const [workspace, setWorkspace] = useState(null);
  const [dbDrivers, setDbDrivers] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [mobile, setMobile] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [driverHistory, setDriverHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [metricHistoryRows, setMetricHistoryRows] = useState([]);
  const [fleetHistory, setFleetHistory] = useState([]);
  const [globalSearch, setGlobalSearch] = useState("");
  const [siteFilter, setSiteFilter] = useState("all");
  const [platformAdmin, setPlatformAdmin] = useState(false);
  const [access, setAccess] = useState(null);

  useEffect(() => {
    let alive = true;
    const supabase = getSupabaseBrowserClient();
    async function initialise() {
      try {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) { router.replace("/login"); return; }
        const user = userData.user;
        await supabase.rpc("redeem_my_pending_invites");
        const { data: profile } = await supabase.from("profiles").select("full_name,email").eq("id", user.id).maybeSingle();
        const resolved = await resolveWorkspace(supabase, user);
        const { data: adminFlag, error: adminFlagError } = await supabase.rpc("is_platform_admin");
        if (adminFlagError) throw adminFlagError;
        await supabase.rpc("touch_last_login");
        const { data: accessRows, error: accessError } = await supabase.rpc("get_workspace_access", { p_organization_id: resolved.organization.id });
        if (accessError) throw accessError;
        const accessState = Array.isArray(accessRows) ? (accessRows[0] || null) : accessRows;
        if (!alive) return;
        setPlatformAdmin(Boolean(adminFlag));
        setAccess(accessState);
        setWorkspace(resolved);
        setSession({
          name: profile?.full_name || user.user_metadata?.full_name || user.email?.split("@")[0] || "MetrixIQ User",
          email: profile?.email || user.email || "",
          organisation: resolved.organization.name,
          role: resolved.role,
        });
        const { data: scorecards, error: scorecardError } = await supabase.from("driver_scorecards").select("*").eq("organization_id", resolved.organization.id).order("full_name");
        if (scorecardError) throw scorecardError;
        const metricRows = await fetchAllDriverMetricRows(supabase, resolved.organization.id);
        if (alive) {
          setDbDrivers((scorecards || []).map(mapScorecard));
          setMetricHistoryRows(metricRows || []);
          setFleetHistory(aggregateFleetHistory(metricRows || []));
        }
      } catch (e) {
        if (alive) setLoadError(e?.message || "Could not load the workspace.");
      } finally {
        if (alive) setAuthLoading(false);
      }
    }
    initialise();
    const { data: authListener } = supabase.auth.onAuthStateChange((event) => { if (event === "SIGNED_OUT") router.replace("/login"); });
    return () => { alive = false; authListener.subscription.unsubscribe(); };
  }, [router]);

  const sites = [...new Set(dbDrivers.map((d) => String(d.site || "").trim().toUpperCase()).filter((site) => /^[A-Z]{2,5}\d{1,3}$/.test(site)))].sort();
  const drivers = siteFilter === "all" ? dbDrivers : dbDrivers.filter((d) => d.site === siteFilter);
  const liveKpis = dbDrivers.length ? {
    dcr: avg(drivers, "dcr"), pod: avg(drivers, "pod"), iadc: avg(drivers, "iadc"), cc: avg(drivers, "cc"),
    fico: avg(drivers, "mentor_score") ?? avg(drivers, "ementor") ?? avg(drivers, "fico"), ementor: avg(drivers, "mentor_score") ?? avg(drivers, "ementor") ?? avg(drivers, "fico"), mentor: avg(drivers, "mentor_score") ?? avg(drivers, "ementor") ?? avg(drivers, "fico"), psb: avg(drivers, "psb"), reattempts: avg(drivers, "reattempts"),
    concessions: avg(drivers, "concessions"), lor: avg(drivers, "lor"), data_confidence: avg(drivers, "dataConfidence"),
  } : {};
  const kpis = { ...liveKpis };

  async function imported(result, files) {
    if (!workspace?.organization?.id) throw new Error("Workspace is not ready yet.");
    const supabase = getSupabaseBrowserClient();
    const saved = await persistAnalysis({ organizationId: workspace.organization.id, analysis: result, files });
    await supabase.rpc("sync_driver_directory", { p_organization_id: workspace.organization.id });
    setAnalysis(result);

    const { data: scorecards, error: scorecardError } = await supabase
      .from("driver_scorecards").select("*")
      .eq("organization_id", workspace.organization.id)
      .order("full_name");
    if (scorecardError) throw scorecardError;

    const metricRows = await fetchAllDriverMetricRows(supabase, workspace.organization.id);

    setDbDrivers((scorecards || []).map(mapScorecard));
    setMetricHistoryRows(metricRows || []);
    setFleetHistory(aggregateFleetHistory(metricRows || []));
    return saved;
  }
  async function logout() { try { await getSupabaseBrowserClient().auth.signOut(); } finally { localStorage.removeItem("metrixiq.analysis"); router.replace("/login"); } }
  async function openDriver(driver) {
    setPreviousActive(active === "driver-profile" ? "drivers" : active);
    setSelectedDriver(driver);
    setDriverHistory([]);
    setActive("driver-profile");
    if (!driver.dbId || !workspace?.organization?.id) return;
    setHistoryLoading(true);
    try {
      const { data } = await getSupabaseBrowserClient().from("driver_metrics").select("period_start,period_end,week_label,performance,dcr,pod,iadc,cc,fico,ementor,mentor_score,concessions,cdf_dpmo,risk,issue,raw_data").eq("organization_id", workspace.organization.id).eq("driver_id", driver.dbId).order("period_end", { ascending: true }).limit(12);
      setDriverHistory(data || []);
    } finally { setHistoryLoading(false); }
  }
  function backFromDriver() { setSelectedDriver(null); setDriverHistory([]); setActive(previousActive || "drivers"); }

  let view;
  switch (active) {
    case "site-scorecards": view = <SiteScorecardsView organizationId={workspace?.organization?.id} onOpenDriver={openDriver} onImport={() => setActive("imports")} />; break;
    case "driver-scorecards": view = <DriverScorecardsView organizationId={workspace?.organization?.id} onOpenDriver={openDriver} onImport={() => setActive("imports")} />; break;
    case "drivers": view = <ProDriversView drivers={drivers} onOpen={openDriver} query={globalSearch} />; break;
    case "performance": view = <ProPerformanceView kpis={kpis} history={fleetHistory} rows={metricHistoryRows} onOpenDriver={openDriver} />; break;
    case "iadc": view = <DirectIadcView organizationId={workspace?.organization?.id} onOpenDriver={openDriver} onImport={() => setActive("imports")} />; break;
    case "cdf": view = <CdfView organizationId={workspace?.organization?.id} onImport={() => setActive("imports")} />; break;
    case "mentor": view = <DirectMentorView organizationId={workspace?.organization?.id} onOpenDriver={openDriver} />; break;
    case "concessions": view = <DirectConcessionsView organizationId={workspace?.organization?.id} onOpenDriver={openDriver} />; break;
    case "coaching": view = <CoachingView drivers={drivers} onOpen={openDriver} />; break;
    case "intelligence": view = <IntelligenceView drivers={drivers} onCoaching={() => setActive("coaching")} />; break;
    case "imports": view = <ImportsView onImported={imported} analysis={analysis} />; break;
    case "data-quality": view = <DataQualityView organizationId={workspace?.organization?.id} onImport={() => setActive("imports")} />; break;
    case "reports": view = <ReportsView />; break;
    case "billing": view = <BillingProView access={access} organizationId={workspace?.organization?.id} platformAdmin={platformAdmin} onAccessChanged={setAccess} />; break;
    case "team": view = <TeamManagementView organizationId={workspace?.organization?.id} workspaceRole={session?.role} platformAdmin={platformAdmin} />; break;
    case "settings": view = <SettingsView session={session || {}} onLogout={logout} />; break;
    case "admin": view = platformAdmin ? <PlatformAdminView /> : <SettingsView session={session || {}} onLogout={logout} />; break;
    case "driver-profile": view = selectedDriver ? <DriverScorecardView driver={selectedDriver} history={driverHistory} historyLoading={historyLoading} onBack={backFromDriver} /> : <ProDriversView drivers={drivers} onOpen={openDriver} query={globalSearch} />; break;
    default: view = <DashboardView drivers={drivers} kpis={kpis} history={fleetHistory} onImport={() => setActive("imports")} onOpenDriver={openDriver} onDrivers={() => setActive("drivers")} onPerformance={() => setActive("performance")} onCoaching={() => setActive("coaching")} />;
  }

  if (authLoading) return <main className="app-loading"><div className="auth-spinner" /><h1>MetrixIQ</h1><p>Loading secure workspace…</p></main>;
  if (loadError) return <main className="app-loading"><h1>Workspace unavailable</h1><p>{loadError}</p><button className="btn primary" onClick={() => window.location.reload()}>Try again</button><button className="btn ghost" onClick={logout}>Sign out</button></main>;
  if (!session) return null;
  if (!platformAdmin && access?.suspended) return <SuspendedWorkspaceView access={access} onLogout={logout} />;
  if (!platformAdmin && access && !access.onboarding_completed) return <PlanOnboardingView organizationId={workspace?.organization?.id} organizationName={workspace?.organization?.name} onComplete={setAccess} onLogout={logout} />;

  return <div className="app-shell"><aside className={mobile ? "sidebar open" : "sidebar"}><div className="sidebar-brand"><Brand inverse /><button className="mobile-close" onClick={() => setMobile(false)}>×</button></div><div className="workspace-chip"><span>{initials(session.organisation)}</span><div><b>{session.organisation || "My Fleet"}</b><small>{platformAdmin ? "Platform Owner" : access?.subscription_status === "trialing" ? "Full trial" : `${String(access?.effective_plan || "free").toUpperCase()} plan`}</small></div></div><nav className="app-nav">{nav.filter(([id]) => canAccessNav(id, access, platformAdmin, session?.role)).map(([id, label], i) => <div key={id}>{navSection(i) && <small className="nav-section">{navSection(i)}</small>}<button onClick={() => { setActive(id); setSelectedDriver(null); setMobile(false); }} className={active === id ? "active" : ""}><span>{icon[id]}</span>{label}{id === "intelligence" && <em>AI</em>}</button></div>)}</nav><div className="sidebar-user"><span>{initials(session.name)}</span><div><b>{session.name}</b><small>{session.email}</small></div><button onClick={logout}>↪</button></div></aside>{mobile && <button className="mobile-overlay" onClick={() => setMobile(false)} aria-label="Close navigation" />}<div className="app-body"><header className="topbar"><div className="topbar-left"><button className="menu-btn" onClick={() => setMobile(true)}>☰</button><div className="search-box">⌕ <input aria-label="Search drivers" placeholder="Search drivers by name or TRID…" value={globalSearch} onChange={(e)=>{setGlobalSearch(e.target.value); if(e.target.value) setActive("drivers");}} /><kbd>Ctrl K</kbd></div></div><div className="topbar-right"><select className="site-select" value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)} aria-label="Filter workspace by site"><option value="all">All sites</option>{sites.map((site) => <option key={site} value={site}>{site}</option>)}</select><span className="top-avatar">{initials(session.name)}</span></div></header><main className="app-main">{view}</main></div></div>;
}
