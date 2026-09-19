import { authenticatePublicApi, apiError, recordApiResult } from "../../../../lib/integrations/serverV9";
import { apiDataResponse, intParam } from "../../../../lib/integrations/publicApiV9";

export const runtime = "nodejs";

export async function GET(request) {
  let context;
  try {
    context = await authenticatePublicApi(request, "workflows:read");
    const { admin, auth } = context;
    const url = new URL(request.url);
    const limit = intParam(url.searchParams.get("limit"), 250, 1000);
    const status = url.searchParams.get("status");

    let query = admin
      .from("workflow_instances")
      .select("id,driver_id,site,week_label,title,status,current_step,assigned_to,due_at,completed_at,source_type,source_id,created_at,updated_at,workflow_playbooks(playbook_key,name),drivers(trid,full_name,site)")
      .eq("organization_id", auth.organization_id)
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (status) query = query.eq("status", status);

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
