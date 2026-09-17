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

    const { data: cards, error: cardError } = await supabase
      .from("site_scorecards")
      .select("*")
      .eq("organization_id", organizationId)
      .order("year", { ascending: false })
      .order("week", { ascending: false });

    if (cardError) throw cardError;

    const rows = [];
    const pageSize = 1000;
    let from = 0;

    while (true) {
      const { data, error } = await supabase
        .from("driver_metrics")
        .select("driver_id,week_label,period_end,performance,dcr,pod,iadc,cc,mentor_score,ementor,fico,concessions,delivered,dnr_dpmo,dsc_dpmo,ce_dpmo,cdf_dpmo,psb,lor,risk,issue,data_confidence,drivers(id,trid,full_name,site,status)")
        .eq("organization_id", organizationId)
        .order("period_end", { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) throw error;

      const page = data || [];
      rows.push(...page);

      if (page.length < pageSize) break;
      from += pageSize;
    }

    return { cards: cards || [], rows };
  }, [organizationId]);

  const cards = load.data?.cards || [];
  const [selectedId, setSelectedId] = useState("");

  useEffect(() => {
    if (cards.length && !selectedId) setSelectedId(cards[0].id);
  }, [cards, selectedId]);

  const sortedCards = useMemo(() => cards.slice().sort(weekSort), [cards]);
  const card = cards.find((item) => item.id === selectedId) || cards[0];

  const weekRows = useMemo(() => {
    if (!card) return [];
    return (load.data?.rows || []).filter((row) =>
      row.week_label === card.week_label &&
      (!card.site || !row.drivers?.site || row.drivers.site === card.site)
    );
  }, [card, load.data]);

  const delivered = weekRows.reduce((sum, row) => sum + (num(row.delivered) || 0), 0);
  const concessions = weekRows.reduce((sum, row) => sum + (num(row.concessions) || 0), 0);
  const below = weekRows.filter((row) => {
    const mentor = num(row.mentor_score ?? row.ementor ?? row.fico);
    return (num(row.dcr) != null && row.dcr < TARGETS.dcr) ||
      (num(row.pod) != null && row.pod < TARGETS.pod) ||
      (num(row.iadc) != null && row.iadc < TARGETS.iadc) ||
      (mentor != null && mentor < TARGETS.mentor);
  }).length;

  const standingClass = (standing) => {
    const value = String(standing || "").trim().toLowerCase();
    if (value.includes("fantastic plus")) return "fantastic-plus";
    if (value.includes("fantastic")) return "fantastic";
    if (value.includes("great")) return "great";
    if (value.includes("fair")) return "fair";
    if (value.includes("poor")) return "poor";
    if (value.includes("compliance")) return "fantastic";
    return "neutral";
  };

  const standingPercent = (standing, fallback = null) => {
    if (num(fallback) != null) return Math.max(0, Math.min(100, Number(fallback)));
    const cls = standingClass(standing);
    if (cls === "fantastic-plus") return 100;
    if (cls === "fantastic") return 90;
    if (cls === "great") return 74;
    if (cls === "fair") return 52;
    if (cls === "poor") return 28;
    return 0;
  };

  const ScoreSegments = ({ standing, score = null }) => {
    const percent = standingPercent(standing, score);
    return <div className="sitepro-segments" aria-label={`${standing || "Not rated"} score`}>
      {[0,1,2,3,4].map((segment) => {
        const start = segment * 20;
        const fill = Math.max(0, Math.min(20, percent - start)) / 20 * 100;
        return <span key={segment}><i style={{ width: `${fill}%` }} /></span>;
      })}
    </div>;
  };

  const rawItemValue = (item) => item && typeof item === "object" ? item.value : item;
  const rawItemStanding = (item) => item && typeof item === "object" ? item.standing : null;

  const displayValue = (item, format = "plain") => {
    const value = rawItemValue(item);
    if (value == null || value === "") return "—";
    if (format === "pct" && num(value) != null) return `${Number(value).toFixed(2)}%`;
    if (format === "score" && num(value) != null) return Number(value).toFixed(0);
    if (format === "dpmo" && num(value) != null) return Math.round(Number(value)).toLocaleString();
    return String(value);
  };

  const MetricLine = ({ label, item, format = "plain", accent = false }) => {
    const standing = rawItemStanding(item);
    const cls = standingClass(standing);
    return <div className={`sitepro-metric ${accent ? "accent" : ""}`}>
      <span>{label}</span>
      <div>
        <b className={cls}>{displayValue(item, format)}</b>
        {standing && <em className={cls}>{standing}</em>}
      </div>
    </div>;
  };

  const metrics = card?.metrics || {};

  const sourceFocus = Array.isArray(card?.focus_areas)
    ? card.focus_areas.filter(Boolean)
    : [];

  const generatedFocus = useMemo(() => {
    if (sourceFocus.length) return sourceFocus;

    const candidates = [
      ["Delivery Success Conditions (DSC) DPMO", metrics.dsc_dpmo],
      ["Mentor Adoption Rate", metrics.mentor_adoption_rate],
      ["Speeding Event Rate (Per 100 Trips)", metrics.speeding_event_rate],
      ["Customer Delivery Feedback", metrics.cdf_dpmo],
      ["Contact Compliance", metrics.cc],
      ["Delivery Completion Rate (DCR)", metrics.dcr],
      ["Photo-On-Delivery", metrics.pod],
      ["Pickup Success Behaviours", metrics.psb],
    ];

    const priority = { poor: 0, fair: 1, great: 2, neutral: 3, fantastic: 4, "fantastic-plus": 5 };

    return candidates
      .filter(([, item]) => item)
      .map(([label, item]) => ({
        label,
        rank: priority[standingClass(rawItemStanding(item))] ?? 3,
      }))
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 3)
      .map((item) => item.label);
  }, [card]);

  if (load.loading) return <LoadingPanel text="Loading weekly scorecards…" />;
  if (load.error) return <ErrorPanel error={load.error} />;

  if (!cards.length) {
    return <>
      <div className="page-heading">
        <div>
          <span className="page-kicker">SCORECARDS</span>
          <h1>Site scorecards</h1>
          <p>Weekly operational scorecards and source metrics.</p>
        </div>
      </div>
      <EmptyPanel
        title="No site scorecard stored yet"
        text="Import a DSP Scorecard PDF and MetrixIQ will build the weekly report automatically."
        action="Import scorecard"
        onAction={onImport}
      />
    </>;
  }

  const previousCardIndex = sortedCards.findIndex((item) => item.id === card.id);
  const previousCard = previousCardIndex >= 0 ? sortedCards[previousCardIndex + 1] : null;
  const scoreDelta =
    num(card.overall_score) != null && num(previousCard?.overall_score) != null
      ? Number(card.overall_score) - Number(previousCard.overall_score)
      : null;

  return <div className="sitepro-root">
    <div className="page-heading sitepro-page-heading">
      <div>
        <span className="page-kicker">SCORECARDS</span>
        <h1>Site scorecard</h1>
        <p>Source-faithful weekly DSP performance with MetrixIQ operational context.</p>
      </div>

      <div className="sitepro-controls">
        <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
          {sortedCards.map((item) =>
            <option key={item.id} value={item.id}>
              {item.site} · {item.year} · {item.week_label}
            </option>
          )}
        </select>
        <button className="btn ghost" onClick={() => window.print()}>Export / print</button>
      </div>
    </div>

    <section className="sitepro-report">
      <header className="sitepro-report-head">
        <div>
          <span className="sitepro-eyebrow">DSP WEEKLY SCORECARD</span>
          <h2>{card.site || "Site"} · Week {card.week || String(card.week_label || "").replace(/\D/g, "")} — {card.year}</h2>
        </div>

        <div className="sitepro-rank">
          <span>Rank at {card.site || "site"}</span>
          <strong>{card.site_rank ?? "—"}</strong>
          <small>
            {card.rank_delta != null
              ? `${card.rank_delta >= 0 ? "+" : ""}${card.rank_delta} WoW`
              : "WoW unavailable"}
          </small>
        </div>
      </header>

      <section className="sitepro-overall">
        <div className="sitepro-overall-copy">
          <span>Overall Score</span>
          <div>
            <strong>{num(card.overall_score) == null ? "—" : Number(card.overall_score).toFixed(2)}</strong>
            <em className={standingClass(card.standing)}>{card.standing || "Not rated"}</em>
          </div>
          {scoreDelta != null &&
            <small className={scoreDelta >= 0 ? "positive" : "negative"}>
              {scoreDelta >= 0 ? "+" : ""}{scoreDelta.toFixed(2)} vs previous stored week
            </small>
          }
        </div>

        <div className="sitepro-overall-track">
          <ScoreSegments standing={card.standing} score={card.overall_score} />
          <div className="sitepro-scale">
            <span>Poor</span><span>Fair</span><span>Great</span><span>Fantastic</span><span>Fantastic+</span>
          </div>
        </div>
      </section>

      <section className="sitepro-section">
        <div className="sitepro-section-title">
          <div>
            <span>COMPLIANCE AND SAFETY</span>
            <ScoreSegments standing={card.safety_standing} />
          </div>
          <strong className={standingClass(card.safety_standing)}>{card.safety_standing || "—"}</strong>
        </div>

        <p className="sitepro-note">
          You need to achieve Fantastic in Safety to qualify for Scorecard incentives.
        </p>

        <div className="sitepro-two-col">
          <div className="sitepro-metric-group">
            <h3>Safety</h3>
            <MetricLine label="Safe Driving Metric (FICO)" item={metrics.mentor_score} format="score" />
            <MetricLine label="Speeding Event Rate (Per 100 Trips)" item={metrics.speeding_event_rate} />
            <MetricLine label="Mentor Adoption Rate" item={metrics.mentor_adoption_rate} format="pct" />
          </div>

          <div className="sitepro-metric-group">
            <h3>Compliance</h3>
            <MetricLine label="Vehicle Audit (VSA) Compliance" item={metrics.vsa} format="pct" />
            <MetricLine label="Breach of Contract (BOC)" item={metrics.boc} />
            <MetricLine label="Working Hours Compliance (WHC)" item={metrics.whc} format="pct" />
            <MetricLine label="Comprehensive Audit Score (CAS)" item={metrics.cas} />
          </div>
        </div>
      </section>

      <section className="sitepro-section">
        <div className="sitepro-section-title">
          <div>
            <span>DELIVERY QUALITY &amp; SWC</span>
            <ScoreSegments standing={card.delivery_quality_standing} />
          </div>
          <strong className={standingClass(card.delivery_quality_standing)}>{card.delivery_quality_standing || "—"}</strong>
        </div>

        <div className="sitepro-two-col quality">
          <div>
            <div className="sitepro-metric-group">
              <h3>Customer Delivery Experience</h3>
              <MetricLine label="Customer Escalation DPMO" item={metrics.ce_dpmo} format="dpmo" />
              <MetricLine label="Customer Delivery Feedback" item={metrics.cdf_dpmo} format="dpmo" />
            </div>

            <div className="sitepro-metric-group sitepro-subgroup">
              <h3>Standard Work Compliance</h3>
              <MetricLine label="Photo-On-Delivery" item={metrics.pod} format="pct" />
              <MetricLine label="Contact Compliance" item={metrics.cc} format="pct" />
            </div>
          </div>

          <div className="sitepro-metric-group">
            <h3>Quality</h3>
            <MetricLine label="Delivery Completion Rate (DCR)" item={metrics.dcr} format="pct" />
            <MetricLine label="Delivered Not Received (DNR DPMO)" item={metrics.dnr_dpmo} format="dpmo" accent />
            <MetricLine label="Lost on Road (LoR) DPMO" item={metrics.lor} format="dpmo" />
            <MetricLine label="Delivery Success Conditions (DSC DPMO)" item={metrics.dsc_dpmo} format="dpmo" />
            <p className="sitepro-quality-note">Metrics highlighted in red are for visibility only and do not impact final DSP Scores / Tiers.</p>
          </div>
        </div>
      </section>

      <section className="sitepro-section compact">
        <div className="sitepro-section-title">
          <div>
            <span>CAPACITY</span>
            <ScoreSegments standing={card.capacity_standing} />
          </div>
          <strong className={standingClass(card.capacity_standing)}>{card.capacity_standing || "—"}</strong>
        </div>

        <div className="sitepro-single-metric">
          <MetricLine label="Capacity Reliability" item={metrics.capacity_reliability} format="pct" />
        </div>
      </section>

      <section className="sitepro-section compact">
        <div className="sitepro-section-title">
          <div>
            <span>PICKUP QUALITY</span>
            <ScoreSegments standing={card.pickup_quality_standing} />
          </div>
          <strong className={standingClass(card.pickup_quality_standing)}>{card.pickup_quality_standing || "—"}</strong>
        </div>

        <div className="sitepro-single-metric">
          <MetricLine label="Pickup Success Behaviours" item={metrics.psb} />
        </div>
      </section>

      <section className="sitepro-focus">
        <span>RECOMMENDED FOCUS AREAS</span>
        <ol>
          {generatedFocus.length
            ? generatedFocus.map((focus, index) => <li key={`${focus}-${index}`}>{focus}</li>)
            : <li>No focus areas were supplied in this scorecard.</li>
          }
        </ol>
      </section>
    </section>

    <section className="sitepro-context">
      <article>
        <span>Drivers measured</span>
        <strong>{weekRows.length}</strong>
        <small>{card.week_label}</small>
      </article>
      <article>
        <span>Parcels delivered</span>
        <strong>{Math.round(delivered).toLocaleString()}</strong>
        <small>Driver evidence total</small>
      </article>
      <article>
        <span>Concessions</span>
        <strong>{Math.round(concessions)}</strong>
        <small>Same reporting week</small>
      </article>
      <article>
        <span>Below operational target</span>
        <strong>{below}</strong>
        <small>DCR / POD / IADC / Mentor</small>
      </article>
    </section>

    <section className="leaderboard-grid sitepro-leaders">
      <LeaderList rows={weekRows} title="Top 5 performers" onOpenDriver={onOpenDriver} />
      <LeaderList rows={weekRows} title="Bottom 5 — attention" inverse onOpenDriver={onOpenDriver} />
    </section>

    <style jsx global>{`
      .sitepro-root{width:100%;padding-bottom:30px;color:#26384c}
      .sitepro-page-heading{align-items:flex-start;margin-bottom:16px}
      .sitepro-controls{display:flex;gap:8px;align-items:center}
      .sitepro-controls select{height:39px;min-width:185px;padding:0 11px;border:1px solid #dce4ea;border-radius:9px;background:#fff;color:#26394c;font-size:10px;font-weight:800;outline:none}
      .sitepro-report{background:#fff;border:1px solid #dce4e9;border-radius:16px;box-shadow:0 7px 25px rgba(26,44,62,.055);overflow:hidden}
      .sitepro-report-head{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;padding:22px 28px 18px;border-bottom:1px solid #e3e8ec;background:linear-gradient(180deg,#fff 0%,#fbfcfd 100%)}
      .sitepro-eyebrow{display:block;font-size:11px;font-weight:950;letter-spacing:.12em;color:#273a4e}.sitepro-report-head h2{margin:5px 0 0;font-size:20px;letter-spacing:-.015em;color:#1f3042}
      .sitepro-rank{text-align:right}.sitepro-rank span{display:block;font-size:8px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#8592a0}.sitepro-rank strong{display:block;margin-top:3px;font-size:28px;color:#21364a}.sitepro-rank small{display:block;margin-top:1px;color:#83919f;font-size:8px}
      .sitepro-overall{display:grid;grid-template-columns:260px 1fr;gap:30px;align-items:center;padding:18px 28px 20px;border-bottom:1px solid #e0e6ea}
      .sitepro-overall-copy>span{display:block;font-size:10px;font-weight:900;color:#33485d}.sitepro-overall-copy>div{display:flex;align-items:baseline;gap:12px;margin-top:4px}.sitepro-overall-copy strong{font-size:34px;letter-spacing:-.025em;color:#1f3247}.sitepro-overall-copy em{font-size:18px;font-style:normal;font-weight:900}.sitepro-overall-copy small{display:block;margin-top:3px;font-size:8px;font-weight:800}.sitepro-overall-copy small.positive{color:#3c8869}.sitepro-overall-copy small.negative{color:#b44e58}
      .sitepro-overall-track{padding-top:8px}.sitepro-segments{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}.sitepro-segments>span{position:relative;display:block;height:12px;border-radius:3px;background:#e5e7e9;overflow:hidden}.sitepro-segments>span>i{display:block;height:100%;background:#477bc9;border-radius:3px}
      .sitepro-scale{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-top:7px}.sitepro-scale span{text-align:center;color:#9aa4ae;font-size:7px;font-weight:800}
      .sitepro-section{padding:20px 28px 21px;border-bottom:1px solid #dfe5e9}.sitepro-section.compact{padding-bottom:18px}
      .sitepro-section-title{display:grid;grid-template-columns:1fr auto;gap:20px;align-items:start;margin-bottom:8px}.sitepro-section-title>div>span{display:block;margin-bottom:8px;font-size:15px;font-weight:900;color:#2c3b4c}.sitepro-section-title .sitepro-segments{max-width:760px}.sitepro-section-title strong{align-self:start;padding-top:1px;font-size:17px}.sitepro-note{margin:1px 0 18px;color:#5e6c7a;font-size:8px}
      .sitepro-two-col{display:grid;grid-template-columns:1fr 1fr;gap:46px;padding:0 12px}.sitepro-two-col.quality{align-items:start}.sitepro-metric-group h3{margin:0 0 9px;color:#1f3042;font-size:13px}.sitepro-subgroup{margin-top:17px}
      .sitepro-metric{display:grid;grid-template-columns:minmax(180px,1fr) auto;align-items:center;gap:14px;min-height:26px;border-bottom:1px dotted #edf0f2}.sitepro-metric:last-child{border-bottom:0}.sitepro-metric>span{color:#29394a;font-size:9px}.sitepro-metric>div{display:flex;align-items:center;justify-content:flex-end;gap:4px;text-align:right}.sitepro-metric b{font-size:9px}.sitepro-metric em{font-size:8px;font-style:normal;font-weight:850}.sitepro-metric.accent>span{color:#be2f34}
      .sitepro-single-metric{max-width:520px;padding:0 12px}.sitepro-quality-note{margin:9px 0 0;color:#c33a3a;font-size:7px;font-style:italic;text-align:right}
      .sitepro-focus{padding:19px 28px 22px;background:#fbfcfd}.sitepro-focus>span{display:block;font-size:15px;font-weight:900;color:#2a3b4c}.sitepro-focus ol{margin:7px 0 0;padding-left:22px}.sitepro-focus li{margin:4px 0;color:#263748;font-size:10px}
      .sitepro-context{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-top:11px}.sitepro-context article{padding:13px 14px;border:1px solid #dfe6eb;border-radius:11px;background:#fff}.sitepro-context span{display:block;font-size:8px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;color:#8794a1}.sitepro-context strong{display:block;margin-top:4px;font-size:20px;color:#21364b}.sitepro-context small{display:block;margin-top:3px;color:#9aa4ae;font-size:8px}.sitepro-leaders{margin-top:11px}
      .sitepro-root .fantastic-plus{color:#3d8c45}.sitepro-root .fantastic{color:#467ecb}.sitepro-root .great{color:#84a936}.sitepro-root .fair{color:#dd8d12}.sitepro-root .poor{color:#cf3238}.sitepro-root .neutral{color:#97a0aa}
      @media(max-width:1100px){.sitepro-overall{grid-template-columns:1fr}.sitepro-two-col{gap:24px}.sitepro-context{grid-template-columns:repeat(2,1fr)}}
      @media(max-width:760px){.sitepro-controls{width:100%;flex-wrap:wrap}.sitepro-controls select{flex:1}.sitepro-report-head,.sitepro-overall,.sitepro-section,.sitepro-focus{padding-left:18px;padding-right:18px}.sitepro-two-col{grid-template-columns:1fr;padding:0}.sitepro-section-title{grid-template-columns:1fr}.sitepro-rank{text-align:left}.sitepro-context{grid-template-columns:1fr}.sitepro-segments{gap:5px}.sitepro-scale{gap:5px}}
      @media print{.sitepro-page-heading,.sitepro-context,.sitepro-leaders,.sidebar,.app-topbar{display:none!important}.sitepro-report{box-shadow:none;border:0}.sitepro-root{padding:0}.sitepro-section{break-inside:avoid}}
    `}</style>
  </div>;
}



export function DriverScorecardsView({ organizationId, onOpenDriver, onImport }) {
  const load = useLoad(async () => {
    const supabase = getSupabaseBrowserClient();

    const { data: cards, error: cardsError } = await supabase
      .from("site_scorecards")
      .select("*")
      .eq("organization_id", organizationId)
      .order("year", { ascending: false })
      .order("week", { ascending: false });

    if (cardsError) throw cardsError;

    const select = "driver_id,week_label,period_start,period_end,performance,scorecard_score,tier,dcr,pod,iadc,cc,mentor_score,ementor,fico,concessions,delivered,dnr_dpmo,dsc_dpmo,ce_dpmo,cdf_dpmo,psb,lor,risk,issue,data_confidence,raw_data,drivers(id,trid,full_name,site,status)";
    const rows = [];
    const pageSize = 1000;
    let from = 0;

    while (true) {
      const { data, error } = await supabase
        .from("driver_metrics")
        .select(select)
        .eq("organization_id", organizationId)
        .order("period_end", { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) throw error;

      const page = data || [];
      rows.push(...page);

      if (page.length < pageSize) break;
      from += pageSize;
    }

    return { cards: cards || [], rows };
  }, [organizationId]);

  const rows = load.data?.rows || [];
  const cards = load.data?.cards || [];

  const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number(value)));
  const linearScore = (value, points) => {
    const v = num(value);
    if (v == null) return null;
    const sorted = [...points].sort((a, b) => a[0] - b[0]);
    if (v <= sorted[0][0]) return sorted[0][1];
    if (v >= sorted.at(-1)[0]) return sorted.at(-1)[1];

    for (let i = 0; i < sorted.length - 1; i++) {
      const [x1, y1] = sorted[i];
      const [x2, y2] = sorted[i + 1];
      if (v >= x1 && v <= x2) {
        const ratio = (v - x1) / Math.max(0.000001, x2 - x1);
        return y1 + (y2 - y1) * ratio;
      }
    }

    return null;
  };

  const calculatedDriverScore = (row) => {
    const sourceScore = num(row.scorecard_score ?? row.raw_data?.scorecard_score);
    if (sourceScore != null) return { value: clamp(sourceScore), origin: "source" };

    const mentor = num(row.mentor_score ?? row.ementor ?? row.fico);
    const values = [
      {
        key: "concessions",
        value: num(row.concessions),
        weight: 15,
        score: (v) => clamp(100 - Number(v) * 12),
      },
      {
        key: "fico",
        value: mentor,
        weight: 10,
        score: (v) => linearScore(v, [[700,0],[750,30],[780,55],[800,75],[815,90],[850,100]]),
      },
      {
        key: "dcr",
        value: num(row.dcr),
        weight: 13,
        score: (v) => linearScore(v, [[97,20],[98,40],[98.5,60],[99,80],[99.2,90],[99.5,95],[100,100]]),
      },
      {
        key: "dsc",
        value: num(row.dsc_dpmo),
        weight: 13,
        score: (v) => linearScore(v, [[0,100],[500,90],[1000,75],[2000,55],[4000,30],[6000,15],[8000,5],[10000,0]]),
      },
      {
        key: "lor",
        value: num(row.lor),
        weight: 8,
        score: (v) => linearScore(v, [[0,100],[500,50],[1500,20],[3000,0]]),
      },
      {
        key: "pod",
        value: num(row.pod),
        weight: 12,
        score: (v) => linearScore(v, [[95,20],[98,45],[99,70],[99.6,90],[99.8,95],[100,100]]),
      },
      {
        key: "cc",
        value: num(row.cc),
        weight: 10,
        score: (v) => linearScore(v, [[80,0],[90,15],[95,35],[98,65],[99,85],[99.5,95],[100,100]]),
      },
      {
        key: "ce",
        value: num(row.ce_dpmo),
        weight: 5,
        score: (v) => Number(v) === 0 ? 100 : Number(v) <= 1 ? 50 : 0,
      },
      {
        key: "cdf",
        value: num(row.cdf_dpmo),
        weight: 10,
        score: (v) => linearScore(v, [[0,100],[2000,90],[4000,70],[6000,50],[8000,35],[12000,15],[18000,5],[25000,0]]),
      },
      {
        key: "psb",
        value: num(row.psb),
        weight: 4,
        score: (v) => linearScore(v, [[0,100],[5,80],[10,65],[50,0],[100,0]]),
      },
    ];

    const available = values
      .filter((item) => item.value != null)
      .map((item) => ({ ...item, component: item.score(item.value) }))
      .filter((item) => item.component != null);

    if (available.length < 4) return { value: null, origin: "insufficient" };

    const weightTotal = available.reduce((sum, item) => sum + item.weight, 0);
    const weighted = available.reduce((sum, item) => sum + item.component * item.weight, 0) / Math.max(1, weightTotal);
    const missingPenalty = Math.max(0, values.length - available.length) * 1.25;

    return {
      value: clamp(weighted - missingPenalty),
      origin: "calculated",
      coverage: available.length,
    };
  };

  const sourceTier = (score, sourceTierValue = "") => {
    const value = num(score);
    if (value != null) {
      if (value < 50) return { label: "Poor", cls: "poor" };
      if (value < 70) return { label: "Fair", cls: "fair" };
      if (value < 85) return { label: "Great", cls: "great" };
      if (value < 93) return { label: "Fantastic", cls: "fantastic" };
      return { label: "Fantastic Plus", cls: "fantastic-plus" };
    }

    const source = String(sourceTierValue || "").trim().toLowerCase();
    if (source.includes("fantastic plus")) return { label: "Fantastic Plus", cls: "fantastic-plus" };
    if (source === "fantastic") return { label: "Fantastic", cls: "fantastic" };
    if (source === "great") return { label: "Great", cls: "great" };
    if (source === "fair") return { label: "Fair", cls: "fair" };
    if (source === "poor") return { label: "Poor", cls: "poor" };
    return { label: "Unrated", cls: "unrated" };
  };

  const yearForRow = (row) => {
    const raw = String(row.period_end || row.period_start || "");
    const match = raw.match(/^(20\d{2})/);
    return match ? Number(match[1]) : null;
  };

  const periodKeyForRow = (row) => `${yearForRow(row) || "unknown"}-${row.week_label || "Unknown"}`;

  const periodMap = useMemo(() => {
    const map = new Map();

    for (const row of rows) {
      if (!row.week_label) continue;
      const key = periodKeyForRow(row);
      const current = map.get(key) || {
        key,
        year: yearForRow(row),
        weekLabel: row.week_label,
        periodEnd: row.period_end || "",
        rows: [],
      };
      current.rows.push(row);
      if (row.period_end && (!current.periodEnd || row.period_end > current.periodEnd)) current.periodEnd = row.period_end;
      map.set(key, current);
    }

    for (const card of cards) {
      const weekLabel = card.week_label || `W${String(card.week || "").padStart(2, "0")}`;
      const key = `${card.year || "unknown"}-${weekLabel}`;
      const current = map.get(key) || {
        key,
        year: card.year || null,
        weekLabel,
        periodEnd: "",
        rows: [],
      };
      current.card = card;
      map.set(key, current);
    }

    return [...map.values()].sort((a, b) => {
      const ay = Number(a.year || 0);
      const by = Number(b.year || 0);
      if (ay !== by) return by - ay;
      return (Number(String(b.weekLabel || "").replace(/\D/g, "")) || 0) -
        (Number(String(a.weekLabel || "").replace(/\D/g, "")) || 0);
    });
  }, [rows, cards]);

  const [periodKey, setPeriodKey] = useState("");
  const [query, setQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");

  useEffect(() => {
    if (periodMap.length && !periodMap.some((period) => period.key === periodKey)) {
      setPeriodKey(periodMap[0].key);
    }
  }, [periodMap, periodKey]);

  const period = periodMap.find((item) => item.key === periodKey) || periodMap[0] || null;
  const card = period?.card || cards.find((item) =>
    item.week_label === period?.weekLabel &&
    (!period?.year || Number(item.year) === Number(period.year))
  ) || null;

  const enrichedRows = useMemo(() => {
    if (!period) return [];

    return period.rows.map((row) => {
      const score = calculatedDriverScore(row);
      const tier = sourceTier(score.value, row.tier ?? row.raw_data?.tier ?? row.raw_data?.scorecard_tier);
      return {
        ...row,
        displayScore: score.value,
        scoreOrigin: score.origin,
        scoreCoverage: score.coverage || 0,
        sourceRank: tier,
      };
    });
  }, [period]);

  const periodRows = useMemo(() => {
    const q = query.toLowerCase().trim();

    return enrichedRows
      .filter((row) => {
        const text = `${row.drivers?.full_name || ""} ${row.drivers?.trid || ""} ${row.drivers?.site || ""}`.toLowerCase();
        return !q || text.includes(q);
      })
      .filter((row) => groupFilter === "all" || row.sourceRank.cls === groupFilter)
      .sort((a, b) => {
        const as = a.displayScore ?? -1;
        const bs = b.displayScore ?? -1;
        if (as !== bs) return bs - as;
        return displayDriverName(a.drivers).localeCompare(displayDriverName(b.drivers));
      });
  }, [enrichedRows, query, groupFilter]);

  const groupOrder = [
    { label: "Fantastic Plus", cls: "fantastic-plus", min: "93+" },
    { label: "Fantastic", cls: "fantastic", min: "85–92.99" },
    { label: "Great", cls: "great", min: "70–84.99" },
    { label: "Fair", cls: "fair", min: "50–69.99" },
    { label: "Poor", cls: "poor", min: "≤49.99" },
  ];

  const groupCounts = groupOrder.reduce((acc, group) => {
    acc[group.cls] = enrichedRows.filter((row) => row.sourceRank.cls === group.cls).length;
    return acc;
  }, {});

  const totalDrivers = enrichedRows.length;
  const delivered = enrichedRows.reduce((sum, row) => sum + (num(row.delivered) || 0), 0);
  const concessions = enrichedRows.reduce((sum, row) => sum + (num(row.concessions) || 0), 0);
  const calculatedScores = enrichedRows.map((row) => num(row.displayScore)).filter((value) => value != null);
  const averageDriverScore = calculatedScores.length ? calculatedScores.reduce((a, b) => a + b, 0) / calculatedScores.length : null;
  const calculatedCount = enrichedRows.filter((row) => row.scoreOrigin === "calculated").length;
  const sourceCount = enrichedRows.filter((row) => row.scoreOrigin === "source").length;

  const overallScore = num(card?.overall_score);
  const overallStanding = card?.standing || (averageDriverScore != null ? sourceTier(averageDriverScore).label : "Not rated");

  const fmtPercentFlexible = (value) => {
    const nValue = num(value);
    return nValue == null ? "—" : `${nValue.toFixed(2)}%`;
  };

  const metricTone = (key, value) => {
    const v = num(value);
    if (v == null) return "neutral";
    if (key === "concessions") return v === 0 ? "good" : v < 3 ? "warn" : "bad";
    if (key === "fico") return v >= 815 ? "good" : v >= 800 ? "warn" : "bad";
    if (key === "dcr") return v >= 99.2 ? "good" : v >= 98 ? "warn" : "bad";
    if (key === "pod") return v >= 99.6 ? "good" : v >= 99 ? "warn" : "bad";
    if (key === "cc") return v >= 99 ? "good" : v >= 95 ? "warn" : "bad";
    if (key === "dsc_dpmo") return v === 0 ? "good" : v < 1000 ? "warn" : "bad";
    if (key === "lor") return v === 0 ? "good" : "bad";
    if (key === "ce_dpmo") return v === 0 ? "good" : "bad";
    if (key === "cdf_dpmo") return v < 4000 ? "good" : v < 8000 ? "warn" : "bad";
    if (key === "psb") return v === 0 ? "good" : "bad";
    return "neutral";
  };

  const metricCell = (key, value, formatter = plain) =>
    <span className={`scorex-metric ${metricTone(key, value)}`}>{formatter(value)}</span>;

  if (load.loading) return <LoadingPanel text="Loading weekly scorecard archive…" />;
  if (load.error) return <ErrorPanel error={load.error} />;

  if (!periodMap.length) {
    return <>
      <div className="page-heading">
        <div>
          <span className="page-kicker">SCORECARDS</span>
          <h1>Weekly scorecards</h1>
          <p>Upload an Amazon DSP scorecard and MetrixIQ will build the weekly driver table automatically.</p>
        </div>
      </div>
      <EmptyPanel
        title="No scorecard history stored yet"
        text="Import a DSP Scorecard PDF. MetrixIQ will combine its Transporter IDs and quality metrics with other evidence already stored for the same week."
        action="Import scorecard"
        onAction={onImport}
      />
    </>;
  }

  return <div className="scorex-root">
    <div className="page-heading scorex-heading">
      <div>
        <span className="page-kicker">WEEKLY SCORECARD ARCHIVE</span>
        <h1>Driver scorecards</h1>
        <p>Amazon weekly summary enriched automatically with driver identity, Mentor/FICO and concessions from the same reporting week.</p>
      </div>

      <div className="scorex-actions">
        <select value={periodKey} onChange={(event) => setPeriodKey(event.target.value)}>
          {periodMap.map((item) =>
            <option key={item.key} value={item.key}>
              {item.year || "—"} · {item.weekLabel} · {item.card?.standing || "Scorecard"}
            </option>
          )}
        </select>
        <button className="btn primary" onClick={onImport}>Import scorecard</button>
      </div>
    </div>

    <section className="scorex-hero">
      <div>
        <span>{period?.year || ""} · {period?.weekLabel || "WEEK"}</span>
        <h2>{period?.weekLabel || "WEEK"} — {String(overallStanding).toUpperCase()}</h2>
        <p>Amazon source scorecard · {totalDrivers} driver records linked by Transporter ID</p>
      </div>
      <strong>{overallScore != null ? `${overallScore.toFixed(2)}%` : averageDriverScore != null ? averageDriverScore.toFixed(2) : "—"}</strong>
    </section>

    <section className="scorex-info">
      <div>
        <b>Automatic driver enrichment</b>
        <span>The Amazon PDF contains Transporter ID + delivery-quality metrics, but not a per-driver Name, FICO, Concessions, TOTAL SCORE or Rank. MetrixIQ joins those fields from the same-week records already stored for that TRID.</span>
      </div>
      <div className="scorex-origin">
        <span><i className="source"/>Source scores {sourceCount}</span>
        <span><i className="calculated"/>Calculated scores {calculatedCount}</span>
      </div>
    </section>

    <section className="scorex-summary">
      <article><span>Drivers</span><strong>{totalDrivers}</strong><small>Linked for {period?.weekLabel}</small></article>
      <article><span>Delivered</span><strong>{Math.round(delivered).toLocaleString()}</strong><small>Amazon scorecard total</small></article>
      <article><span>Concessions</span><strong>{Math.round(concessions)}</strong><small>Same-week merged evidence</small></article>
      <article><span>Avg TOTAL SCORE</span><strong>{averageDriverScore == null ? "—" : averageDriverScore.toFixed(1)}</strong><small>Source when available, otherwise MetrixIQ-calculated</small></article>
    </section>

    <section className="scorex-archive">
      <div className="scorex-section-head">
        <div><span>HISTORY</span><h2>Weekly scorecard evidence</h2></div>
        <small>{periodMap.length} stored period{periodMap.length === 1 ? "" : "s"}</small>
      </div>
      <div className="scorex-archive-grid">
        {periodMap.slice(0, 12).map((item) => {
          const itemRows = item.rows.map((row) => {
            const score = calculatedDriverScore(row);
            return score.value;
          }).filter((value) => value != null);
          const avg = itemRows.length ? itemRows.reduce((a, b) => a + b, 0) / itemRows.length : null;
          const standing = item.card?.standing || (avg != null ? sourceTier(avg).label : "Stored");
          const cls = sourceTier(avg, standing).cls;

          return <button
            type="button"
            key={item.key}
            className={`${item.key === periodKey ? "active" : ""} ${cls}`}
            onClick={() => setPeriodKey(item.key)}
          >
            <span>{item.year || "—"}</span>
            <b>{item.weekLabel}</b>
            <em>{standing}</em>
            <strong>{num(item.card?.overall_score) != null ? `${Number(item.card.overall_score).toFixed(2)}%` : avg != null ? avg.toFixed(1) : "—"}</strong>
            <small>{item.rows.length} drivers</small>
          </button>;
        })}
      </div>
    </section>

    <section className="scorex-rank-strip">
      {groupOrder.map((group) =>
        <button
          type="button"
          key={group.cls}
          className={`${group.cls} ${groupFilter === group.cls ? "active" : ""}`}
          onClick={() => setGroupFilter((current) => current === group.cls ? "all" : group.cls)}
        >
          <span>{group.label}</span>
          <strong>{groupCounts[group.cls] || 0}</strong>
          <small>{group.min}</small>
        </button>
      )}
    </section>

    <section className="panel scorex-table-panel">
      <div className="scorex-table-tools">
        <div>
          <span>SCORECARD REGISTER</span>
          <h2>{period?.weekLabel} driver ranking</h2>
        </div>
        <div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name or Transporter ID…"
          />
          {groupFilter !== "all" &&
            <button type="button" className="scorex-clear" onClick={() => setGroupFilter("all")}>
              Clear rank filter
            </button>
          }
        </div>
      </div>

      <div className="table-wrap scorex-table-wrap">
        <table className="data-table scorex-table">
          <thead>
            <tr>
              <th>Transporter ID</th>
              <th>RANK</th>
              <th>Name</th>
              <th>Concessions</th>
              <th>TOTAL SCORE</th>
              <th>FICO</th>
              <th>Delivered</th>
              <th>DCR</th>
              <th>DSC DPMO</th>
              <th>LoR DPMO</th>
              <th>POD</th>
              <th>CC</th>
              <th>CE</th>
              <th>CDF DPMO</th>
              <th>PSB</th>
              <th />
            </tr>
          </thead>

          <tbody>
            {groupOrder.map((group) => {
              const groupRows = periodRows.filter((row) => row.sourceRank.cls === group.cls);
              if (!groupRows.length) return null;

              return [
                <tr key={`${group.cls}-header`} className={`scorex-group-row ${group.cls}`}>
                  <td colSpan="16">
                    <div>
                      <b>{group.label}</b>
                      <span>{group.min} TOTAL SCORE</span>
                      <strong>{groupRows.length} driver{groupRows.length === 1 ? "" : "s"}</strong>
                    </div>
                  </td>
                </tr>,
                ...groupRows.map((row) => {
                  const driver = row.drivers || {};
                  const mentor = num(row.mentor_score ?? row.ementor ?? row.fico);
                  return <tr key={`${row.driver_id}-${period?.key}`} className={`scorex-driver-row ${row.sourceRank.cls}`}>
                    <td><b className="scorex-trid">{driver.trid || "—"}</b></td>
                    <td><span className={`scorex-rank ${row.sourceRank.cls}`}>{row.sourceRank.label}</span></td>
                    <td><b>{displayDriverName(driver)}</b></td>
                    <td>{metricCell("concessions", row.concessions)}</td>
                    <td>
                      <span className={`scorex-total ${row.sourceRank.cls}`}>{row.displayScore == null ? "—" : row.displayScore.toFixed(0)}</span>
                      {row.scoreOrigin === "calculated" && <small className="scorex-calculated">CALC</small>}
                    </td>
                    <td>{metricCell("fico", mentor)}</td>
                    <td><span className="scorex-delivered">{plain(row.delivered)}</span></td>
                    <td>{metricCell("dcr", row.dcr, fmtPercentFlexible)}</td>
                    <td>{metricCell("dsc_dpmo", row.dsc_dpmo)}</td>
                    <td>{metricCell("lor", row.lor)}</td>
                    <td>{metricCell("pod", row.pod, fmtPercentFlexible)}</td>
                    <td>{metricCell("cc", row.cc, fmtPercentFlexible)}</td>
                    <td>{metricCell("ce_dpmo", row.ce_dpmo)}</td>
                    <td>{metricCell("cdf_dpmo", row.cdf_dpmo)}</td>
                    <td>{metricCell("psb", row.psb)}</td>
                    <td><button className="profile-link" onClick={() => onOpenDriver?.(driverShape(row))}>Open →</button></td>
                  </tr>;
                })
              ];
            })}

            {!periodRows.length &&
              <tr>
                <td colSpan="16"><div className="ops-mini-empty">No drivers match this selection.</div></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>

    <style jsx global>{`
      .scorex-root{width:100%;padding-bottom:30px}
      .scorex-heading{align-items:flex-start}.scorex-actions{display:flex;gap:8px;align-items:center}.scorex-actions select{height:38px;min-width:210px;border:1px solid #dbe3e9;border-radius:9px;background:#fff;padding:0 10px;color:#273b50;font-size:10px;font-weight:800}
      .scorex-hero{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:20px 24px;margin-bottom:10px;border-radius:15px;background:linear-gradient(120deg,#111c2b 0%,#172c3f 60%,#194f48 100%);color:#fff;box-shadow:0 8px 26px rgba(20,38,55,.12)}.scorex-hero span{font-size:9px;font-weight:900;letter-spacing:.13em;color:#92d6c5}.scorex-hero h2{margin:4px 0;font-size:22px}.scorex-hero p{margin:0;color:#aebcca;font-size:10px}.scorex-hero>strong{font-size:33px;letter-spacing:-.03em;color:#8ef061}
      .scorex-info{display:flex;justify-content:space-between;gap:20px;align-items:center;margin-bottom:10px;padding:11px 14px;border:1px solid #d9e5e2;border-radius:11px;background:#f5faf8}.scorex-info b{display:block;color:#24483f;font-size:9px}.scorex-info div>span{display:block;margin-top:2px;color:#6e807d;font-size:8px;line-height:1.45}.scorex-origin{display:flex!important;gap:12px;white-space:nowrap}.scorex-origin>span{display:flex!important;align-items:center;gap:5px;margin:0!important;font-weight:800}.scorex-origin i{width:7px;height:7px;border-radius:50%}.scorex-origin i.source{background:#4f9d8d}.scorex-origin i.calculated{background:#d5a03a}
      .scorex-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-bottom:13px}.scorex-summary article{padding:13px 15px;border:1px solid #dfe6eb;border-radius:11px;background:#fff}.scorex-summary span{display:block;font-size:8px;font-weight:900;letter-spacing:.08em;color:#8794a1}.scorex-summary strong{display:block;margin-top:5px;font-size:20px;color:#203449}.scorex-summary small{display:block;margin-top:4px;color:#9aa4ae;font-size:8px}
      .scorex-archive{margin-bottom:13px}.scorex-section-head{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:7px}.scorex-section-head span{font-size:8px;font-weight:900;letter-spacing:.11em;color:#4d9485}.scorex-section-head h2{margin:3px 0 0;font-size:15px;color:#203449}.scorex-section-head small{color:#8a97a4;font-size:8px}
      .scorex-archive-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:7px}.scorex-archive-grid button{display:grid;grid-template-columns:auto 1fr;gap:2px 7px;padding:9px 10px;border:1px solid #dfe6eb;border-radius:10px;background:#fff;text-align:left;cursor:pointer}.scorex-archive-grid button.active{border-color:#4e9688;box-shadow:0 0 0 2px rgba(78,150,136,.12)}.scorex-archive-grid button>span{font-size:7px;color:#98a4af}.scorex-archive-grid button>b{grid-column:1;font-size:12px;color:#21364b}.scorex-archive-grid button>em{grid-column:2;grid-row:1/3;align-self:center;justify-self:end;font-size:7px;font-style:normal;font-weight:900;text-transform:uppercase}.scorex-archive-grid button>strong{font-size:12px;color:#243a4e}.scorex-archive-grid button>small{justify-self:end;color:#97a2ad;font-size:7px}.scorex-archive-grid button.fantastic-plus>em{color:#2b7d56}.scorex-archive-grid button.fantastic>em{color:#4f8147}.scorex-archive-grid button.great>em{color:#9a6917}.scorex-archive-grid button.fair>em{color:#9c5d36}.scorex-archive-grid button.poor>em{color:#ac3940}
      .scorex-rank-strip{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:12px}.scorex-rank-strip button{display:grid;grid-template-columns:1fr auto;align-items:center;gap:3px 8px;padding:10px 12px;border:1px solid #dfe6eb;border-radius:10px;background:#fff;text-align:left;cursor:pointer;transition:.15s}.scorex-rank-strip button.active{transform:translateY(-1px);box-shadow:0 5px 14px rgba(20,40,60,.08)}.scorex-rank-strip span{font-size:9px;font-weight:900}.scorex-rank-strip strong{font-size:17px}.scorex-rank-strip small{grid-column:1/3;font-size:7px;color:#8b97a3}.scorex-rank-strip .fantastic-plus{border-left:4px solid #6bbf3d;color:#2d6f28}.scorex-rank-strip .fantastic{border-left:4px solid #68a45a;color:#47763f}.scorex-rank-strip .great{border-left:4px solid #e6a126;color:#8e5e0a}.scorex-rank-strip .fair{border-left:4px solid #d69b9b;color:#915151}.scorex-rank-strip .poor{border-left:4px solid #e32620;color:#a5292c}
      .scorex-table-panel{padding:0;overflow:hidden}.scorex-table-tools{display:flex;align-items:center;justify-content:space-between;gap:15px;padding:14px 16px;border-bottom:1px solid #e6ecef}.scorex-table-tools>div:first-child span{font-size:8px;font-weight:900;letter-spacing:.1em;color:#4b9384}.scorex-table-tools h2{margin:3px 0 0;font-size:16px;color:#203449}.scorex-table-tools>div:last-child{display:flex;gap:7px}.scorex-table-tools input{height:34px;min-width:220px;border:1px solid #dce4e9;border-radius:8px;padding:0 10px;font-size:9px}.scorex-clear{border:1px solid #dce4e9;border-radius:8px;background:#f7f9fa;padding:0 10px;color:#617184;font-size:8px;font-weight:800}
      .scorex-table-wrap{max-height:68vh}.scorex-table{min-width:1500px}.scorex-table thead th{position:sticky;top:0;z-index:4;background:#d8d8d8;color:#111;border-right:1px solid #a9a9a9;font-size:8px;font-weight:900;white-space:nowrap}.scorex-table td{border-right:1px solid #edf0f2;white-space:nowrap;font-size:8px}.scorex-group-row td{padding:7px 11px!important;border-top:2px solid #283746;border-bottom:1px solid #b7c0c7}.scorex-group-row td>div{display:flex;align-items:center;gap:12px}.scorex-group-row b{font-size:10px;text-transform:uppercase}.scorex-group-row span{font-size:7px;opacity:.75}.scorex-group-row strong{margin-left:auto;font-size:8px}.scorex-group-row.fantastic-plus td{background:#87ef3d;color:#183d10}.scorex-group-row.fantastic td{background:#67a85b;color:#fff}.scorex-group-row.great td{background:#eca329;color:#3c2a07}.scorex-group-row.fair td{background:#d7a0a0;color:#572f2f}.scorex-group-row.poor td{background:#e62922;color:#fff}
      .scorex-trid{font-size:7px;color:#566777}.scorex-rank{display:inline-flex;min-width:72px;justify-content:center;padding:4px 6px;border-radius:5px;font-size:7px;font-weight:900}.scorex-rank.fantastic-plus{background:#87ef3d;color:#183d10}.scorex-rank.fantastic{background:#68a75b;color:#fff}.scorex-rank.great{background:#eca329;color:#3c2a07}.scorex-rank.fair{background:#ddb0b0;color:#633838}.scorex-rank.poor{background:#e62922;color:#fff}
      .scorex-total{display:inline-flex;min-width:38px;justify-content:center;padding:4px 5px;border-radius:5px;font-weight:900}.scorex-total.fantastic-plus{background:#8bd036;color:#1f4815}.scorex-total.fantastic{background:#a9be2a;color:#344408}.scorex-total.great{background:#dd8a21;color:#4d2c05}.scorex-total.fair{background:#e2621b;color:#fff}.scorex-total.poor{background:#d7221b;color:#fff}.scorex-calculated{display:inline-block;margin-left:4px;padding:2px 4px;border-radius:4px;background:#fff1cf;color:#8f691a;font-size:6px;font-weight:900;vertical-align:middle}
      .scorex-metric{display:inline-flex;min-width:45px;justify-content:center;padding:4px 5px;border-radius:5px;font-size:7px;font-weight:850}.scorex-metric.good{background:#88ef3f;color:#183b12}.scorex-metric.warn{background:#f2c644;color:#62460b}.scorex-metric.bad{background:#df291d;color:#fff}.scorex-metric.neutral{background:#eef2f4;color:#657483}.scorex-delivered{display:inline-flex;min-width:45px;justify-content:center;padding:4px 5px;border-radius:5px;background:#e8efea;color:#4a5d50;font-weight:800}
      @media(max-width:1250px){.scorex-archive-grid{grid-template-columns:repeat(4,1fr)}.scorex-summary{grid-template-columns:repeat(2,1fr)}}
      @media(max-width:800px){.scorex-actions{width:100%;flex-wrap:wrap}.scorex-actions select{flex:1}.scorex-hero{align-items:flex-start}.scorex-archive-grid{grid-template-columns:repeat(2,1fr)}.scorex-rank-strip{grid-template-columns:repeat(2,1fr)}.scorex-table-tools{align-items:flex-start;flex-direction:column}.scorex-table-tools>div:last-child{width:100%}.scorex-table-tools input{flex:1;min-width:0}.scorex-info{align-items:flex-start;flex-direction:column}.scorex-origin{flex-wrap:wrap}}
    `}</style>
  </div>;
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

  async function autoSync(){
    setBusy("autosync"); setNotice("");
    try{
      const {data,error}=await getSupabaseBrowserClient().rpc("sync_driver_directory",{p_organization_id:organizationId});
      if(error)throw error;
      const row=Array.isArray(data)?data[0]:null;
      setNotice(`Identity sync complete${row?`: ${row.updated_names||0} names and ${row.updated_sites||0} sites updated`:""}.`);
      setRefreshKey((v)=>v+1);
    }catch(error){setNotice(`Could not sync identities: ${error?.message||"Unknown error"}`);}finally{setBusy("");}
  }

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
    <div className="page-heading"><div><span className="page-kicker">DATA QUALITY</span><h1>Identity resolution</h1><p>Keep TRIDs, driver names and name-only Mentor records mapped to one trusted profile.</p></div><div className="page-actions"><button className="btn ghost" disabled={busy==="autosync"} onClick={autoSync}>{busy==="autosync"?"Syncing…":"Auto-match aliases"}</button><button className="btn primary" onClick={onImport}>Import master roster</button></div></div>
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
