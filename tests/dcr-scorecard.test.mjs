import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { dcrSourceSite, isScorecardDcrRow } from "../lib/data/dcr.js";

const read = (path) =>
  fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("DCR workspace is weekly and scorecard-backed", () => {
  const data = read("lib/data/dcr.js");
  const view = read("components/operations/DcrScorecardView.jsx");
  const router = read("components/operations/IadcView.jsx");

  assert.ok(data.includes('.not("dcr", "is", null)'));
  assert.ok(data.includes('granularity !== "weekly"'));
  assert.ok(data.includes("dcrSourceSite(row) === wantedSite"));
  assert.ok(data.includes("historical duplicates"));

  assert.ok(view.includes("fetchDcrScorecardRows"));
  assert.ok(view.includes("Source: DSP Scorecard"));
  assert.ok(view.includes("Daily operational records are excluded"));
  assert.ok(view.includes("DCR Driver Ranking"));
  assert.ok(view.includes("Gap to target"));

  assert.ok(router.includes('if(metric==="dcr") return <DcrScorecardView'));
});

test("DCR source filename wins over a historically wrong stored site", () => {
  const row = {
    dcr: 99.5,
    site: "DDN1",
    scorecard_score: null,
    week_label: "W38",
    raw_data: {
      metric_granularity: "weekly",
      calendar_week: "W38",
      source_files: ["UK-DCSL-DLS2-Week38-DSP-Scorecard-3.0.pdf"],
      activity_site: "DDN1",
    },
  };

  assert.equal(isScorecardDcrRow(row), true);
  assert.equal(dcrSourceSite(row), "DLS2");
});

test("scorecard spreadsheet DCR uses embedded filename site", () => {
  const row = {
    dcr: 98.8,
    site: "DDN1",
    scorecard_score: 72,
    week_label: "W39",
    raw_data: {
      metric_granularity: "weekly",
      calendar_week: "W39",
      source_files: ["DDN1.xlsx"],
    },
  };

  assert.equal(isScorecardDcrRow(row), true);
  assert.equal(dcrSourceSite(row), "DDN1");
});
