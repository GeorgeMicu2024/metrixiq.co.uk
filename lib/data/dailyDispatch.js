export const DAILY_DISPATCH_SELECT =
  "id,organization_id,site,dispatch_date,route_code,driver_id,trid,driver_name,assignment_key,source_route_file,source_wave_file,created_at,updated_at,drivers(id,trid,full_name,site,status)";

export async function replaceDailyDispatchAssignments(
  supabase,
  {
    organizationId,
    site,
    dispatchDate,
    assignments = [],
    sourceRouteFile = null,
    sourceWaveFile = null,
  }
) {
  if (!organizationId) throw new Error("Workspace is required to save Daily Dispatch.");
  if (!site || String(site).toLowerCase() === "all") {
    throw new Error("Select an Activity Site before saving Daily Dispatch.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dispatchDate || ""))) {
    throw new Error("A valid Daily Dispatch date is required.");
  }

  const payload = (assignments || [])
    .map((row) => ({
      route_code: String(row?.routeCode || row?.route_code || "").trim().toUpperCase(),
      driver_id: row?.driverId || row?.driver_id || null,
      trid: String(row?.trid || "").trim().toUpperCase() || null,
      driver_name: String(row?.driverName || row?.driver_name || "").trim(),
      assignment_key: String(row?.assignmentKey || row?.assignment_key || "").trim() || null,
    }))
    .filter((row) => row.route_code && row.driver_name);

  const { data, error } = await supabase.rpc("replace_daily_dispatch_assignments", {
    p_organization_id: organizationId,
    p_site: String(site).trim().toUpperCase(),
    p_dispatch_date: dispatchDate,
    p_assignments: payload,
    p_source_route_file: sourceRouteFile || null,
    p_source_wave_file: sourceWaveFile || null,
  });

  if (error) throw error;
  return data || { saved: payload.length };
}

export async function fetchDailyDispatchAssignments(
  supabase,
  organizationId,
  site,
  dispatchDate
) {
  if (!organizationId || !site || !dispatchDate || String(site).toLowerCase() === "all") return [];

  const { data, error } = await supabase
    .from("daily_dispatch_assignments")
    .select(DAILY_DISPATCH_SELECT)
    .eq("organization_id", organizationId)
    .eq("site", String(site).trim().toUpperCase())
    .eq("dispatch_date", dispatchDate)
    .order("route_code", { ascending: true })
    .order("driver_name", { ascending: true });

  if (error) throw error;
  return data || [];
}
