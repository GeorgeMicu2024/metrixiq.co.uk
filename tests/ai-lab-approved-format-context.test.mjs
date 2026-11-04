import test from "node:test";
import assert from "node:assert/strict";
import { approvedFormatContext, isFormatQuestion } from "../lib/ai-lab/approved-format-context.mjs";

const wave = { id: "1", name: "Private Driver John Smith.xlsx",
  signature: "route number|driver name|UK5043217812|staging lane|load time",
  columns: { route: 0, driver: 1, staging: 3, loading: 4 } };
const route = { id: "2", name: "Some Other Private File.xlsx",
  signature: "route|transporter id|driver name",
  columns: { route: 0, trid: 1, driver: 2 } };

test("approved Wave Plan context uses only safe header aliases and positions", () => {
  const result = approvedFormatContext([wave], "Explain this Wave Plan format");
  assert.equal(result.formats.length, 1);
  assert.equal(result.formats[0].fields.staging.columnNumber, 4);
  assert.equal(result.formats[0].fields.loading.header, "load time");
  assert(!result.context.includes("John Smith"));
  assert(!result.context.includes("UK5043217812"));
  assert(!result.context.includes("Private Driver"));
  assert.match(result.context, /station.*not recorded/);
});

test("Wave and Route Plan questions select the relevant approved layouts first", () => {
  assert.equal(approvedFormatContext([route, wave], "What is the staging lane in Wave Plan?").formats[0].suggestedType, "Wave Plan candidate");
  assert.equal(approvedFormatContext([wave, route], "How are TRIDs mapped in Route Plan?").formats[0].suggestedType, "Route Plan candidate");
});

test("approved format memory never appears in unrelated questions", () => {
  assert(!isFormatQuestion("Why is DCR 98% this week?"));
  assert.equal(approvedFormatContext([wave], "Why is DCR 98% this week?").formats.length, 0);
});

test("approved format context is limited to three layouts and a small prompt", () => {
  const items = Array.from({ length: 20 }, (_, i) => ({ ...wave, id: String(i) }));
  const result = approvedFormatContext(items, "Wave Plan Excel format");
  assert.equal(result.formats.length, 3);
  assert(result.context.length <= 1850);
});
