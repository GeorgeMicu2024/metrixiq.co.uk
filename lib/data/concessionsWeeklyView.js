import { buildFourWeekConcessionMatrix } from "./concessions.js";

// Assemble a single-week report without losing affected drivers who are absent
// from the latest roster. The roster adds zero-DNR drivers only; concessions
// remain sourced exclusively from verified weekly snapshots.
export function buildSingleWeekConcessionRows(snapshotRows, site, week, latestRoster = [], fallbackRoster = []) {
  if (!site || !week) return [];

  const snapshotRowsForWeek = buildFourWeekConcessionMatrix(snapshotRows, site, [week]);
  const byTrid = new Map(snapshotRowsForWeek.map((row) => [String(row.driver_trid || "").trim().toUpperCase(), row]));
  const roster = latestRoster.length ? latestRoster : fallbackRoster;

  for (const driver of roster) {
    const trid = String(driver?.trid || driver?.id || "").trim().toUpperCase();
    if (!trid) continue;
    const existing = byTrid.get(trid);
    if (existing) {
      byTrid.set(trid, {
        ...existing,
        driver_id: existing.driver_id || driver?.dbId || null,
        driver_name: driver?.name || existing.driver_name,
      });
      continue;
    }
    byTrid.set(trid, {
      driver_id: driver?.dbId || null,
      driver_trid: trid,
      driver_name: driver?.name || trid,
      site,
      byWeek: { [week]: 0 },
      total: 0,
      affectedWeeks: 0,
    });
  }

  return [...byTrid.values()].sort(
    (a, b) =>
      Number(b.byWeek?.[week] || 0) - Number(a.byWeek?.[week] || 0) ||
      String(a.driver_name).localeCompare(String(b.driver_name))
  );
}

// Preserve every verified DNR driver across the selected weeks, including
// drivers no longer present on the latest site roster. Roster-only entries
// remain visible with zero DNR and must not inflate affected-driver KPIs.
export function buildMultiWeekConcessionRows(snapshotRows, site, weeks, latestRoster = [], fallbackRoster = []) {
  const snapshotMatrix = buildFourWeekConcessionMatrix(snapshotRows, site, weeks);
  const roster = latestRoster.length ? latestRoster : fallbackRoster;
  if (!roster.length) return snapshotMatrix;

  const byTrid = new Map(snapshotMatrix.map((row) => [String(row.driver_trid || "").trim().toUpperCase(), row]));
  for (const driver of roster) {
    const trid = String(driver?.trid || driver?.id || "").trim().toUpperCase();
    if (!trid) continue;
    const existing = byTrid.get(trid);
    if (existing) {
      byTrid.set(trid, {
        ...existing,
        driver_id: existing.driver_id || driver?.dbId || null,
        driver_name: driver?.name || existing.driver_name || trid,
        site,
      });
    } else {
      byTrid.set(trid, {
        driver_id: driver?.dbId || null,
        driver_trid: trid,
        driver_name: driver?.name || trid,
        site,
        byWeek: Object.fromEntries(weeks.map((week) => [week, 0])),
        total: 0,
        affectedWeeks: 0,
      });
    }
  }

  return [...byTrid.values()].sort(
    (a, b) =>
      b.total - a.total ||
      b.affectedWeeks - a.affectedWeeks ||
      a.driver_name.localeCompare(b.driver_name)
  );
}

export function concessionExportPages(rows, pageSize = 25) {
  const pages = [];
  for (let offset = 0; offset < rows.length; offset += pageSize) {
    pages.push(rows.slice(offset, offset + pageSize));
  }
  return pages;
}

export function weeklyConcessionTone(value) {
  const count = Number(value || 0);
  if (count <= 0) return "zero";
  if (count <= 2) return "one";
  if (count <= 4) return "two";
  return "high";
}
