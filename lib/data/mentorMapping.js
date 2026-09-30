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
  const materialized = new Map();

  // A saved mentor_hash alias means we know the canonical driver, but the
  // reconciliation row is not actually resolved until the daily snapshot is
  // materialized. Heal stale rows through the same audited RPC used by manual
  // mapping instead of only changing their UI status.
  for (const row of rows) {
    if (row.status !== "open") continue;
    const key = String(
      row.payload?.driver?.mentorHash ||
      row.payload?.driver?.details?.mentor?.identityKey ||
      ""
    ).trim();
    const driverId = mapped.get(key);
    if (!driverId) continue;

    const { error: resolveError } = await supabase.rpc("resolve_mentor_unmatched_record", {
      p_organization_id: organizationId,
      p_record_id: row.id,
      p_driver_id: driverId,
    });

    if (!resolveError) materialized.set(row.id, driverId);
  }

  return rows.map((row) => {
    const driverId = materialized.get(row.id);
    return driverId
      ? {
          ...row,
          status: "resolved",
          matched_driver_id: driverId,
          resolved_at: row.resolved_at || new Date().toISOString(),
          auto_materialized: true,
        }
      : row;
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
  const fullName = String(values?.full_name || "").replace(/\s+/g, " ").trim();
  const trid = String(values?.trid || "").trim().toUpperCase() || null;
  const site = String(values?.site || "").trim().toUpperCase() || null;
  if (!fullName) throw new Error("Driver name is required.");

  // A TRID is the canonical identity key inside a workspace. If the driver
  // already exists, this action should link the eMentor account to that
  // existing driver instead of attempting to create a duplicate row.
  if (trid) {
    const { data: existing, error: existingError } = await supabase
      .from("drivers")
      .select("id,trid,full_name,site,status")
      .eq("organization_id", organizationId)
      .eq("trid", trid)
      .maybeSingle();

    if (existingError) throw existingError;
    if (existing) return { ...existing, reused_existing: true };
  }

  const payload = { organization_id: organizationId, full_name: fullName, site, status: "active" };
  if (trid) payload.trid = trid;

  const { data, error } = await supabase
    .from("drivers")
    .insert(payload)
    .select("id,trid,full_name,site,status")
    .single();

  // Guard against a race where another request created the same TRID between
  // the lookup above and this insert.
  if (error && trid && error.code === "23505") {
    const { data: existing, error: lookupError } = await supabase
      .from("drivers")
      .select("id,trid,full_name,site,status")
      .eq("organization_id", organizationId)
      .eq("trid", trid)
      .maybeSingle();

    if (lookupError) throw lookupError;
    if (existing) return { ...existing, reused_existing: true };
  }

  if (error) throw error;
  return { ...data, reused_existing: false };
}
