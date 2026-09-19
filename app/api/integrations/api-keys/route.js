import crypto from "node:crypto";
import {
  apiError,
  generateApiKey,
  requireIntegrationUser,
} from "../../../../lib/integrations/serverV9";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = String(body?.organizationId || "");
    if (!organizationId) return Response.json({ error: "Workspace is required." }, { status: 400 });

    const { scoped } = await requireIntegrationUser(request, organizationId, "manage_api_keys");
    const generated = generateApiKey();
    const scopes = Array.isArray(body?.scopes) ? body.scopes.map(String) : [];
    const expiresAt = body?.expiresAt ? new Date(body.expiresAt).toISOString() : null;

    const { data: id, error } = await scoped.rpc("create_api_key_record", {
      p_organization_id: organizationId,
      p_name: String(body?.name || "").trim(),
      p_key_prefix: generated.prefix,
      p_key_hash: generated.hash,
      p_scopes: scopes,
      p_rate_limit_per_hour: Number(body?.rateLimitPerHour || 300),
      p_expires_at: expiresAt,
    });
    if (error) throw error;

    return Response.json({
      id,
      api_key: generated.raw,
      prefix: generated.prefix,
      scopes,
      warning: "This API key is shown once. Store it securely.",
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
