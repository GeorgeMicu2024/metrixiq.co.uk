import crypto from "node:crypto";
import {
  apiError,
  assertSafeHttpsUrl,
  encryptIntegrationConfig,
  requireIntegrationUser,
} from "../../../lib/integrations/serverV9";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = String(body?.organizationId || "");
    if (!organizationId) return Response.json({ error: "Workspace is required." }, { status: 400 });

    const { scoped } = await requireIntegrationUser(request, organizationId, "manage_webhooks");
    const url = String(body?.url || "");
    await assertSafeHttpsUrl(url);

    const endpointId = body?.id || null;
    const rotate = !endpointId || body?.rotateSecret === true;
    const secret = rotate ? "whsec_" + crypto.randomBytes(32).toString("base64url") : null;
    const ciphertext = secret ? encryptIntegrationConfig({ secret }) : null;

    const { data: id, error } = await scoped.rpc("upsert_webhook_endpoint_record", {
      p_organization_id: organizationId,
      p_endpoint_id: endpointId,
      p_name: String(body?.name || "").trim(),
      p_url: url,
      p_secret_ciphertext: ciphertext,
      p_event_types: Array.isArray(body?.eventTypes) ? body.eventTypes.map(String) : [],
      p_enabled: body?.enabled !== false,
    });
    if (error) throw error;

    return Response.json({
      id,
      signing_secret: secret,
      warning: secret ? "The webhook signing secret is shown once." : null,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
