import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("components/scorecards/ScorecardViews.jsx", "utf8");
const siteView = source.split("export function SiteScorecardsView(")[1]?.split("function LegacyDriverScorecardsView(")[0] || "";

test("Site Scorecards loads only lightweight site scorecards", () => {
  assert.ok(siteView.includes("fetchSiteCards(supabase, organizationId)"));
  assert.equal(siteView.includes("fetchSiteScorecardData("), false);
  assert.ok(siteView.includes("return { cards }"));
});

test("Site Scorecards defaults to the newest available week", () => {
  assert.ok(siteView.includes("cards.slice().sort(weekSort)"));
  assert.ok(siteView.includes("setSelectedId(sortedCards[0].id)"));
  assert.ok(siteView.includes("sortedCards.find((item) => item.id === selectedId) || sortedCards[0]"));
});
