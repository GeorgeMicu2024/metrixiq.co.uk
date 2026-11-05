import test from "node:test";
import assert from "node:assert/strict";
import { ASSISTANT_STARTERS, assistantFollowUps } from "../lib/ai-lab/assistant-experience.mjs";

test("assistant starts with concrete DSP tasks rather than empty chit-chat", () => {
  assert.equal(ASSISTANT_STARTERS.length, 4);
  assert(ASSISTANT_STARTERS.every(item => item.label && item.prompt && /evidence|check|report|driver/i.test(item.prompt)));
});

test("follow-up suggestions respond to the question without exposing source data", () => {
  const messages = [{ role: "user", content: "Why did DZM1 IADC fall below 80%?" },
    { role: "assistant", content: "This needs a week-specific report." }];
  assert.equal(assistantFollowUps(messages)[0].label, "Prioritise fixes");
  assert.equal(assistantFollowUps([{ role: "user", content: "Check Wave Plan" },
    { role: "assistant", content: "Check route IDs." }])[0].label, "Pre-dispatch checklist");
  assert.equal(assistantFollowUps([{ role: "user", content: "Hello" }]).length, 0);
  assert(!JSON.stringify(assistantFollowUps(messages)).includes("DZM1"));
});
