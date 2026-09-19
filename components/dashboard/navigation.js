export const NAV_ITEMS = [
  ["dashboard", "Dashboard"],
  ["manager-control", "Action Center"],
  ["automation", "Automation Engine"],
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
  ["developer-platform", "Integration & API"],
  ["portfolio", "Enterprise Portfolio"],
  ["enterprise-settings", "Enterprise Settings"],
  ["reports", "Report Builder"],
  ["billing", "Plans & Billing"],
  ["team", "Team & Access"],
  ["settings", "Settings"],
  ["admin", "Super Admin"],
];

export const NAV_ICONS = Object.freeze({
  dashboard: "▦",
  "manager-control": "◉",
  automation: "⌁",
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
  "developer-platform": "⌘",
  portfolio: "▦",
  "enterprise-settings": "⚙",
  reports: "▤",
  billing: "£",
  settings: "⚙",
  team: "◉",
  admin: "♛",
});

export function navSection(index) {
  if (index === 1) return "MANAGEMENT";
  if (index === 5) return "SCORECARDS";
  if (index === 7) return "OPERATIONS";
  if (index === 16) return "INTELLIGENCE";
  if (index === 18) return "DATA";
  if (index === 20) return "GOVERNANCE";
  if (index === 22) return "PLATFORM";
  if (index === 25) return "ENTERPRISE";
  if (index === 27) return "REPORTING";
  if (index === 28) return "ACCOUNT";
  if (index === 31) return "PLATFORM ADMIN";
  return "";
}
