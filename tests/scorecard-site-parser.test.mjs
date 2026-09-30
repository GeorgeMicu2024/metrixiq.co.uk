import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { scorecardSiteSummary } from "../lib/analyzer/pdf.js";

const period = {
  year: 2026,
  week: 38,
  weekLabel: "W38",
};

test("site scorecard metrics come from the weekly scorecard page, not resource legends", () => {
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
Week 38 - 2026
Rank at DLS2: 5 (↓1 WoW)
Overall Score: 79.39 | Great
Compliance and Safety: Fantastic
Safety Great
Vehicle Audit (VSA) Compliance 100%|Fantastic
Breach of Contract (BOC) None
Working Hours Compliance (WHC) 99.03%|Great
Comprehensive Audit Score (CAS) In Compliance
Delivery Quality & SWC: Great
Customer Escalation DPMO 30|Great Delivery Completion Rate (DCR) 98.94%|Great
Customer Delivery Feedback 5328|Great Delivered Not Received(DNR DPMO) 1308|N/A
Lost on Road (LoR) DPMO 15|Fantastic
Photo-On-Delivery N/A
Contact Compliance 99.43%|Fantastic
Delivery Success Conditions (DSC DPMO) 702|Great
Capacity: Fantastic
Capacity Reliability 100.00%|Fantastic
Pickup Quality: Fantastic
Pickup Success Behaviours 0.00|Fantastic
Recommended Focus Areas
1. Delivery Success Conditions (DSC) DPMO
2. Delivery Completion Rate (DCR)
3. Speeding Event Rate (Per 100 Trips)
Current Week Tips
`;

  const streamWeekly = `
DSP WEEKLY SCORECARD
DCSL at DLS2
Week 38 - 2026
Rank at DLS2: 5 (↓1 WoW)
Overall Score: 79.39 | Great
? Safe Driving Metric (FICO) 817|Fantastic
? Speeding Event Rate (Per 100 Trips) 2.02|Fair
? Mentor Adoption Rate 94.52%|Fantastic
`;

  const summary = scorecardSiteSummary(
    "UK-DCSL-DLS2-Week38-DSP-Scorecard-3.0.pdf",
    {
      pageTexts: [resources, streamWeekly],
      layoutPageTexts: [resources, weekly],
    },
    period
  );

  assert.equal(summary.site, "DLS2");
  assert.equal(summary.overallScore, 79.39);
  assert.equal(summary.standing, "Great");
  assert.equal(summary.siteRank, 5);
  assert.equal(summary.rankDelta, -1);
  assert.deepEqual(summary.metrics.mentor_score, { value: 817, standing: "Fantastic" });
  assert.deepEqual(summary.metrics.dcr, { value: 98.94, standing: "Great" });
  assert.deepEqual(summary.metrics.cc, { value: 99.43, standing: "Fantastic" });
  assert.deepEqual(summary.metrics.lor, { value: 15, standing: "Fantastic" });
  assert.deepEqual(summary.metrics.dsc_dpmo, { value: 702, standing: "Great" });
  assert.deepEqual(summary.metrics.vsa, { value: 100, standing: "Fantastic" });
});

test("invalid prose beside a metric label is rejected instead of stored as a metric", () => {
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

test("dashboard does not silently replace invalid site scorecard metrics with driver averages", () => {
  const home = fs.readFileSync("components/dashboard/HomeView.jsx", "utf8");
  assert.ok(home.includes("const dcr=safe(m?.dcr?.value);"));
  assert.ok(home.includes("const cc=safe(m?.cc?.value);"));
  assert.equal(home.includes('const dcr=safe(m?.dcr?.value)??fallback(site,"dcr")'), false);
});
