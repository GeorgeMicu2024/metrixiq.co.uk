export const NAV_ITEMS = [
  ["dashboard", "Dashboard"],
  ["manager-control", "Manager Control"],
  ["mobile-manager", "Manager Mobile"],
  ["site-operations", "Site Operations"],
  ["site-scorecards", "Site Scorecards"],
  ["driver-scorecards", "Driver Scorecards"],
  ["drivers", "Drivers"],
  ["performance", "Performance"],
  ["iadc", "IADC"],
  ["cdf", "CDF Feedback"],
  ["mentor", "Mentor"],
  ["concessions", "Concessions"],
  ["evidence", "Evidence & Incidents"],
  ["coaching", "Coaching"],
  ["notifications", "Notifications"],
  ["intelligence", "AI Analyst"],
  ["simulator", "What-if Simulator"],
  ["imports", "Import Center"],
  ["data-quality", "Data Quality"],
  ["management-views", "Management Views"],
  ["audit", "Audit Center"],
  ["integrations", "Integration Hub"],
  ["reliability", "Reliability Center"],
  ["reports", "Report Builder"],
  ["billing", "Plans & Billing"],
  ["team", "Team & Access"],
  ["settings", "Settings"],
  ["admin", "Super Admin"],
];

export const NAV_ICONS = Object.freeze({
  dashboard: "▦",
  "manager-control": "◉",
  "mobile-manager": "▥",
  "site-operations": "▣",
  "site-scorecards": "▤",
  "driver-scorecards": "◫",
  drivers: "◎",
  performance: "↗",
  iadc: "✓",
  cdf: "◈",
  mentor: "◇",
  concessions: "◆",
  evidence: "⌕",
  coaching: "✓",
  notifications: "♢",
  intelligence: "✦",
  simulator: "≈",
  imports: "⇧",
  "data-quality": "⌁",
  "management-views": "☷",
  audit: "◴",
  integrations: "⇄",
  reliability: "◌",
  reports: "▤",
  billing: "£",
  settings: "⚙",
  team: "◉",
  admin: "♛",
});

export function navSection(index) {
  if (index === 1) return "MANAGEMENT";
  if (index === 4) return "SCORECARDS";
  if (index === 6) return "OPERATIONS";
  if (index === 15) return "INTELLIGENCE";
  if (index === 17) return "DATA";
  if (index === 19) return "GOVERNANCE";
  if (index === 21) return "PLATFORM";
  if (index === 23) return "REPORTING";
  if (index === 24) return "ACCOUNT";
  if (index === 27) return "PLATFORM ADMIN";
  return "";
}
