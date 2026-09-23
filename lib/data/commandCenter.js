export function emptyCommandCenterSummary() {
  return {
    period_label: null,
    period_key: null,
    generated_at: null,
    alerts: {
      total: 0,
      critical: 0,
      high: 0,
      medium: 0,
      iadc: 0,
      fico: 0,
      dcr_drop: 0,
      repeat_concessions: 0,
      deteriorating: 0,
    },
    coaching: {
      open: 0,
      overdue: 0,
      closed: 0,
    },
    priority_drivers: [],
  };
}

export async function fetchCommandCenterSummary(supabase, organizationId, site = null) {
  if (!organizationId) return emptyCommandCenterSummary();

  const { data, error } = await supabase.rpc("get_command_center_summary", {
    p_organization_id: organizationId,
    p_site: site && site !== "all" ? site : null,
  });

  if (error) throw error;

  return {
    ...emptyCommandCenterSummary(),
    ...(data || {}),
    alerts: {
      ...emptyCommandCenterSummary().alerts,
      ...(data?.alerts || {}),
    },
    coaching: {
      ...emptyCommandCenterSummary().coaching,
      ...(data?.coaching || {}),
    },
    priority_drivers: Array.isArray(data?.priority_drivers)
      ? data.priority_drivers
      : [],
  };
}

export async function refreshCommandCenterSummary(
  supabase,
  organizationId,
  { refreshAlerts = false, site = null } = {}
) {
  if (!organizationId) return emptyCommandCenterSummary();

  if (refreshAlerts) {
    const { error: refreshError } = await supabase.rpc("refresh_performance_alerts", {
      p_organization_id: organizationId,
      p_site: site && site !== "all" ? site : null,
    });
    if (refreshError) throw refreshError;
  }

  return fetchCommandCenterSummary(supabase, organizationId, site);
}
