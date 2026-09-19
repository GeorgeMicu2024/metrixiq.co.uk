"use client";

import { useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { SaasStyles } from "./SaasShared";
import { activateWorkspaceMode } from "../../lib/data/billing";

export function PlanOnboardingView({ organizationId, organizationName, onComplete, onLogout }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function choose(mode) {
    if (!organizationId || busy) return;

    setBusy(mode);
    setError("");

    try {
      const access = await activateWorkspaceMode(
        getSupabaseBrowserClient(),
        organizationId,
        mode
      );

      onComplete?.(access);
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


