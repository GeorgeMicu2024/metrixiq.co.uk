import { getSupabaseBrowserClient } from "../supabase/client";

const STAGING_FUNCTION_URL = "https://hsbxqiuvciwalxogqceb.supabase.co/functions/v1/smart-import-stage";
const APPROVE_FUNCTION_URL = "https://hsbxqiuvciwalxogqceb.supabase.co/functions/v1/smart-import-approve";
const PRODUCTION_PREFLIGHT_URL = "https://bbljkuwfejslsqoqqwzh.supabase.co/functions/v1/smart-import-production";

export async function stageSmartImportPayload(payload, { signal } = {}) {
  if (!payload?.organizationId) throw new Error("Workspace organisation is missing.");
  if (payload?.writesEnabled !== false) throw new Error("Only validated dry-run payloads can be staged.");

  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data?.session?.access_token;
  if (!token) throw new Error("Your MetrixIQ session has expired. Sign in again before staging.");

  const response = await fetch(STAGING_FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
    },
    body: JSON.stringify(payload),
    signal,
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result?.error || result?.message || ("Staging request failed (" + response.status + ")."));
  }
  return result;
}


export async function approveSmartImportBatch({ batchId, organizationId }, { signal } = {}) {
  if (!batchId || !organizationId) {
    throw new Error("Batch and workspace organisation are required for approval.");
  }

  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data?.session?.access_token;
  if (!token) throw new Error("Your MetrixIQ session has expired. Sign in again before approval.");

  const response = await fetch(APPROVE_FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
    },
    body: JSON.stringify({ batchId, organizationId }),
    signal,
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result?.error || result?.message || ("Approval request failed (" + response.status + ")."));
  }
  return result;
}


export async function preflightSmartImportProduction({ batchId, organizationId }, { signal } = {}) {
  if (!batchId || !organizationId) {
    throw new Error("Batch and workspace organisation are required for Production preflight.");
  }

  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data?.session?.access_token;
  if (!token) throw new Error("Your MetrixIQ session has expired. Sign in again before Production preflight.");

  const response = await fetch(PRODUCTION_PREFLIGHT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
    },
    body: JSON.stringify({
      action: "preflight",
      batchId,
      organizationId,
    }),
    signal,
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result?.error || result?.message || ("Production preflight failed (" + response.status + ")."));
  }
  return result;
}


export async function commitSmartImportProduction({
  batchId,
  organizationId,
  expectedFingerprint,
}, { signal } = {}) {
  if (!batchId || !organizationId || !expectedFingerprint) {
    throw new Error("Batch, workspace organisation and approved fingerprint are required for Production commit.");
  }

  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data?.session?.access_token;
  if (!token) throw new Error("Your MetrixIQ session has expired. Sign in again before Production commit.");

  const response = await fetch(PRODUCTION_PREFLIGHT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
    },
    body: JSON.stringify({
      action: "commit",
      confirmation: "COMMIT_APPROVED_BATCH",
      batchId,
      organizationId,
      expectedFingerprint,
    }),
    signal,
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result?.error || result?.message || ("Production commit failed (" + response.status + ")."));
  }
  return result;
}
