import { calculateDriverScorecard } from "../scorecards/driverScoreFormula";
import { rowsToCsv } from "./serverV9";

export function intParam(value, fallback, max = 500) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(n, max));
}

export function scorecardApiRow(row) {
  const calculated = calculateDriverScorecard(row);
  return {
    id: row.id,
    driver_id: row.driver_id,
    trid: row.drivers?.trid || null,
    driver_name: row.drivers?.full_name || null,
    site: row.drivers?.site || null,
    week_label: row.week_label,
    period_start: row.period_start,
    period_end: row.period_end,
    total_score: calculated.value,
    score_coverage: calculated.coverage,
    tier: calculated.value == null ? null :
      calculated.value >= 93 ? "Fantastic Plus" :
      calculated.value >= 85 ? "Fantastic" :
      calculated.value >= 70 ? "Great" :
      calculated.value >= 50 ? "Fair" : "Poor",
    fico: row.mentor_score ?? row.ementor ?? row.fico ?? null,
    dcr: row.dcr,
    dsc_dpmo: row.dsc_dpmo,
    lor: row.lor,
    pod: row.pod,
    cc: row.cc,
    ce_dpmo: row.ce_dpmo,
    cdf_dpmo: row.cdf_dpmo,
    psb: row.psb,
    concessions: row.concessions,
    delivered: row.delivered,
    iadc: row.iadc,
    reattempts: row.reattempts,
  };
}

export function apiDataResponse(data, request, meta = {}) {
  const url = new URL(request.url);
  const format = String(url.searchParams.get("format") || "").toLowerCase();
  if (format === "csv") {
    const rows = Array.isArray(data) ? data : [data];
    const csv = rowsToCsv(rows);
    return {
      response: new Response(csv, {
        status: 200,
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": 'attachment; filename="metrixiq-export.csv"',
          "cache-control": "no-store",
        },
      }),
      bodyForMetering: csv,
    };
  }

  const body = { data, meta };
  return {
    response: Response.json(body, { headers: { "cache-control": "no-store" } }),
    bodyForMetering: body,
  };
}
