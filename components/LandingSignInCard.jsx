"use client";

import { useState } from "react";
import Link from "next/link";
import Brand from "./Brand";
import { getSupabaseBrowserClient } from "../lib/supabase/client";

function validEmail(value) {
  return /^\S+@\S+\.\S+$/.test(String(value || "").trim());
}

export default function LandingSignInCard() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

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
    if (!password) {
      setIsError(true);
      setMessage("Enter your password.");
      return;
    }

    setBusy(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: clean,
        password,
      });
      if (error) throw error;

      // Full navigation guarantees the authenticated shell receives the fresh session.
      window.location.replace("/app");
    } catch (error) {
      setIsError(true);
      setMessage(error?.message || "Could not sign in. Check your details and try again.");
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    if (busy || googleBusy) return;

    setMessage("");
    setIsError(false);
    setGoogleBusy(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/app`,
        },
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

  return (
    <div className="mk-login-card" id="sign-in">
      <Brand />
      <small>WELCOME BACK</small>
      <h3>Sign in to your account</h3>

      <form className="mk-login-form" onSubmit={submit}>
        <label>
          <span className="mk-field-icon" aria-hidden="true">✉</span>
          <input
            type="email"
            autoComplete="email"
            placeholder="Email address"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={busy || googleBusy}
          />
        </label>

        <label>
          <span className="mk-field-icon" aria-hidden="true">♙</span>
          <input
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={busy || googleBusy}
          />
          <button
            type="button"
            className="mk-password-toggle"
            aria-label={showPassword ? "Hide password" : "Show password"}
            onClick={() => setShowPassword((value) => !value)}
          >
            {showPassword ? "◌" : "◉"}
          </button>
        </label>

        <div className="mk-remember">
          <span>✓ &nbsp; Secure session</span>
          <button type="button" disabled={busy || googleBusy} onClick={forgotPassword}>
            Forgot password?
          </button>
        </div>

        {message && (
          <div className={isError ? "mk-auth-message error" : "mk-auth-message success"}>
            {message}
          </div>
        )}

        <button className="mk-signin" type="submit" disabled={busy || googleBusy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <div className="mk-or"><span />OR CONTINUE WITH<span /></div>

      <button
        className="mk-google"
        type="button"
        disabled={busy || googleBusy}
        onClick={signInWithGoogle}
      >
        ⓖ &nbsp; {googleBusy ? "Connecting…" : "Continue with Google"}
      </button>

      <p>
        Don't have an account? <Link href="/login?mode=register">Create account</Link>
      </p>
    </div>
  );
}
