export async function fetchMyWorkspaces(supabase) {
  const { data, error } = await supabase.rpc("list_my_workspaces");
  if (error) throw error;
  return data || [];
}

export async function fetchMyPortfolios(supabase) {
  const { data, error } = await supabase.rpc("list_my_portfolios");
  if (error) throw error;
  return data || [];
}

export async function createEnterprisePortfolio(supabase, name, initialOrganizationId = null) {
  const { data, error } = await supabase.rpc("create_enterprise_portfolio", {
    p_name: name,
    p_initial_organization_id: initialOrganizationId,
  });
  if (error) throw error;
  return data;
}

export async function fetchPortfolioOrganizations(supabase, portfolioId) {
  if (!portfolioId) return [];
  const { data, error } = await supabase.rpc("list_portfolio_organizations", {
    p_portfolio_id: portfolioId,
  });
  if (error) throw error;
  return data || [];
}

export async function addPortfolioOrganization(
  supabase,
  { portfolioId, organizationId, displayName = null, region = null }
) {
  const { error } = await supabase.rpc("add_portfolio_organization", {
    p_portfolio_id: portfolioId,
    p_organization_id: organizationId,
    p_display_name: displayName,
    p_region: region,
  });
  if (error) throw error;
}

export async function removePortfolioOrganization(supabase, portfolioId, organizationId) {
  const { error } = await supabase.rpc("remove_portfolio_organization", {
    p_portfolio_id: portfolioId,
    p_organization_id: organizationId,
  });
  if (error) throw error;
}

export async function fetchPortfolioBenchmark(supabase, portfolioId, weekLabel = null) {
  if (!portfolioId) return [];
  const { data, error } = await supabase.rpc("list_portfolio_benchmark", {
    p_portfolio_id: portfolioId,
    p_week_label: weekLabel || null,
  });
  if (error) throw error;
  return data || [];
}

export async function fetchOrganizationHierarchy(supabase, organizationId) {
  if (!organizationId) return [];
  const { data, error } = await supabase.rpc("list_organization_hierarchy", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
  return data || [];
}

export async function upsertOrganizationSiteProfile(supabase, payload) {
  const { error } = await supabase.rpc("upsert_organization_site_profile", {
    p_organization_id: payload.organizationId,
    p_site: payload.site,
    p_display_name: payload.displayName || null,
    p_region: payload.region || null,
    p_country: payload.country || null,
    p_active: payload.active ?? true,
  });
  if (error) throw error;
}

export async function fetchKpiPolicies(supabase, organizationId) {
  if (!organizationId) return [];
  const { data, error } = await supabase.rpc("list_kpi_policies", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
  return data || [];
}

export async function upsertKpiPolicy(supabase, payload) {
  const { data, error } = await supabase.rpc("upsert_kpi_policy", {
    p_organization_id: payload.organizationId,
    p_site: payload.site || null,
    p_metric: payload.metric,
    p_target: payload.target,
    p_direction: payload.direction || "gte",
    p_warning_margin: payload.warningMargin ?? 0,
    p_unit: payload.unit || "percent",
    p_enabled: payload.enabled ?? true,
  });
  if (error) throw error;
  return data;
}

export async function deleteKpiPolicy(supabase, policyId) {
  const { error } = await supabase.rpc("delete_kpi_policy", {
    p_policy_id: policyId,
  });
  if (error) throw error;
}

export async function fetchOrganizationBranding(supabase, organizationId) {
  if (!organizationId) return null;
  const { data, error } = await supabase.rpc("get_organization_branding", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
  return data || null;
}

export async function updateOrganizationBranding(supabase, payload) {
  const { error } = await supabase.rpc("update_organization_branding", {
    p_organization_id: payload.organizationId,
    p_brand_name: payload.brandName || null,
    p_accent_color: payload.accentColor || "#66E3CE",
    p_secondary_color: payload.secondaryColor || "#9B90FF",
    p_logo_url: payload.logoUrl || null,
    p_footer_text: payload.footerText || null,
    p_show_metrixiq_brand: payload.showMetrixiqBrand ?? true,
  });
  if (error) throw error;
}

export async function fetchEnterpriseWorkspaceData(supabase, organizationId) {
  const [hierarchy, policies, branding] = await Promise.all([
    fetchOrganizationHierarchy(supabase, organizationId),
    fetchKpiPolicies(supabase, organizationId),
    fetchOrganizationBranding(supabase, organizationId),
  ]);
  return { hierarchy, policies, branding };
}
