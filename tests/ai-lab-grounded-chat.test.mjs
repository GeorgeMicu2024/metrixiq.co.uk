import test from "node:test";
import assert from "node:assert/strict";
import { connectedEvidence, localEvidenceAnswer, needsStationEvidence } from "../lib/ai-lab/grounded-chat.mjs";
import { connected360ChatContext, buildConnected360 } from "../lib/ai-lab/connected-360.mjs";
import { buildDataDoctor } from "../lib/ai-lab/data-doctor.mjs";
import { buildMorningBriefing } from "../lib/ai-lab/morning-briefing.mjs";

const snapshot = buildConnected360({ site: "DZM1", year: 2026, week: 44,
  card: { year: 2026, week: 44, overall_score: 80.49, standing: "Great",
    metrics: { dcr: { value: 99.28, standing: "Fantastic" }, lor: { value: 154, standing: "Poor" } } },
  metricRows: [{ driver_id: "PRIVATE DRIVER", source_import_id: "import-secret", period_end: "2026-11-01", lor: 0 }],
  feedbackRows: [], concessionRows: [], lorCases: [], importRows: [] });
const context = connected360ChatContext(snapshot, buildDataDoctor(snapshot), buildMorningBriefing(snapshot),
  { year: 2026, week: 43, score: 94.01, standing: "Fantastic Plus",
    metrics: { dcr: { value: 99.58 }, lor: { value: null } } });

test("Connected evidence identifies exact official period and previous available score", () => {
  const data = connectedEvidence(context);
  assert.equal(data.site, "DZM1");
  assert.equal(data.week, 44);
  assert.equal(data.score, 80.49);
  assert.equal(data.previous.score, 94.01);
  assert(data.metrics.some(item => item.name === "Lost on Road" && item.value === "154"));
  assert(data.metricChanges.some(item => item.name === "DCR" && item.delta === -0.3));
  assert.equal(JSON.parse(context).previousOfficial.tier, "Fantastic Plus");
});

test("Local briefing cites real imported values and never exposes private rows", () => {
  const reply = localEvidenceAnswer(context);
  assert.match(reply, /DZM1.*W44 2026/);
  assert.match(reply, /80\.49/);
  assert.match(reply, /W43 2026.*94\.01/);
  assert.match(reply, /-13\.52 points/);
  assert.match(reply, /Lost on Road 154/);
  assert.match(reply, /DCR 99\.58 → 99\.28/);
  assert.doesNotMatch(reply, /PRIVATE DRIVER|import-secret/);
});

test("No verified report means an honest missing-source response", () => {
  assert.equal(connectedEvidence("{invalid"), null);
  assert.equal(connectedEvidence(JSON.stringify({ site: "DZM1", year: 2026, week: 44 })), null);
  assert.match(localEvidenceAnswer(""), /don't have a verified station report/);
  const missingPrevious = connected360ChatContext(snapshot, buildDataDoctor(snapshot), buildMorningBriefing(snapshot),
    { year: 2026, week: 43, score: null });
  assert.equal(JSON.parse(missingPrevious).previousOfficial, null);
});

test("Questions about station results demand evidence, definitions do not", () => {
  for (const question of ["Why is our DZM1 scorecard down?", "What are today's priorities?",
    "Compare W43 and W44 IADC", "How did we do on DCR last week?", "Tell me my latest POD score",
    "What happened at DZM1 yesterday?", "What should we do this morning for our drivers?"]) {
    assert.equal(needsStationEvidence(question), true, question);
  }
  for (const question of ["What is IADC?", "Explain the meaning of POD", "Write a general safety reminder"]) {
    assert.equal(needsStationEvidence(question), false, question);
  }
});
