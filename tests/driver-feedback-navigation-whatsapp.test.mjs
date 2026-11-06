import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { NAV_GROUPS } from "../components/dashboard/navigation.js";

test("Driver Feedback appears immediately after Driver Scorecards exactly once", () => {
  const quickAccess = NAV_GROUPS.find((group) => group.label === "QUICK ACCESS");
  const scorecardsIndex = quickAccess.items.findIndex(([id]) => id === "driver-scorecards");

  assert.ok(scorecardsIndex >= 0);
  assert.deepEqual(quickAccess.items[scorecardsIndex + 1], ["performance", "Driver Feedback"]);
  assert.equal(NAV_GROUPS.flatMap((group) => group.items).filter(([id]) => id === "performance").length, 1);
});

test("Driver Feedback launches the installed WhatsApp app and retains a web fallback", async () => {
  const source = await readFile(new URL("../components/feedback/DriverFeedbackView.jsx", import.meta.url), "utf8");
  assert.match(source, /href=\{`whatsapp:\/\/send\?text=\$\{encodeURIComponent\(draft\)\}`\}/);
  assert.match(source, /Open WhatsApp App/);
  assert.match(source, /href=\{`https:\/\/wa\.me\/\?text=\$\{encodeURIComponent\(draft\)\}`\}/);
  assert.match(source, /target="_blank" rel="noopener noreferrer"/);
  assert.match(source, /choose the driver and press Send/);

  const message = "Week 44 — Good work!\nNext: POD & IADC ✅";
  const url = `whatsapp://send?text=${encodeURIComponent(message)}`;
  assert.equal(new URL(url).searchParams.get("text"), message);
});
