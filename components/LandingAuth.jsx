"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "../lib/supabase/client";

const AUTH_EVENT = "metrixiq:auth-open";
const VALID_PLANS = new Set(["pro", "business", "full"]);

function writeIntent(intent, plan, interval = "month") {
  try {
    if (intent === "trial") {
      window.localStorage.setItem("metrixiq.onboardingIntent", JSON.stringify({ mode: "trial" }));
      return;
    }
    if (intent === "plan" && VALID_PLANS.has(plan)) {
      window.localStorage.setItem("metrixiq.onboardingIntent", JSON.stringify({ mode: "plan", plan, interval: interval === "year" ? "year" : "month" }));
      return;
    }
    window.localStorage.removeItem("metrixiq.onboardingIntent");
  } catch {}
}

export function LandingAuthTrigger({
  children,
  className = "",
  mode = "signin",
  intent = "",
  plan = "",
  interval = "month",
  fallbackHref = "/login",
  ctaLocation = "homepage",
}) {
  function open(event) {
    event.preventDefault();
    window.dispatchEvent(new CustomEvent(AUTH_EVENT, {
      detail: { mode, intent, plan, interval },
    }));
  }

  return (
    <a
      href={fallbackHref}
      className={className}
      onClick={open}
      data-track-event="cta_click"
      data-track-params={JSON.stringify({
        destination: fallbackHref,
        cta_label: typeof children === "string" ? children : mode,
        cta_location: ctaLocation,
        ...(plan ? { plan } : {}),
        ...(plan ? { interval } : {}),
      })}
    >
      {children}
    </a>
  );
}

export default function LandingAuthModal() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("signin");
  const [intent, setIntent] = useState("");
  const [plan, setPlan] = useState("");
  const [interval, setInterval] = useState("month");
  const [name, setName] = useState("");
  const [org, setOrg] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    function handleOpen(event) {
      const detail = event?.detail || {};
      setMode(detail.mode === "register" ? "register" : "signin");
      setIntent(detail.intent || "");
      setPlan(detail.plan || "");
      setInterval(detail.interval === "year" ? "year" : "month");
      setMessage("");
      setIsError(false);
      setOpen(true);
    }
    function keydown(event) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener(AUTH_EVENT, handleOpen);
    window.addEventListener("keydown", keydown);
    return () => {
      window.removeEventListener(AUTH_EVENT, handleOpen);
      window.removeEventListener("keydown", keydown);
    };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  function validEmail(value) {
    return /^\S+@\S+\.\S+$/.test(String(value || "").trim());
  }

  function planLabel() {
    if (plan === "pro") return "Starter";
    if (plan === "business") return "Professional";
    if (plan === "full") return "Business";
    return "";
  }

  function destination() {
    if (intent === "trial") return "/app";
    if (intent === "plan" && VALID_PLANS.has(plan)) return "/app";
    return "/app";
  }

  function persistIntent() {
    writeIntent(intent, plan, interval);
  }

  async function submit(event) {
    event.preventDefault();
    if (busy || googleBusy) return;

    const clean = email.trim().toLowerCase();
    setMessage("");
    setIsError(false);

    if (!validEmail(clean)) {
      setIsError(true);
      setMessage("Enter a valid email address.");
      return;
    }
    if (password.length < 8) {
      setIsError(true);
      setMessage("Password must contain at least 8 characters.");
      return;
    }
    if (mode === "register" && !name.trim()) {
      setIsError(true);
      setMessage("Enter your full name.");
      return;
    }
    if (mode === "register" && !org.trim()) {
      setIsError(true);
      setMessage("Enter your organisation name.");
      return;
    }

    setBusy(true);
    try {
      const supabase = getSupabaseBrowserClient();
      persistIntent();

      if (mode === "register") {
        const redirectTo = `${window.location.origin}/auth/callback?next=/app`;
        const { data, error } = await supabase.auth.signUp({
          email: clean,
          password,
          options: {
            emailRedirectTo: redirectTo,
            data: {
              full_name: name.trim(),
              organization_name: org.trim(),
            },
          },
        });
        if (error) throw error;

        if (data?.session) {
          window.location.assign(destination());
          return;
        }

        setMessage("Account created. Check your email to confirm your address, then continue to MetrixIQ.");
        setIsError(false);
        setBusy(false);
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({ email: clean, password });
      if (error) throw error;
      window.location.assign(destination());
    } catch (error) {
      setIsError(true);
      setMessage(error?.message || "Authentication failed. Please try again.");
      setBusy(false);
    }
  }

  async function google() {
    if (busy || googleBusy) return;
    setMessage("");
    setIsError(false);
    setGoogleBusy(true);
    try {
      persistIntent();
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/app` },
      });
      if (error) throw error;
    } catch (error) {
      setIsError(true);
      setMessage(error?.message || "Google sign-in is not available right now.");
      setGoogleBusy(false);
    }
  }

  async function forgotPassword() {
    const clean = email.trim().toLowerCase();
    setMessage("");
    setIsError(false);
    if (!validEmail(clean)) {
      setIsError(true);
      setMessage("Enter your email address first.");
      return;
    }
    setBusy(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.resetPasswordForEmail(clean, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });
      if (error) throw error;
      setMessage("Password reset email sent.");
    } catch (error) {
      setIsError(true);
      setMessage(error?.message || "Could not send the password reset email.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const selectedPlan = planLabel();
  const register = mode === "register";

  return (
    <div className="mk-auth-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) setOpen(false);
    }}>
      <section className="mk-auth-modal" role="dialog" aria-modal="true" aria-label={register ? "Create MetrixIQ account" : "Sign in to MetrixIQ"}>
        <button className="mk-auth-close" type="button" onClick={() => setOpen(false)} aria-label="Close">×</button>
        <div className="mk-auth-brand"><span>W</span><b>Metrix<span>IQ</span></b></div>

        <div className="mk-auth-heading">
          <small>{register ? (intent === "trial" ? "7-DAY PREMIUM TRIAL" : selectedPlan ? `${selectedPlan.toUpperCase()} PLAN` : "CREATE WORKSPACE") : "WELCOME BACK"}</small>
          <h2>{register ? (intent === "trial" ? "Start your 7-Day Free Trial" : "Create your MetrixIQ account") : "Sign in to MetrixIQ"}</h2>
          <p>
            {register
              ? intent === "trial"
                ? "Full platform access for 7 days. No card required."
                : selectedPlan
                  ? `${selectedPlan} is selected on ${interval === "year" ? "annual" : "monthly"} billing. Create your workspace to continue.`
                  : "Create a secure fleet workspace in a few moments."
              : "Access dashboards, scorecards and fleet performance insights."}
          </p>
        </div>

        {selectedPlan && register && (
          <div className="mk-auth-plan">
            <span>Selected plan</span><b>{selectedPlan} · {interval === "year" ? "Annual" : "Monthly"}</b><small>Billing is completed securely in Stripe after account setup.</small>
          </div>
        )}

        <button className="mk-auth-google" type="button" disabled={busy || googleBusy} onClick={google}>
          <span>G</span>{googleBusy ? "Connecting…" : "Continue with Google"}
        </button>
        <div className="mk-auth-or"><span />OR EMAIL<span /></div>

        <form className="mk-auth-form" onSubmit={submit}>
          {register && (
            <div className="mk-auth-two">
              <label><span>Full name</span><input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></label>
              <label><span>Organisation</span><input autoComplete="organization" value={org} onChange={(e) => setOrg(e.target.value)} /></label>
            </div>
          )}
          <label><span>Email</span><input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label className="mk-auth-password">
            <span>Password</span>
            <input type={showPassword ? "text" : "password"} autoComplete={register ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? "◌" : "◉"}</button>
          </label>

          {!register && <button className="mk-auth-forgot" type="button" disabled={busy} onClick={forgotPassword}>Forgot password?</button>}
          {message && <div className={isError ? "mk-auth-status error" : "mk-auth-status success"}>{message}</div>}

          <button className="mk-auth-submit" type="submit" disabled={busy || googleBusy}>
            {busy ? (register ? "Creating account…" : "Signing in…") : register ? (intent === "trial" ? "Start Free Trial →" : selectedPlan ? "Continue →" : "Create workspace →") : "Sign in →"}
          </button>
        </form>

        <div className="mk-auth-secure"><i>✓</i><span><b>Secure authentication</b><small>Accounts and sessions are protected by Supabase Auth.</small></span></div>

        <p className="mk-auth-switch">
          {register ? "Already have an account?" : "New to MetrixIQ?"}
          <button type="button" onClick={() => { setMode(register ? "signin" : "register"); setMessage(""); setIsError(false); }}>
            {register ? "Sign in" : "Create account"}
          </button>
        </p>
      </section>
    </div>
  );
}
