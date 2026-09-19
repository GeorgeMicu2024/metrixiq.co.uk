import { authenticatePublicApi, apiError, recordApiResult } from "../../../../lib/integrations/serverV9";
import { apiDataResponse, intParam } from "../../../../lib/integrations/publicApiV9";

export const runtime = "nodejs";

export async function GET(request) {
  let context;
  try {
    context = await authenticatePublicApi(request, "reports:read");
    const { admin, auth } = context;
    const url = new URL(request.url);
    const limit = intParam(url.searchParams.get("limit"), 100, 500);
    const week = url.searchParams.get("week");
    const site = url.searchParams.get("site");

    let query = admin
      .from("report_snapshots")
      .select("id,report_type,title,site,week_label,filters,sections,summary,payload,created_at")
      .eq("organization_id", auth.organization_id)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (week) query = query.eq("week_label", week.toUpperCase());
    if (site) query = query.eq("site", site.toUpperCase());

    const { data, error } = await query;
    if (error) throw error;
    const output = apiDataResponse(data || [], request, { organization_id: auth.organization_id, limit });
    await recordApiResult(admin, auth, output.bodyForMetering, false);
    return output.response;
  } catch (error) {
    if (context?.admin && context?.auth) await recordApiResult(context.admin, context.auth, { error: error?.message }, true);
    return apiError(error);
  }
}
