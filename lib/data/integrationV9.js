async function authHeaders(supabase) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data?.session?.access_token;
  if (!token) throw new Error("Authentication required.");
  return {
    authorization: "Bearer " + token,
    "content-type": "application/json",
  };
}

async function postJson(supabase, path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: await authHeaders(supabase),
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || "Integration request failed.");
  return payload;
}

export async function fetchApiKeys(supabase, organizationId) {
  const { data, error } = await supabase.rpc("list_api_keys", { p_organization_id: organizationId });
  if (error) throw error;
  return data || [];
}

export async function createApiKey(supabase, payload) {
  return postJson(supabase, "/api/integrations/api-keys", payload);
}

export async function revokeApiKey(supabase, apiKeyId) {
  const { error } = await supabase.rpc("revoke_api_key", { p_api_key_id: apiKeyId });
  if (error) throw error;
}

export async function fetchApiUsage(supabase, organizationId, hours = 168) {
  const { data, error } = await supabase.rpc("list_api_usage", {
    p_organization_id: organizationId,
    p_hours: hours,
  });
  if (error) throw error;
  return data || [];
}

export async function fetchWebhookEndpoints(supabase, organizationId) {
  const { data, error } = await supabase.rpc("list_webhook_endpoints", { p_organization_id: organizationId });
  if (error) throw error;
  return data || [];
}

export async function saveWebhookEndpoint(supabase, payload) {
  return postJson(supabase, "/api/integrations/webhooks", payload);
}

export async function deleteWebhookEndpoint(supabase, endpointId) {
  const { error } = await supabase.rpc("delete_webhook_endpoint", { p_endpoint_id: endpointId });
  if (error) throw error;
}

export async function queueWebhookTest(supabase, organizationId) {
  const { data, error } = await supabase.rpc("emit_webhook_event", {
    p_organization_id: organizationId,
    p_event_type: "webhook.test",
    p_event_key: "manual:" + Date.now(),
    p_source_type: "developer_platform",
    p_source_id: null,
    p_payload: { message: "MetrixIQ webhook test", timestamp: new Date().toISOString() },
  });
  if (error) throw error;
  return data;
}

export async function fetchWebhookDeliveries(supabase, organizationId, limit = 250) {
  const { data, error } = await supabase.rpc("list_webhook_deliveries", {
    p_organization_id: organizationId,
    p_limit: limit,
  });
  if (error) throw error;
  return data || [];
}

export async function fetchDeliveryConnections(supabase, organizationId) {
  const { data, error } = await supabase.rpc("list_delivery_connections", { p_organization_id: organizationId });
  if (error) throw error;
  return data || [];
}

export async function saveDeliveryConnection(supabase, payload) {
  return postJson(supabase, "/api/integrations/connections", payload);
}

export async function deleteDeliveryConnection(supabase, connectionId) {
  const { error } = await supabase.rpc("delete_delivery_connection", { p_connection_id: connectionId });
  if (error) throw error;
}

export async function testDeliveryConnection(supabase, organizationId, connectionId) {
  return postJson(supabase, "/api/integrations/test", { organizationId, connectionId });
}

export async function fetchIntegrationDeliveryHealth(supabase, organizationId) {
  const { data, error } = await supabase.rpc("get_integration_delivery_health", { p_organization_id: organizationId });
  if (error) throw error;
  return data || {};
}

export async function fetchIntegrationV9Data(supabase, organizationId) {
  const [apiKeys, usage, webhooks, webhookDeliveries, connections, health] = await Promise.all([
    fetchApiKeys(supabase, organizationId),
    fetchApiUsage(supabase, organizationId, 168),
    fetchWebhookEndpoints(supabase, organizationId),
    fetchWebhookDeliveries(supabase, organizationId, 250),
    fetchDeliveryConnections(supabase, organizationId),
    fetchIntegrationDeliveryHealth(supabase, organizationId),
  ]);
  return { apiKeys, usage, webhooks, webhookDeliveries, connections, health };
}
