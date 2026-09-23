"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Brand from "./Brand";
import { getSupabaseBrowserClient } from "../lib/supabase/client";

export default function LoginClient() {
  const router = useRouter();
  const [register, setRegister] = useState(false);
  const [inviteMode, setInviteMode] = useState(false);
  const [inviteToken, setInviteToken] = useState("");
  const [invitedEmailLocked, setInvitedEmailLocked] = useState(false);
  const [name, setName] = useState("");
  const [org, setOrg] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const invited = params.get("invite") === "1";
      const invitedEmail = String(params.get("email") || "").trim().toLowerCase();
      const token = String(params.get("token") || "").trim();
      setInviteMode(invited);
      setInviteToken(token);
      setRegister(params.get("mode") === "register" || invited);
      if (invitedEmail) {
        setEmail(invitedEmail);
        setInvitedEmailLocked(Boolean(token));
      }
      const supabase = getSupabaseBrowserClient();
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) router.replace("/app");
      });
    } catch (e) {
      setError(e?.message || "Authentication is not configured.");
    }
  }, [router]);

  function withTimeout(promise, ms, message) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = window.setTimeout(() => reject(new Error(message)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer));
  }

  async function registerWithInviteToken(clean) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch("/api/auth/register-invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token: inviteToken,
          email: clean,
          password,
          fullName: name.trim(),
        }),
        signal: controller.signal,
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Could not complete the invited registration.");
      }
      return payload;
    } catch (e) {
      if (e?.name === "AbortError") {
        throw new Error("Registration timed out. Please try again; your account was not created.");
      }
      throw e;
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    const clean = email.trim().toLowerCase();

    if (!/^\S+@\S+\.\S+$/.test(clean)) return setError("Enter a valid email address.");
    if (password.length < 8) return setError("Password must contain at least 8 characters.");
    if (register && !name.trim()) return setError("Enter your full name.");
    if (register && !inviteMode && !org.trim()) return setError("Enter your organisation name.");

    setBusy(true);
    try {
      const supabase = getSupabaseBrowserClient();

      if (register && inviteMode && inviteToken) {
        const result = await registerWithInviteToken(clean);

        const { error: signInError } = await withTimeout(
          supabase.auth.signInWithPassword({ email: clean, password }),
          12000,
          "Your account was created, but sign-in timed out. Please use Sign in with the same email and password."
        );
        if (signInError) throw signInError;

        setNotice(`Account created. Joining ${result?.organization_name || "your workspace"}…`);
        router.replace("/app");
        return;
      }

      if (register) {
        const redirectTo = `${window.location.origin}/auth/callback?next=/app`;
        const { data, error: signUpError } = await withTimeout(
          supabase.auth.signUp({
            email: clean,
            password,
            options: {
              emailRedirectTo: redirectTo,
              data: {
                full_name: name.trim(),
                ...(inviteMode ? {} : { organization_name: org.trim() }),
              },
            },
          }),
          15000,
          inviteMode
            ? "Registration service timed out. Ask your manager for the personal invite link and try again."
            : "Registration service timed out. Please try again."
        );

        if (signUpError) throw signUpError;
        if (data.session) {
          router.replace("/app");
          return;
        }
        setNotice("Account created. Check your email to confirm your address, then sign in.");
        return;
      }

      const { error: signInError } = await withTimeout(
        supabase.auth.signInWithPassword({ email: clean, password }),
        12000,
        "Sign-in timed out. Please try again."
      );
      if (signInError) throw signInError;
      router.replace("/app");
    } catch (e) {
      setError(e?.message || "Authentication failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }


  async function forgotPassword() {
    setError("");
    setNotice("");

    const clean = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(clean)) {
      setError("Enter your email address first.");
      return;
    }

    setBusy(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const redirectTo = `${window.location.origin}/auth/reset-password`;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(clean, {
        redirectTo,
      });

      if (resetError) throw resetError;

      setNotice("Password reset email sent. Check your inbox and follow the secure link.");
    } catch (e) {
      setError(e?.message || "Could not send the password reset email.");
    } finally {
      setBusy(false);
    }
  }

  async function social(provider) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=/app`,
        },
      });
      if (oauthError) throw oauthError;
    } catch (e) {
      setError(e?.message || `${provider} sign in is not available yet.`);
      setBusy(false);
    }
  }

  function toggleMode() {
    if (inviteMode) {
      setRegister(false);
      setInviteMode(false);
      setInviteToken("");
      setInvitedEmailLocked(false);
      window.history.replaceState({}, "", "/login");
    } else {
      setRegister((value) => !value);
    }
    setError("");
    setNotice("");
  }

  return (
    <main className="auth-page">
      <section className="auth-visual">
        <div className="auth-grid" />
        <Link href="/" className="auth-brand"><Brand inverse /></Link>
        <div className="auth-copy">
          <span className="section-kicker light">OPERATIONAL INTELLIGENCE</span>
          <h1>One workspace for every fleet performance decision.</h1>
          <p>Import operational reports, map TRIDs to drivers, identify risk and turn weekly scorecards into a clear management workflow.</p>
          <ul>
            <li><span>✓</span> Multiple Excel / CSV / PDF imports</li>
            <li><span>✓</span> DCR · POD · FICO · IADC · Concessions</li>
            <li><span>✓</span> Driver risk and coaching intelligence</li>
          </ul>
        </div>
        <p className="auth-foot">MetrixIQ · Fleet & driver intelligence</p>
      </section>

      <section className="auth-form-wrap">
        <div className="auth-form">
          <Link href="/" className="mobile-brand"><Brand /></Link>
          <span className="section-kicker">{register ? (inviteMode ? "JOIN WORKSPACE" : "CREATE WORKSPACE") : "WELCOME BACK"}</span>
          <h2>{register ? (inviteMode ? "Create your invited account" : "Start your MetrixIQ workspace") : "Sign in to MetrixIQ"}</h2>
          <p className="auth-sub">{register ? (inviteMode ? "Register with the invited email. MetrixIQ will attach you to the existing workspace automatically." : "Create your secure fleet workspace.") : "Use your MetrixIQ account to continue."}</p>

          <div className="provider-row provider-row-single">
            <button type="button" disabled={busy} onClick={() => social("google")}>Continue with Google</button>
          </div>
          <div className="divider"><span />or email<span /></div>

          <form onSubmit={submit}>
            {register && <>
              <label>Full name<input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></label>
              {!inviteMode && <label>Organisation<input autoComplete="organization" value={org} onChange={(e) => setOrg(e.target.value)} /></label>}
            </>}
            <label>Email<input type="email" autoComplete="email" value={email} readOnly={invitedEmailLocked} onChange={(e) => setEmail(e.target.value)} /></label>
            <label>Password<input type="password" autoComplete={register ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} /></label>{!register && <button type="button" className="auth-forgot" disabled={busy} onClick={forgotPassword}>Forgot password?</button>}
            {error && <div className="form-error">{error}</div>}
            {notice && <div className="form-notice">{notice}</div>}
            <button className="submit-btn" disabled={busy}>{busy ? (register ? "Creating account…" : "Signing in…") : register ? (inviteMode ? "Join workspace" : "Create workspace") : "Sign in"}<span>→</span></button>
          </form>

          <div className="secure-auth-note"><span>✓</span><p><b>Secure authentication</b><br />Accounts and sessions are managed by Supabase Auth.</p></div>
          <p className="auth-switch">{register ? "Already have an account?" : "New to MetrixIQ?"} <button type="button" onClick={toggleMode}>{register ? "Sign in" : "Create workspace"}</button></p>
        </div>
      </section>
    </main>
  );
}
