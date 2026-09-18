"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { authToken, daysLeft, planLabel, rowFromRpc, SaasStyles } from "../saas/SaasShared";

export function BillingProView({ access, organizationId, onAccessChanged, platformAdmin = false }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [cycle, setCycle] = useState("month");

  const trialDays = daysLeft(access?.trial_ends_at);
  const effectivePlan = platformAdmin ? "full" : String(access?.effective_plan || "free");
  const status = platformAdmin ? "active" : String(access?.subscription_status || "free");

  async function refreshAccess() {
    if (!organizationId) return;
    const supabase = getSupabaseBrowserClient();
    const { data, error: accessError } = await supabase.rpc("get_workspace_access", {
      p_organization_id: organizationId,
    });
    if (accessError) throw accessError;
    onAccessChanged?.(rowFromRpc(data));
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("billing") !== "success") return;

    const timer = window.setTimeout(() => {
      refreshAccess().catch(() => {});
      window.history.replaceState({}, "", "/app");
    }, 1500);

    return () => window.clearTimeout(timer);
  }, [organizationId]);

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
      await refreshAccess();
    } catch (e) {
      setError(e?.message || "Could not start the trial.");
    } finally {
      setBusy("");
    }
  }

  async function beginCheckout(plan) {
    if (!organizationId || busy) return;

    setBusy(plan);
    setError("");

    try {
      const token = await authToken();
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          organizationId,
          plan,
          interval: cycle,
        }),
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Could not start Stripe Checkout.");
      if (!payload?.url) throw new Error("Stripe Checkout URL was not returned.");

      window.location.assign(payload.url);
    } catch (e) {
      setError(e?.message || "Could not start Stripe Checkout.");
      setBusy("");
    }
  }

  async function openPortal() {
    if (!organizationId || busy) return;

    setBusy("portal");
    setError("");

    try {
      const token = await authToken();
      const response = await fetch("/api/billing/portal", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ organizationId }),
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Could not open the billing portal.");
      if (!payload?.url) throw new Error("Billing portal URL was not returned.");

      window.location.assign(payload.url);
    } catch (e) {
      setError(e?.message || "Could not open the billing portal.");
      setBusy("");
    }
  }

  const plans = [
    {
      name: "Free",
      key: "free",
      month: "£0",
      year: "£0",
      description: "Core fleet visibility for small teams",
      features: ["Dashboard", "Drivers", "Core performance"],
    },
    {
      name: "Starter",
      key: "pro",
      month: "£29",
      year: "£290",
      description: "Weekly operational scorecards and quality tools",
      features: ["Scorecards", "IADC / Mentor / CDF", "Coaching & reports"],
    },
    {
      name: "Professional",
      key: "business",
      month: "£69",
      year: "£690",
      description: "Advanced fleet intelligence for growing operations",
      features: ["Everything in Starter", "AI Insights", "Team Management"],
    },
    {
      name: "Business",
      key: "full",
      month: "£149",
      year: "£1,490",
      description: "Maximum MetrixIQ capability for larger operations",
      features: ["Everything in Professional", "Full platform access", "Premium capability"],
    },
  ];

  const hasStripeSubscription = ["active", "past_due", "cancelled"].includes(status);

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="page-kicker">ACCOUNT</span>
          <h1>Plans & billing</h1>
          <p>Secure subscriptions powered by Stripe.</p>
        </div>

        <div className="page-actions">
          {hasStripeSubscription && !platformAdmin && (
            <button className="btn ghost" disabled={Boolean(busy)} onClick={openPortal}>
              {busy === "portal" ? "Opening…" : "Manage subscription"}
            </button>
          )}
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
                ? "Stripe subscription active"
                : status === "past_due"
                  ? "Payment requires attention"
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

      <div className="saas-cycle-switch">
        <button className={cycle === "month" ? "active" : ""} onClick={() => setCycle("month")}>
          Monthly
        </button>
        <button className={cycle === "year" ? "active" : ""} onClick={() => setCycle("year")}>
          Annual
        </button>
      </div>

      {error && <div className="saas-error">{error}</div>}

      <div className="saas-billing-grid">
        {plans.map((plan) => {
          const active = effectivePlan === plan.key && (status === "active" || status === "free");
          const amount = cycle === "year" ? plan.year : plan.month;
          const period = cycle === "year" ? "/year" : "/month";

          return (
            <article key={plan.key} className={plan.key === "business" ? "recommended" : ""}>
              {plan.key === "business" && <span className="saas-recommended">POPULAR</span>}
              <h3>{plan.name}</h3>
              <strong>{amount}<small>{plan.key === "free" ? "" : period}</small></strong>
              <p>{plan.description}</p>
              <ul>{plan.features.map((feature) => <li key={feature}>✓ {feature}</li>)}</ul>

              {platformAdmin ? (
                <button className="saas-secondary wide" disabled>Owner access</button>
              ) : active ? (
                <button className="saas-secondary wide" disabled>Current plan</button>
              ) : plan.key === "free" ? (
                <button className="saas-secondary wide" disabled>Free access</button>
              ) : hasStripeSubscription ? (
                <button className="saas-primary wide" disabled={Boolean(busy)} onClick={openPortal}>
                  Manage in Stripe
                </button>
              ) : (
                <button
                  className="saas-primary wide"
                  disabled={Boolean(busy)}
                  onClick={() => beginCheckout(plan.key)}
                >
                  {busy === plan.key ? "Opening Stripe…" : `Choose ${plan.name}`}
                </button>
              )}
            </article>
          );
        })}
      </div>

      {!platformAdmin && status === "free" && !access?.trial_started_at && (
        <div className="saas-billing-note">
          <b>Not ready to subscribe?</b>
          <p>You can still unlock the full platform for 7 days with no card required.</p>
          <button className="saas-secondary" disabled={Boolean(busy)} onClick={startTrial}>
            {busy === "trial" ? "Starting…" : "Start 7-Day Trial"}
          </button>
        </div>
      )}

      <div className="saas-billing-note">
        <b>Live Stripe catalogue</b>
        <p>
          MetrixIQ currently uses the live Stripe Starter, Professional and Business products
          already configured on your Stripe account. Checkout is hosted securely by Stripe.
        </p>
      </div>

      <SaasStyles />
    </>
  );
}


