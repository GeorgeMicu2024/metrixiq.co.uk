"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import {
  ensureManagerTask,
  fetchManagerControlData,
  openCoachingFromManagerItem,
  reviewManagerItem,
  updateManagerTask,
} from "../../lib/data/managerControlV2";
import { templateForMetric } from "../../lib/coaching/templates";

const severityRank = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

function driverShape(item) {
  return {
    id: item.trid || "—",
    dbId: item.driver_id,
    name: item.driver_name || "Driver",
    site: item.site || "",
    risk: ["critical", "high"].includes(item.severity) ? "High" : "Medium",
    issue: item.detail || item.title || "Management signal",
  };
}

function dateLabel(value) {
  if (!value) return "No due date";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "No due date";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function relativeDue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const days = Math.ceil((date.getTime() - Date.now()) / 86400000);
  if (days < 0) return Math.abs(days) + "d overdue";
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return "Due in " + days + "d";
}

export default function ManagerControlCenterV2({
  organizationId,
  siteFilter = "all",
  canManage = false,
  onOpenDriver,
  onOpenCoaching,
  onOpenDataQuality,
  onOpenImports,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [severity, setSeverity] = useState("all");
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);

  async function load() {
    if (!organizationId) return;
    setLoading(true);
    setError("");
    try {
      setData(await fetchManagerControlData(getSupabaseBrowserClient(), organizationId, siteFilter));
    } catch (e) {
      setError(e?.message || "Could not load Manager Control Center.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [organizationId, siteFilter]);

  const queue = data?.queue || [];
  const summary = data?.summary || {};
  const assignees = data?.assignees || [];

  const categories = useMemo(
    () => [...new Set(queue.map((item) => item.category).filter(Boolean))].sort(),
    [queue]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return queue
      .filter((item) => {
        if (severity !== "all" && item.severity !== severity) return false;
        if (category !== "all" && item.category !== category) return false;
        if (q) {
          const haystack = [
            item.driver_name,
            item.trid,
            item.title,
            item.detail,
            item.metric,
          ].filter(Boolean).join(" ").toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) =>
        (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9) ||
        (a.due_at ? new Date(a.due_at).getTime() : Infinity) -
          (b.due_at ? new Date(b.due_at).getTime() : Infinity)
      );
  }, [queue, severity, category, query]);

  async function run(key, fn, success) {
    if (!canManage) return;
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await fn();
      setNotice(success);
      await load();
    } catch (e) {
      setError(e?.message || "Action failed.");
    } finally {
      setBusy("");
    }
  }

  async function ensure(item) {
    return ensureManagerTask(getSupabaseBrowserClient(), organizationId, item);
  }

  async function assign(item, userId) {
    const id = await ensure(item);
    await run(
      "assign-" + item.id,
      () => updateManagerTask(getSupabaseBrowserClient(), id, { status: "in_progress", assignedTo: userId }),
      "Task assigned."
    );
  }

  async function closeItem(item) {
    const id = await ensure(item);
    await run(
      "close-" + item.id,
      () => updateManagerTask(getSupabaseBrowserClient(), id, { status: "done" }),
      "Management item closed."
    );
  }

  async function review(item) {
    const note = window.prompt("Review note:", "Reviewed in Manager Control Center");
    if (note === null) return;
    await run(
      "review-" + item.id,
      async () => {
        await reviewManagerItem(getSupabaseBrowserClient(), organizationId, item, note);
        if (item.source === "manager-task" && item.source_id) {
          await updateManagerTask(getSupabaseBrowserClient(), item.source_id, { status: "done" });
        }
      },
      "Item marked reviewed."
    );
  }

  async function coach(item) {
    if (!item.driver_id) {
      setNotice("This workspace-level item has no driver to coach.");
      return;
    }
    const template = templateForMetric(item.metric || item.category);
    await run(
      "coach-" + item.id,
      async () => {
        await openCoachingFromManagerItem(
          getSupabaseBrowserClient(),
          organizationId,
          item,
          template.id
        );
        const taskId = await ensure(item);
        await updateManagerTask(getSupabaseBrowserClient(), taskId, { status: "in_progress" });
      },
      "Coaching case created."
    );
  }

  function openRelated(item) {
    if (item.category === "data-quality" && !item.driver_id) return onOpenDataQuality?.();
    if (item.category === "imports") return onOpenImports?.();
    if (item.category === "coaching") return onOpenCoaching?.();
    if (item.driver_id) return onOpenDriver?.(driverShape(item));
  }

  if (loading) {
    return <section className="panel mgrv2-empty"><div className="auth-spinner" /><b>Building today’s manager queue…</b></section>;
  }

  return <div className="mgrv2-root">
    <div className="mgrv2-heading">
      <div>
        <span className="page-kicker">MANAGER CONTROL CENTER V2</span>
        <h1>Today</h1>
        <p>One operational queue for scorecard risk, coaching, data quality and import exceptions.</p>
      </div>
      <div className="mgrv2-heading-actions">
        <button className="btn ghost" onClick={load}>Refresh intelligence</button>
        <button className="btn primary" onClick={onOpenCoaching}>Open Coaching</button>
      </div>
    </div>

    {error && <div className="mgrv2-notice error">{error}</div>}
    {notice && <div className="mgrv2-notice good">{notice}</div>}

    <section className="mgrv2-hero">
      <div>
        <span>CURRENT PRIORITY</span>
        <h2>
          {summary.critical
            ? summary.critical + " critical item" + (summary.critical === 1 ? "" : "s") + " need immediate action"
            : summary.high
              ? summary.high + " high-priority item" + (summary.high === 1 ? "" : "s") + " are waiting"
              : "No critical management item is open"}
        </h2>
        <p>{summary.overdue || 0} overdue · {summary.unassigned || 0} unassigned tasks · {summary.dataQuality || 0} data-quality signals.</p>
      </div>
      <div>
        <span>Action queue</span>
        <strong>{summary.total || 0}</strong>
        <small>{siteFilter === "all" ? "All sites" : siteFilter}</small>
      </div>
    </section>

    <section className="mgrv2-kpis">
      <article className={summary.critical ? "bad" : ""}><span>Critical</span><strong>{summary.critical || 0}</strong><small>Immediate action</small></article>
      <article className={summary.high ? "warn" : ""}><span>High</span><strong>{summary.high || 0}</strong><small>Coach / review</small></article>
      <article className={summary.overdue ? "bad" : ""}><span>Overdue</span><strong>{summary.overdue || 0}</strong><small>Past due date</small></article>
      <article><span>Coaching</span><strong>{summary.coaching || 0}</strong><small>Follow-up signals</small></article>
      <article><span>Data Quality</span><strong>{summary.dataQuality || 0}</strong><small>Evidence issues</small></article>
      <article><span>Unassigned</span><strong>{summary.unassigned || 0}</strong><small>Manager tasks</small></article>
    </section>

    <section className="mgrv2-controls">
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search driver, TRID, metric or action…" />
      <select value={severity} onChange={(e) => setSeverity(e.target.value)}>
        <option value="all">All severities</option>
        <option value="critical">Critical</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>
      <select value={category} onChange={(e) => setCategory(e.target.value)}>
        <option value="all">All categories</option>
        {categories.map((value) => <option key={value} value={value}>{value}</option>)}
      </select>
      <span>{visible.length} visible</span>
    </section>

    <div className="mgrv2-layout">
      <section className="panel mgrv2-queue">
        <div className="panel-head">
          <div><h2>Needs attention</h2><p>Prioritised by severity, due date and source evidence.</p></div>
          <span className="panel-badge">{visible.length}</span>
        </div>
        <div className="mgrv2-stack">
          {visible.map((item) => <article
            key={item.id}
            className={"mgrv2-item " + (item.severity || "medium") + (selected?.id === item.id ? " active" : "")}
            onClick={() => setSelected(item)}
          >
            <span className={"mgrv2-severity " + (item.severity || "medium")}>{item.severity || "medium"}</span>
            <div className="mgrv2-item-main">
              <div><b>{item.title}</b><em>{item.category}</em></div>
              <p>{item.detail}</p>
              <small>
                {item.driver_name && item.driver_name !== "Driver"
                  ? item.driver_name + " · " + (item.trid || "—") + " · "
                  : ""}
                {item.site || "Workspace"}
                {item.week_label ? " · " + item.week_label : ""}
              </small>
            </div>
            <div className="mgrv2-item-side">
              {item.due_at && <b className={new Date(item.due_at) < new Date() ? "late" : ""}>{relativeDue(item.due_at)}</b>}
              <small>{item.source}</small>
            </div>
          </article>)}
          {!visible.length && <div className="mgrv2-empty"><b>Queue clear</b><span>No management signal matches the current filters.</span></div>}
        </div>
      </section>

      <aside className="panel mgrv2-detail">
        {!selected ? <div className="mgrv2-empty"><b>Select an item</b><span>Assignment, coaching and review actions appear here.</span></div> : <>
          <div className="panel-head">
            <div><span className="page-kicker">{selected.category}</span><h2>{selected.title}</h2><p>{selected.detail}</p></div>
            <span className={"mgrv2-severity " + selected.severity}>{selected.severity}</span>
          </div>

          <div className="mgrv2-detail-grid">
            <div><span>Driver</span><b>{selected.driver_name && selected.driver_name !== "Driver" ? selected.driver_name : "Workspace item"}</b></div>
            <div><span>Site</span><b>{selected.site || "All / workspace"}</b></div>
            <div><span>Week</span><b>{selected.week_label || "Current"}</b></div>
            <div><span>Due</span><b>{dateLabel(selected.due_at)}</b></div>
          </div>

          <button className="mgrv2-open-driver" onClick={() => openRelated(selected)}>
            {selected.driver_id ? "Open driver profile →" : "Open related workspace area →"}
          </button>

          <label className="mgrv2-assign">
            <span>Assign manager</span>
            <select
              value={selected.metadata?.assigned_to || ""}
              disabled={!canManage || !!busy}
              onChange={(e) => e.target.value && assign(selected, e.target.value)}
            >
              <option value="">Choose manager…</option>
              {assignees.map((person) => <option key={person.user_id} value={person.user_id}>
                {(person.full_name || person.email || person.user_id) + " · " + person.role}
              </option>)}
            </select>
          </label>

          <div className="mgrv2-actions">
            <button disabled={!canManage || !!busy} onClick={() => review(selected)}>Reviewed</button>
            {selected.driver_id && <button disabled={!canManage || !!busy} onClick={() => coach(selected)}>Create coaching</button>}
            <button className="primary" disabled={!canManage || !!busy} onClick={() => closeItem(selected)}>Close task</button>
          </div>
        </>}
      </aside>
    </div>
  </div>;
}
