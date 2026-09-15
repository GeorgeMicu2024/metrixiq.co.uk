"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../../../lib/supabase/client";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState("Completing secure sign in…");

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const next = new URLSearchParams(window.location.search).get("next") || "/app";
    let active = true;

    async function complete() {
      const { data, error } = await supabase.auth.getSession();
      if (!active) return;
      if (error) {
        setMessage(error.message || "We could not complete sign in.");
        return;
      }
      if (data.session) {
        router.replace(next);
        return;
      }
      setMessage("Waiting for authentication confirmation…");
    }

    complete();
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session) router.replace(next);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [router]);

  return (
    <main className="auth-callback-page">
      <div className="auth-callback-card">
        <div className="auth-spinner" />
        <h1>MetrixIQ</h1>
        <p>{message}</p>
      </div>
    </main>
  );
}
