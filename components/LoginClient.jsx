"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Brand from "./Brand";
import { getSupabaseBrowserClient } from "../lib/supabase/client";

export default function LoginClient() {
  const router = useRouter();
  const [register, setRegister] = useState(false);
  const [name, setName] = useState("");
  const [org, setOrg] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      setRegister(new URLSearchParams(window.location.search).get("mode") === "register");
      const supabase = getSupabaseBrowserClient();
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) router.replace("/app");
      });
    } catch (e) {
      setError(e?.message || "Authentication is not configured.");
    }
  }, [router]);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    const clean = email.trim().toLowerCase();

    if (!/^\S+@\S+\.\S+$/.test(clean)) return setError("Enter a valid email address.");
    if (password.length < 8) return setError("Password must contain at least 8 characters.");
    if (register && !name.trim()) return setError("Enter your full name.");
    if (register && !org.trim()) return setError("Enter your organisation name.");

    setBusy(true);
    try {
      const supabase = getSupabaseBrowserClient();
      if (register) {
        const redirectTo = `${window.location.origin}/auth/callback?next=/app`;
        const { data, error: signUpError } = await supabase.auth.signUp({
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
        if (signUpError) throw signUpError;
        if (data.session) {
          router.replace("/app");
          return;
        }
        setNotice("Account created. Check your email to confirm your address, then sign in.");
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: clean,
        password,
      });
      if (signInError) throw signInError;
      router.replace("/app");
    } catch (e) {
      setError(e?.message || "Authentication failed. Please try again.");
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
    setRegister((value) => !value);
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
          <span className="section-kicker">{register ? "CREATE WORKSPACE" : "WELCOME BACK"}</span>
          <h2>{register ? "Start your MetrixIQ workspace" : "Sign in to MetrixIQ"}</h2>
          <p className="auth-sub">{register ? "Create your secure fleet workspace." : "Use your MetrixIQ account to continue."}</p>

          <div className="provider-row">
            <button type="button" disabled={busy} onClick={() => social("google")}>Continue with Google</button>
            <button type="button" disabled={busy} onClick={() => social("apple")}>Continue with Apple</button>
          </div>
          <div className="divider"><span />or email<span /></div>

          <form onSubmit={submit}>
            {register && <>
              <label>Full name<input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></label>
              <label>Organisation<input autoComplete="organization" value={org} onChange={(e) => setOrg(e.target.value)} /></label>
            </>}
            <label>Email<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <label>Password<input type="password" autoComplete={register ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
            {error && <div className="form-error">{error}</div>}
            {notice && <div className="form-notice">{notice}</div>}
            <button className="submit-btn" disabled={busy}>{busy ? "Please wait…" : register ? "Create workspace" : "Sign in"}<span>→</span></button>
          </form>

          <div className="secure-auth-note"><span>✓</span><p><b>Secure authentication</b><br />Accounts and sessions are managed by Supabase Auth.</p></div>
          <p className="auth-switch">{register ? "Already have an account?" : "New to MetrixIQ?"} <button type="button" onClick={toggleMode}>{register ? "Sign in" : "Create workspace"}</button></p>
        </div>
      </section>
    </main>
  );
}
