import {
  apiError,
  requireIntegrationUser,
} from "../../../lib/integrations/serverV9";
import { testDeliveryConnection } from "../../../lib/integrations/deliveryV9";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = String(body?.organizationId || "");
    const connectionId = String(body?.connectionId || "");
    if (!organizationId || !connectionId) {
      return Response.json({ error: "Workspace and connection are required." }, { status: 400 });
    }

    const { admin } = await requireIntegrationUser(request, organizationId, "manage_delivery");
    const { data: connection, error } = await admin
      .from("delivery_connections")
      .select("id,organization_id,provider,config_ciphertext")
      .eq("id", connectionId)
      .eq("organization_id", organizationId)
      .single();
    if (error) throw error;

    let result;
    try {
      result = await testDeliveryConnection(connection.provider, connection.config_ciphertext);
      await admin.rpc("mark_delivery_connection_test", {
        p_connection_id: connectionId,
        p_success: Boolean(result.ok),
        p_error: result.ok ? null : "HTTP " + result.status + ": " + result.body,
      });
    } catch (error) {
      await admin.rpc("mark_delivery_connection_test", {
        p_connection_id: connectionId,
        p_success: false,
        p_error: error?.message || "Connection test failed.",
      });
      throw error;
    }

    return Response.json(
      { ok: result.ok, status: result.status, response: result.body },
      { status: result.ok ? 200 : 502, headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    return apiError(error);
  }
}
