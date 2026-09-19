export const NAV_ITEMS = [
  ["dashboard", "Dashboard"],
  ["manager-control", "Manager Control"],
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
  ["intelligence", "Intelligence"],
  ["simulator", "What-if Simulator"],
  ["imports", "Import Center"],
  ["data-quality", "Data Quality"],
  ["management-views", "Management Views"],
  ["audit", "Audit Center"],
  ["reports", "Reports"],
  ["billing", "Plans & Billing"],
  ["team", "Team & Access"],
  ["settings", "Settings"],
  ["admin", "Super Admin"],
];

export const NAV_ICONS = Object.freeze({
  dashboard: "▦",
  "manager-control": "◉",
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
  reports: "▤",
  billing: "£",
  settings: "⚙",
  team: "◉",
  admin: "♛",
});

export function navSection(index) {
  if (index === 1) return "MANAGEMENT";
  if (index === 3) return "SCORECARDS";
  if (index === 5) return "OPERATIONS";
  if (index === 14) return "INTELLIGENCE";
  if (index === 16) return "DATA";
  if (index === 18) return "GOVERNANCE";
  if (index === 20) return "REPORTING";
  if (index === 21) return "ACCOUNT";
  if (index === 24) return "PLATFORM";
  return "";
}
