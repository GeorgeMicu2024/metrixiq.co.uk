import crypto from "node:crypto";
import { assertSafeHttpsUrl, decryptIntegrationConfig } from "./serverV9";

const TIMEOUT_MS = 12000;

async function readResponse(response) {
  const text = await response.text().catch(() => "");
  return {
    ok: response.ok,
    status: response.status,
    body: text.slice(0, 4000),
  };
}

async function safeFetch(urlValue, options = {}) {
  const url = await assertSafeHttpsUrl(urlValue);
  const response = await fetch(url, {
    ...options,
    redirect: "error",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return readResponse(response);
}

export async function deliverOutgoingWebhook(job) {
  const secretData = decryptIntegrationConfig(job.secret_ciphertext);
  const secret = String(secretData?.secret || "");
  if (!secret) throw new Error("Webhook signing secret is not configured.");

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const envelope = {
    id: job.event_id,
    type: job.event_type,
    key: job.event_key,
    created_at: new Date().toISOString(),
    data: job.payload || {},
  };
  const body = JSON.stringify(envelope);
  const signature = crypto
    .createHmac("sha256", secret)
    .update(timestamp + "." + body)
    .digest("hex");

  return safeFetch(job.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "MetrixIQ-Webhooks/1.0",
      "x-metrixiq-event": job.event_type,
      "x-metrixiq-delivery": job.delivery_id,
      "x-metrixiq-timestamp": timestamp,
      "x-metrixiq-signature": "v1=" + signature,
    },
    body,
  });
}

function messageText(job) {
  const parts = [
    job.title,
    job.message,
    job.site ? "Site: " + job.site : "",
    "Severity: " + String(job.severity || "medium").toUpperCase(),
  ].filter(Boolean);
  return parts.join("\n");
}

async function deliverResend(job, config) {
  const apiKey = String(config.api_key || "");
  const from = String(config.from || "");
  const to = Array.isArray(config.to) ? config.to : [config.to].filter(Boolean);
  if (!apiKey || !from || !to.length) throw new Error("Resend connection requires api_key, from and to.");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: "Bearer " + apiKey,
      "content-type": "application/json",
      "user-agent": "MetrixIQ-Delivery/1.0",
    },
    body: JSON.stringify({
      from,
      to,
      subject: job.title,
      text: messageText(job),
      reply_to: config.reply_to || undefined,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return readResponse(response);
}

async function deliverSlack(job, config) {
  if (!config.webhook_url) throw new Error("Slack webhook URL is not configured.");
  return safeFetch(config.webhook_url, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "MetrixIQ-Delivery/1.0" },
    body: JSON.stringify({
      text: "*"+job.title+"*\n"+messageText(job),
    }),
  });
}

async function deliverTeams(job, config) {
  if (!config.webhook_url) throw new Error("Teams webhook URL is not configured.");
  return safeFetch(config.webhook_url, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "MetrixIQ-Delivery/1.0" },
    body: JSON.stringify({ text: messageText(job) }),
  });
}

async function deliverGenericWebhook(job, config) {
  if (!config.url) throw new Error("Generic webhook URL is not configured.");
  const body = JSON.stringify({
    type: "metrixiq.delivery",
    category: job.category,
    severity: job.severity,
    title: job.title,
    message: job.message,
    site: job.site,
    driver_id: job.driver_id,
    payload: job.payload || {},
  });
  const headers = {
    "content-type": "application/json",
    "user-agent": "MetrixIQ-Delivery/1.0",
  };
  if (config.secret) {
    headers["x-metrixiq-signature"] = "v1=" + crypto.createHmac("sha256", String(config.secret)).update(body).digest("hex");
  }
  return safeFetch(config.url, { method: "POST", headers, body });
}

async function deliverWhatsApp(job, config) {
  const token = String(config.access_token || "");
  const phoneNumberId = String(config.phone_number_id || "");
  const recipients = Array.isArray(config.recipients) ? config.recipients.filter(Boolean) : [config.recipient].filter(Boolean);
  if (!token || !phoneNumberId || !recipients.length) {
    throw new Error("WhatsApp Cloud connection requires access_token, phone_number_id and recipient(s).");
  }

  const apiVersion = /^v\d+\.\d+$/.test(String(config.api_version || "")) ? config.api_version : "v22.0";
  const url = "https://graph.facebook.com/" + apiVersion + "/" + encodeURIComponent(phoneNumberId) + "/messages";
  let last = { ok: true, status: 200, body: "" };

  for (const recipient of recipients) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: "Bearer " + token,
        "content-type": "application/json",
        "user-agent": "MetrixIQ-Delivery/1.0",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: String(recipient),
        type: "text",
        text: { preview_url: false, body: messageText(job) },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    last = await readResponse(response);
    if (!last.ok) return last;
  }
  return last;
}

export async function deliverQueueMessage(job) {
  const config = decryptIntegrationConfig(job.config_ciphertext);
  switch (job.provider) {
    case "resend":
      return deliverResend(job, config);
    case "slack_webhook":
      return deliverSlack(job, config);
    case "teams_webhook":
      return deliverTeams(job, config);
    case "whatsapp_cloud":
      return deliverWhatsApp(job, config);
    case "generic_webhook":
      return deliverGenericWebhook(job, config);
    default:
      throw new Error("Unsupported delivery provider: " + job.provider);
  }
}

export async function testDeliveryConnection(provider, encryptedConfig) {
  const config = decryptIntegrationConfig(encryptedConfig);
  const job = {
    title: "MetrixIQ connection test",
    message: "Your MetrixIQ external delivery connection is working.",
    category: "integration_test",
    severity: "info",
    site: null,
    driver_id: null,
    payload: { test: true },
    provider,
    config_ciphertext: encryptedConfig,
  };
  return deliverQueueMessage(job);
}
