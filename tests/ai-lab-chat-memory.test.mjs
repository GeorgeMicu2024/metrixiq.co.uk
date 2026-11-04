import test from "node:test";
import assert from "node:assert/strict";
import { approvedChatMemory, memoryStation, retrievalQuery } from "../lib/ai-lab/chat-memory.mjs";

const notes = [
  { id: "a", site: "DZM1", lesson: "Verify staging lanes and loading order before dispatch" },
  { id: "b", site: "DLS2", lesson: "Always check parking allocations separately" },
  { id: "c", site: null, lesson: "Customer delivery notes should not replace NOA" },
];

test("AI memory chooses a station from the question and excludes unrelated sites", () => {
  assert.equal(memoryStation("", "Ce reguli avem la DZM1?"), "DZM1");
  const result = approvedChatMemory(notes, "Cum verific staging la DZM1?", "", [{ id: "b", similarity: .94 }]);
  assert.deepEqual(result.matches.map(x => x.id), ["a"]);
  assert(!result.context.includes("DLS2"));
});

test("AI memory only includes relevant approved notes, never all notes", () => {
  const found = approvedChatMemory(notes, "NOA customer", "", [{ id: "a", similarity: .95 }]);
  assert.deepEqual(found.matches.map(x => x.id), ["c"]);
  assert.equal(approvedChatMemory(notes, "x", "DZM1").matches.length, 0);
});

test("AI memory omits personal identifiers before semantic retrieval", () => {
  assert(!retrievalQuery("parcel UK5043217812 and a@b.co.uk").includes("UK5043217812"));
  assert(!retrievalQuery("parcel UK5043217812 and a@b.co.uk").includes("a@b.co.uk"));
  const dirty = [{ id: "z", site: null, lesson: "Driver phone +447700900123 needs action" }];
  assert.equal(approvedChatMemory(dirty, "driver phone").matches.length, 0);
});

test("AI memory context is bounded to five approved notes and 1900 characters", () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ id: String(i), site: null, lesson: "Check IADC NOA proof " + i + " before delivery" }));
  const selected = approvedChatMemory(many, "IADC NOA", "");
  assert.equal(selected.matches.length, 5);
  assert(selected.context.length <= 1900);
});
