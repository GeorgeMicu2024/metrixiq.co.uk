import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { scorecardSiteSummary } from "../lib/analyzer/pdf.js";

test("weekly site scorecard uses metric values from the scorecard page", () => {
  const resources = `
Resources
DCR - Delivery Completion Rate
CC - Contact Compliance
Lost on Road (LoR) DPMO
UK/IE OSM UK/IE BO DE/AT ES FR BE NL IT
`;

  const weekly = `
DSP WEEKLY SCORECARD
DCSL at DLS2
Week 39 - 2026
Overall Score: 82.48 | Great
Vehicle Audit (VSA) Compliance 100%|Fantastic
Delivery Completion Rate (DCR) 99.14%|Fantastic
Delivery Success Conditions (DSC DPMO) 911|Great
Lost on Road (LoR) DPMO 0|Fantastic
Contact Compliance 98.73%|Great
`;

  const summary = scorecardSiteSummary(
    "UK-DCSL-DLS2-Week39-DSP-Scorecard-3.0.pdf",
    {
      pageTexts: [resources, weekly],
      layoutPageTexts: [resources, weekly],
    },
    { year: 2026, week: 39, weekLabel: "W39" }
  );

  assert.equal(summary.site, "DLS2");
  assert.deepEqual(summary.metrics.dcr, { value: 99.14, standing: "Fantastic" });
  assert.deepEqual(summary.metrics.dsc_dpmo, { value: 911, standing: "Great" });
  assert.deepEqual(summary.metrics.lor, { value: 0, standing: "Fantastic" });
  assert.deepEqual(summary.metrics.cc, { value: 98.73, standing: "Great" });
  assert.deepEqual(summary.metrics.vsa, { value: 100, standing: "Fantastic" });
});

test("invalid scorecard prose is never treated as a numeric metric", () => {
  const weekly = `
DSP WEEKLY SCORECARD
DCSL at DLS2
Week 39 - 2026
Overall Score: 82.48 | Great
Delivery Completion Rate (DCR) See details on next page
Contact Compliance UK/IE OSM UK/IE BO DE/AT ES FR BE NL IT
Lost on Road (LoR) DPMO 2. Delivery Completion Rate (DCR)
`;

  const summary = scorecardSiteSummary(
    "UK-DCSL-DLS2-Week39-DSP-Scorecard-3.0.pdf",
    [weekly],
    { year: 2026, week: 39, weekLabel: "W39" }
  );

  assert.equal(summary.metrics.dcr, null);
  assert.equal(summary.metrics.cc, null);
  assert.equal(summary.metrics.lor, null);
});

test("Site Performance does not replace a missing scorecard metric with driver averages", () => {
  const home = fs.readFileSync("components/dashboard/HomeView.jsx", "utf8");
  const start = home.indexOf("const sourceMetric=(card,key)=>");
  const end = home.indexOf("const siteMetric=", start);
  const block = home.slice(start, end);
  assert.ok(block.includes("return safe(direct);"));
  assert.equal(block.includes("scorecardRowsFor(card)"), false);
  assert.equal(block.includes("values.push"), false);
});
