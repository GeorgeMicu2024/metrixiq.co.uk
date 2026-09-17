"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "../lib/supabase/client";
import { displayDriverName, isUsablePersonName, nameSignature, normalizeName } from "../lib/identity";
import { TARGETS } from "./HistoricalAnalytics";

const num = (value) => value == null || value === "" || Number.isNaN(Number(value)) ? null : Number(value);
const pct = (value, digits = 2) => num(value) == null ? "—" : `${Number(value).toFixed(digits)}%`;
const plain = (value, digits = 0) => num(value) == null ? "—" : Number(value).toFixed(digits);
const weekSort = (a, b) => (Number(b.year || 0) * 100 + Number(b.week || 0)) - (Number(a.year || 0) * 100 + Number(a.week || 0));

function useLoad(loader, deps = []) {
  const [state, setState] = useState({ loading: true, error: "", data: null });
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: "" }));
    loader()
      .then((data) => alive && setState({ loading: false, error: "", data }))
      .catch((error) => alive && setState({ loading: false, error: error?.message || "Could not load data.", data: null }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

function LoadingPanel({ text = "Loading operational data…" }) {
  return <section className="panel ops-empty"><div className="auth-spinner" /><b>{text}</b></section>;
}
function ErrorPanel({ error }) {
  return <section className="panel ops-empty error"><b>Unable to load this view</b><span>{error}</span></section>;
}
function EmptyPanel({ title, text, action, onAction }) {
  return <section className="panel ops-empty"><div className="ops-empty-icon">◇</div><b>{title}</b><span>{text}</span>{action && <button className="btn primary" onClick={onAction}>{action}</button>}</section>;
}

function MetricValue({ item, format = "plain" }) {
  if (!item) return <span className="muted-value">—</span>;
  const value = typeof item === "object" ? item.value : item;
  const standing = typeof item === "object" ? item.standing : null;
  const shown = format === "pct" && num(value) != null ? `${Number(value).toFixed(2)}%` : String(value ?? "—");
  return <span className="scorecard-source-value"><b>{shown}</b>{standing && <em>{standing}</em>}</span>;
}

function ScorecardMetricRow({ label, item, format }) {
  return <div className="source-metric-row"><span>{label}</span><MetricValue item={item} format={format} /></div>;
}

function indexFor(row) {
  const parts = [];
  if (num(row.dcr) != null) parts.push(Math.min(105, Number(row.dcr) / TARGETS.dcr * 100));
  if (num(row.pod) != null) parts.push(Math.min(105, Number(row.pod) / TARGETS.pod * 100));
  if (num(row.iadc) != null) parts.push(Math.min(105, Number(row.iadc) / TARGETS.iadc * 100));
  const mentor = num(row.mentor_score ?? row.ementor ?? row.fico);
  if (mentor != null) parts.push(Math.min(105, mentor / TARGETS.mentor * 100));
  return parts.length >= 2 ? parts.reduce((a, b) => a + b, 0) / parts.length : num(row.performance);
}

function tierForIndex(value) {
  const n = num(value);
  if (n == null) return { label: "Insufficient data", cls: "neutral" };
  if (n >= 100) return { label: "Strong", cls: "good" };
  if (n >= 96) return { label: "Stable", cls: "good" };
  if (n >= 90) return { label: "Watch", cls: "warn" };
  return { label: "Priority", cls: "bad" };
}

function driverShape(row) {
  const driver = row.drivers || {};
  return {
    id: driver.trid,
    dbId: row.driver_id,
    name: displayDriverName(driver),
    site: driver.site,
    status: driver.status || "active",
    performance: num(row.performance),
    dcr: num(row.dcr),
    pod: num(row.pod),
    iadc: num(row.iadc),
    cc: num(row.cc),
    fico: num(row.mentor_score ?? row.ementor ?? row.fico),
    ementor: num(row.mentor_score ?? row.ementor ?? row.fico),
    mentor_score: num(row.mentor_score ?? row.ementor ?? row.fico),
    concessions: num(row.concessions),
    lor: num(row.lor),
    psb: num(row.psb),
    risk: row.risk || "Low",
    issue: row.issue || "No active concern",
    weekLabel: row.week_label,
    dataConfidence: num(row.data_confidence),
  };
}

function LeaderList({ rows, title, inverse = false, onOpenDriver }) {
  const sorted = rows
    .map((row) => ({ ...row, index: indexFor(row) }))
    .filter((row) => row.index != null)
    .sort((a, b) => inverse ? a.index - b.index : b.index - a.index)
    .slice(0, 5);
  return <article className="panel ops-leader-card">
    <div className="panel-head"><div><h2>{title}</h2><p>{inverse ? "Lowest combined index — prioritise review." : "Highest combined index in the selected week."}</p></div></div>
    <div className="leader-stack">
      {sorted.length ? sorted.map((row, i) => {
        const driver = row.drivers || {};
        const tier = tierForIndex(row.index);
        return <button key={row.driver_id} className="leader-row" onClick={() => onOpenDriver?.(driverShape(row))}>
          <span className="rank-badge">{i + 1}</span>
          <span className="leader-name"><b>{displayDriverName(driver)}</b><small>{driver.trid}</small></span>
          <span className={`tier-chip ${tier.cls}`}>{tier.label}</span>
          <strong>{row.index.toFixed(1)}</strong>
        </button>;
      }) : <div className="ops-mini-empty">Not enough combined metrics yet.</div>}
    </div>
  </article>;
}

export function SiteScorecardsView({ organizationId, onOpenDriver, onImport }) {
  const load = useLoad(async () => {
    const supabase = getSupabaseBrowserClient();
    const [{ data: cards, error: cardError }, { data: rows, error: rowError }] = await Promise.all([
      supabase.from("site_scorecards").select("*").eq("organization_id", organizationId).order("year", { ascending: false }).order("week", { ascending: false }),
      supabase.from("driver_metrics")
        .select("driver_id,week_label,period_end,performance,dcr,pod,iadc,cc,mentor_score,ementor,fico,concessions,delivered,dnr_dpmo,dsc_dpmo,ce_dpmo,cdf_dpmo,psb,lor,risk,issue,data_confidence,drivers(id,trid,full_name,site,status)")
        .eq("organization_id", organizationId).limit(10000),
    ]);
    if (cardError) throw cardError;
    if (rowError) throw rowError;
    return { cards: cards || [], rows: rows || [] };
  }, [organizationId]);

  const cards = load.data?.cards || [];
  const [selectedId, setSelectedId] = useState("");
  useEffect(() => { if (cards.length && !selectedId) setSelectedId(cards[0].id); }, [cards, selectedId]);
  const card = cards.find((c) => c.id === selectedId) || cards[0];
  const weekRows = useMemo(() => card ? (load.data?.rows || []).filter((row) => row.week_label === card.week_label && (!card.site || !row.drivers?.site || row.drivers.site === card.site)) : [], [card, load.data]);
  const delivered = weekRows.reduce((sum, row) => sum + (num(row.delivered) || 0), 0);
  const concessions = weekRows.reduce((sum, row) => sum + (num(row.concessions) || 0), 0);
  const below = weekRows.filter((row) => {
    const mentor = num(row.mentor_score ?? row.ementor ?? row.fico);
    return (num(row.dcr) != null && row.dcr < TARGETS.dcr) ||
      (num(row.pod) != null && row.pod < TARGETS.pod) ||
      (num(row.iadc) != null && row.iadc < TARGETS.iadc) ||
      (mentor != null && mentor < TARGETS.mentor);
  }).length;

  if (load.loading) return <LoadingPanel text="Loading weekly scorecards…" />;
  if (load.error) return <ErrorPanel error={load.error} />;
  if (!cards.length) return <><div className="page-heading"><div><span className="page-kicker">SCORECARDS</span><h1>Site scorecards</h1><p>Weekly operational scorecards and source metrics.</p></div></div><EmptyPanel title="No site scorecard stored yet" text="Import a DSP Scorecard PDF and MetrixIQ will build the weekly view automatically." action="Import scorecard" onAction={onImport} /></>;

  const metrics = card.metrics || {};
  return <>
    <div className="page-heading scorecard-page-heading">
      <div><span className="page-kicker">SCORECARDS</span><h1>Site scorecard</h1><p>Source-faithful weekly performance with MetrixIQ driver intelligence underneath.</p></div>
      <div className="scorecard-filter-row">
        <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
          {cards.slice().sort(weekSort).map((item) => <option key={item.id} value={item.id}>{item.site} · {item.year} · {item.week_label}</option>)}
        </select>
        <button className="btn ghost" onClick={() => window.print()}>Export / print</button>
      </div>
    </div>

    <section className="team-overview-card">
      <div className="team-overview-head"><div><span>TEAM OVERVIEW</span><h2>{card.site} · {card.year}, {card.week_label}</h2></div><span className={`standing-chip ${(card.standing || "").toLowerCase().replace(/\s+/g, "-")}`}>{card.standing || "Not rated"}</span></div>
      <div className="team-kpis">
        <div><strong>{weekRows.length}</strong><span>Drivers</span></div>
        <div><strong>{Math.round(delivered).toLocaleString()}</strong><span>Parcels</span></div>
        <div><strong>{Math.round(concessions)}</strong><span>Concessions</span></div>
        <div><strong>{below}</strong><span>Below target</span></div>
      </div>
      <div className="overall-score-row">
        <div><span>Overall source score</span><strong>{card.overall_score == null ? "—" : Number(card.overall_score).toFixed(2)}</strong><em>{card.standing || "—"}</em></div>
        <div className="rank-block"><span>Site rank</span><strong>{card.site_rank ?? "—"}</strong><small>{card.rank_delta != null ? `${card.rank_delta >= 0 ? "+" : ""}${card.rank_delta} WoW` : "No rank movement data"}</small></div>
      </div>
    </section>

    <section className="scorecard-section-grid">
      <article className="panel source-scorecard-section">
        <div className="source-section-head"><div><span>SAFETY & COMPLIANCE</span><h2>{card.safety_standing || "—"}</h2></div></div>
        <div className="source-two-col">
          <div><h3>Safety</h3>
            <ScorecardMetricRow label="Mentor / FICO score" item={metrics.mentor_score} />
            <ScorecardMetricRow label="Speeding event rate" item={metrics.speeding_event_rate} />
            <ScorecardMetricRow label="Mentor adoption rate" item={metrics.mentor_adoption_rate} format="pct" />
          </div>
          <div><h3>Compliance</h3>
            <ScorecardMetricRow label="Vehicle Audit compliance" item={metrics.vsa} format="pct" />
            <ScorecardMetricRow label="Breach of Contract" item={metrics.boc} />
            <ScorecardMetricRow label="Working Hours compliance" item={metrics.whc} format="pct" />
            <ScorecardMetricRow label="Comprehensive Audit" item={metrics.cas} />
          </div>
        </div>
      </article>

      <article className="panel source-scorecard-section">
        <div className="source-section-head"><div><span>DELIVERY QUALITY & CUSTOMER</span><h2>{card.delivery_quality_standing || "—"}</h2></div></div>
        <div className="source-two-col">
          <div><h3>Customer experience</h3>
            <ScorecardMetricRow label="Customer Escalation DPMO" item={metrics.ce_dpmo} />
            <ScorecardMetricRow label="Customer Delivery Feedback" item={metrics.cdf_dpmo} />
            <ScorecardMetricRow label="Photo on Delivery" item={metrics.pod} format="pct" />
            <ScorecardMetricRow label="Contact Compliance" item={metrics.cc} format="pct" />
          </div>
          <div><h3>Quality</h3>
            <ScorecardMetricRow label="Delivery Completion Rate" item={metrics.dcr} format="pct" />
            <ScorecardMetricRow label="DNR DPMO" item={metrics.dnr_dpmo} />
            <ScorecardMetricRow label="Lost on Road DPMO" item={metrics.lor} />
            <ScorecardMetricRow label="DSC DPMO" item={metrics.dsc_dpmo} />
          </div>
        </div>
      </article>

      <article className="panel source-scorecard-section wide">
        <div className="source-section-head"><div><span>CAPACITY & PICKUP</span><h2>{card.capacity_standing || card.pickup_quality_standing || "—"}</h2></div></div>
        <div className="source-two-col">
          <div><h3>Capacity</h3><ScorecardMetricRow label="Capacity Reliability" item={metrics.capacity_reliability} format="pct" /></div>
          <div><h3>Pickup</h3><ScorecardMetricRow label="Pickup Success Behaviours" item={metrics.psb} /></div>
        </div>
      </article>
    </section>

    {Array.isArray(card.focus_areas) && card.focus_areas.length > 0 && <section className="panel focus-area-panel"><div className="panel-head"><div><h2>Recommended focus areas</h2><p>Imported from the source scorecard.</p></div></div><div className="focus-chips">{card.focus_areas.map((focus, index) => <span key={`${focus}-${index}`}>{index + 1}. {focus}</span>)}</div></section>}

    <section className="leaderboard-grid">
      <LeaderList rows={weekRows} title="Top 5 performers" onOpenDriver={onOpenDriver} />
      <LeaderList rows={weekRows} title="Bottom 5 — attention" inverse onOpenDriver={onOpenDriver} />
    </section>
  </>;
}

export function DriverScorecardsView({ organizationId, onOpenDriver, onImport }) {
  const load = useLoad(async () => {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.from("driver_metrics")
      .select("driver_id,week_label,period_end,performance,dcr,pod,iadc,cc,mentor_score,ementor,fico,concessions,delivered,dnr_dpmo,dsc_dpmo,ce_dpmo,cdf_dpmo,psb,lor,risk,issue,data_confidence,drivers(id,trid,full_name,site,status)")
      .eq("organization_id", organizationId).order("period_end", { ascending: false }).limit(10000);
    if (error) throw error;
    return data || [];
  }, [organizationId]);

  const rows = load.data || [];
  const weeks = useMemo(() => [...new Set(rows.map((r) => r.week_label).filter(Boolean))].sort((a, b) => Number(b.replace(/\D/g, "")) - Number(a.replace(/\D/g, ""))), [rows]);
  const [week, setWeek] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => { if (weeks.length && !week) setWeek(weeks[0]); }, [weeks, week]);
  const selected = useMemo(() => rows.filter((r) => r.week_label === week).filter((r) => `${r.drivers?.full_name || ""} ${r.drivers?.trid || ""}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => (indexFor(b) ?? -1) - (indexFor(a) ?? -1)), [rows, week, query]);

  if (load.loading) return <LoadingPanel text="Loading driver scorecards…" />;
  if (load.error) return <ErrorPanel error={load.error} />;

  return <>
    <div className="page-heading scorecard-page-heading">
      <div><span className="page-kicker">DRIVER INTELLIGENCE</span><h1>Driver scorecards</h1><p>Weekly driver metrics, ranking, evidence and coaching access.</p></div>
      <div className="scorecard-filter-row"><select value={week} onChange={(e) => setWeek(e.target.value)}>{weeks.map((w) => <option key={w}>{w}</option>)}</select><button className="btn primary" onClick={onImport}>Import reports</button></div>
    </div>
    <section className="panel">
      <div className="table-tools"><input placeholder="Search driver name or TRID…" value={query} onChange={(e) => setQuery(e.target.value)} /><span>{selected.length} drivers · {week || "No week"}</span></div>
      <div className="table-wrap"><table className="data-table pro-driver-score-table"><thead><tr><th>#</th><th>Driver</th><th>Index</th><th>DCR</th><th>POD</th><th>IADC</th><th>Mentor</th><th>CC</th><th>Concessions</th><th>CDF DPMO</th><th>Risk</th><th /></tr></thead><tbody>
        {selected.map((row, index) => {
          const driver = row.drivers || {};
          const score = indexFor(row);
          const tier = tierForIndex(score);
          return <tr key={`${row.driver_id}-${week}`}>
            <td><span className="rank-badge">{index + 1}</span></td>
            <td><div className="driver-cell"><span className="driver-avatar">{displayDriverName(driver).slice(0,1)}</span><div><b>{displayDriverName(driver)}</b><small>{driver.trid}</small></div></div></td>
            <td><b>{score == null ? "—" : score.toFixed(1)}</b><small className={`tier-inline ${tier.cls}`}>{tier.label}</small></td>
            <td>{pct(row.dcr)}</td><td>{pct(row.pod)}</td><td>{pct(row.iadc)}</td><td>{plain(row.mentor_score ?? row.ementor ?? row.fico)}</td><td>{pct(row.cc)}</td><td>{plain(row.concessions)}</td><td>{plain(row.cdf_dpmo)}</td><td><span className={`risk-pill risk-${String(row.risk || "Low").toLowerCase()}`}>{row.risk || "Low"}</span></td>
            <td><button className="profile-link" onClick={() => onOpenDriver?.(driverShape(row))}>Open →</button></td>
          </tr>;
        })}
        {!selected.length && <tr><td colSpan="12"><div className="ops-mini-empty">No driver evidence stored for this week.</div></td></tr>}
      </tbody></table></div>
    </section>
  </>;
}

export function IadcView({ organizationId, onOpenDriver, onImport }) {
  const load = useLoad(async () => {
    const { data, error } = await getSupabaseBrowserClient().from("driver_metrics")
      .select("driver_id,week_label,period_end,iadc,raw_data,risk,issue,drivers(id,trid,full_name,site,status)")
      .eq("organization_id", organizationId).not("iadc", "is", null).order("period_end", { ascending: false }).limit(10000);
    if (error) throw error;
    return data || [];
  }, [organizationId]);

  const rows = load.data || [];
  const weeks = useMemo(() => [...new Set(rows.map((r) => r.week_label).filter(Boolean))].sort((a,b)=>Number(b.replace(/\D/g,""))-Number(a.replace(/\D/g,""))), [rows]);
  const [week, setWeek] = useState("");
  useEffect(() => { if (weeks.length && !week) setWeek(weeks[0]); }, [weeks, week]);
  const selected = rows.filter((r) => r.week_label === week).sort((a,b)=>(num(b.iadc)||0)-(num(a.iadc)||0));
  const average = selected.length ? selected.reduce((sum, row) => sum + Number(row.iadc), 0) / selected.length : null;
  const below = selected.filter((r) => Number(r.iadc) < TARGETS.iadc).length;
  const best = selected[0];

  if (load.loading) return <LoadingPanel text="Loading IADC intelligence…" />;
  if (load.error) return <ErrorPanel error={load.error} />;

  return <>
    <div className="page-heading scorecard-page-heading"><div><span className="page-kicker">WORKFLOW COMPLIANCE</span><h1>IADC intelligence</h1><p>Current-week delivery workflow compliance with exact driver evidence.</p></div><div className="scorecard-filter-row"><select value={week} onChange={(e)=>setWeek(e.target.value)}>{weeks.map((w)=><option key={w}>{w}</option>)}</select><button className="btn primary" onClick={onImport}>Import IADC</button></div></div>
    <section className="ops-kpi-strip"><div><span>Fleet IADC</span><strong>{average == null ? "—" : `${average.toFixed(1)}%`}</strong><small>Target ≥ 80%</small></div><div><span>Below target</span><strong>{below}</strong><small>Needs coaching</small></div><div><span>Drivers measured</span><strong>{selected.length}</strong><small>{week || "No week"}</small></div><div><span>Best result</span><strong>{best ? `${Number(best.iadc).toFixed(1)}%` : "—"}</strong><small>{best ? displayDriverName(best.drivers) : "No evidence"}</small></div></section>
    <section className="panel"><div className="panel-head"><div><h2>Driver IADC ranking</h2><p>DWC is shown when available from the same workflow report.</p></div><span className="panel-badge">{selected.length} drivers</span></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Rank</th><th>Driver</th><th>TRID</th><th>IADC</th><th>DWC</th><th>Status</th><th /></tr></thead><tbody>
      {selected.map((row,index)=><tr key={row.driver_id}><td><span className="rank-badge">{index+1}</span></td><td><b>{displayDriverName(row.drivers)}</b></td><td>{row.drivers?.trid}</td><td><b>{pct(row.iadc)}</b></td><td>{pct(row.raw_data?.dwc)}</td><td><span className={`target-status ${Number(row.iadc)>=TARGETS.iadc?"good":"bad"}`}>{Number(row.iadc)>=TARGETS.iadc?"On target":"Below 80%"}</span></td><td><button className="profile-link" onClick={()=>onOpenDriver?.(driverShape({...row,performance:null,dcr:null,pod:null,cc:null,mentor_score:null,concessions:null,lor:null,psb:null,data_confidence:null}))}>Open →</button></td></tr>)}
      {!selected.length && <tr><td colSpan="7"><div className="ops-mini-empty">Import a DWC/IADC report to populate this view.</div></td></tr>}
    </tbody></table></div></section>
  </>;
}

export function CdfView({ organizationId, onImport }) {
  const load = useLoad(async () => {
    const supabase = getSupabaseBrowserClient();
    const [{ data: events, error: eventError }, { data: cards, error: cardError }] = await Promise.all([
      supabase.from("feedback_events").select("*,drivers(trid,full_name,site)").eq("organization_id", organizationId).order("feedback_date", { ascending: false }).limit(10000),
      supabase.from("site_scorecards").select("id,site,year,week,week_label,metrics").eq("organization_id", organizationId).order("year", { ascending: false }).order("week", { ascending: false }),
    ]);
    if (eventError) throw eventError;
    if (cardError) throw cardError;
    return { events: events || [], cards: cards || [] };
  }, [organizationId]);

  const events = load.data?.events || [];
  const weeks = useMemo(() => [...new Set(events.map((e)=>e.week_label).filter(Boolean))].sort((a,b)=>Number(b.replace(/\D/g,""))-Number(a.replace(/\D/g,""))), [events]);
  const [week,setWeek]=useState("");
  const [category,setCategory]=useState("all");
  const [query,setQuery]=useState("");
  useEffect(()=>{if(weeks.length&&!week)setWeek(weeks[0]);},[weeks,week]);

  const selected = events.filter((e)=>e.week_label===week);
  const filtered = selected.filter((e)=>category==="all"||e.feedback_l1===category).filter((e)=>`${e.drivers?.full_name||""} ${e.trid_raw||""} ${e.tracking_id||""}`.toLowerCase().includes(query.toLowerCase()));
  const categories = [...new Set(selected.map((e)=>e.feedback_l1).filter(Boolean))];
  const affected = new Set(selected.map((e)=>e.driver_id||e.trid_raw).filter(Boolean)).size;
  const dnr = selected.filter((e)=>e.dnr_concession).length;
  const over25 = selected.filter((e)=>e.scanned_over_25m).length;
  const siteMetric = load.data?.cards.find((c)=>c.week_label===week)?.metrics?.cdf_dpmo;

  if(load.loading)return <LoadingPanel text="Loading customer feedback…"/>;
  if(load.error)return <ErrorPanel error={load.error}/>;

  return <>
    <div className="page-heading scorecard-page-heading"><div><span className="page-kicker">CUSTOMER EXPERIENCE</span><h1>CDF feedback</h1><p>Negative customer feedback, root causes and driver-level evidence.</p></div><div className="scorecard-filter-row"><select value={week} onChange={(e)=>setWeek(e.target.value)}>{weeks.map((w)=><option key={w}>{w}</option>)}</select><button className="btn primary" onClick={onImport}>Import CDF</button></div></div>
    <section className="ops-kpi-strip"><div><span>Negative feedback</span><strong>{selected.length}</strong><small>{week||"No week"}</small></div><div><span>Drivers affected</span><strong>{affected}</strong><small>Unique drivers</small></div><div><span>DNR concessions</span><strong>{dnr}</strong><small>Flagged in CDF</small></div><div><span>CDF DPMO</span><strong>{siteMetric?.value ?? "—"}</strong><small>{siteMetric?.standing || "From weekly scorecard"}</small></div></section>
    <section className="cdf-category-grid">{categories.slice(0,6).map((cat)=><button key={cat} className={category===cat?"active":""} onClick={()=>setCategory(category===cat?"all":cat)}><span>{cat}</span><strong>{selected.filter((e)=>e.feedback_l1===cat).length}</strong></button>)}</section>
    <section className="panel"><div className="table-tools"><input placeholder="Search driver, TRID or tracking ID…" value={query} onChange={(e)=>setQuery(e.target.value)}/><select value={category} onChange={(e)=>setCategory(e.target.value)}><option value="all">All feedback types</option>{categories.map((cat)=><option key={cat}>{cat}</option>)}</select><span>{filtered.length} events · {over25} over 25m</span></div><div className="table-wrap"><table className="data-table cdf-table"><thead><tr><th>Date</th><th>Driver</th><th>Tracking ID</th><th>Feedback</th><th>Detail</th><th>Contact</th><th>PHR</th><th>&gt;25m</th><th>DNR</th></tr></thead><tbody>
      {filtered.map((event)=><tr key={event.id}><td>{event.feedback_date||"—"}</td><td><b>{displayDriverName(event.drivers)}</b><small className="history-date">{event.trid_raw}</small></td><td>{event.tracking_id}</td><td>{event.feedback_l1||event.feedback_l0||"—"}</td><td>{event.feedback_l2||"—"}</td><td>{event.contact_compliance||"—"}</td><td>{event.phr_compliance||"—"}</td><td>{event.scanned_over_25m?"Yes":"No"}</td><td>{event.dnr_concession?"Yes":"No"}</td></tr>)}
      {!filtered.length&&<tr><td colSpan="9"><div className="ops-mini-empty">No CDF events stored for this selection.</div></td></tr>}
    </tbody></table></div></section>
  </>;
}

export function DataQualityView({ organizationId, onImport }) {
  const [refreshKey,setRefreshKey]=useState(0);
  const [renameId,setRenameId]=useState("");
  const [renameValue,setRenameValue]=useState("");
  const [choice,setChoice]=useState({});
  const [busy,setBusy]=useState("");
  const [notice,setNotice]=useState("");

  const load = useLoad(async()=>{
    const supabase=getSupabaseBrowserClient();
    const [{data:drivers,error:driverError},{data:unmatched,error:unmatchedError},{data:aliases,error:aliasError}]=await Promise.all([
      supabase.from("drivers").select("id,trid,full_name,site,status").eq("organization_id",organizationId).order("full_name"),
      supabase.from("unmatched_driver_records").select("*").eq("organization_id",organizationId).eq("status","open").order("created_at",{ascending:false}).limit(500),
      supabase.from("driver_aliases").select("id,driver_id,alias_type,alias_value,confidence,source").eq("organization_id",organizationId),
    ]);
    if(driverError)throw driverError;if(unmatchedError)throw unmatchedError;if(aliasError)throw aliasError;
    return {drivers:drivers||[],unmatched:unmatched||[],aliases:aliases||[]};
  },[organizationId,refreshKey]);

  const drivers=load.data?.drivers||[];
  const unresolved=drivers.filter((d)=>!isUsablePersonName(d.full_name));
  const unmatched=load.data?.unmatched||[];

  async function saveName(driver){
    const name=renameValue.trim();
    if(!isUsablePersonName(name)){
      setNotice("Please enter the full driver name (at least first name and surname).");
      return;
    }
    setBusy(driver.id);
    setNotice("");
    try{
      const supabase=getSupabaseBrowserClient();
      const {error}=await supabase.rpc("resolve_driver_identity",{
        p_organization_id:organizationId,
        p_driver_id:driver.id,
        p_full_name:name,
        p_normalized_name:normalizeName(name),
        p_name_signature:nameSignature(name),
      });
      if(error)throw error;
      setRenameId("");
      setRenameValue("");
      setNotice(`${name} saved and linked to ${driver.trid}.`);
      setRefreshKey((v)=>v+1);
    }catch(error){
      setNotice(`Could not save driver name: ${error?.message || "Unknown error"}`);
    }finally{setBusy("");}
  }

  async function resolveRecord(record){
    const driverId=choice[record.id];
    if(!driverId)return;
    setBusy(record.id);
    setNotice("");
    try{
      const supabase=getSupabaseBrowserClient();
      const aliasName=record.raw_name&&isUsablePersonName(record.raw_name)?record.raw_name:"";
      const {error}=await supabase.rpc("resolve_unmatched_driver_record",{
        p_organization_id:organizationId,
        p_record_id:record.id,
        p_driver_id:driverId,
        p_alias_name:aliasName,
        p_normalized_name:aliasName?normalizeName(aliasName):"",
        p_name_signature:aliasName?nameSignature(aliasName):"",
      });
      if(error)throw error;
      setNotice("Imported record resolved successfully.");
      setChoice((current)=>{const next={...current};delete next[record.id];return next;});
      setRefreshKey((v)=>v+1);
    }catch(error){
      setNotice(`Could not resolve imported record: ${error?.message || "Unknown error"}`);
    }finally{setBusy("");}
  }

  if(load.loading)return <LoadingPanel text="Checking identity quality…"/>;
  if(load.error)return <ErrorPanel error={load.error}/>;

  const resolved=drivers.length-unresolved.length;
  return <>
    <div className="page-heading"><div><span className="page-kicker">DATA QUALITY</span><h1>Identity resolution</h1><p>Keep TRIDs, driver names and name-only Mentor records mapped to one trusted profile.</p></div><button className="btn primary" onClick={onImport}>Import master roster</button></div>
    {notice && <div className={`import-message ${notice.startsWith("Could not") || notice.startsWith("Please") ? "error" : ""}`}>{notice}</div>}
    <section className="ops-kpi-strip"><div><span>Known drivers</span><strong>{drivers.length}</strong><small>Workspace identities</small></div><div><span>Resolved names</span><strong>{resolved}</strong><small>{drivers.length?`${Math.round(resolved/drivers.length*100)}% coverage`:"0% coverage"}</small></div><div><span>Unresolved TRIDs</span><strong>{unresolved.length}</strong><small>Need trusted name mapping</small></div><div><span>Unmatched records</span><strong>{unmatched.length}</strong><small>Name-only or ambiguous evidence</small></div></section>

    <section className="panel"><div className="panel-head"><div><h2>Unresolved driver identities</h2><p>Import MASTER TRID to auto-resolve, or set a trusted name manually.</p></div><span className="panel-badge">{unresolved.length}</span></div><div className="table-wrap"><table className="data-table"><thead><tr><th>TRID</th><th>Current label</th><th>Site</th><th>Resolution</th></tr></thead><tbody>
      {unresolved.map((driver)=><tr key={driver.id}><td><b>{driver.trid}</b></td><td>Unresolved identity</td><td>{driver.site||"—"}</td><td>{renameId===driver.id?<div className="inline-resolve"><input autoFocus placeholder="Full driver name" value={renameValue} onChange={(e)=>setRenameValue(e.target.value)}/><button className="btn primary" disabled={busy===driver.id} onClick={()=>saveName(driver)}>Save</button><button className="btn ghost" onClick={()=>setRenameId("")}>Cancel</button></div>:<button className="profile-link" onClick={()=>{setRenameId(driver.id);setRenameValue("");}}>Resolve name →</button>}</td></tr>)}
      {!unresolved.length&&<tr><td colSpan="4"><div className="ops-mini-empty success">All current TRIDs have trusted names.</div></td></tr>}
    </tbody></table></div></section>

    <section className="panel data-quality-unmatched"><div className="panel-head"><div><h2>Unmatched imported records</h2><p>Map ambiguous or name-only source records once; the alias is remembered for future imports.</p></div><span className="panel-badge">{unmatched.length}</span></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Source name</th><th>TRID</th><th>Week</th><th>Type</th><th>Map to driver</th><th /></tr></thead><tbody>
      {unmatched.map((record)=><tr key={record.id}><td>{record.raw_name||"—"}</td><td>{record.raw_trid||"—"}</td><td>{record.week_label||"—"}</td><td>{record.report_type||"—"}</td><td><select value={choice[record.id]||""} onChange={(e)=>setChoice((c)=>({...c,[record.id]:e.target.value}))}><option value="">Choose trusted driver…</option>{drivers.filter((d)=>isUsablePersonName(d.full_name)).map((driver)=><option key={driver.id} value={driver.id}>{driver.full_name} · {driver.trid}</option>)}</select></td><td><button className="btn primary compact" disabled={!choice[record.id]||busy===record.id} onClick={()=>resolveRecord(record)}>Resolve</button></td></tr>)}
      {!unmatched.length&&<tr><td colSpan="6"><div className="ops-mini-empty success">No unmatched imported records.</div></td></tr>}
    </tbody></table></div></section>
  </>;
}
