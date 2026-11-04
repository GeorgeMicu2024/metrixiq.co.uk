import test from "node:test";
import assert from "node:assert/strict";
import { mergeApprovedKnowledge } from "../lib/ai-lab/semantic-memory.mjs";

const notes = [
  { id: "one", site: "DZM1", lesson: "Check the loading lanes and departure times" },
  { id: "two", site: null, lesson: "Verify NOA contact before claiming a failed delivery" },
  { id: "three", site: "DLS2", lesson: "Separate parking from loading" },
];

test("semantic memory combines semantic and lexical evidence once", () => {
  const merged = mergeApprovedKnowledge(notes,
    [{ id: "one", relevance: 5 }, { id: "two", relevance: 2 }],
    [{ id: "two", similarity: 0.83 }], "DZM1");
  assert.deepEqual(merged.map(row => row.id), ["two", "one"]);
  assert.equal(merged[0].method, "semantic");
  assert.equal(merged[1].method, "keyword");
});

test("semantic results cannot display lessons outside the RLS-loaded site", () => {
  const merged = mergeApprovedKnowledge(notes,
    [{ id: "three", relevance: 99 }],
    [{ id: "unknown", similarity: 0.99 }, { id: "three", similarity: 0.9 },
      { id: "one", similarity: 0.1 }, { id: "two", similarity: NaN }], "DZM1");
  assert.deepEqual(merged, []);
});

test("semantic memory retains keyword fallback when server returns nothing", () => {
  const merged = mergeApprovedKnowledge(notes, [{ id: "one", relevance: 3 }], [], "DZM1");
  assert.equal(merged.length, 1);
  assert.equal(merged[0].method, "keyword");
});
