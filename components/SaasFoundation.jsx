"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "../lib/supabase/client";

const PLAN_ORDER = { free: 0, pro: 1, business: 2, full: 3 };

const NAV_MIN_PLAN = {
  dashboard: "free",
  drivers: "free",
  performance: "free",
  billing: "free",
  settings: "free",

  "site-scorecards": "pro",
  "driver-scorecards": "pro",
  iadc: "pro",
  cdf: "pro",
  mentor: "pro",
  concessions: "pro",
  coaching: "pro",
  imports: "pro",
  "data-quality": "pro",
  reports: "pro",

  intelligence: "business",
};

function rowFromRpc(data) {
  if (Array.isArray(data)) return data[0] || null;
  return data || null;
}

function planLabel(plan) {
  const value = String(plan || "free").toLowerCase();
  if (value === "pro") return "Pro";
  if (value === "business") return "Business";
  if (value === "full") return "Full";
  if (value === "suspended") return "Suspended";
  return "Free";
}

function dateLabel(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function dateTimeLabel(value) {
  if (!value) return "Never";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Never";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function daysLeft(value) {
  if (!value) return 0;
  const end = new Date(value).getTime();
  if (!Number.isFinite(end)) return 0;
  return Math.max(0, Math.ceil((end - Date.now()) / 86400000));
}

export function canAccessNav(id, access, platformAdmin) {
  if (id === "admin") return Boolean(platformAdmin);
  if (platformAdmin) return true;

  const effective = String(access?.effective_plan || "free").toLowerCase();
  const required = NAV_MIN_PLAN[id] || "full";

  return (PLAN_ORDER[effective] ?? 0) >= (PLAN_ORDER[required] ?? 3);
}

export function SuspendedWorkspaceView({ access, onLogout }) {
  return (
    <main className="saas-fullscreen">
      <section className="saas-suspended">
        <span className="saas-kicker">WORKSPACE ACCESS</span>
        <h1>Workspace suspended</h1>
        <p>
          This workspace is currently suspended. Your data has not been deleted.
          {access?.suspended_reason ? ` Reason: ${access.suspended_reason}` : ""}
        </p>
        <button className="saas-secondary" onClick={onLogout}>Sign out</button>
      </section>
      <SaasStyles />
    </main>
  );
}

export function PlanOnboardingView({ organizationId, organizationName, onComplete, onLogout }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function choose(mode) {
    if (!organizationId || busy) return;

    setBusy(mode);
    setError("");

    try {
      const supabase = getSupabaseBrowserClient();
      const rpc = mode === "trial" ? "start_workspace_trial" : "choose_free_plan";

      const { error: chooseError } = await supabase.rpc(rpc, {
        p_organization_id: organizationId,
      });

      if (chooseError) throw chooseError;

      const { data, error: accessError } = await supabase.rpc("get_workspace_access", {
        p_organization_id: organizationId,
      });

      if (accessError) throw accessError;

      onComplete?.(rowFromRpc(data));
    } catch (e) {
      setError(e?.message || "We could not activate this plan.");
    } finally {
      setBusy("");
    }
  }

  return (
    <main className="saas-fullscreen">
      <section className="saas-onboarding">
        <div className="saas-onboarding-head">
          <div>
            <span className="saas-kicker">WELCOME TO METRIXIQ</span>
            <h1>Choose how you want to start</h1>
            <p>
              {organizationName || "Your workspace"} is ready. Start free permanently,
              or unlock the full platform for 7 days — no card required.
            </p>
          </div>
          <button className="saas-link" onClick={onLogout}>Sign out</button>
        </div>

        <div className="saas-choice-grid">
          <article className="saas-choice">
            <span className="saas-plan-badge">FREE</span>
            <h2>Start Free</h2>
            <strong>£0</strong>
            <small>Permanent free workspace</small>

            <ul>
              <li>✓ Core fleet dashboard</li>
              <li>✓ Driver directory</li>
              <li>✓ Core performance view</li>
              <li>✓ Keep your account and data</li>
            </ul>

            <button
              className="saas-secondary wide"
              disabled={Boolean(busy)}
              onClick={() => choose("free")}
            >
              {busy === "free" ? "Activating…" : "Continue with Free"}
            </button>
          </article>

          <article className="saas-choice featured">
            <span className="saas-plan-badge premium">7-DAY PREMIUM TRIAL</span>
            <h2>Unlock everything</h2>
            <strong>7 days</strong>
            <small>No payment method required</small>

            <ul>
              <li>✓ Site & driver scorecards</li>
              <li>✓ IADC · Mentor · CDF · Concessions</li>
              <li>✓ Coaching & Smart Import</li>
              <li>✓ AI Insights and advanced tools</li>
            </ul>

            <button
              className="saas-primary wide"
              disabled={Boolean(busy)}
              onClick={() => choose("trial")}
            >
              {busy === "trial" ? "Starting trial…" : "Start 7-Day Free Trial"}
            </button>

            <p className="saas-fine">
              If you do not upgrade, the workspace automatically returns to Free when the trial ends.
            </p>
          </article>
        </div>

        {error && <div className="saas-error">{error}</div>}

        <p className="saas-trust">
          Secure authentication · Workspace data protected by Supabase row-level security
        </p>
      </section>

      <SaasStyles />
    </main>
  );
}

export function BillingProView({ access, organizationId, onAccessChanged, platformAdmin = false }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const trialDays = daysLeft(access?.trial_ends_at);
  const effectivePlan = platformAdmin ? "full" : String(access?.effective_plan || "free");
  const status = platformAdmin ? "active" : String(access?.subscription_status || "free");

  async function startTrial() {
    if (!organizationId || busy) return;

    setBusy("trial");
    setError("");

    try {
      const supabase = getSupabaseBrowserClient();
      const { error: trialError } = await supabase.rpc("start_workspace_trial", {
        p_organization_id: organizationId,
      });
      if (trialError) throw trialError;

      const { data, error: accessError } = await supabase.rpc("get_workspace_access", {
        p_organization_id: organizationId,
      });
      if (accessError) throw accessError;

      onAccessChanged?.(rowFromRpc(data));
    } catch (e) {
      setError(e?.message || "Could not start the trial.");
    } finally {
      setBusy("");
    }
  }

  const plans = [
    ["Free", "free", "£0", "Core dashboard for small teams", ["Dashboard", "Drivers", "Performance"]],
    ["Pro", "pro", "£39", "Weekly operations & scorecards", ["Scorecards", "IADC / Mentor / CDF", "Coaching & reports"]],
    ["Business", "business", "£89", "Advanced fleet intelligence", ["Everything in Pro", "AI Insights", "Expanded operations"]],
    ["Full", "full", "£169", "Maximum platform capability", ["Everything in Business", "Premium feature set", "Priority capability"]],
  ];

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="page-kicker">ACCOUNT</span>
          <h1>Plans & billing</h1>
          <p>Manage your MetrixIQ access level and subscription.</p>
        </div>
      </div>

      <section className="saas-current-plan">
        <div>
          <span>CURRENT ACCESS</span>
          <h2>{platformAdmin ? "Platform Owner" : `${planLabel(effectivePlan)} plan`}</h2>
          <p>
            {status === "trialing"
              ? `Premium trial · ${trialDays} day${trialDays === 1 ? "" : "s"} remaining`
              : status === "active"
                ? "Paid subscription active"
                : "Free workspace"}
          </p>
        </div>

        {status === "trialing" && (
          <div className="saas-trial-counter">
            <strong>{trialDays}</strong>
            <span>days left</span>
            <small>Ends {dateLabel(access?.trial_ends_at)}</small>
          </div>
        )}
      </section>

      {error && <div className="saas-error">{error}</div>}

      <div className="saas-billing-grid">
        {plans.map(([name, key, price, description, features]) => {
          const active = effectivePlan === key && (status === "active" || status === "free");
          const trialActive = status === "trialing" && key === "full";

          return (
            <article key={key} className={key === "business" ? "recommended" : ""}>
              {key === "business" && <span className="saas-recommended">POPULAR</span>}
              <h3>{name}</h3>
              <strong>{price}<small>/month</small></strong>
              <p>{description}</p>
              <ul>{features.map((feature) => <li key={feature}>✓ {feature}</li>)}</ul>

              {active || trialActive ? (
                <button className="saas-secondary wide" disabled>
                  {trialActive ? "Trial active" : "Current plan"}
                </button>
              ) : key === "full" && status === "free" && !access?.trial_started_at ? (
                <button className="saas-primary wide" disabled={Boolean(busy)} onClick={startTrial}>
                  {busy === "trial" ? "Starting…" : "Try Full free for 7 days"}
                </button>
              ) : key === "free" ? (
                <button className="saas-secondary wide" disabled>Available</button>
              ) : (
                <button
                  className="saas-primary wide"
                  disabled
                  title="Stripe Checkout will be connected in the next R1 billing step."
                >
                  Stripe checkout next
                </button>
              )}
            </article>
          );
        })}
      </div>

      <div className="saas-billing-note">
        <b>R1 billing foundation is active.</b>
        <p>
          Free and 7-day trial access are live. Paid plan buttons are intentionally locked until
          Stripe Checkout and webhook synchronization are connected, so nobody can be charged
          without the subscription state being verified automatically.
        </p>
      </div>

      <SaasStyles />
    </>
  );
}

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
      const supabase = getSupabaseBrowserClient();
      const { data, error: rpcError } = await supabase.rpc("admin_list_accounts");
      if (rpcError) throw rpcError;
      setAccounts(data || []);
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
      const supabase = getSupabaseBrowserClient();
      const { error: updateError } = await supabase.rpc("admin_set_workspace_plan", {
        p_organization_id: account.organization_id,
        p_plan: plan,
        p_status: status,
      });
      if (updateError) throw updateError;
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
      const supabase = getSupabaseBrowserClient();
      const { error: suspendError } = await supabase.rpc("admin_set_workspace_suspension", {
        p_organization_id: account.organization_id,
        p_suspended: suspended,
        p_reason: suspended ? "Suspended by platform owner" : null,
      });
      if (suspendError) throw suspendError;
      await load();
    } catch (e) {
      setError(e?.message || "Could not update workspace access.");
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
              placeholder="Search name, email or workspace…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
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
                            <option value="pro">Pro</option>
                            <option value="business">Business</option>
                            <option value="full">Full</option>
                          </select>

                          <button
                            className={account.suspended ? "restore" : "suspend"}
                            disabled={planBusy || suspendBusy}
                            onClick={() => setSuspended(account, !account.suspended)}
                          >
                            {suspendBusy ? "…" : account.suspended ? "Restore" : "Suspend"}
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
          The account directory and administrative actions are enforced by Supabase SECURITY DEFINER
          functions that only accept the platform owner. Hiding this page in the UI is not the security boundary.
        </p>
      </div>

      <SaasStyles />
    </>
  );
}

function SaasStyles() {
  return (
    <style jsx global>{`
      .saas-fullscreen{
        min-height:100vh;
        display:grid;
        place-items:center;
        padding:28px;
        background:
          radial-gradient(circle at 10% 10%,rgba(44,151,126,.13),transparent 34%),
          radial-gradient(circle at 90% 10%,rgba(55,102,160,.10),transparent 34%),
          #f4f7f8;
        color:#223548;
      }
      .saas-onboarding,.saas-suspended{
        width:min(980px,100%);
        padding:30px;
        border:1px solid #dce5e9;
        border-radius:20px;
        background:#fff;
        box-shadow:0 18px 55px rgba(29,48,66,.10);
      }
      .saas-suspended{max-width:580px;text-align:center}
      .saas-suspended h1{margin:7px 0 10px;font-size:30px}
      .saas-suspended p{color:#71808e;line-height:1.6}
      .saas-onboarding-head{
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:24px;
        margin-bottom:24px;
      }
      .saas-kicker{
        display:block;
        color:#4b9384;
        font-size:9px;
        font-weight:950;
        letter-spacing:.12em;
      }
      .saas-onboarding h1{margin:7px 0 6px;font-size:31px;letter-spacing:-.025em}
      .saas-onboarding-head p{max-width:650px;margin:0;color:#758391;line-height:1.55;font-size:12px}
      .saas-link{border:0;background:transparent;color:#667887;font-size:10px;font-weight:800;cursor:pointer}
      .saas-choice-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
      .saas-choice{
        position:relative;
        padding:22px;
        border:1px solid #dfe7eb;
        border-radius:15px;
        background:#fff;
      }
      .saas-choice.featured{
        border-color:#9dcec1;
        background:linear-gradient(180deg,#f8fcfb 0%,#fff 100%);
        box-shadow:0 9px 30px rgba(53,124,105,.08);
      }
      .saas-plan-badge,.saas-recommended{
        display:inline-flex;
        padding:5px 8px;
        border-radius:999px;
        background:#eef2f4;
        color:#62727f;
        font-size:7px;
        font-weight:950;
        letter-spacing:.08em;
      }
      .saas-plan-badge.premium,.saas-recommended{background:#dff2ec;color:#347765}
      .saas-choice h2{margin:11px 0 5px;font-size:19px}
      .saas-choice>strong{display:block;font-size:29px;letter-spacing:-.02em}
      .saas-choice>small{display:block;margin-top:2px;color:#8c99a4;font-size:9px}
      .saas-choice ul,.saas-billing-grid ul{list-style:none;margin:18px 0;padding:0}
      .saas-choice li,.saas-billing-grid li{margin:8px 0;color:#536575;font-size:10px}
      .saas-primary,.saas-secondary{
        min-height:39px;
        padding:0 14px;
        border-radius:9px;
        font-size:9px;
        font-weight:900;
        cursor:pointer;
      }
      .saas-primary{border:1px solid #2f806d;background:#347f6d;color:#fff}
      .saas-secondary{border:1px solid #d7e1e6;background:#fff;color:#34495b}
      .saas-primary:disabled,.saas-secondary:disabled{cursor:not-allowed;opacity:.55}
      .wide{width:100%}
      .saas-fine{margin:10px 0 0;color:#929da6;font-size:8px;line-height:1.5}
      .saas-trust{text-align:center;margin:19px 0 0;color:#98a3ad;font-size:8px}
      .saas-error{margin:12px 0;padding:10px 12px;border:1px solid #efc8cd;border-radius:8px;background:#fff3f4;color:#a7414c;font-size:9px}
      .saas-current-plan{
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:20px;
        margin-bottom:12px;
        padding:18px;
        border:1px solid #dce6e9;
        border-radius:13px;
        background:linear-gradient(135deg,#fff 0%,#f5faf8 100%);
      }
      .saas-current-plan>div>span{font-size:8px;font-weight:950;letter-spacing:.1em;color:#4b9384}
      .saas-current-plan h2{margin:4px 0;font-size:22px}
      .saas-current-plan p{margin:0;color:#82909c;font-size:9px}
      .saas-trial-counter{text-align:right}
      .saas-trial-counter strong{display:block;font-size:28px;color:#347f6d}
      .saas-trial-counter span,.saas-trial-counter small{display:block;color:#8a98a3;font-size:8px}
      .saas-billing-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
      .saas-billing-grid article{
        position:relative;
        padding:17px;
        border:1px solid #dfe6ea;
        border-radius:12px;
        background:#fff;
      }
      .saas-billing-grid article.recommended{border-color:#9dcec1}
      .saas-recommended{position:absolute;right:12px;top:12px}
      .saas-billing-grid h3{margin:0 0 10px;font-size:16px}
      .saas-billing-grid article>strong{font-size:25px}
      .saas-billing-grid article>strong small{font-size:8px;color:#8b98a3}
      .saas-billing-grid article>p{min-height:32px;color:#7a8995;font-size:8px;line-height:1.45}
      .saas-billing-note{
        margin-top:12px;
        padding:13px 15px;
        border:1px solid #d9e8e3;
        border-radius:10px;
        background:#f5faf8;
      }
      .saas-billing-note b{display:block;color:#30584e;font-size:9px}
      .saas-billing-note p{margin:4px 0 0;color:#70837e;font-size:8px;line-height:1.55}
      .saas-owner-chip{
        display:inline-flex;
        align-items:center;
        height:36px;
        padding:0 11px;
        border-radius:8px;
        background:#162b3f;
        color:#9fe1cf;
        font-size:8px;
        font-weight:950;
        letter-spacing:.08em;
        text-transform:uppercase;
      }
      .saas-admin-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-bottom:11px}
      .saas-admin-summary article{padding:14px;border:1px solid #dfe6ea;border-radius:11px;background:#fff}
      .saas-admin-summary span{display:block;font-size:7px;font-weight:950;letter-spacing:.09em;color:#8996a2}
      .saas-admin-summary strong{display:block;margin-top:5px;font-size:24px;color:#21364a}
      .saas-admin-summary small{display:block;margin-top:3px;color:#98a3ad;font-size:8px}
      .saas-admin-panel{padding:0;overflow:hidden}
      .saas-admin-toolbar{
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:18px;
        padding:14px 15px;
        border-bottom:1px solid #e5ebee;
      }
      .saas-admin-toolbar>div:first-child>span{font-size:7px;font-weight:950;letter-spacing:.1em;color:#4b9384}
      .saas-admin-toolbar h2{margin:3px 0 0;font-size:15px}
      .saas-admin-filters{display:flex;gap:7px}
      .saas-admin-filters input,.saas-admin-filters select,.saas-admin-actions select{
        height:34px;
        border:1px solid #dbe4e8;
        border-radius:8px;
        background:#fff;
        padding:0 9px;
        color:#34495c;
        font-size:8px;
      }
      .saas-admin-filters input{min-width:240px}
      .saas-admin-table{min-width:1180px}
      .saas-admin-table th,.saas-admin-table td{font-size:8px}
      .saas-admin-user{display:flex;align-items:center;gap:8px}
      .saas-admin-user>span{display:grid;place-items:center;width:29px;height:29px;border-radius:8px;background:#e8f3ef;color:#347766;font-size:8px;font-weight:900}
      .saas-admin-user b{display:block}
      .saas-admin-user small,.saas-cell-small{display:block;margin-top:2px;color:#8d9aa4;font-size:7px}
      .saas-status{display:inline-flex;padding:4px 7px;border-radius:999px;font-size:7px;font-weight:900;text-transform:uppercase}
      .saas-status.active{background:#e4f4ee;color:#317562}
      .saas-status.suspended{background:#f8e8ea;color:#a23f4b}
      .saas-admin-actions{display:flex;gap:5px;align-items:center}
      .saas-admin-actions button{
        height:30px;
        padding:0 8px;
        border-radius:7px;
        font-size:7px;
        font-weight:900;
        cursor:pointer;
      }
      .saas-admin-actions button.suspend{border:1px solid #efc7cc;background:#fff4f5;color:#a4434e}
      .saas-admin-actions button.restore{border:1px solid #c9e5dc;background:#f2faf7;color:#347562}
      @media(max-width:1050px){
        .saas-billing-grid{grid-template-columns:repeat(2,1fr)}
        .saas-admin-summary{grid-template-columns:repeat(2,1fr)}
      }
      @media(max-width:700px){
        .saas-fullscreen{padding:14px}
        .saas-onboarding{padding:20px}
        .saas-onboarding-head{flex-direction:column}
        .saas-choice-grid,.saas-billing-grid{grid-template-columns:1fr}
        .saas-current-plan{align-items:flex-start;flex-direction:column}
        .saas-trial-counter{text-align:left}
        .saas-admin-filters{width:100%;flex-direction:column}
        .saas-admin-filters input,.saas-admin-filters select{width:100%;min-width:0}
        .saas-admin-toolbar{align-items:flex-start;flex-direction:column}
      }
    `}</style>
  );
}
