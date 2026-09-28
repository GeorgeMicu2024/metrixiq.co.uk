"use client";

import { CONSENT_EVENT } from "./GoogleAnalytics";

export default function CookieSettingsButton() {
  const enabled = Boolean(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID);

  if (!enabled) return null;

  return (
    <button
      type="button"
      className="cookie-settings-button"
      onClick={() => window.dispatchEvent(new Event(CONSENT_EVENT))}
    >
      Cookie settings
    </button>
  );
}
