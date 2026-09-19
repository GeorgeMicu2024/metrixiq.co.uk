export const TEAM_MANAGER_ROLES = Object.freeze(["owner", "admin", "manager"]);

export function canManageTeam(workspaceRole, platformAdmin = false) {
  if (platformAdmin) return true;
  return TEAM_MANAGER_ROLES.includes(String(workspaceRole || "").toLowerCase());
}

export function parseSiteScope(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => String(item || "").trim().toUpperCase()).filter(Boolean))];
  }

  return [...new Set(
    String(value || "")
      .split(",")
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean)
  )];
}
