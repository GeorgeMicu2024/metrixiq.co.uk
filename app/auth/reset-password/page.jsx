"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Brand from "../../../components/Brand";
import { getSupabaseBrowserClient } from "../../../lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("Validating your secure recovery link…");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let active = true;

    async function initialiseRecovery() {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (!active) return;

      if (sessionError) {
        setError(sessionError.message || "Could not validate the recovery session.");
        setMessage("");
        return;
      }

      if (data.session) {
        setReady(true);
        setMessage("");
        return;
      }

      setMessage("Open the password reset link from your email to continue.");
    }

    initialiseRecovery();

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;

      if (event === "PASSWORD_RECOVERY" && session) {
        setReady(true);
        setError("");
        setMessage("");
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function submit(event) {
    event.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must contain at least 8 characters.");
      return;
    }

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      setMessage("Password updated successfully. Redirecting to your workspace…");
      window.setTimeout(() => router.replace("/app"), 600);
    } catch (e) {
      setError(e?.message || "Could not update your password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page reset-auth-page">
      <section className="auth-visual">
        <div className="auth-grid" />
        <Link href="/" className="auth-brand"><Brand inverse /></Link>
        <div className="auth-copy">
          <span className="section-kicker light">ACCOUNT SECURITY</span>
          <h1>Restore access securely.</h1>
          <p>Use the recovery link from your email to choose a new MetrixIQ password.</p>
        </div>
        <p className="auth-foot">MetrixIQ · Secure fleet intelligence</p>
      </section>

      <section className="auth-form-wrap">
        <div className="auth-form">
          <Link href="/" className="mobile-brand"><Brand /></Link>
          <span className="section-kicker">PASSWORD RECOVERY</span>
          <h2>Choose a new password</h2>
          <p className="auth-sub">Your recovery link creates a temporary secure session for this change.</p>

          {message && <div className="form-notice">{message}</div>}
          {error && <div className="form-error">{error}</div>}

          {ready ? (
            <form onSubmit={submit}>
              <label>
                New password
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <label>
                Confirm password
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                />
              </label>
              <button className="submit-btn" disabled={busy}>
                {busy ? "Updating…" : "Update password"}
                <span>→</span>
              </button>
            </form>
          ) : (
            <p className="auth-switch">
              Need a new recovery link? <Link href="/login">Return to sign in</Link>
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
