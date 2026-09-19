"use client";

import { useEffect, useMemo, useState } from "react";
import DriverScorecardsV22 from "./DriverScorecardsV22";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { fetchDriverScorecardData, fetchSiteScorecardData } from "../../lib/data/scorecardData";
import { displayDriverName, isUsablePersonName, nameSignature, normalizeName } from "../../lib/identity";
import { TARGETS, targetLabel } from "../../lib/config/performance";
import {
  driverShape,
  num,
  pct,
  plain,
  weekSort,
} from "../../lib/scorecards/metrics";
import {
  EmptyPanel,
  ErrorPanel,
  LeaderList,
  LoadingPanel,
  ScorecardMetricRow,
  useLoad,
} from "./ScorecardPrimitives";

export function SiteScorecardsView({ organizationId, onOpenDriver, onImport, siteFilter = "all" }) {
  const load = useLoad(async () => {
    const supabase = getSupabaseBrowserClient();
    return fetchSiteScorecardData(supabase, organizationId);
  }, [organizationId]);

  const cards = useMemo(() => {
    const allCards = load.data?.cards || [];
    if (siteFilter === "all") return allCards;
    return allCards.filter((item) => String(item.site || "").trim().toUpperCase() === siteFilter);
  }, [load.data, siteFilter]);
  const [selectedId, setSelectedId] = useState("");

  useEffect(() => {
    if (cards.length && !cards.some((item) => item.id === selectedId)) {
      setSelectedId(cards[0].id);
    }
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
        <select aria-label="Select scorecard driver" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
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

    
  </div>;
}





function LegacyDriverScorecardsView({ organizationId, onOpenDriver, onImport, siteFilter = "all" }) {
  const load = useLoad(async () => {
    const supabase = getSupabaseBrowserClient();
    return fetchDriverScorecardData(supabase, organizationId);
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

  const siteForRow = (row) => {
    const value = String(row?.drivers?.site || "").trim().toUpperCase();
    return value || "UNASSIGNED";
  };

  const periodKeyForRow = (row) =>
    `${yearForRow(row) || "unknown"}-${row.week_label || "Unknown"}-${siteForRow(row)}`;

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
      const cardSite = String(card.site || "").trim().toUpperCase() || "UNASSIGNED";
      if (siteFilter !== "all" && cardSite !== siteFilter) continue;
      const key = `${card.year || "unknown"}-${weekLabel}-${cardSite}`;
      const current = map.get(key) || {
        key,
        year: card.year || null,
        weekLabel,
        site: cardSite,
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
      const weekDelta = (Number(String(b.weekLabel || "").replace(/\D/g, "")) || 0) -
        (Number(String(a.weekLabel || "").replace(/\D/g, "")) || 0);
      if (weekDelta !== 0) return weekDelta;
      return String(a.site || "").localeCompare(String(b.site || ""));
    });
  }, [rows, cards, siteFilter]);

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
    (!period?.year || Number(item.year) === Number(period.year)) &&
    (String(item.site || "").trim().toUpperCase() || "UNASSIGNED") === period?.site
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
    if (key === "fico") return v >= TARGETS.mentor ? "good" : v >= 800 ? "warn" : "bad";
    if (key === "dcr") return v >= TARGETS.dcr ? "good" : v >= 98 ? "warn" : "bad";
    if (key === "pod") return v >= TARGETS.pod ? "good" : v >= 99 ? "warn" : "bad";
    if (key === "cc") return v >= TARGETS.cc ? "good" : v >= Math.max(0, TARGETS.cc - 3) ? "warn" : "bad";
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
        <select aria-label="Select scorecard period" value={periodKey} onChange={(event) => setPeriodKey(event.target.value)}>
          {periodMap.map((item) =>
            <option key={item.key} value={item.key}>
              {item.year || "—"} · {item.weekLabel} · {item.site || "UNASSIGNED"} · {item.card?.standing || "Scorecard"}
            </option>
          )}
        </select>
        <button className="btn primary" onClick={onImport}>Import scorecard</button>
      </div>
    </div>

    <section className="scorex-hero">
      <div>
        <span>{period?.year || ""} · {period?.weekLabel || "WEEK"} · {period?.site || "UNASSIGNED"}</span>
        <h2>{period?.weekLabel || "WEEK"} — {String(overallStanding).toUpperCase()}</h2>
        <p>{card ? "Amazon source scorecard" : "MetrixIQ consolidated evidence"} · {totalDrivers} driver records linked by Transporter ID</p>
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
            <em>{item.site || "UNASSIGNED"} · {standing}</em>
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
            aria-label="Search scorecards"
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

    
  </div>;
}





export function DriverScorecardsView(props) {
  return <DriverScorecardsV22 {...props} />;
}
