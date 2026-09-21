export async function fetchMentorMappingRows(supabase, organizationId) {
  const { data, error } = await supabase
    .from("unmatched_driver_records")
    .select("id,source_import_id,report_type,week_label,raw_trid,raw_name,normalized_name,payload,status,matched_driver_id,created_at,resolved_at,site")
    .eq("organization_id", organizationId)
    .eq("report_type", "mentor_daily")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = data || [];

  // A manual eMentor mapping can already be persisted as a mentor_hash alias
  // while an older reconciliation row remains open. Treat that stale row as
  // resolved in the UI so the same source account is never shown twice.
  const { data: aliases, error: aliasError } = await supabase
    .from("driver_aliases")
    .select("driver_id,alias_normalized")
    .eq("organization_id", organizationId)
    .eq("alias_type", "mentor_hash");
  if (aliasError) throw aliasError;

  const mapped = new Map((aliases || []).map((alias) => [String(alias.alias_normalized || ""), alias.driver_id]));
  return rows.map((row) => {
    if (row.status !== "open") return row;
    const key = String(row.payload?.driver?.mentorHash || row.payload?.driver?.details?.mentor?.identityKey || "").trim();
    const driverId = mapped.get(key);
    return driverId ? { ...row, status: "resolved", matched_driver_id: driverId, resolved_via_alias: true } : row;
  });
}

export async function fetchMentorMappingDrivers(supabase, organizationId) {
  const { data, error } = await supabase
    .from("drivers")
    .select("id,trid,full_name,site,status")
    .eq("organization_id", organizationId)
    .order("full_name", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function resolveMentorMapping(supabase, organizationId, record, driverId) {
  const { data, error } = await supabase.rpc("resolve_mentor_unmatched_record", {
    p_organization_id: organizationId,
    p_record_id: record.id,
    p_driver_id: driverId,
  });
  if (error) throw error;
  return data;
}

export async function classifyMentorMapping(supabase, organizationId, recordId, status) {
  const { data, error } = await supabase.rpc("classify_mentor_unmatched_record", {
    p_organization_id: organizationId,
    p_record_id: recordId,
    p_status: status,
  });
  if (error) throw error;
  return data;
}


export async function createMentorMappingDriver(supabase, organizationId, values) {
  const fullName = String(values?.full_name || "").trim();
  const trid = String(values?.trid || "").trim().toUpperCase() || null;
  const site = String(values?.site || "").trim() || null;
  if (!fullName) throw new Error("Driver name is required.");

  const payload = { organization_id: organizationId, full_name: fullName, site, status: "active" };
  if (trid) payload.trid = trid;

  const { data, error } = await supabase
    .from("drivers")
    .insert(payload)
    .select("id,trid,full_name,site,status")
    .single();
  if (error) throw error;
  return data;
}
