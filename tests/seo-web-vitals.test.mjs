import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) =>
  fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Core Web Vitals telemetry uses the Next web-vitals hook", () => {
  const reporter = read("components/WebVitalsReporter.jsx");
  const layout = read("app/layout.jsx");

  assert.ok(reporter.includes('useReportWebVitals'));
  assert.ok(reporter.includes('window.gtag("event", "web_vital"'));
  assert.ok(reporter.includes('typeof window.gtag !== "function"'));
  assert.ok(reporter.includes('metric_name: metric.name'));
  assert.ok(reporter.includes('metric_rating: metric.rating'));
  assert.ok(layout.includes("<WebVitalsReporter />"));
});

test("CLS is scaled for GA event value while timing metrics are rounded", () => {
  const reporter = read("components/WebVitalsReporter.jsx");

  assert.ok(reporter.includes('metric.name === "CLS"'));
  assert.ok(reporter.includes("metric.value * 1000"));
  assert.ok(reporter.includes("Math.round(metric.value)"));
});
