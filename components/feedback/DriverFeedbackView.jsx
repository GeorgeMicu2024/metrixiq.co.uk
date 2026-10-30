"use client";

import { useMemo, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { fetchDriverScorecardData } from "../../lib/data/scorecardData";
import { applyMetricOverrides, fetchMetricOverrides } from "../../lib/data/governanceV2";
import {
  buildDriverScorecardConcessionMap,
  fetchDriverScorecardConcessionSnapshots,
} from "../../lib/data/concessions";
import { compareDriverScorecardRank } from "../../lib/scorecards/driverRanking";
import { calculateDriverScorecard } from "../../lib/scorecards/driverScoreFormula";
import {
  buildDriverFeedback,
  collectFeedbackPeriods,
  driverFeedbackIssues,
  scorecardActivitySite,
  scorecardTier,
  classifyDriverFeedback,
} from "../../lib/scorecards/driverFeedback";
import { LoadingPanel, ErrorPanel, EmptyPanel, useLoad } from "../scorecards/ScorecardPrimitives";

const driverId = (row) => String(row?.driver_id || row?.drivers?.id || row?.drivers?.trid || "").trim();
const driverName = (row) => String(row?.drivers?.full_name || row?.drivers?.trid || "Unknown driver").trim();
const shownScore = (value) => value == null ? "—" : Number(value).toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
const shortMetric = (key) => ({ concessions: "CON", dsc_dpmo: "DSC", cdf_dpmo: "CDF", ce_dpmo: "CE", cc: "CC", lor: "LoR", psb: "PSB" }[key] || String(key || "").toUpperCase());

async function copyToClipboard(value) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Some in-app browsers block the clipboard API.
    }
  }
  const field = document.createElement("textarea");
  field.value = value;
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.focus();
  field.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(field);
  if (!copied) throw new Error("Copy is blocked by this browser. Select the text and copy it manually.");
}

export default function DriverFeedbackView({
  organizationId,
  siteFilter = "all",
  allowedSites = [],
  refreshKey = 0,
}) {
  const [refreshTick, setRefreshTick] = useState(0);
  const [periodKey, setPeriodKey] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [detail, setDetail] = useState("short");
  const [tone, setTone] = useState("professional");
  const [editedFor, setEditedFor] = useState("");
  const [editedMessage, setEditedMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [mobilePane, setMobilePane] = useState("list");
  const messageRef = useRef(null);

  const load = useLoad(async () => {
    const supabase = getSupabaseBrowserClient();
    const [data, overrides, concessionSnapshots] = await Promise.all([
      fetchDriverScorecardData(supabase, organizationId),
      fetchMetricOverrides(supabase, organizationId, "active"),
      fetchDriverScorecardConcessionSnapshots(supabase, organizationId),
    ]);
    const rows = applyMetricOverrides(data.rows || [], overrides);
    const concessionMap = buildDriverScorecardConcessionMap(concessionSnapshots || []);
    const concessionOverrides = new Map();
    for (const override of overrides || []) {
      if (override.status === "active" && override.metric_key === "concessions") {
        concessionOverrides.set(String(override.driver_id) + "::" + override.week_label, Number(override.override_value));
      }
    }
    return rows.map((row) => {
      const site = scorecardActivitySite(row);
      const id = driverId(row) + "::" + row.week_label;
      const snapshotKey = site + "::" + row.week_label + "::" + String(row.drivers?.trid || "").trim().toUpperCase();
      const snapshot = concessionMap.get(snapshotKey);
      const concessions = concessionOverrides.has(id)
        ? concessionOverrides.get(id)
        : snapshot ? snapshot.dnr : row.concessions;
      return { ...row, concessions };
    });
  }, [organizationId, refreshKey, refreshTick]);

  const allowedKey = (allowedSites || []).join("|");
  const periods = useMemo(
    () => collectFeedbackPeriods(load.data || [], siteFilter, allowedKey ? allowedKey.split("|") : []),
    [load.data, siteFilter, allowedKey]
  );
  const period = periods.find((item) => item.key === periodKey) || periods[0] || null;

  const drivers = useMemo(() => {
    if (!period) return [];
    return period.rows.map((row) => {
      const scored = calculateDriverScorecard(row);
      return {
        ...row,
        displayScore: scored.value,
        issueCount: driverFeedbackIssues(row).length,
        topIssues: driverFeedbackIssues(row).slice(0, 2),
        urgency: classifyDriverFeedback(row),
        scoreCoverage: scored.coverage || 0,
        tier: scorecardTier(scored.value),
      };
    }).sort(compareDriverScorecardRank).map((row, index) => ({ ...row, rank: index + 1 }));
  }, [period]);

  const filtered = useMemo(() => {
    const phrase = search.trim().toLowerCase();
    return drivers.filter((row) => {
      if (filter !== "all" && row.urgency !== filter) return false;
      if (!phrase) return true;
      return [driverName(row), row.drivers?.trid, row.rank].some((value) =>
        String(value || "").toLowerCase().includes(phrase)
      );
    });
  }, [drivers, filter, search]);

  const selectedRow = filtered.find((row) => driverId(row) === selectedId) || filtered[0] || null;
  const selectedKey = selectedRow ? period?.key + "::" + driverId(selectedRow) + "::" + tone + "::" + detail : "";
  const generated = selectedRow
    ? buildDriverFeedback(selectedRow, { site: period.site, weekLabel: period.weekLabel, tone, detail })
    : null;
  const draft = editedFor === selectedKey ? editedMessage : generated?.message || "";
  const priorityCount = drivers.filter((row) => row.urgency === "priority").length;
  const improveCount = drivers.filter((row) => row.urgency === "improve").length;
  const onTrackCount = drivers.filter((row) => row.urgency === "on-track").length;
  const needData = drivers.filter((row) => row.urgency === "unknown").length;
  const statusCards = [
    { key: "priority", label: "Priority", count: priorityCount },
    { key: "improve", label: "Improve", count: improveCount },
    { key: "on-track", label: "On track", count: onTrackCount },
  ];

  async function copyMessage(message, name) {
    try {
      await copyToClipboard(message);
      setNotice("Copied message for " + name + ".");
    } catch (error) {
      setNotice(error?.message || "Could not copy this message.");
    }
  }

  function messageFor(row) {
    return buildDriverFeedback(row, { site: period.site, weekLabel: period.weekLabel, tone, detail }).message;
  }

  async function shareSelected() {
    if (!selectedRow) return;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Driver scorecard feedback", text: draft });
        setNotice("Message sent to the share sheet. You choose the recipient.");
        return;
      } catch (error) {
        if (error?.name === "AbortError") return;
      }
    }
    await copyMessage(draft, driverName(selectedRow));
  }

  function downloadMessages() {
    if (!filtered.length || !period) return;
    const contents = filtered.map((row) =>
      "===== " + driverName(row) + " =====\n" + messageFor(row)
    ).join("\n\n----------------------------------------\n\n");
    const file = new Blob([contents], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = "MetrixIQ-Driver-Feedback-" + period.site + "-" + period.weekLabel + ".txt";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("Downloaded " + filtered.length + " individual messages.");
  }

  if (load.loading) return <LoadingPanel text="Preparing scorecard feedback…" />;
  if (load.error) return <ErrorPanel error={load.error} />;

  return (
    <main className={"feedback-page" + (mobilePane === "message" ? " in-message" : "")}>
      <header className="feedback-command-header">
        <div className="feedback-command-top">
          <div className="feedback-wordmark"><span className="feedback-iq-mark">iQ</span><b>METRIX<span>IQ</span></b></div>
          <span className="feedback-command-path">OPERATIONS / DRIVER COACHING</span>
          <button type="button" className="feedback-refresh-icon" title="Refresh scorecards" aria-label="Refresh scorecards"
            onClick={() => { setRefreshTick((value) => value + 1); setNotice(""); }}>
            ↻
          </button>
        </div>
        <div className="feedback-title-row">
          <div>
            <h1>Driver Feedback</h1>
            {period && <div className="feedback-period-select">
              <span className="feedback-period-pulse" />
              <label>
                <span className="sr-only">Scorecard week and site</span>
                <select value={period.key} aria-label="Scorecard week and site"
                  onChange={(event) => { setPeriodKey(event.target.value); setSelectedId(""); setNotice(""); setMobilePane("list"); }}>
                  {periods.map((item) => <option key={item.key} value={item.key}>
                    {item.site} / WEEK {String(item.weekLabel).replace(/^W/i, "")} / {item.year || "—"}
                  </option>)}
                </select>
              </label>
            </div>}
          </div>
          <div className="feedback-driver-total"><span>◉</span><b>{drivers.length}</b> drivers</div>
        </div>
        <div className="feedback-command-progress" aria-hidden="true"><i /></div>
      </header>

      {!periods.length ? (
        <EmptyPanel title="No weekly driver scorecards found" text="Import a DSP scorecard for an accessible site first. Feedback is never generated from unrelated daily or POD uploads." />
      ) : (
        <>
          <section className="feedback-mission-strip" aria-label="Feedback priorities">
            {statusCards.map((item) => {
              const percent = drivers.length ? (item.count / drivers.length) * 100 : 0;
              return (
                <button type="button" key={item.key} onClick={() => { setFilter(item.key); setSelectedId(""); setMobilePane("list"); }}
                  className={"feedback-mission-item " + item.key + (filter === item.key ? " selected" : "")}
                  aria-label={item.count + " drivers: " + item.label}>
                  <span className="feedback-mission-ring" style={{ "--ring-pct": percent + "%" }}><b>{item.count}</b></span>
                  <span className="feedback-mission-label"><strong>{item.label}</strong><small>{percent.toFixed(1)}%</small><i /></span>
                </button>
              );
            })}
            {needData > 0 && <span className="feedback-data-note">{needData} missing scores</span>}
          </section>

          <section className="feedback-filter-panel" aria-label="Search and filter drivers">
            <label className="feedback-search">
              <span aria-hidden="true">⌕</span>
              <input type="search" placeholder="Search driver, TRID or rank…" aria-label="Search driver"
                value={search} onChange={(event) => { setSearch(event.target.value); setSelectedId(""); }} />
            </label>
            <div className="feedback-filter-tabs" role="group" aria-label="Urgency filter">
              {[["all", "All"], ["priority", "Priority"], ["improve", "Improve"], ["on-track", "On track"]].map(([key, label]) =>
                <button type="button" key={key} onClick={() => { setFilter(key); setSelectedId(""); setMobilePane("list"); }}
                  className={filter === key ? "active " + key : key} aria-pressed={filter === key}>
                  {key !== "all" && <i aria-hidden="true" />}{label}
                </button>
              )}
            </div>
          </section>

          <div className="feedback-workspace">
            <section className="feedback-list-card" aria-label="Drivers">
              <div className="feedback-panel-heading">
                <div><span className="feedback-panel-symbol">⌗</span><strong>DRIVER RANKING</strong><small>{filtered.length} shown</small></div>
                <button type="button" onClick={downloadMessages} disabled={!filtered.length}>↓ Export messages</button>
              </div>
              <div className="feedback-list">
                {filtered.length ? filtered.map((row) => {
                  const active = selectedRow && driverId(row) === driverId(selectedRow);
                  return (
                    <div className={"feedback-driver " + row.urgency + (active ? " selected" : "")} key={driverId(row)}>
                      <button type="button" className="feedback-driver-select" aria-label={"Open feedback for " + driverName(row)}
                        onClick={() => {
                          setSelectedId(driverId(row));
                          setNotice("");
                          setMobilePane("message");
                          if (typeof window !== "undefined" && window.innerWidth <= 900) window.scrollTo({ top: 0, behavior: "smooth" });
                        }}>
                        <span className="feedback-driver-rank">#{String(row.rank).padStart(2, "0")}</span>
                        <span className="feedback-driver-info">
                          <strong>{driverName(row)}</strong>
                          <small>{row.drivers?.trid || "No TRID"} · {period.site}</small>
                          <span className="feedback-metric-tags">
                            {row.topIssues.length ? row.topIssues.map((issue) =>
                              <em key={issue.key}>{shortMetric(issue.key)} <b>{issue.value}</b></em>
                            ) : <em>{row.urgency === "unknown" ? "Score unavailable" : "All scorecard metrics on track"}</em>}
                          </span>
                        </span>
                        <span className={"feedback-score-block " + row.tier.cls}>
                          <small>{row.tier.label}</small><b>{shownScore(row.displayScore)}</b>
                        </span>
                        <span className={"feedback-driver-issues " + row.urgency}>
                          {row.urgency === "on-track" ? "✓" : row.urgency === "unknown" ? "—" : row.issueCount}
                          <small>{row.urgency === "priority" ? "priority" : row.urgency === "improve" ? "to review" : row.urgency === "unknown" ? "no data" : "on track"}</small>
                        </span>
                      </button>
                      <button type="button" className="feedback-quick-copy" title={"Copy feedback for " + driverName(row)}
                        aria-label={"Copy feedback for " + driverName(row)} onClick={() => copyMessage(messageFor(row), driverName(row))}>⧉</button>
                    </div>
                  );
                }) : <p className="feedback-no-results">No drivers match this search or filter.</p>}
              </div>
              {notice && mobilePane === "list" && <p className="feedback-list-notice" role="status">{notice}</p>}
            </section>

            <section className="feedback-message-card" aria-label="Individual coaching message">
              {selectedRow ? (
                <>
                  <div className="feedback-panel-heading coaching">
                    <div><span className="feedback-panel-symbol">▤</span><strong>COACHING MESSAGE</strong></div>
                    <button type="button" className="feedback-back" onClick={() => setMobilePane("list")}>← Back to drivers</button>
                    <span className="feedback-message-index">DRIVER #{String(selectedRow.rank).padStart(2, "0")}</span>
                  </div>
                  <div className="feedback-message-content">
                    <div className="feedback-message-driver">
                      <div>
                        <strong>{driverName(selectedRow)}</strong>
                        <small>{selectedRow.drivers?.trid || "No TRID"} · {period.site} · {period.weekLabel}</small>
                      </div>
                      <span className={"feedback-message-result " + selectedRow.tier.cls}><b>{shownScore(selectedRow.displayScore)}</b> / {selectedRow.tier.label}</span>
                    </div>
                    <div className="feedback-message-options">
                      <div className="feedback-segment" role="group" aria-label="Message tone">
                        <button type="button" className={tone === "professional" ? "selected" : ""} aria-pressed={tone === "professional"} onClick={() => setTone("professional")}>Professional</button>
                        <button type="button" className={tone === "firm" ? "selected" : ""} aria-pressed={tone === "firm"} onClick={() => setTone("firm")}>Firm</button>
                      </div>
                      <div className="feedback-segment" role="group" aria-label="Message detail">
                        <button type="button" className={detail === "short" ? "selected" : ""} aria-pressed={detail === "short"} onClick={() => setDetail("short")}>Concise</button>
                        <button type="button" className={detail === "detailed" ? "selected" : ""} aria-pressed={detail === "detailed"} onClick={() => setDetail("detailed")}>Detailed</button>
                      </div>
                    </div>
                    <label className="feedback-message-editor">
                      <span className="sr-only">Edit individual feedback message</span>
                      <textarea ref={messageRef} aria-label="Edit individual feedback message" value={draft}
                        onChange={(event) => { setEditedFor(selectedKey); setEditedMessage(event.target.value); }}
                        rows={12} spellCheck />
                    </label>
                    <div className="feedback-actions">
                      <button type="button" className="feedback-copy-main" onClick={() => copyMessage(draft, driverName(selectedRow))}>⧉ <span>Copy message</span></button>
                      <button type="button" className="feedback-share-main" onClick={shareSelected}>↗ <span>Share WhatsApp</span></button>
                      <button type="button" className="feedback-edit" onClick={() => messageRef.current?.focus()}>✎ <span>Edit</span></button>
                      <button type="button" className="feedback-reset" onClick={() => { setEditedFor(""); setEditedMessage(""); }}>Reset</button>
                    </div>
                    <p className="feedback-message-hint">Based on recorded scorecard metrics. Coaching advice does not establish fault for a specific event.</p>
                    {notice && <p className="feedback-notice" role="status">{notice}</p>}
                  </div>
                </>
              ) : <p className="feedback-no-results">Choose a driver to prepare a message.</p>}
            </section>
          </div>
        </>
      )}
    </main>
  );
}
