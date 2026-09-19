export const NAV_ITEMS = [
  ["dashboard", "Dashboard"],
  ["manager-control", "Manager Control"],
  ["site-scorecards", "Site Scorecards"],
  ["driver-scorecards", "Driver Scorecards"],
  ["drivers", "Drivers"],
  ["performance", "Performance"],
  ["iadc", "IADC"],
  ["cdf", "CDF Feedback"],
  ["mentor", "Mentor"],
  ["concessions", "Concessions"],
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
  "site-scorecards": "▤",
  "driver-scorecards": "◫",
  drivers: "◎",
  performance: "↗",
  iadc: "✓",
  cdf: "◈",
  mentor: "◇",
  concessions: "◆",
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
  if (index === 2) return "SCORECARDS";
  if (index === 4) return "OPERATIONS";
  if (index === 12) return "INTELLIGENCE";
  if (index === 14) return "DATA";
  if (index === 16) return "GOVERNANCE";
  if (index === 18) return "REPORTING";
  if (index === 19) return "ACCOUNT";
  if (index === 22) return "PLATFORM";
  return "";
}
