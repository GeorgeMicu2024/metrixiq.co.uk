"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../../../lib/supabase/client";

function safeInternalPath(value) {
  const candidate = String(value || "").trim();
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\")) {
    return "/app";
  }

  try {
    const parsed = new URL(candidate, window.location.origin);
    if (parsed.origin !== window.location.origin) return "/app";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/app";
  }
}

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const requestedNext = new URLSearchParams(window.location.search).get("next");
    const next = safeInternalPath(requestedNext);
    let active = true;

    async function complete() {
      const { data, error } = await supabase.auth.getSession();
      if (!active) return;
      if (error) {
        router.replace(`/login?auth_error=${encodeURIComponent(error.message || "Authentication failed")}`);
        return;
      }
      if (data.session) {
        router.replace(next);
        return;
      }
      window.setTimeout(() => { if (active) router.replace("/login?auth_error=Authentication%20confirmation%20timed%20out"); }, 2500);
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

  return <main className="oauth-handoff" aria-label="Completing sign in" />;
}
