export const PERMISSION_GROUPS = Object.freeze([
  {
    label: "Read access",
    permissions: [
      ["view_dashboard", "Dashboard"],
      ["view_driver_data", "Driver data"],
      ["view_scorecards", "Scorecards"],
      ["view_reports", "Reports"],
      ["view_audit", "Audit Center"],
      ["view_site_operations", "Site Operations"],
      ["view_incidents", "Evidence & incidents"],
    ],
  },
  {
    label: "Operations",
    permissions: [
      ["manage_imports", "Import reports"],
      ["resolve_data_quality", "Resolve data quality"],
      ["edit_scorecards", "Edit scorecard metrics"],
      ["reset_overrides", "Reset overrides"],
      ["manage_coaching", "Manage coaching"],
      ["bulk_actions", "Bulk actions"],
      ["manage_incidents", "Manage incidents"],
    ],
  },
  {
    label: "Administration",
    permissions: [
      ["manage_team", "Manage team"],
      ["manage_permissions", "Manage permissions"],
      ["view_billing", "View billing"],
    ],
  },
]);

export const ALL_PERMISSIONS = Object.freeze(
  PERMISSION_GROUPS.flatMap((group) => group.permissions.map(([key]) => key))
);

const allowAll = () => Object.fromEntries(ALL_PERMISSIONS.map((key) => [key, true]));

export const ROLE_DEFAULTS = Object.freeze({
  owner: allowAll(),
  admin: allowAll(),
  manager: {
    ...allowAll(),
    manage_permissions: false,
    view_billing: false,
  },
  dispatcher: {
    view_dashboard: true,
    view_driver_data: true,
    view_scorecards: true,
    view_reports: true,
    view_audit: false,
    manage_imports: false,
    resolve_data_quality: false,
    edit_scorecards: false,
    reset_overrides: false,
    manage_coaching: true,
    bulk_actions: true,
    manage_incidents: true,
    view_site_operations: true,
    view_incidents: true,
    manage_team: false,
    manage_permissions: false,
    view_billing: false,
  },
  viewer: {
    view_dashboard: true,
    view_driver_data: true,
    view_scorecards: true,
    view_reports: true,
    view_audit: false,
    manage_imports: false,
    resolve_data_quality: false,
    edit_scorecards: false,
    reset_overrides: false,
    manage_coaching: false,
    bulk_actions: false,
    manage_incidents: false,
    view_site_operations: true,
    view_incidents: true,
    manage_team: false,
    manage_permissions: false,
    view_billing: false,
  },
});

export function normalizeRole(role) {
  const value = String(role || "viewer").toLowerCase();
  return ROLE_DEFAULTS[value] ? value : "viewer";
}

export function effectivePermissions(role, overrides = {}) {
  const base = ROLE_DEFAULTS[normalizeRole(role)] || ROLE_DEFAULTS.viewer;
  const result = { ...base };
  for (const key of ALL_PERMISSIONS) {
    if (typeof overrides?.[key] === "boolean") result[key] = overrides[key];
  }
  return result;
}

export function hasPermission(role, overrides, permission, platformAdmin = false) {
  if (platformAdmin) return true;
  return Boolean(effectivePermissions(role, overrides)?.[permission]);
}

export function explicitOverrides(role, desired = {}) {
  const base = ROLE_DEFAULTS[normalizeRole(role)] || ROLE_DEFAULTS.viewer;
  const output = {};
  for (const key of ALL_PERMISSIONS) {
    if (typeof desired?.[key] === "boolean" && desired[key] !== base[key]) {
      output[key] = desired[key];
    }
  }
  return output;
}

export function permissionLabel(key) {
  for (const group of PERMISSION_GROUPS) {
    const match = group.permissions.find(([permission]) => permission === key);
    if (match) return match[1];
  }
  return key;
}
