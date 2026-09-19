import crypto from "node:crypto";
import dns from "node:dns/promises";
import net from "node:net";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "../billing/stripeServer";

function serverConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publicKey) throw new Error("Supabase public credentials are not configured.");
  return { url, publicKey };
}

export function getBearerToken(request) {
  const header = request.headers.get("authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

export function getUserScopedSupabase(request) {
  const token = getBearerToken(request);
  if (!token) {
    const error = new Error("Authentication required.");
    error.statusCode = 401;
    throw error;
  }
  const { url, publicKey } = serverConfig();
  return createClient(url, publicKey, {
    global: { headers: { Authorization: "Bearer " + token } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export async function requireIntegrationUser(request, organizationId, permission) {
  const token = getBearerToken(request);
  if (!token) {
    const error = new Error("Authentication required.");
    error.statusCode = 401;
    throw error;
  }

  const scoped = getUserScopedSupabase(request);
  const { data: userData, error: userError } = await scoped.auth.getUser(token);
  if (userError || !userData?.user) {
    const error = new Error("Your session is invalid or expired.");
    error.statusCode = 401;
    throw error;
  }

  const { data: allowed, error: permissionError } = await scoped.rpc("authorize_integration_action", {
    p_organization_id: organizationId,
    p_permission: permission,
  });
  if (permissionError) throw permissionError;
  if (!allowed) {
    const error = new Error("You do not have permission for this integration action.");
    error.statusCode = 403;
    throw error;
  }

  return { scoped, user: userData.user, admin: getSupabaseAdmin() };
}

function encryptionKey() {
  const secret = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!secret || secret.length < 24) {
    throw new Error("INTEGRATION_ENCRYPTION_KEY is not configured securely.");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptIntegrationConfig(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(value ?? {}), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptIntegrationConfig(ciphertext) {
  const [version, ivText, tagText, dataText] = String(ciphertext || "").split(".");
  if (version !== "v1" || !ivText || !tagText || !dataText) throw new Error("Invalid encrypted integration configuration.");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivText, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(dataText, "base64url")),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8"));
}

export function generateApiKey() {
  const raw = "miq_live_" + crypto.randomBytes(32).toString("base64url");
  return {
    raw,
    prefix: raw.slice(0, 18),
    hash: crypto.createHash("sha256").update(raw).digest("hex"),
  };
}

export function hashApiKey(raw) {
  return crypto.createHash("sha256").update(String(raw || "")).digest("hex");
}

function isPrivateIpv4(ip) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) return false;
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a === 0
  );
}

function isPrivateIpv6(ip) {
  const lower = ip.toLowerCase();
  return lower === "::1" || lower === "::" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80:");
}

export async function assertSafeHttpsUrl(value) {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch {
    throw new Error("A valid HTTPS URL is required.");
  }
  if (url.protocol !== "https:") throw new Error("Only HTTPS integration URLs are allowed.");
  const hostname = url.hostname.toLowerCase();
  if (!hostname || hostname === "localhost" || hostname.endsWith(".local")) {
    throw new Error("Local or private integration hosts are not allowed.");
  }

  if (net.isIP(hostname)) {
    if ((net.isIP(hostname) === 4 && isPrivateIpv4(hostname)) || (net.isIP(hostname) === 6 && isPrivateIpv6(hostname))) {
      throw new Error("Private network integration hosts are not allowed.");
    }
    return url;
  }

  const resolved = await dns.lookup(hostname, { all: true, verbatim: true });
  if (!resolved.length) throw new Error("Integration host could not be resolved.");
  for (const item of resolved) {
    if ((item.family === 4 && isPrivateIpv4(item.address)) || (item.family === 6 && isPrivateIpv6(item.address))) {
      throw new Error("Integration host resolves to a private network.");
    }
  }
  return url;
}

export async function authenticatePublicApi(request, requiredScope) {
  const token = getBearerToken(request);
  if (!token || !token.startsWith("miq_live_")) {
    const error = new Error("A valid MetrixIQ API key is required.");
    error.statusCode = 401;
    throw error;
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc("authenticate_api_key", {
    p_key_hash: hashApiKey(token),
    p_required_scope: requiredScope,
  });
  if (error) throw error;

  const auth = data?.[0];
  const status = auth?.auth_status || "not_found";
  if (status !== "ok") {
    const err = new Error(
      status === "scope_denied" ? "API key does not include the required scope." :
      status === "rate_limited" ? "API rate limit exceeded for this hour." :
      status === "expired" ? "API key has expired." :
      status === "revoked" ? "API key has been revoked." :
      "Invalid API key."
    );
    err.statusCode = status === "rate_limited" ? 429 : status === "scope_denied" ? 403 : 401;
    throw err;
  }

  return { admin, auth };
}

export async function recordApiResult(admin, auth, responseBody, isError = false) {
  if (!auth?.api_key_id) return;
  let bytes = 0;
  try {
    bytes = Buffer.byteLength(typeof responseBody === "string" ? responseBody : JSON.stringify(responseBody ?? null));
  } catch {}
  await admin.rpc("record_api_request_result", {
    p_api_key_id: auth.api_key_id,
    p_error: Boolean(isError),
    p_bytes_out: bytes,
  }).catch(() => null);
}

export function apiError(error) {
  return Response.json(
    { error: error?.message || "Integration request failed." },
    { status: Number(error?.statusCode) || 500, headers: { "cache-control": "no-store" } }
  );
}

export function csvEscape(value) {
  if (value == null) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
}

export function rowsToCsv(rows) {
  if (!rows?.length) return "";
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row || {})))];
  return [keys.join(","), ...rows.map((row) => keys.map((key) => csvEscape(row?.[key])).join(","))].join("\n");
}
