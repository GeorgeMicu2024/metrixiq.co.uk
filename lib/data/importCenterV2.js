function fileKey(name, size) {
  return `${String(name || "").toLowerCase()}::${Number(size || 0)}`;
}

export async function findPotentialDuplicateImports(supabase, organizationId, files = []) {
  const names = [...new Set((files || []).map((file) => file.name).filter(Boolean))];
  if (!names.length) return new Map();

  const { data, error } = await supabase
    .from("imports")
    .select("id,file_name,file_size_bytes,status,detected_report_type,period_start,period_end,metadata,created_at")
    .eq("organization_id", organizationId)
    .in("file_name", names)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const map = new Map();
  for (const row of data || []) {
    const key = fileKey(row.file_name, row.file_size_bytes);
    const current = map.get(key) || [];
    current.push(row);
    map.set(key, current);
  }
  return map;
}

export function duplicateMatchesForFile(duplicates, file) {
  return duplicates.get(fileKey(file?.name, file?.size)) || [];
}

export async function fetchImportHistoryV2(supabase, organizationId, limit = 100) {
  const { data, error } = await supabase
    .from("imports")
    .select("id,file_name,file_type,file_size_bytes,status,detected_report_type,period_start,period_end,error_message,metadata,created_at,completed_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function rollbackImportV2(supabase, importId, reason = "") {
  const { data, error } = await supabase.rpc("rollback_import_v2", {
    p_import_id: importId,
    p_reason: reason || null,
  });
  if (error) throw error;
  return data || {};
}

export async function fetchImportChangePreview(supabase, importId) {
  const { data, error } = await supabase.rpc("preview_import_rollback", {
    p_import_id: importId,
  });
  if (error) throw error;
  return data || {};
}

export async function recordImportSnapshots(supabase, importIds = []) {
  if (!importIds.length) return;
  const { error } = await supabase.rpc("finalize_import_change_snapshots", {
    p_import_ids: importIds,
  });
  if (error) throw error;
}
