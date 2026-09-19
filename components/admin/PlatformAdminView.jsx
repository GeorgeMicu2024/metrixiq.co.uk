"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { dateLabel, dateTimeLabel, daysLeft, planLabel, SaasStyles } from "../saas/SaasShared";
import { deleteAdminAccount, fetchAdminAccounts, setAdminWorkspacePlan, setAdminWorkspaceSuspension } from "../../lib/data/admin";

export function PlatformAdminView() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState("");

  async function load() {
    setLoading(true);
    setError("");

    try {
      const nextAccounts = await fetchAdminAccounts(getSupabaseBrowserClient());
      setAccounts(nextAccounts);
    } catch (e) {
      setError(e?.message || "Could not load registered accounts.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return accounts.filter((account) => {
      const text = `${account.full_name || ""} ${account.email || ""} ${account.organization_name || ""} ${account.plan || ""} ${account.subscription_status || ""}`.toLowerCase();
      const matchesText = !q || text.includes(q);

      const matchesFilter =
        filter === "all" ||
        (filter === "paid" && account.subscription_status === "active" && account.plan !== "free") ||
        account.subscription_status === filter ||
        (filter === "suspended" && account.suspended);

      return matchesText && matchesFilter;
    });
  }, [accounts, query, filter]);

  const summary = useMemo(() => {
    const uniqueUsers = new Set(accounts.map((a) => a.user_id)).size;
    const trials = accounts.filter((a) => a.subscription_status === "trialing").length;
    const paid = accounts.filter((a) => a.subscription_status === "active" && a.plan !== "free").length;
    const suspended = accounts.filter((a) => a.suspended).length;

    return { uniqueUsers, trials, paid, suspended };
  }, [accounts]);

  async function updatePlan(account, plan, status) {
    if (!account.organization_id) return;

    const key = `${account.organization_id}-plan`;
    setBusy(key);
    setError("");

    try {
      await setAdminWorkspacePlan(getSupabaseBrowserClient(), {
        organizationId: account.organization_id,
        plan,
        status,
      });
      await load();
    } catch (e) {
      setError(e?.message || "Could not update the workspace plan.");
    } finally {
      setBusy("");
    }
  }

  async function setSuspended(account, suspended) {
    if (!account.organization_id) return;

    const key = `${account.organization_id}-suspend`;
    setBusy(key);
    setError("");

    try {
      await setAdminWorkspaceSuspension(getSupabaseBrowserClient(), {
        organizationId: account.organization_id,
        suspended,
        reason: suspended ? "Suspended by platform owner" : null,
      });
      await load();
    } catch (e) {
      setError(e?.message || "Could not update workspace access.");
    } finally {
      setBusy("");
    }
  }


  async function deleteAccount(account) {
    const label = account.email || account.full_name || "this account";
    const confirmation = window.prompt(
      `Delete ${label} permanently?\n\nThis removes the Auth account and any empty workspace owned only by this user. Type DELETE to continue.`
    );
    if (confirmation !== "DELETE") return;

    const key = `${account.user_id}-delete`;
    setBusy(key);
    setError("");

    try {
      await deleteAdminAccount(getSupabaseBrowserClient(), account.user_id);
      await load();
    } catch (e) {
      setError(e?.message || "Could not delete the account.");
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="page-kicker">PLATFORM CONTROL</span>
          <h1>Super Admin</h1>
          <p>Registered users, workspace access, trials and subscriptions across MetrixIQ.</p>
        </div>
        <div className="page-actions">
          <span className="saas-owner-chip">Platform Owner</span>
          <button className="btn ghost" disabled={loading} onClick={load}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      <section className="saas-admin-summary">
        <article><span>REGISTERED USERS</span><strong>{summary.uniqueUsers}</strong><small>All accounts</small></article>
        <article><span>ACTIVE TRIALS</span><strong>{summary.trials}</strong><small>7-day premium access</small></article>
        <article><span>PAID</span><strong>{summary.paid}</strong><small>Active subscriptions</small></article>
        <article><span>SUSPENDED</span><strong>{summary.suspended}</strong><small>Workspace access blocked</small></article>
      </section>

      <section className="panel saas-admin-panel">
        <div className="saas-admin-toolbar">
          <div>
            <span>ACCOUNT DIRECTORY</span>
            <h2>Customers & subscriptions</h2>
          </div>

          <div className="saas-admin-filters">
            <input
              aria-label="Search platform accounts"
              placeholder="Search name, email or workspace…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select aria-label="Filter platform accounts" value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">All accounts</option>
              <option value="free">Free</option>
              <option value="trialing">Trial</option>
              <option value="paid">Paid</option>
              <option value="past_due">Past due</option>
              <option value="cancelled">Cancelled</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
        </div>

        {error && <div className="saas-error">{error}</div>}

        <div className="table-wrap">
          <table className="data-table saas-admin-table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Workspace</th>
                <th>Access</th>
                <th>Subscription</th>
                <th>Trial</th>
                <th>Last login</th>
                <th>Registered</th>
                <th>Controls</th>
              </tr>
            </thead>
            <tbody>
              {loading && !accounts.length && (
                <tr><td colSpan="8">Loading accounts…</td></tr>
              )}

              {!loading && filtered.map((account) => {
                const planBusy = busy === `${account.organization_id}-plan`;
                const suspendBusy = busy === `${account.organization_id}-suspend`;

                return (
                  <tr key={`${account.user_id}-${account.organization_id || "none"}`}>
                    <td>
                      <div className="saas-admin-user">
                        <span>{String(account.full_name || account.email || "U").slice(0, 1).toUpperCase()}</span>
                        <div>
                          <b>{account.full_name || "Unnamed account"}</b>
                          <small>{account.email || "No email"}</small>
                        </div>
                      </div>
                    </td>

                    <td>
                      <b>{account.organization_name || "No workspace"}</b>
                      <small className="saas-cell-small">{account.workspace_role || "—"}</small>
                    </td>

                    <td>
                      {account.suspended
                        ? <span className="saas-status suspended">Suspended</span>
                        : <span className="saas-status active">Allowed</span>}
                    </td>

                    <td>
                      <b>{planLabel(account.plan)}</b>
                      <small className="saas-cell-small">{account.subscription_status || "free"}</small>
                    </td>

                    <td>
                      {account.subscription_status === "trialing"
                        ? <>
                            <b>{daysLeft(account.trial_ends_at)} days</b>
                            <small className="saas-cell-small">{dateLabel(account.trial_ends_at)}</small>
                          </>
                        : "—"}
                    </td>

                    <td>{dateTimeLabel(account.last_login_at)}</td>
                    <td>{dateLabel(account.created_at)}</td>

                    <td>
                      {account.organization_id ? (
                        <div className="saas-admin-actions">
                          <select
                            aria-label={`Plan for ${account.organization_name || account.email || "workspace"}`}
                            defaultValue={account.plan || "free"}
                            onChange={(e) => updatePlan(
                              account,
                              e.target.value,
                              e.target.value === "free" ? "free" : "active"
                            )}
                            disabled={planBusy || suspendBusy}
                            aria-label={`Change plan for ${account.organization_name || account.email}`}
                          >
                            <option value="free">Free</option>
                            <option value="pro">Starter</option>
                            <option value="business">Professional</option>
                            <option value="full">Business</option>
                          </select>

                          <button
                            className={account.suspended ? "restore" : "suspend"}
                            disabled={planBusy || suspendBusy || busy === `${account.user_id}-delete`}
                            onClick={() => setSuspended(account, !account.suspended)}
                          >
                            {suspendBusy ? "…" : account.suspended ? "Restore" : "Suspend"}
                          </button>
                          <button
                            className="suspend"
                            disabled={planBusy || suspendBusy || busy === `${account.user_id}-delete`}
                            onClick={() => deleteAccount(account)}
                          >
                            {busy === `${account.user_id}-delete` ? "Deleting…" : "Delete"}
                          </button>
                        </div>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}

              {!loading && !filtered.length && (
                <tr><td colSpan="8">No accounts match this filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="saas-billing-note">
        <b>Protected platform control</b>
        <p>
          The account directory and administrative actions are enforced by protected Supabase functions
          that only accept the platform owner.
        </p>
      </div>

      <SaasStyles />
    </>
  );
}


