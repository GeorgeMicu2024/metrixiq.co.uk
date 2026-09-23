export const PLAN_ORDER = Object.freeze({
  free: 0,
  pro: 1,
  business: 2,
  full: 3,
});

export const NAV_MIN_PLAN = Object.freeze({
  dashboard: "free",
  drivers: "free",
  "driver-master": "free",
  performance: "free",
  billing: "free",
  settings: "free",

  "site-scorecards": "pro",
  "driver-scorecards": "pro",
  iadc: "pro",
  cdf: "pro",
  mentor: "pro",
  concessions: "pro",
  coaching: "pro",
  notifications: "pro",
  imports: "pro",
  "data-quality": "pro",
  reports: "pro",

  "manager-control": "business",
  automation: "business",
  "mobile-manager": "pro",
  "site-operations": "business",
  evidence: "business",
  intelligence: "business",
  simulator: "business",
  "management-views": "business",
  audit: "business",
  integrations: "business",
  reliability: "business",
  "developer-platform": "full",
  portfolio: "full",
  "enterprise-settings": "full",
  team: "business",
});

const NAV_PERMISSION = Object.freeze({
  dashboard: "view_dashboard",
  "manager-control": "view_workflows",
  automation: "view_workflows",
  "mobile-manager": "manage_coaching",
  "site-operations": "view_site_operations",
  evidence: "view_incidents",
  drivers: "view_driver_data",
  "driver-master": "view_driver_data",
  performance: "view_driver_data",
  iadc: "view_driver_data",
  cdf: "view_driver_data",
  mentor: "view_driver_data",
  concessions: "view_driver_data",
  notifications: "view_driver_data",
  "site-scorecards": "view_scorecards",
  "driver-scorecards": "view_scorecards",
  simulator: "view_scorecards",
  "management-views": "view_scorecards",
  intelligence: "view_reports",
  coaching: "manage_coaching",
  imports: "manage_imports",
  "data-quality": "resolve_data_quality",
  reports: "view_reports",
  audit: "view_audit",
  integrations: "view_integrations",
  reliability: "view_reliability",
  "developer-platform": "view_developer_platform",
  portfolio: "view_portfolio",
  "enterprise-settings": "view_enterprise_settings",
  team: "manage_team",
  billing: "view_billing",
});

export function canAccessNav(id, access, platformAdmin, workspaceRole = "viewer", permissions = null) {
  if (id === "admin") return Boolean(platformAdmin);
  if (platformAdmin) return true;

  const role = String(workspaceRole || "viewer").toLowerCase();
  const managers = ["owner", "admin", "manager"];

  if (permissions && NAV_PERMISSION[id] && permissions[NAV_PERMISSION[id]] === false) {
    return false;
  }

  if (!permissions && ["billing", "team", "imports", "data-quality", "audit"].includes(id) && !managers.includes(role)) {
    return false;
  }

  const effective = String(access?.effective_plan || "free").toLowerCase();
  const required = NAV_MIN_PLAN[id] || "full";

  return (PLAN_ORDER[effective] ?? 0) >= (PLAN_ORDER[required] ?? 3);
}
