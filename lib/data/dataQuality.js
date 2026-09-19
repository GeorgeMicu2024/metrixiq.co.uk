import { nameSignature, normalizeName } from "../identity";

export async function fetchDataQualityState(supabase, organizationId) {
  const [driversResult, unmatchedResult] = await Promise.all([
    supabase
      .from("drivers")
      .select("id,trid,full_name,site,status")
      .eq("organization_id", organizationId)
      .order("full_name"),
    supabase
      .from("unmatched_driver_records")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  if (driversResult.error) throw driversResult.error;
  if (unmatchedResult.error) throw unmatchedResult.error;

  return {
    drivers: driversResult.data || [],
    unmatched: unmatchedResult.data || [],
  };
}

export async function syncDriverDirectory(supabase, organizationId) {
  const { data, error } = await supabase.rpc("sync_driver_directory", {
    p_organization_id: organizationId,
  });

  if (error) throw error;
  return Array.isArray(data) ? data[0] || null : data || null;
}

export async function resolveDriverIdentity(supabase, {
  organizationId,
  driverId,
  fullName,
}) {
  const { error } = await supabase.rpc("resolve_driver_identity", {
    p_organization_id: organizationId,
    p_driver_id: driverId,
    p_full_name: fullName,
    p_normalized_name: normalizeName(fullName),
    p_name_signature: nameSignature(fullName),
  });

  if (error) throw error;
}

export async function resolveUnmatchedDriverRecord(supabase, {
  organizationId,
  recordId,
  driverId,
  aliasName,
}) {
  const { error } = await supabase.rpc("resolve_unmatched_driver_record", {
    p_organization_id: organizationId,
    p_record_id: recordId,
    p_driver_id: driverId,
    p_alias_name: aliasName || "",
    p_normalized_name: aliasName ? normalizeName(aliasName) : "",
    p_name_signature: aliasName ? nameSignature(aliasName) : "",
  });

  if (error) throw error;
}
