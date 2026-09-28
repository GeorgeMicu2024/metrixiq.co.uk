"use client";

import { useReportWebVitals } from "next/web-vitals";

function metricValue(metric) {
  if (metric.name === "CLS") return Math.round(metric.value * 1000);
  return Math.round(metric.value);
}

export default function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    if (typeof window === "undefined" || typeof window.gtag !== "function") return;

    window.gtag("event", "web_vital", {
      metric_name: metric.name,
      metric_id: metric.id,
      metric_value: metricValue(metric),
      metric_delta: Math.round(metric.delta || 0),
      metric_rating: metric.rating || "",
      non_interaction: true,
    });
  });

  return null;
}
