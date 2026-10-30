// Keep ranking deterministic without changing the points awarded by the
// official scorecard bands. FICO only breaks ties in the total score.
const rankNumber = (value) => {
  if (value == null || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export function compareDriverScorecardRank(a, b) {
  const scoreA = rankNumber(a?.displayScore);
  const scoreB = rankNumber(b?.displayScore);
  if (scoreA == null && scoreB != null) return 1;
  if (scoreB == null && scoreA != null) return -1;
  if (scoreA != null && scoreB != null && scoreA !== scoreB) return scoreB - scoreA;

  // For identical scorecard scores, reward the higher actual FICO.
  // Missing FICO is not treated as zero or an invented score.
  const ficoA = rankNumber(a?.mentor_score ?? a?.ementor ?? a?.fico);
  const ficoB = rankNumber(b?.mentor_score ?? b?.ementor ?? b?.fico);
  if (ficoA == null && ficoB != null) return 1;
  if (ficoB == null && ficoA != null) return -1;
  if (ficoA != null && ficoB != null && ficoA !== ficoB) return ficoB - ficoA;

  // Final stable ordering is independent of database/import insertion order.
  const nameA = String(a?.drivers?.full_name ?? a?.driver_name ?? "");
  const nameB = String(b?.drivers?.full_name ?? b?.driver_name ?? "");
  const byName = nameA.localeCompare(nameB, "en", { sensitivity: "base", numeric: true });
  if (byName) return byName;
  return String(a?.drivers?.trid ?? a?.driver_id ?? "")
    .localeCompare(String(b?.drivers?.trid ?? b?.driver_id ?? ""), "en", { numeric: true });
}

/**
 * Split the ordered team into balanced, non-empty photo pages.
 * Three images are used for a normal-sized scorecard; larger sites receive
 * extra pages so no image exceeds maxRows rows on a phone.
 */
export function splitScorecardPhotoPages(rankedRows, { preferredPages = 3, maxRows = 25 } = {}) {
  if (!Array.isArray(rankedRows) || rankedRows.length === 0) return [];
  const total = rankedRows.length;
  const pageCount = Math.min(total, Math.max(preferredPages, Math.ceil(total / maxRows)));
  const baseSize = Math.floor(total / pageCount);
  const remainder = total % pageCount;
  const pages = [];
  let offset = 0;
  for (let index = 0; index < pageCount; index += 1) {
    const size = baseSize + (index < remainder ? 1 : 0);
    pages.push({
      page: index + 1,
      start: offset + 1,
      end: offset + size,
      rows: rankedRows.slice(offset, offset + size),
    });
    offset += size;
  }
  return pages;
}
