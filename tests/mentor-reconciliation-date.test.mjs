import test from "node:test";
import assert from "node:assert/strict";
import { storeUnmatched } from "../lib/persistence/identity.js";

function mentorRow(reportDate, key, weekLabel = "W39") {
  return {
    report_type: "mentor_daily",
    week_label: weekLabel,
    raw_trid: null,
    raw_name: null,
    normalized_name: null,
    payload: {
      reportDate,
      score: 800,
      driver: {
        mentorHash: key,
        details: { mentor: { identityKey: key } },
      },
    },
    status: "open",
  };
}

test("daily eMentor reconciliation deduplicates by report date, not week", async () => {
  const inserted = [];
  const existing = [
    {
      reconciliation_key: "MENTOR-ACCOUNT-1",
      payload: { reportDate: "2026-09-25" },
    },
  ];

  const supabase = {
    from(table) {
      assert.equal(table, "unmatched_driver_records");
      return {
        select(columns) {
          assert.equal(columns, "reconciliation_key,payload");
          return {
            eq() { return this; },
            in(column, values) {
              assert.equal(column, "reconciliation_key");
              assert.deepEqual(values, ["MENTOR-ACCOUNT-1"]);
              return Promise.resolve({ data: existing, error: null });
            },
          };
        },
        insert(rows) {
          inserted.push(...rows);
          return {
            select: async (columns) => {
              assert.equal(columns, "id");
              return {
                data: rows.map((_, index) => ({ id: String(index + 1) })),
                error: null,
              };
            },
          };
        },
      };
    },
  };

  const saved = await storeUnmatched(supabase, "org-1", [
    mentorRow("2026-09-25", "MENTOR-ACCOUNT-1"),
    mentorRow("2026-09-26", "MENTOR-ACCOUNT-1"),
  ]);

  assert.equal(saved, 1);
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].payload.reportDate, "2026-09-26");
  assert.equal(inserted[0].reconciliation_key, "MENTOR-ACCOUNT-1");
});
