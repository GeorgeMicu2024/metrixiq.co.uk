"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";

const severityRank = { critical: 0, high: 1, medium: 2, low: 3 };
const statusLabel = (value) => String(value || "open").replaceAll("_", " ");

function driverShape(row) {
  return {
    id: row.trid || "—",
    dbId: row.driver_id,
    name: row.driver_name || "Unresolved driver",
    site: row.site || "",
    risk: row.severity === "critical" || row.priority === "critical" ? "High" :
      row.severity === "high" || row.priority === "high" ? "High" : "Medium",
    issue: row.message || row.reason || row.title || "Performance alert",
  };
}

function scopeRows(rows, siteFilter) {
  if (siteFilter === "all") return rows;
  return rows.filter((row) => String(row.site || "").trim().toUpperCase() === siteFilter);
}

function dateLabel(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function CoachingAlertsView({
  organizationId,
  siteFilter = "all",
  onOpenDriver,
  canManage = false,
}) {
  const [tab, setTab] = useState("alerts");
  const [alerts, setAlerts] = useState([]);
  const [cases, setCases] = useState([]);
  const [selectedCaseId, setSelectedCaseId] = useState("");
  const [notes, setNotes] = useState([]);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("");
  const [outcome, setOutcome] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    if (!organizationId) return;
    setLoading(true);
    setError("");

    try {
      const supabase = getSupabaseBrowserClient();
      const [alertsResult, casesResult] = await Promise.all([
        supabase.rpc("list_performance_alerts", {
          p_organization_id: organizationId,
          p_status: null,
          p_limit: 500,
        }),
        supabase.rpc("list_coaching_cases", {
          p_organization_id: organizationId,
          p_status: null,
          p_limit: 500,
        }),
      ]);

      if (alertsResult.error) throw alertsResult.error;
      if (casesResult.error) throw casesResult.error;

      setAlerts(alertsResult.data || []);
      setCases(casesResult.data || []);
    } catch (e) {
      setError(e?.message || "Could not load coaching intelligence.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [organizationId]);

  const scopedAlerts = useMemo(
    () => scopeRows(alerts, siteFilter)
      .sort((a, b) => (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9) || new Date(b.created_at) - new Date(a.created_at)),
    [alerts, siteFilter]
  );

  const scopedCases = useMemo(
    () => scopeRows(cases, siteFilter)
      .sort((a, b) => (severityRank[a.priority] ?? 9) - (severityRank[b.priority] ?? 9) || new Date(b.created_at) - new Date(a.created_at)),
    [cases, siteFilter]
  );

  const selectedCase = scopedCases.find((item) => item.id === selectedCaseId) || null;

  useEffect(() => {
    if (selectedCase) {
      setStatus(selectedCase.status || "open");
      setOutcome(selectedCase.outcome || "");
    }
  }, [selectedCaseId, selectedCase?.updated_at]);

  useEffect(() => {
    let alive = true;
    if (!selectedCaseId) {
      setNotes([]);
      return () => {};
    }

    (async () => {
      try {
        const { data, error: rpcError } = await getSupabaseBrowserClient().rpc("list_coaching_case_notes", {
          p_case_id: selectedCaseId,
        });
        if (rpcError) throw rpcError;
        if (alive) setNotes(data || []);
      } catch (e) {
        if (alive) setError(e?.message || "Could not load coaching notes.");
      }
    })();

    return () => { alive = false; };
  }, [selectedCaseId]);

  async function run(key, fn, success) {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await fn();
      if (success) setNotice(success);
      await load();
    } catch (e) {
      setError(e?.message || "The action could not be completed.");
    } finally {
      setBusy("");
    }
  }

  async function acknowledge(alert) {
    await run(`ack-${alert.id}`, async () => {
      const { error: rpcError } = await getSupabaseBrowserClient().rpc("acknowledge_performance_alert", {
        p_alert_id: alert.id,
      });
      if (rpcError) throw rpcError;
    }, "Alert acknowledged.");
  }

  async function resolveAlert(alert) {
    await run(`resolve-${alert.id}`, async () => {
      const { error: rpcError } = await getSupabaseBrowserClient().rpc("resolve_performance_alert", {
        p_alert_id: alert.id,
      });
      if (rpcError) throw rpcError;
    }, "Alert resolved.");
  }

  async function openCase(alert) {
    setBusy(`case-${alert.id}`);
    setError("");
    setNotice("");
    try {
      const { data, error: rpcError } = await getSupabaseBrowserClient().rpc("open_coaching_case_from_alert", {
        p_alert_id: alert.id,
      });
      if (rpcError) throw rpcError;
      await load();
      setTab("cases");
      setSelectedCaseId(data || "");
      setNotice("Coaching case opened from the alert.");
    } catch (e) {
      setError(e?.message || "Could not open coaching case.");
    } finally {
      setBusy("");
    }
  }

  async function refreshAlerts() {
    await run("refresh", async () => {
      const { error: rpcError } = await getSupabaseBrowserClient().rpc("refresh_performance_alerts", {
        p_organization_id: organizationId,
      });
      if (rpcError) throw rpcError;
    }, "Alert engine refreshed against the latest driver periods.");
  }

  async function saveCase() {
    if (!selectedCase) return;
    await run(`save-${selectedCase.id}`, async () => {
      const { error: rpcError } = await getSupabaseBrowserClient().rpc("update_coaching_case", {
        p_case_id: selectedCase.id,
        p_status: status || null,
        p_priority: selectedCase.priority || null,
        p_assigned_to: selectedCase.assigned_to || null,
        p_due_at: selectedCase.due_at || null,
        p_follow_up_at: selectedCase.follow_up_at || null,
        p_outcome: outcome.trim() || null,
      });
      if (rpcError) throw rpcError;
    }, "Coaching case updated.");
  }

  async function addNote() {
    if (!selectedCase || !note.trim()) return;
    setBusy(`note-${selectedCase.id}`);
    setError("");
    try {
      const { error: rpcError } = await getSupabaseBrowserClient().rpc("add_coaching_case_note", {
        p_case_id: selectedCase.id,
        p_note: note.trim(),
        p_note_type: "note",
      });
      if (rpcError) throw rpcError;
      setNote("");
      const { data, error: notesError } = await getSupabaseBrowserClient().rpc("list_coaching_case_notes", {
        p_case_id: selectedCase.id,
      });
      if (notesError) throw notesError;
      setNotes(data || []);
      setNotice("Coaching note added.");
      await load();
    } catch (e) {
      setError(e?.message || "Could not add coaching note.");
    } finally {
      setBusy("");
    }
  }

  const openAlerts = scopedAlerts.filter((item) => item.status === "open").length;
  const critical = scopedAlerts.filter((item) => item.status !== "resolved" && item.severity === "critical").length;
  const high = scopedAlerts.filter((item) => item.status !== "resolved" && item.severity === "high").length;
  const activeCases = scopedCases.filter((item) => item.status !== "closed").length;
  const overdueCases = scopedCases.filter((item) => item.status !== "closed" && item.due_at && new Date(item.due_at) < new Date()).length;

  if (loading) {
    return <section className="panel ops-empty"><div className="auth-spinner" /><b>Loading coaching intelligence…</b></section>;
  }

  return <>
    <div className="page-heading coaching-hub-heading">
      <div>
        <span className="page-kicker">ACTION MANAGEMENT</span>
        <h1>Coaching & alerts</h1>
        <p>Convert performance signals into acknowledged actions, coaching cases and documented follow-up.</p>
      </div>
      <div className="page-actions">
        <button className="btn ghost" disabled={!canManage || busy === "refresh"} onClick={refreshAlerts}>
          {busy === "refresh" ? "Refreshing…" : "Refresh alerts"}
        </button>
      </div>
    </div>

    {(error || notice) && <div className={error ? "ops-notice error" : "ops-notice good"}>{error || notice}</div>}

    <section className="coaching-hub-kpis">
      <article><span>Open alerts</span><strong>{openAlerts}</strong><small>Current visible scope</small></article>
      <article className={critical ? "bad" : ""}><span>Critical</span><strong>{critical}</strong><small>Immediate action</small></article>
      <article className={high ? "warn" : ""}><span>High priority</span><strong>{high}</strong><small>Coaching candidates</small></article>
      <article><span>Active cases</span><strong>{activeCases}</strong><small>{overdueCases} overdue</small></article>
    </section>

    <div className="coaching-hub-tabs">
      <button className={tab === "alerts" ? "active" : ""} onClick={() => setTab("alerts")}>Performance alerts <span>{scopedAlerts.length}</span></button>
      <button className={tab === "cases" ? "active" : ""} onClick={() => setTab("cases")}>Coaching cases <span>{scopedCases.length}</span></button>
    </div>

    {tab === "alerts" && <section className="panel coaching-alert-panel">
      <div className="panel-head"><div><h2>Alert queue</h2><p>Server-generated signals from the latest stored driver metrics.</p></div></div>
      <div className="table-wrap">
        <table className="data-table coaching-alert-table">
          <thead><tr><th>Severity</th><th>Driver</th><th>Metric</th><th>Actual / Target</th><th>Period</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {scopedAlerts.map((alert) => <tr key={alert.id}>
              <td><span className={`alert-severity ${alert.severity || "medium"}`}>{alert.severity || "medium"}</span></td>
              <td><button className="driver-text-button" onClick={() => onOpenDriver?.(driverShape(alert))}><b>{alert.driver_name || "Unresolved driver"}</b><small>{alert.trid || "—"} · {alert.site || "Unassigned"}</small></button></td>
              <td><b>{alert.metric || alert.alert_type}</b><small className="history-date">{alert.title}</small></td>
              <td><b>{alert.actual_value ?? "—"}</b><small className="history-date">Target {alert.threshold ?? "—"}</small></td>
              <td>{alert.period_label || "—"}</td>
              <td><span className={`case-status ${alert.status}`}>{statusLabel(alert.status)}</span></td>
              <td><div className="coaching-row-actions">
                {alert.status === "open" && <button disabled={!canManage || !!busy} onClick={() => acknowledge(alert)}>Acknowledge</button>}
                {alert.status !== "resolved" && <button className="primary" disabled={!canManage || !!busy} onClick={() => openCase(alert)}>Coach</button>}
                {alert.status !== "resolved" && <button disabled={!canManage || !!busy} onClick={() => resolveAlert(alert)}>Resolve</button>}
              </div></td>
            </tr>)}
            {!scopedAlerts.length && <tr><td colSpan="7"><div className="ops-mini-empty">No alerts in the current site scope.</div></td></tr>}
          </tbody>
        </table>
      </div>
    </section>}

    {tab === "cases" && <div className="coaching-case-layout">
      <section className="panel coaching-case-list">
        <div className="panel-head"><div><h2>Coaching cases</h2><p>Documented intervention workflow.</p></div></div>
        <div className="coaching-case-stack">
          {scopedCases.map((item) => <button key={item.id} className={selectedCaseId === item.id ? "active" : ""} onClick={() => setSelectedCaseId(item.id)}>
            <span className={`alert-severity ${item.priority || "medium"}`}>{item.priority || "medium"}</span>
            <div><b>{item.driver_name || "Unresolved driver"}</b><small>{item.trid || "—"} · {item.site || "Unassigned"}</small><p>{item.title}</p></div>
            <em>{statusLabel(item.status)}</em>
          </button>)}
          {!scopedCases.length && <div className="ops-mini-empty">No coaching cases yet. Open one from a performance alert.</div>}
        </div>
      </section>

      <section className="panel coaching-case-detail">
        {!selectedCase && <div className="ops-mini-empty">Select a coaching case to view actions and notes.</div>}
        {selectedCase && <>
          <div className="panel-head">
            <div><h2>{selectedCase.driver_name || "Driver coaching"}</h2><p>{selectedCase.title}</p></div>
            <button className="profile-link" onClick={() => onOpenDriver?.(driverShape(selectedCase))}>Open driver →</button>
          </div>

          <div className="coaching-case-meta">
            <div><span>Metric</span><b>{selectedCase.metric || "—"}</b></div>
            <div><span>Priority</span><b>{selectedCase.priority || "—"}</b></div>
            <div><span>Due</span><b>{dateLabel(selectedCase.due_at)}</b></div>
            <div><span>Follow-up</span><b>{dateLabel(selectedCase.follow_up_at)}</b></div>
          </div>

          <div className="coaching-case-reason"><span>Reason</span><p>{selectedCase.reason || "No reason recorded."}</p></div>

          <div className="coaching-case-form">
            <label><span>Status</span><select value={status} disabled={!canManage} onChange={(e) => setStatus(e.target.value)}>
              {["open","assigned","acknowledged","follow_up","improved","not_improved","closed"].map((value) => <option key={value} value={value}>{statusLabel(value)}</option>)}
            </select></label>
            <label className="wide"><span>Outcome</span><input value={outcome} disabled={!canManage} onChange={(e) => setOutcome(e.target.value)} placeholder="Outcome / next action…" /></label>
            <button className="btn primary" disabled={!canManage || busy === `save-${selectedCase.id}`} onClick={saveCase}>Save case</button>
          </div>

          <div className="coaching-notes">
            <h3>Coaching notes</h3>
            <div className="coaching-note-entry">
              <textarea value={note} disabled={!canManage} onChange={(e) => setNote(e.target.value)} placeholder="Add evidence, conversation notes or follow-up action…" />
              <button className="btn primary" disabled={!canManage || !note.trim() || busy === `note-${selectedCase.id}`} onClick={addNote}>Add note</button>
            </div>
            <div className="coaching-note-list">
              {notes.map((item) => <div key={item.id}><span>{item.author_name || "Team member"} · {dateLabel(item.created_at)}</span><p>{item.note}</p></div>)}
              {!notes.length && <p className="team-empty">No notes recorded yet.</p>}
            </div>
          </div>
        </>}
      </section>
    </div>}
  </>;
}
