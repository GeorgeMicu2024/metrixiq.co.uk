import {
  apiError,
  assertSafeHttpsUrl,
  encryptIntegrationConfig,
  requireIntegrationUser,
} from "../../../lib/integrations/serverV9";

export const runtime = "nodejs";

async function validateConfig(provider, config) {
  if (provider === "resend") {
    if (!config?.api_key || !config?.from || !(config?.to || config?.recipients)) {
      throw new Error("Resend requires api_key, from and to.");
    }
  } else if (provider === "slack_webhook" || provider === "teams_webhook") {
    if (!config?.webhook_url) throw new Error("Webhook URL is required.");
    await assertSafeHttpsUrl(config.webhook_url);
  } else if (provider === "generic_webhook") {
    if (!config?.url) throw new Error("Webhook URL is required.");
    await assertSafeHttpsUrl(config.url);
  } else if (provider === "whatsapp_cloud") {
    if (!config?.access_token || !config?.phone_number_id || !(config?.recipient || config?.recipients?.length)) {
      throw new Error("WhatsApp Cloud requires access_token, phone_number_id and recipient(s).");
    }
  } else {
    throw new Error("Unsupported delivery provider.");
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = String(body?.organizationId || "");
    if (!organizationId) return Response.json({ error: "Workspace is required." }, { status: 400 });

    const { scoped } = await requireIntegrationUser(request, organizationId, "manage_delivery");
    const provider = String(body?.provider || "");
    const config = body?.config && typeof body.config === "object" ? body.config : null;
    if (config) await validateConfig(provider, config);
    if (!body?.id && !config) throw new Error("Connection configuration is required.");

    const ciphertext = config ? encryptIntegrationConfig(config) : null;
    const { data: id, error } = await scoped.rpc("upsert_delivery_connection_record", {
      p_organization_id: organizationId,
      p_connection_id: body?.id || null,
      p_name: String(body?.name || "").trim(),
      p_channel: String(body?.channel || ""),
      p_provider: provider,
      p_config_ciphertext: ciphertext,
      p_enabled: body?.enabled !== false,
    });
    if (error) throw error;

    return Response.json({ id }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
