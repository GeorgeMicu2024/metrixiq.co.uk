"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { acknowledgeNotification, fetchNotifications } from "../../lib/data/notifications";

const severityRank = { critical: 0, high: 1, medium: 2, low: 3 };

function driverShape(alert) {
  return {
    id: alert.trid || "—",
    dbId: alert.driver_id,
    name: alert.driver_name || "Unresolved driver",
    site: alert.site || "",
    risk: ["critical", "high"].includes(String(alert.severity || "").toLowerCase()) ? "High" : "Medium",
    issue: alert.message || alert.title || "Performance alert",
  };
}

function relativeTime(value) {
  if (!value) return "Recently";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return "Now";
  if (minutes < 60) return minutes + "m ago";
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours + "h ago";
  return Math.round(hours / 24) + "d ago";
}

export default function NotificationsCenter({
  organizationId,
  siteFilter = "all",
  summaryCount = 0,
  refreshKey = "",
  canManage = false,
  onOpenDriver,
  onOpenCoaching,
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const rootRef = useRef(null);

  async function load() {
    if (!organizationId) {
      setRows([]);
      setLoaded(true);
      return;
    }

    setError("");
    try {
      const next = await fetchNotifications(
        getSupabaseBrowserClient(),
        organizationId,
        50
      );
      setRows(next);
    } catch (e) {
      setError(e?.message || "Could not load notifications.");
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    setLoaded(false);
    load();
  }, [organizationId, refreshKey]);

  useEffect(() => {
    function closeOutside(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    function closeEscape(event) {
      if (String(event.key || "").toLowerCase() === "escape") setOpen(false);
    }

    document.addEventListener("mousedown", closeOutside);
    window.addEventListener("keydown", closeEscape);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      window.removeEventListener("keydown", closeEscape);
    };
  }, []);

  const visible = useMemo(() => {
    const scoped =
      siteFilter === "all"
        ? rows
        : rows.filter(
            (item) =>
              String(item.site || "").trim().toUpperCase() === siteFilter
          );

    return [...scoped].sort(
      (a, b) =>
        (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9) ||
        new Date(b.created_at || 0) - new Date(a.created_at || 0)
    );
  }, [rows, siteFilter]);

  const activeCount = loaded
    ? visible.filter((item) => item.status === "open").length
    : Number(summaryCount || 0);

  async function acknowledge(alert) {
    if (!canManage || busy) return;
    setBusy(alert.id);
    setError("");

    try {
      await acknowledgeNotification(getSupabaseBrowserClient(), alert.id);
      setRows((current) =>
        current.map((item) =>
          item.id === alert.id ? { ...item, status: "acknowledged" } : item
        )
      );
    } catch (e) {
      setError(e?.message || "Could not acknowledge notification.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="notifications-center" ref={rootRef}>
      <button
        type="button"
        className={open ? "notification-bell active" : "notification-bell"}
        aria-label={"Notifications" + (activeCount ? " (" + activeCount + ")" : "")}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>♢</span>
        {activeCount > 0 && <b>{activeCount > 99 ? "99+" : activeCount}</b>}
      </button>

      {open && (
        <section className="notifications-popover">
          <div className="notifications-head">
            <div>
              <span>NOTIFICATIONS</span>
              <h3>Action alerts</h3>
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onOpenCoaching?.();
              }}
            >
              View all →
            </button>
          </div>

          {error && <div className="notifications-error">{error}</div>}

          <div className="notifications-list">
            {!loaded && (
              <div className="notifications-empty">
                <div className="auth-spinner" />
                <span>Loading alerts…</span>
              </div>
            )}

            {loaded &&
              visible.slice(0, 8).map((alert) => (
                <article key={alert.id} className={"notification-item " + (alert.severity || "medium")}>
                  <button
                    type="button"
                    className="notification-main"
                    onClick={() => {
                      setOpen(false);
                      if (alert.driver_id) onOpenDriver?.(driverShape(alert));
                      else onOpenCoaching?.();
                    }}
                  >
                    <span className={"notification-severity " + (alert.severity || "medium")}>
                      {String(alert.severity || "medium").slice(0, 1).toUpperCase()}
                    </span>
                    <div>
                      <b>{alert.title || "Performance alert"}</b>
                      <p>{alert.driver_name || alert.site || "Workspace alert"}</p>
                      <small>
                        {alert.period_label || "Current period"} · {relativeTime(alert.created_at)}
                      </small>
                    </div>
                  </button>

                  {alert.status === "open" && canManage && (
                    <button
                      type="button"
                      className="notification-ack"
                      disabled={busy === alert.id}
                      onClick={() => acknowledge(alert)}
                    >
                      {busy === alert.id ? "…" : "Acknowledge"}
                    </button>
                  )}
                </article>
              ))}

            {loaded && !visible.length && (
              <div className="notifications-empty">
                <b>All clear</b>
                <span>No unresolved alert is active in the current site scope.</span>
              </div>
            )}
          </div>

          <div className="notifications-foot">
            <span>{activeCount} active alert{activeCount === 1 ? "" : "s"}</span>
            <button type="button" onClick={load}>Refresh</button>
          </div>
        </section>
      )}
    </div>
  );
}
