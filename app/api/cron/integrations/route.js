import { getSupabaseAdmin } from "../../../../lib/billing/stripeServer";
import { deliverOutgoingWebhook, deliverQueueMessage } from "../../../../lib/integrations/deliveryV9";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function processWebhook(admin, job) {
  try {
    const result = await deliverOutgoingWebhook(job);
    await admin.rpc("complete_webhook_delivery", {
      p_delivery_id: job.delivery_id,
      p_success: result.ok,
      p_response_status: result.status,
      p_response_body: result.body || "",
      p_error: result.ok ? null : "HTTP " + result.status,
    });
    return result.ok;
  } catch (error) {
    await admin.rpc("complete_webhook_delivery", {
      p_delivery_id: job.delivery_id,
      p_success: false,
      p_response_status: null,
      p_response_body: "",
      p_error: error?.message || "Webhook delivery failed.",
    });
    return false;
  }
}

async function processDelivery(admin, job) {
  try {
    const result = await deliverQueueMessage(job);
    await admin.rpc("complete_delivery_message", {
      p_queue_id: job.queue_id,
      p_connection_id: job.connection_id,
      p_success: result.ok,
      p_response_status: result.status,
      p_error: result.ok ? null : "HTTP " + result.status + ": " + (result.body || ""),
    });
    return result.ok;
  } catch (error) {
    await admin.rpc("complete_delivery_message", {
      p_queue_id: job.queue_id,
      p_connection_id: job.connection_id,
      p_success: false,
      p_response_status: null,
      p_error: error?.message || "External delivery failed.",
    });
    return false;
  }
}

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !process.env.INTEGRATION_ENCRYPTION_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json(
      { ok: false, error: "Integration worker environment is not configured." },
      { status: 503, headers: { "cache-control": "no-store" } }
    );
  }

  if ((request.headers.get("authorization") || "") !== "Bearer " + secret) {
    return Response.json(
      { ok: false, error: "Unauthorized." },
      { status: 401, headers: { "cache-control": "no-store" } }
    );
  }

  const admin = getSupabaseAdmin();
  const [webhookResult, deliveryResult] = await Promise.all([
    admin.rpc("claim_webhook_deliveries", { p_limit: 40 }),
    admin.rpc("claim_delivery_messages", { p_limit: 40 }),
  ]);

  if (webhookResult.error) {
    return Response.json({ ok: false, error: webhookResult.error.message }, { status: 500 });
  }
  if (deliveryResult.error) {
    return Response.json({ ok: false, error: deliveryResult.error.message }, { status: 500 });
  }

  let webhookSucceeded = 0;
  let deliverySucceeded = 0;

  for (const job of webhookResult.data || []) {
    if (await processWebhook(admin, job)) webhookSucceeded += 1;
  }
  for (const job of deliveryResult.data || []) {
    if (await processDelivery(admin, job)) deliverySucceeded += 1;
  }

  return Response.json({
    ok: true,
    worker: "integration-delivery-v9",
    webhooks: {
      claimed: webhookResult.data?.length || 0,
      succeeded: webhookSucceeded,
      failed: (webhookResult.data?.length || 0) - webhookSucceeded,
    },
    deliveries: {
      claimed: deliveryResult.data?.length || 0,
      succeeded: deliverySucceeded,
      failed: (deliveryResult.data?.length || 0) - deliverySucceeded,
    },
    timestamp: new Date().toISOString(),
  }, { headers: { "cache-control": "no-store" } });
}
