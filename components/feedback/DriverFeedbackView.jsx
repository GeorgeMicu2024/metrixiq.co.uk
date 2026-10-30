"use client";

import { useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { fetchDriverFeedbackScorecardRows } from "../../lib/data/scorecardData";
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
} from "../../lib/scorecards/driverFeedback";
import { LoadingPanel, ErrorPanel, EmptyPanel, useLoad } from "../scorecards/ScorecardPrimitives";

const driverId = (row) => String(row?.driver_id || row?.drivers?.id || row?.drivers?.trid || "").trim();
const driverName = (row) => String(row?.drivers?.full_name || row?.drivers?.trid || "Unknown driver").trim();
const shownScore = (value) => value == null ? "—" : Number(value).toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");

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

  const load = useLoad(async () => {
    const supabase = getSupabaseBrowserClient();
    const [data, overrides, concessionSnapshots] = await Promise.all([
      fetchDriverFeedbackScorecardRows(supabase, organizationId),
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
        scoreCoverage: scored.coverage || 0,
        tier: scorecardTier(scored.value),
      };
    }).sort(compareDriverScorecardRank).map((row, index) => ({ ...row, rank: index + 1 }));
  }, [period]);

  const filtered = useMemo(() => {
    const phrase = search.trim().toLowerCase();
    return drivers.filter((row) => {
      if (filter === "attention" && !row.issueCount) return false;
      if (filter === "on-track" && (row.issueCount || row.displayScore == null)) return false;
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
  const attentionCount = drivers.filter((row) => row.issueCount > 0).length;
  const needData = drivers.filter((row) => row.displayScore == null).length;
  const onTrackCount = drivers.filter((row) => !row.issueCount && row.displayScore != null).length;

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
    <main className="feedback-page">
      <header className="feedback-hero">
        <div>
          <span className="feedback-kicker">METRIXIQ · DRIVER COACHING</span>
          <h1>Driver Feedback</h1>
          <p>Personal WhatsApp-ready messages based on each driver's actual weekly scorecard. Review and edit before sending.</p>
        </div>
        <button type="button" className="feedback-refresh" onClick={() => { setRefreshTick((value) => value + 1); setNotice(""); }}>
          ↻ Refresh scorecards
        </button>
      </header>

      {periods.length === 0 ? (
        <EmptyPanel title="No weekly driver scorecards found" text="Import a DSP scorecard for an accessible site first. Feedback is never generated from unrelated daily or POD uploads." />
      ) : (
        <>
          <section className="feedback-toolbar" aria-label="Feedback filters">
            <label>
              <span>WEEK & SITE</span>
              <select value={period.key} onChange={(event) => { setPeriodKey(event.target.value); setSelectedId(""); setNotice(""); }}>
                {periods.map((item) => (
                  <option key={item.key} value={item.key}>{item.site} · {item.weekLabel} · {item.year || "—"} · {item.rows.length} drivers</option>
                ))}
              </select>
            </label>
            <label>
              <span>SEARCH DRIVER</span>
              <input type="search" placeholder="Name, TRID or rank…" value={search} onChange={(event) => setSearch(event.target.value)} />
            </label>
            <label>
              <span>SHOW</span>
              <select value={filter} onChange={(event) => { setFilter(event.target.value); setSelectedId(""); }}>
                <option value="all">All drivers</option>
                <option value="attention">Needs attention</option>
                <option value="on-track">No flagged issues</option>
              </select>
            </label>
          </section>

          <section className="feedback-summary" aria-label="Weekly feedback summary">
            <article><span>DRIVERS</span><strong>{drivers.length}</strong><small>Official scorecard cohort</small></article>
            <article><span>NEED FEEDBACK</span><strong>{attentionCount}</strong><small>Metrics with lost points</small></article>
            <article><span>NO FLAGGED ISSUES</span><strong>{onTrackCount}</strong><small>Available scorecard metrics</small></article>
            <article><span>MISSING SCORES</span><strong>{needData}</strong><small>Not treated as driver errors</small></article>
          </section>

          <div className="feedback-workspace">
            <section className="feedback-list-card" aria-label="Drivers">
              <div className="feedback-list-head">
                <div><h2>Driver messages</h2><p>{filtered.length} driver{filtered.length === 1 ? "" : "s"} in this view</p></div>
                <button type="button" onClick={downloadMessages} disabled={!filtered.length}>↓ Export TXT</button>
              </div>
              <div className="feedback-list">
                {filtered.length ? filtered.map((row) => {
                  const active = selectedRow && driverId(row) === driverId(selectedRow);
                  return (
                    <div className={"feedback-driver" + (active ? " selected" : "")} key={driverId(row)}>
                      <button type="button" className="feedback-driver-select" onClick={() => { setSelectedId(driverId(row)); setNotice(""); }}>
                        <span className="feedback-driver-rank">#{row.rank}</span>
                        <span className="feedback-driver-info">
                          <strong>{driverName(row)}</strong>
                          <small>{row.drivers?.trid || period.site} · {row.displayScore == null ? "Score unavailable" : row.issueCount ? row.issueCount + " to review" : "No flagged issues"}</small>
                        </span>
                        <span className={"feedback-driver-score " + row.tier.cls}>
                          <b>{shownScore(row.displayScore)}</b>
                          <small>{row.tier.label}</small>
                        </span>
                      </button>
                      <button type="button" className="feedback-quick-copy" onClick={() => copyMessage(messageFor(row), driverName(row))} aria-label={"Copy feedback for " + driverName(row)}>Copy</button>
                    </div>
                  );
                }) : <p className="feedback-no-results">No drivers match these filters.</p>}
              </div>
            </section>

            <section className="feedback-message-card" aria-label="Individual message preview">
              {selectedRow ? (
                <>
                  <div className="feedback-message-head">
                    <div>
                      <span className="feedback-kicker">MESSAGE PREVIEW</span>
                      <h2>{driverName(selectedRow)}</h2>
                      <p>#{selectedRow.rank} · {period.weekLabel} · {period.site} · {selectedRow.tier.label}</p>
                    </div>
                    <span className={"feedback-issue-badge" + (selectedRow.issueCount ? " attention" : "")}>
                      {selectedRow.displayScore == null ? "Check data" : selectedRow.issueCount ? selectedRow.issueCount + " areas to review" : "On track"}
                    </span>
                  </div>
                  <div className="feedback-message-options">
                    <label><span>TONE</span><select value={tone} onChange={(event) => setTone(event.target.value)}>
                      <option value="professional">Professional</option>
                      <option value="firm">Firm</option>
                    </select></label>
                    <label><span>LENGTH</span><select value={detail} onChange={(event) => setDetail(event.target.value)}>
                      <option value="short">WhatsApp · concise</option>
                      <option value="detailed">Detailed · all issues</option>
                    </select></label>
                  </div>
                  <textarea aria-label="Edit individual feedback message" value={draft} onChange={(event) => {
                    setEditedFor(selectedKey);
                    setEditedMessage(event.target.value);
                  }} rows={13} spellCheck />
                  <p className="feedback-message-hint">
                    Generated from recorded values and scorecard point bands. Suggestions are coaching advice, not proof of a specific driving event.
                  </p>
                  <div className="feedback-actions">
                    <button type="button" className="feedback-copy-main" onClick={() => copyMessage(draft, driverName(selectedRow))}>⧉ Copy message</button>
                    <button type="button" className="feedback-share-main" onClick={shareSelected}>↗ Share / WhatsApp</button>
                    <button type="button" onClick={() => { setEditedFor(""); setEditedMessage(""); }}>Reset text</button>
                  </div>
                  {notice && <p className="feedback-notice" role="status">{notice}</p>}
                </>
              ) : <p className="feedback-no-results">Choose a driver to prepare a message.</p>}
            </section>
          </div>
        </>
      )}
    </main>
  );
}
