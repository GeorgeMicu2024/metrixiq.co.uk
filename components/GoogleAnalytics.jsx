"use client";

import { lazy, Suspense, useEffect, useState } from "react";
import Script from "next/script";

const CONSENT_COOKIE = "metrixiq_analytics_consent";
const CONSENT_EVENT = "metrixiq:open-cookie-settings";
const WebVitalsReporter = lazy(() => import("./WebVitalsReporter"));

function readConsent() {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${CONSENT_COOKIE}=`));
  const value = match?.split("=")[1] || "";
  return value === "accepted" || value === "rejected" ? value : null;
}

function storeConsent(value) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie =
    `${CONSENT_COOKIE}=${value}; Path=/; Max-Age=15552000; SameSite=Lax${secure}`;
}

export default function GoogleAnalytics({ openSettingsToken = 0 }) {
  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  const validMeasurementId =
    typeof measurementId === "string" && /^G-[A-Z0-9]+$/i.test(measurementId);

  const [consent, setConsent] = useState(undefined);

  useEffect(() => {
    if (!validMeasurementId) return undefined;

    setConsent(openSettingsToken ? null : readConsent());

    const openSettings = () => setConsent(null);
    window.addEventListener(CONSENT_EVENT, openSettings);

    return () => window.removeEventListener(CONSENT_EVENT, openSettings);
  }, [validMeasurementId, openSettingsToken]);

  useEffect(() => {
    if (consent !== "accepted") return undefined;

    const trackClick = (event) => {
      const target = event.target?.closest?.("[data-track-event]");
      if (!target || typeof window.gtag !== "function") return;

      let params = {};
      try {
        params = JSON.parse(target.getAttribute("data-track-params") || "{}");
      } catch {
        params = {};
      }

      window.gtag("event", target.getAttribute("data-track-event") || "cta_click", params);
    };

    document.addEventListener("click", trackClick, true);
    return () => document.removeEventListener("click", trackClick, true);
  }, [consent]);

  if (!validMeasurementId) return null;

  const choose = (value) => {
    storeConsent(value);
    setConsent(value);
  };

  return (
    <>
      {consent === "accepted" && (
        <>
          <Suspense fallback={null}>
            <WebVitalsReporter />
          </Suspense>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
            strategy="afterInteractive"
          />
          <Script id="metrixiq-ga4" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('consent', 'update', {
                analytics_storage: 'granted'
              });
              gtag('config', '${measurementId}', {
                anonymize_ip: true,
                send_page_view: true
              });
            `}
          </Script>
        </>
      )}

      {consent === null && (
        <aside className="analytics-consent" role="dialog" aria-label="Analytics cookie preferences">
          <div>
            <b>Analytics cookies</b>
            <p>
              MetrixIQ can use optional Google Analytics cookies to understand website usage
              and improve the public product experience. They are not loaded unless you accept.
            </p>
          </div>
          <div className="analytics-consent-actions">
            <button type="button" onClick={() => choose("rejected")}>Reject analytics</button>
            <button className="accept" type="button" onClick={() => choose("accepted")}>Accept analytics</button>
          </div>
        </aside>
      )}
    </>
  );
}

export { CONSENT_EVENT };
