export const PLAN_ORDER = Object.freeze({
  free: 0,
  pro: 1,
  business: 2,
  full: 3,
});

export const NAV_MIN_PLAN = Object.freeze({
  dashboard: "free",
  drivers: "free",
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
  imports: "pro",
  "data-quality": "pro",
  reports: "pro",

  intelligence: "business",
  team: "business",
});

export function canAccessNav(id, access, platformAdmin, workspaceRole = "viewer") {
  if (id === "admin") return Boolean(platformAdmin);
  if (platformAdmin) return true;

  const role = String(workspaceRole || "viewer").toLowerCase();
  const managers = ["owner", "admin", "manager"];

  if (["billing", "team", "imports", "data-quality"].includes(id) && !managers.includes(role)) {
    return false;
  }

  const effective = String(access?.effective_plan || "free").toLowerCase();
  const required = NAV_MIN_PLAN[id] || "full";

  return (PLAN_ORDER[effective] ?? 0) >= (PLAN_ORDER[required] ?? 3);
}
