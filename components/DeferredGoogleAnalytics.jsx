"use client";

import { lazy, Suspense, useEffect, useState } from "react";

const GoogleAnalytics = lazy(() => import("./GoogleAnalytics"));
const CONSENT_COOKIE = "metrixiq_analytics_consent";

function readConsent() {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${CONSENT_COOKIE}=`));
  const value = match?.split("=")[1] || "";
  return value === "accepted" || value === "rejected" ? value : null;
}

export default function DeferredGoogleAnalytics() {
  const enabled = Boolean(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID);
  const [ready, setReady] = useState(false);
  const [openSettingsToken, setOpenSettingsToken] = useState(0);

  useEffect(() => {
    if (!enabled) return undefined;

    const consent = readConsent();
    if (consent === "accepted") {
      setReady(true);
    }

    const openSettings = (event) => {
      const trigger = event.target?.closest?.("[data-cookie-settings]");
      if (!trigger) return;
      setReady(true);
      setOpenSettingsToken((value) => value + 1);
    };

    document.addEventListener("click", openSettings, true);

    let idleId = null;
    let timerId = null;

    const loadConsentUi = () => {
      if (consent === "accepted") return;
      if ("requestIdleCallback" in window) {
        idleId = window.requestIdleCallback(() => setReady(true), { timeout: 2200 });
      } else {
        timerId = window.setTimeout(() => setReady(true), 1600);
      }
    };

    if (document.readyState === "complete") {
      loadConsentUi();
    } else {
      window.addEventListener("load", loadConsentUi, { once: true });
    }

    return () => {
      document.removeEventListener("click", openSettings, true);
      window.removeEventListener("load", loadConsentUi);
      if (idleId !== null && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleId);
      }
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, [enabled]);

  if (!enabled || !ready) return null;

  return (
    <Suspense fallback={null}>
      <GoogleAnalytics openSettingsToken={openSettingsToken} />
    </Suspense>
  );
}
