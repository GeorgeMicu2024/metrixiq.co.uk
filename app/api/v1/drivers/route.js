import { authenticatePublicApi, apiError, recordApiResult } from "../../../../lib/integrations/serverV9";
import { apiDataResponse, intParam } from "../../../../lib/integrations/publicApiV9";

export const runtime = "nodejs";

export async function GET(request) {
  let context;
  try {
    context = await authenticatePublicApi(request, "drivers:read");
    const { admin, auth } = context;
    const url = new URL(request.url);
    const limit = intParam(url.searchParams.get("limit"), 200, 500);
    const offset = intParam(url.searchParams.get("offset"), 0, 100000);
    const site = url.searchParams.get("site");
    const status = url.searchParams.get("status");

    let query = admin
      .from("drivers")
      .select("id,trid,full_name,site,status", { count: "exact" })
      .eq("organization_id", auth.organization_id)
      .order("full_name")
      .range(offset, offset + limit - 1);

    if (site) query = query.eq("site", site.toUpperCase());
    if (status) query = query.eq("status", status);

    const { data, error, count } = await query;
    if (error) throw error;

    const output = apiDataResponse(data || [], request, {
      organization_id: auth.organization_id,
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
