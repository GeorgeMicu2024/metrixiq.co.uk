"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Brand from "./Brand";
import { analyseFiles } from "../lib/analyzer";
import { demoDrivers, demoKpis, trend } from "../lib/demo";
import { getSupabaseBrowserClient } from "../lib/supabase/client";

const nav = [
  ["dashboard", "Dashboard"], ["drivers", "Drivers"], ["performance", "Performance"],
  ["coaching", "Coaching"], ["intelligence", "AI Insights"], ["imports", "Smart Import"],
  ["reports", "Reports"], ["billing", "Plans & Billing"], ["settings", "Settings"],
];
const icon = { dashboard: "â–¦", drivers: "â—Ž", performance: "â†—", coaching: "âś“", intelligence: "âś¦", imports: "â‡§", reports: "â–¤", billing: "ÂŁ", settings: "âš™" };

const numberOrNull = (value) => value == null || value === "" || Number.isNaN(Number(value)) ? null : Number(value);
function fmt(value, key) {
  const v = numberOrNull(value);
  if (v == null) return "â€”";
  if (["dcr", "pod", "iadc", "cc", "psb", "reattempts"].includes(key)) return `${v.toFixed(1)}%`;
  if (["concessions", "lor"].includes(key)) return v.toFixed(2);
  return Math.round(v).toString();
}
function tone(risk) { return risk === "High" ? "risk-high" : risk === "Medium" ? "risk-medium" : "risk-low"; }
function initials(name = "") { return name.split(/\s+/).filter(Boolean).map((x) => x[0]).join("").slice(0, 2).toUpperCase() || "DA"; }
function avg(rows, key) {
  const values = rows.map((r) => numberOrNull(r[key])).filter((v) => v != null);
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function MetricCard({ label, value, target, note, accent = "good" }) {
  return <article className="metric-card"><div className="metric-top"><span>{label}</span><i className={`metric-dot ${accent}`} /></div><strong>{value}</strong><div className="metric-bottom"><span>{target}</span><em>{note}</em></div></article>;
}
function TrendChart({ values = trend }) {
  const safe = values?.length > 1 ? values : trend;
  const pts = safe.map((v, i) => ({ x: 18 + i * (464 / (safe.length - 1)), y: 145 - ((Number(v) - 75) / 20) * 110 }));
  const line = pts.map((p, i) => (i ? "L" : "M") + p.x + " " + p.y).join(" ");
  const area = `${line} L ${pts.at(-1)?.x || 480} 160 L 18 160 Z`;
  return <svg className="trend-chart" width="100%" height="190" viewBox="0 0 500 170" preserveAspectRatio="none" aria-label="Performance trend chart"><defs><linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6bd8c4" stopOpacity=".36" /><stop offset="1" stopColor="#6bd8c4" stopOpacity="0" /></linearGradient></defs><g stroke="#e7edf2" strokeWidth="1"><line x1="18" y1="35" x2="482" y2="35" /><line x1="18" y1="80" x2="482" y2="80" /><line x1="18" y1="125" x2="482" y2="125" /></g><path d={area} fill="url(#areaGrad)" /><path d={line} fill="none" stroke="#149b86" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />{pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="4" fill="#fff" stroke="#149b86" strokeWidth="3" />)}<g fill="#8b97a7" fontSize="11">{safe.map((_, i) => <text key={i} x={18 + i * (464 / (safe.length - 1))} y="166" textAnchor="middle">{`W${i + 1}`}</text>)}</g></svg>;
}

function Action({ n, title, text }) { return <div className="action-item"><span>{n}</span><div><b>{title}</b><p>{text}</p></div><button>â†’</button></div>; }

function DriverTable({ drivers, compact = false, onOpen }) {
  return <div className="table-wrap"><table className="data-table"><thead><tr><th>Driver</th><th>Site</th><th>Performance</th><th>POD</th><th>IADC</th><th>Risk</th>{!compact && <th>Issue</th>}<th /></tr></thead><tbody>{drivers.map((d) => <tr key={`${d.id}-${d.dbId || "demo"}`} className={onOpen ? "driver-row-clickable" : ""} onClick={() => onOpen?.(d)}><td><div className="driver-cell"><span className="driver-avatar">{d.initials || initials(d.name)}</span><div><b>{d.name}</b><small>{d.id}</small></div></div></td><td>{d.site || "â€”"}</td><td><b>{fmt(d.performance, "performance")}</b></td><td>{fmt(d.pod, "pod")}</td><td>{fmt(d.iadc, "iadc")}</td><td><span className={`risk-pill ${tone(d.risk)}`}>{d.risk || "Low"}</span></td>{!compact && <td className="issue-cell">{d.issue || "No active concern"}</td>}<td><button type="button" className="profile-link" onClick={(e) => { e.stopPropagation(); onOpen?.(d); }}>Open â†’</button></td></tr>)}</tbody></table></div>;
}

function DashboardView({ drivers, kpis, onImport, onOpenDriver, onDrivers }) {
  const high = drivers.filter((d) => d.risk === "High").length;
  const med = drivers.filter((d) => d.risk === "Medium").length;
  const low = Math.max(0, drivers.length - high - med);
  const health = Math.round(avg(drivers, "performance") || 0);
  const total = Math.max(1, drivers.length);
  return <><div className="page-heading"><div><span className="page-kicker">OVERVIEW</span><h1>Fleet performance</h1><p>One operating view across driver performance, risk, data quality and coaching.</p></div><div className="page-actions"><button className="btn ghost">Last 4 weeks</button><button className="btn primary" onClick={onImport}>Import reports</button></div></div>
    <section className="summary-strip"><div><span>Fleet health</span><strong>{health}<small>/100</small></strong><em>Current fleet score</em></div><div><span>Active drivers</span><strong>{drivers.length}</strong><em>Current workspace</em></div><div><span>High risk</span><strong>{high}</strong><em>Needs attention</em></div><div><span>Data confidence</span><strong>{fmt(kpis.data_confidence || 96, "performance")}%</strong><em>Trusted records</em></div></section>
    <section className="metric-grid"><MetricCard label="DCR" value={fmt(kpis.dcr, "dcr")} target="Target â‰Ą 98.8%" note="Fleet average" /><MetricCard label="POD" value={fmt(kpis.pod, "pod")} target="Target â‰Ą 98.0%" note={(kpis.pod ?? 100) < 98 ? "Watch" : "Healthy"} accent={(kpis.pod ?? 100) < 98 ? "warn" : "good"} /><MetricCard label="IADC" value={fmt(kpis.iadc, "iadc")} target="Target â‰Ą 80%" note="Fleet average" /><MetricCard label="FICO" value={fmt(kpis.fico, "fico")} target="Target â‰Ą 790" note="Fleet average" /><MetricCard label="eMentor" value={fmt(kpis.ementor, "ementor")} target="Target â‰Ą 815" note="Fleet average" /><MetricCard label="Concessions" value={fmt(kpis.concessions, "concessions")} target="Lower is better" note="Monitor" accent="warn" /></section>
    <section className="dashboard-grid"><article className="panel"><div className="panel-head"><div><h2>Performance trend</h2><p>Combined fleet score versus weekly target</p></div><span className="panel-badge good">Live view</span></div><TrendChart /><div className="chart-legend"><span><i className="legend-line teal" />Fleet performance</span><span><i className="legend-line target" />Target 85</span></div></article>
      <article className="panel"><div className="panel-head"><div><h2>Driver risk</h2><p>Current prioritisation model</p></div><span className="panel-badge">{drivers.length} drivers</span></div><div className="risk-content"><div className="risk-donut" style={{ background: `conic-gradient(#18aa86 0 ${low / total * 100}%, #f0b84b ${low / total * 100}% ${(low + med) / total * 100}%, #ef626b ${(low + med) / total * 100}% 100%)` }}><div><strong>{high}</strong><span>high risk</span></div></div><div className="risk-list"><div><span><i className="risk-dot low" />Low risk</span><b>{low}</b></div><div><span><i className="risk-dot med" />Medium risk</span><b>{med}</b></div><div><span><i className="risk-dot high" />High risk</span><b>{high}</b></div></div></div></article></section>
    <section className="dashboard-grid lower"><article className="panel"><div className="panel-head"><div><h2>Drivers requiring attention</h2><p>Prioritised by repeated failures and score deterioration</p></div><button className="link-btn" onClick={onDrivers}>View all</button></div><DriverTable drivers={drivers.filter((d) => d.risk !== "Low").slice(0, 6)} compact onOpen={onOpenDriver} /></article><article className="panel"><div className="panel-head"><div><h2>Management actions</h2><p>Recommended next steps from current evidence</p></div></div><div className="action-list"><Action n="01" title="Coach high-risk POD drivers" text={`${high} drivers have repeated quality or compliance deterioration.`} /><Action n="02" title="Review IADC exceptions" text="Check drivers below the operational compliance threshold before next route." /><Action n="03" title="Resolve unmatched TRIDs" text="Keep identity mapping complete before weekly scorecards are finalised." /></div></article></section></>;
}

function DriversView({ drivers, onOpen }) {
  const [q, setQ] = useState("");
  const filtered = drivers.filter((d) => `${d.name} ${d.id} ${d.site || ""}`.toLowerCase().includes(q.toLowerCase()));
  return <><div className="page-heading"><div><span className="page-kicker">OPERATIONS</span><h1>Drivers</h1><p>Search every driver profile, metric and current risk status.</p></div></div><section className="panel"><div className="table-tools"><input placeholder="Search name, TRID or siteâ€¦" value={q} onChange={(e) => setQ(e.target.value)} /><span>{filtered.length} drivers</span></div><DriverTable drivers={filtered} onOpen={onOpen} /></section></>;
}
function PerformanceView({ kpis }) {
  const cards = [["DCR", kpis.dcr, "98.8%"], ["POD", kpis.pod, "98.0%"], ["IADC", kpis.iadc, "80%"], ["CC", kpis.cc, "98.0%"], ["PSB", kpis.psb, "98.0%"], ["Reattempts", kpis.reattempts, "95%"]];
  return <><div className="page-heading"><div><span className="page-kicker">OPERATIONS</span><h1>Performance analysis</h1><p>Inspect fleet metrics against operational thresholds.</p></div></div><div className="performance-cards">{cards.map(([label, value, target]) => <article key={label}><span>{label}</span><strong>{fmt(value, label.toLowerCase())}</strong><small>Target {target}</small><div className="progress"><i style={{ width: `${Math.min(100, Number(value) || 0)}%` }} /></div></article>)}</div><section className="panel tall"><div className="panel-head"><div><h2>Four-week movement</h2><p>Performance trend across reporting periods</p></div></div><TrendChart /></section></>;
}
function CoachingView({ drivers, onOpen }) {
  const list = drivers.filter((d) => d.risk !== "Low");
  return <><div className="page-heading"><div><span className="page-kicker">OPERATIONS</span><h1>Coaching queue</h1><p>Turn risk signals into specific management action.</p></div></div><div className="coaching-list">{list.slice(0, 10).map((d, i) => <article key={d.id}><div className="coach-index">{String(i + 1).padStart(2, "0")}</div><div className="coach-main"><div className="driver-cell"><span className="driver-avatar">{d.initials || initials(d.name)}</span><div><b>{d.name}</b><small>{d.site} Â· {d.id}</small></div></div><p>{d.issue}</p></div><span className={`risk-pill ${tone(d.risk)}`}>{d.risk}</span><button className="btn ghost" onClick={() => onOpen(d)}>Open profile</button></article>)}</div></>;
}
function IntelligenceView({ drivers, onCoaching }) {
  const high = drivers.filter((d) => d.risk === "High");
  return <><div className="page-heading"><div><span className="page-kicker">INTELLIGENCE</span><h1>AI Insights</h1><p>Evidence-led signals based on imported driver performance data.</p></div></div><div className="intel-app-grid"><article className="insight-hero"><span>PRIORITY SIGNAL</span><h2>{high.length} drivers need intervention before the next reporting cycle.</h2><p>The strongest pattern is repeated POD / IADC deterioration combined with lower performance consistency. Prioritise coaching rather than reviewing every driver equally.</p><button className="btn light" onClick={onCoaching}>Open coaching queue</button></article><article className="panel"><div className="panel-head"><div><h2>Evidence summary</h2><p>What is driving the signal</p></div></div><div className="evidence-list"><div><b>POD quality</b><span>{drivers.filter((d) => d.pod < 97).length} below 97%</span></div><div><b>IADC compliance</b><span>{drivers.filter((d) => d.iadc < 80).length} below 80%</span></div><div><b>Concessions</b><span>{drivers.filter((d) => d.concessions > 4).length} elevated</span></div><div><b>FICO</b><span>{drivers.filter((d) => d.fico && d.fico < 790).length} below 790</span></div></div></article></div></>;
}

function coachingRecommendations(d) {
  const items = [];
  if (numberOrNull(d.iadc) != null && Number(d.iadc) < 80) items.push("Review delivery workflow: Notify of Arrival, follow the first app option, capture a clear POD and swipe at the delivery location.");
  if (numberOrNull(d.pod) != null && Number(d.pod) < 98) items.push("Coach POD quality and verify the delivery photo clearly shows the parcel at the selected location.");
  if (numberOrNull(d.dcr) != null && Number(d.dcr) < 98.8) items.push("Review unsuccessful deliveries and complete every possible reattempt before returning to station.");
  if (numberOrNull(d.fico) != null && Number(d.fico) < 790) items.push("Review driving behaviour and FICO events; agree one measurable driving improvement for the next reporting cycle.");
  if (numberOrNull(d.ementor) != null && Number(d.ementor) < 815) items.push("eMentor is below target. Reinforce smooth acceleration, braking, cornering and distraction-free driving.");
  if (numberOrNull(d.concessions) != null && Number(d.concessions) > 2) items.push("Review concessions by delivery and identify repeat location, POD or customer-contact patterns.");
  if (!items.length) items.push("No urgent coaching intervention detected. Maintain current workflow and monitor the next reporting cycle.");
  return items;
}

function DriverScorecardView({ driver, history, historyLoading, onBack }) {
  const metrics = [
    ["DCR", driver.dcr, "dcr", "Target â‰Ą 98.8%"], ["POD", driver.pod, "pod", "Target â‰Ą 98.0%"],
    ["IADC", driver.iadc, "iadc", "Target â‰Ą 80%"], ["CC", driver.cc, "cc", "Target â‰Ą 98.0%"],
    ["FICO", driver.fico, "fico", "Target â‰Ą 790"], ["eMentor", driver.ementor, "ementor", "Target â‰Ą 815"],
    ["PSB", driver.psb, "psb", "Target â‰Ą 98.0%"], ["Reattempts", driver.reattempts, "reattempts", "Target â‰Ą 95%"],
    ["Concessions", driver.concessions, "concessions", "Lower is better"], ["LoR", driver.lor, "lor", "Lower is better"],
  ];
  const historicalPerformance = history.map((h) => numberOrNull(h.performance)).filter((v) => v != null);
  const recommendations = coachingRecommendations(driver);
  return <>
    <button type="button" className="scorecard-back" onClick={onBack}>â† Back</button>
    <section className="scorecard-hero">
      <div className="scorecard-person"><span className="scorecard-avatar">{driver.initials || initials(driver.name)}</span><div><span className="page-kicker">INDIVIDUAL DRIVER SCORECARD</span><h1>{driver.name}</h1><p>{driver.site || "No site"} Â· {driver.id} Â· {driver.status || "Active"}</p></div></div>
      <div className="scorecard-status"><span className={`risk-pill ${tone(driver.risk)}`}>{driver.risk || "Low"} risk</span><strong>{fmt(driver.performance, "performance")}<small>/100</small></strong><em>Performance score</em></div>
    </section>
    <section className="scorecard-metrics">{metrics.map(([label, value, key, target]) => <MetricCard key={label} label={label} value={fmt(value, key)} target={target} note="Latest result" accent={(key === "pod" && Number(value) < 98) || (key === "iadc" && Number(value) < 80) ? "warn" : "good"} />)}</section>
    <section className="scorecard-layout"><article className="panel"><div className="panel-head"><div><h2>Performance history</h2><p>{driver.weekLabel ? `Latest period: ${driver.weekLabel}` : "Reporting periods available for this driver"}</p></div><span className="panel-badge">{history.length || 1} period{history.length === 1 ? "" : "s"}</span></div>{historyLoading ? <div className="scorecard-loading">Loading historyâ€¦</div> : historicalPerformance.length > 1 ? <TrendChart values={historicalPerformance.slice(-8)} /> : <div className="empty-history"><b>Current score: {fmt(driver.performance, "performance")}</b><p>More trend data will appear as weekly scorecards are imported.</p></div>}</article>
      <article className="panel"><div className="panel-head"><div><h2>Current risk evidence</h2><p>Latest operational signal</p></div></div><div className="scorecard-issue"><span>Primary issue</span><strong>{driver.issue || "No active concern"}</strong><p>Data confidence: {driver.dataConfidence != null ? `${Number(driver.dataConfidence).toFixed(0)}%` : "Not provided"}</p></div><div className="scorecard-source">Source: {driver.dbId ? "Supabase driver metrics" : "Demo / locally imported analysis"}</div></article></section>
    <section className="panel coaching-recommendations"><div className="panel-head"><div><h2>Coaching action</h2><p>Evidence-led next steps for the manager</p></div></div><div className="recommendation-list">{recommendations.map((text, i) => <div key={text}><span>{String(i + 1).padStart(2, "0")}</span><p>{text}</p></div>)}</div></section>
  </>;
}

function ImportsView({ onImported, analysis }) {
  const input = useRef(null); const [files, setFiles] = useState([]); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  async function run() { if (!files.length) return; setBusy(true); setMessage(""); try { const result = await analyseFiles(files); onImported(result); setMessage(`Processed ${files.length} file(s) Â· ${result.recognizedFiles ?? 0} recognised Â· ${result.unsupportedFiles ?? 0} unsupported Â· ${result.errorFiles ?? 0} errors Â· ${result.driverCount} driver profiles calculated Â· ${result.matchedByTrid} TRID/name matches.`); } catch (e) { setMessage(`Import failed: ${e?.message || "Unknown error"}`); } finally { setBusy(false); } }
  return <><div className="page-heading"><div><span className="page-kicker">DATA</span><h1>Smart Import</h1><p>Upload multiple reports together. Master/schedule files are used automatically for TRID â†’ driver matching.</p></div><button className="btn primary" onClick={() => input.current?.click()}>Choose files</button></div><input ref={input} type="file" multiple hidden onChange={(e) => setFiles(Array.from(e.target.files || []))} /><section className="import-drop" onClick={() => input.current?.click()}><div className="upload-icon">â‡§</div><h2>Drop operational reports here</h2><p>Excel, CSV/TSV, ODS, HTML, PDF, JSON, XML and text Â· Multiple files supported Â· Amazon report recognition Â· TRID mapping</p><button className="btn ghost">Browse files</button></section>{files.length > 0 && <section className="panel import-review"><div className="panel-head"><div><h2>Ready to process</h2><p>{files.length} selected file(s)</p></div><button className="btn primary" onClick={run} disabled={busy}>{busy ? "Analysingâ€¦" : "Analyse & import"}</button></div><div className="file-list">{files.map((f) => <div key={f.name}><span className="file-type">{f.name.split(".").pop()?.toUpperCase()}</span><div><b>{f.name}</b><small>{(f.size / 1024 / 1024).toFixed(2)} MB</small></div><em>{analysis?.fileResults?.find((r) => r.name === f.name)?.status || "Selected"}</em></div>)}</div>{message && <div className={message.startsWith("Import failed") ? "import-message error" : "import-message"}>{message}</div>}</section>}{analysis && <section className="panel import-result"><div className="panel-head"><div><h2>Latest analysis</h2><p>Operational data calculated from imported files. Database persistence is the next implementation step.</p></div><span className="panel-badge good">Complete</span></div><div className="result-grid"><div><span>Drivers</span><strong>{analysis.driverCount}</strong></div><div><span>TRID matches</span><strong>{analysis.matchedByTrid}</strong></div><div><span>Master entries</span><strong>{analysis.scheduleEntries}</strong></div><div><span>Unmatched</span><strong>{analysis.unmatchedDrivers}</strong></div></div></section>}</>;
}
function ReportsView() { return <><div className="page-heading"><div><span className="page-kicker">REPORTING</span><h1>Report centre</h1><p>Generate management-ready views from current fleet data.</p></div><button className="btn primary" onClick={() => window.print()}>Export current view</button></div><div className="report-grid">{[["Executive Fleet Brief", "Health, KPI, risk and recommended actions"], ["Weekly Fleet Report", "Site performance and driver improvement"], ["Driver Performance", "Individual trend, incidents and coaching"], ["Risk Report", "Prioritised drivers and evidence"], ["Coaching Report", "Queue status and action"], ["Site Comparison", "Cross-site KPI analysis"]].map(([t, d]) => <article key={t}><span>â–¤</span><h3>{t}</h3><p>{d}</p><button>Generate report â†’</button></article>)}</div></>; }
function BillingView() { return <><div className="page-heading"><div><span className="page-kicker">ACCOUNT</span><h1>Plans & billing</h1><p>Choose the MetrixIQ capability level for your operation.</p></div></div><div className="billing-grid">{[["Free", "ÂŁ0", ["1 site", "10 drivers", "Core dashboard"]], ["Pro", "ÂŁ39", ["3 sites", "150 drivers", "Risk & coaching"]], ["Business", "ÂŁ89", ["10 sites", "500 drivers", "Advanced intelligence"]], ["Full", "ÂŁ169", ["Unlimited sites", "Owner controls", "Priority support"]]].map(([n, p, fs], i) => <article className={i === 3 ? "current" : ""} key={n}>{i === 3 && <span className="current-tag">Current workspace</span>}<h3>{n}</h3><strong>{p}<small>/month</small></strong><ul>{fs.map((f) => <li key={f}>âś“ {f}</li>)}</ul><button className={i === 3 ? "btn ghost" : "btn primary"}>{i === 3 ? "Active" : "Choose plan"}</button></article>)}</div></>; }
function SettingsView({ session, onLogout }) { return <><div className="page-heading"><div><span className="page-kicker">ACCOUNT</span><h1>Workspace settings</h1><p>Identity, organisation and data controls.</p></div></div><div className="settings-grid"><section className="panel"><h2>Account identity</h2><div className="setting-row"><span>Name</span><b>{session.name}</b></div><div className="setting-row"><span>Email</span><b>{session.email}</b></div><div className="setting-row"><span>Organisation</span><b>{session.organisation || "My Fleet"}</b></div><div className="setting-row"><span>Access</span><b>{session.role || "Member"}</b></div></section><section className="panel"><h2>Data & security</h2><p className="settings-copy">Authentication and fleet data access are protected by Supabase Auth and row-level security. Smart Import persistence will be connected in the next implementation step.</p><button className="btn danger" onClick={onLogout}>Sign out</button></section></div></>; }

async function resolveWorkspace(supabase, user) {
  const { data: membership, error: membershipError } = await supabase.from("organization_members").select("organization_id, role, organizations(id,name,plan)").eq("user_id", user.id).limit(1).maybeSingle();
  if (membershipError) throw membershipError;
  if (membership?.organizations) return { organization: membership.organizations, role: membership.role };

  const name = user.user_metadata?.organization_name?.trim() || `${user.user_metadata?.full_name || user.email?.split("@")[0] || "My"} Fleet`;
  const { data: organization, error: createError } = await supabase.from("organizations").insert({ name, created_by: user.id }).select("id,name,plan").single();
  if (createError) throw createError;
  return { organization, role: "owner" };
}
function mapScorecard(row) {
  return {
    id: row.trid, dbId: row.driver_id, name: row.full_name, initials: initials(row.full_name), site: row.site, status: row.status,
    performance: numberOrNull(row.performance), dcr: numberOrNull(row.dcr), pod: numberOrNull(row.pod), iadc: numberOrNull(row.iadc),
    cc: numberOrNull(row.cc), fico: numberOrNull(row.fico), ementor: numberOrNull(row.ementor), psb: numberOrNull(row.psb),
    reattempts: numberOrNull(row.reattempts), concessions: numberOrNull(row.concessions), lor: numberOrNull(row.lor), risk: row.risk || "Low",
    issue: row.issue || "No active concern", dataConfidence: numberOrNull(row.data_confidence), weekLabel: row.week_label,
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

  useEffect(() => {
    let alive = true;
    const supabase = getSupabaseBrowserClient();
    async function initialise() {
      try {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) { router.replace("/login"); return; }
        const user = userData.user;
        const { data: profile } = await supabase.from("profiles").select("full_name,email").eq("id", user.id).maybeSingle();
        const resolved = await resolveWorkspace(supabase, user);
        if (!alive) return;
        setWorkspace(resolved);
        setSession({
          name: profile?.full_name || user.user_metadata?.full_name || user.email?.split("@")[0] || "MetrixIQ User",
          email: profile?.email || user.email || "",
          organisation: resolved.organization.name,
          role: resolved.role,
        });
        const { data: scorecards, error: scorecardError } = await supabase.from("driver_scorecards").select("*").eq("organization_id", resolved.organization.id).order("full_name");
        if (scorecardError) throw scorecardError;
        if (alive) setDbDrivers((scorecards || []).map(mapScorecard));
        try { const local = JSON.parse(localStorage.getItem("metrixiq.analysis") || "null"); if (local?.drivers?.length && alive) setAnalysis(local); } catch {}
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

  const drivers = analysis?.drivers?.length ? analysis.drivers : dbDrivers.length ? dbDrivers : demoDrivers;
  const liveKpis = dbDrivers.length ? {
    dcr: avg(dbDrivers, "dcr"), pod: avg(dbDrivers, "pod"), iadc: avg(dbDrivers, "iadc"), cc: avg(dbDrivers, "cc"),
    fico: avg(dbDrivers, "fico"), ementor: avg(dbDrivers, "ementor"), psb: avg(dbDrivers, "psb"), reattempts: avg(dbDrivers, "reattempts"),
    concessions: avg(dbDrivers, "concessions"), lor: avg(dbDrivers, "lor"), data_confidence: avg(dbDrivers, "dataConfidence"),
  } : {};
  const kpis = { ...demoKpis, ...liveKpis, ...(analysis?.kpis || {}) };

  function imported(result) { setAnalysis(result); try { localStorage.setItem("metrixiq.analysis", JSON.stringify(result)); } catch {} setActive("dashboard"); }
  async function logout() { try { await getSupabaseBrowserClient().auth.signOut(); } finally { localStorage.removeItem("metrixiq.analysis"); router.replace("/login"); } }
  async function openDriver(driver) {
    setPreviousActive(active === "driver-profile" ? "drivers" : active);
    setSelectedDriver(driver);
    setDriverHistory([]);
    setActive("driver-profile");
    if (!driver.dbId || !workspace?.organization?.id) return;
    setHistoryLoading(true);
    try {
      const { data } = await getSupabaseBrowserClient().from("driver_metrics").select("period_start,period_end,week_label,performance,dcr,pod,iadc,fico,ementor,risk,issue").eq("organization_id", workspace.organization.id).eq("driver_id", driver.dbId).order("period_end", { ascending: true }).limit(12);
      setDriverHistory(data || []);
    } finally { setHistoryLoading(false); }
  }
  function backFromDriver() { setSelectedDriver(null); setDriverHistory([]); setActive(previousActive || "drivers"); }

  let view;
  switch (active) {
    case "drivers": view = <DriversView drivers={drivers} onOpen={openDriver} />; break;
    case "performance": view = <PerformanceView kpis={kpis} />; break;
    case "coaching": view = <CoachingView drivers={drivers} onOpen={openDriver} />; break;
    case "intelligence": view = <IntelligenceView drivers={drivers} onCoaching={() => setActive("coaching")} />; break;
    case "imports": view = <ImportsView onImported={imported} analysis={analysis} />; break;
    case "reports": view = <ReportsView />; break;
    case "billing": view = <BillingView />; break;
    case "settings": view = <SettingsView session={session || {}} onLogout={logout} />; break;
    case "driver-profile": view = selectedDriver ? <DriverScorecardView driver={selectedDriver} history={driverHistory} historyLoading={historyLoading} onBack={backFromDriver} /> : <DriversView drivers={drivers} onOpen={openDriver} />; break;
    default: view = <DashboardView drivers={drivers} kpis={kpis} onImport={() => setActive("imports")} onOpenDriver={openDriver} onDrivers={() => setActive("drivers")} />;
  }

  if (authLoading) return <main className="app-loading"><div className="auth-spinner" /><h1>MetrixIQ</h1><p>Loading secure workspaceâ€¦</p></main>;
  if (loadError) return <main className="app-loading"><h1>Workspace unavailable</h1><p>{loadError}</p><button className="btn primary" onClick={() => window.location.reload()}>Try again</button><button className="btn ghost" onClick={logout}>Sign out</button></main>;
  if (!session) return null;

  return <div className="app-shell"><aside className={mobile ? "sidebar open" : "sidebar"}><div className="sidebar-brand"><Brand inverse /><button className="mobile-close" onClick={() => setMobile(false)}>Ă—</button></div><div className="workspace-chip"><span>{initials(session.organisation)}</span><div><b>{session.organisation || "My Fleet"}</b><small>{session.role || "Member"} workspace</small></div></div><nav className="app-nav">{nav.map(([id, label], i) => <div key={id}>{[1, 4, 5, 6, 7].includes(i) && <small className="nav-section">{i === 1 ? "OPERATIONS" : i === 4 ? "INTELLIGENCE" : i === 5 ? "DATA" : i === 6 ? "REPORTING" : "ACCOUNT"}</small>}<button onClick={() => { setActive(id); setSelectedDriver(null); setMobile(false); }} className={active === id ? "active" : ""}><span>{icon[id]}</span>{label}{id === "intelligence" && <em>AI</em>}</button></div>)}</nav><div className="sidebar-user"><span>{initials(session.name)}</span><div><b>{session.name}</b><small>{session.email}</small></div><button onClick={logout}>â†Ş</button></div></aside>{mobile && <button className="mobile-overlay" onClick={() => setMobile(false)} aria-label="Close navigation" />}<div className="app-body"><header className="topbar"><div className="topbar-left"><button className="menu-btn" onClick={() => setMobile(true)}>â°</button><div className="search-box">âŚ• <span>Search drivers, reports or insightsâ€¦</span><kbd>Ctrl K</kbd></div></div><div className="topbar-right"><button className="site-select">All sitesâŚ„</button><button className="icon-btn">â—Ś</button><button className="icon-btn">â—Ź</button><span className="top-avatar">{initials(session.name)}</span></div></header><main className="app-main">{view}</main></div></div>;
}

