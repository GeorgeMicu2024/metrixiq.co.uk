"use client";

import { useState } from "react";
import { LandingAuthTrigger } from "./LandingAuth";
import { PLAN_CATALOG, formatPlanPrice } from "../lib/config/plans";

const icons = {
  free: "◇",
  pro: "▥",
  business: "↗",
  full: "♟",
};

export default function LandingPricing() {
  const [cycle, setCycle] = useState("month");

  return (
    <section id="pricing" className="mk-home-pricing" aria-labelledby="homepage-pricing-title">
      <div className="mk-home-pricing-head">
        <div>
          <span>TRANSPARENT PRICING</span>
          <h2 id="homepage-pricing-title">Simple pricing for every operation</h2>
          <p>Choose the plan that fits your fleet. Upgrade or cancel anytime.</p>
        </div>
        <div className="mk-home-pricing-controls">
          <div className="mk-home-cycle" aria-label="Billing cycle">
            <button type="button" className={cycle === "month" ? "active" : ""} onClick={() => setCycle("month")}>Monthly</button>
            <button type="button" className={cycle === "year" ? "active" : ""} onClick={() => setCycle("year")}>Annual</button>
          </div>
          <span className="mk-home-save">◇ <b>Save 2 months</b> with annual billing</span>
        </div>
      </div>

      <div className="mk-home-plan-grid">
        {PLAN_CATALOG.map((plan) => {
          const featured = plan.key === "business";
          const paid = plan.key !== "free";
          const href = paid
            ? `/login?mode=register&plan=${encodeURIComponent(plan.key)}`
            : "/login?mode=register";
          return (
            <article key={plan.key} className={featured ? "featured" : ""}>
              {featured && <span className="mk-home-popular">MOST POPULAR</span>}
              <div className="mk-home-plan-title">
                <i>{icons[plan.key] || "◇"}</i>
                <div><h3>{plan.name}</h3><p>{plan.description}</p></div>
              </div>
              <div className="mk-home-plan-price">
                <strong>{formatPlanPrice(plan, cycle)}</strong>
                <span>{paid ? (cycle === "year" ? "/year" : "/month") : "/month"}</span>
              </div>
              <ul>
                {plan.features.map((feature) => <li key={feature}><b>✓</b>{feature}</li>)}
              </ul>
              <LandingAuthTrigger
                className={featured ? "primary" : ""}
                mode="register"
                intent={paid ? "plan" : ""}
                plan={paid ? plan.key : ""}
                interval={cycle}
                fallbackHref={href}
                ctaLocation="homepage_pricing"
              >
                {plan.key === "free" ? "Start free" : `Choose ${plan.name}`}
              </LandingAuthTrigger>
            </article>
          );
        })}
      </div>

      <div className="mk-home-activation">
        <div className="mk-home-activation-intro"><b>Get started in minutes</b><span>From sign-up to insights in under 5 minutes.</span></div>
        <div className="mk-home-step"><i>1</i><span><b>Create account</b><small>Sign up with your work email</small></span></div>
        <em>›</em>
        <div className="mk-home-step"><i>2</i><span><b>Start free trial or choose plan</b><small>Get instant access to the platform</small></span></div>
        <em>›</em>
        <div className="mk-home-step"><i>3</i><span><b>Activate in Stripe</b><small>Secure and simple checkout</small></span></div>
      </div>

      <div className="mk-home-trust-row">
        <span><i>♙</i><b>Built for delivery operations</b><small>Fleet, site and driver workflows</small></span>
        <span><i>▥</i><b>Improve safety & compliance</b><small>Surface risk and exceptions</small></span>
        <span><i>♟</i><b>Develop high-performing teams</b><small>Evidence-led coaching</small></span>
        <span><i>◇</i><b>Run more efficient operations</b><small>Turn insight into measurable action</small></span>
      </div>
    </section>
  );
}
