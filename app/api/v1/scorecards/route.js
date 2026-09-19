import { authenticatePublicApi, apiError, recordApiResult } from "../../../../lib/integrations/serverV9";
import { apiDataResponse, intParam, scorecardApiRow } from "../../../../lib/integrations/publicApiV9";

export const runtime = "nodejs";

const SELECT = "id,driver_id,week_label,period_start,period_end,dcr,pod,iadc,cc,fico,ementor,mentor_score,psb,reattempts,concessions,lor,delivered,dsc_dpmo,ce_dpmo,cdf_dpmo,raw_data,drivers!inner(id,trid,full_name,site,status)";

export async function GET(request) {
  let context;
  try {
    context = await authenticatePublicApi(request, "scorecards:read");
    const { admin, auth } = context;
    const url = new URL(request.url);
    const limit = intParam(url.searchParams.get("limit"), 250, 1000);
    const offset = intParam(url.searchParams.get("offset"), 0, 100000);
    const week = url.searchParams.get("week");
    const site = url.searchParams.get("site");

    let query = admin
      .from("driver_metrics")
      .select(SELECT, { count: "exact" })
      .eq("organization_id", auth.organization_id)
      .order("period_end", { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);

    if (week) query = query.eq("week_label", week.toUpperCase());
    if (site) query = query.eq("drivers.site", site.toUpperCase());

    const { data, error, count } = await query;
    if (error) throw error;
    const rows = (data || []).map(scorecardApiRow);

    const output = apiDataResponse(rows, request, {
      organization_id: auth.organization_id,
      formula: "driver-point-bands-v2",
      limit,
      offset,
      total: count ?? null,
    });
    await recordApiResult(admin, auth, output.bodyForMetering, false);
    return output.response;
  } catch (error) {
    if (context?.admin && context?.auth) await recordApiResult(context.admin, context.auth, { error: error?.message }, true);
    return apiError(error);
  }
}
